import { Hud } from "./hud/HUD";
import { HudMount } from "./hud/mount";
import { createAudioPipeline, type AudioPipeline } from "./audio-pipeline";
import { SegmentTracker } from "./segment-tracker";
import { RewindController } from "./rewind-controller";
import { TimeMapper } from "../lib/time-mapping";
import {
  loadSettings,
  saveSetting,
  onSettingsChanged,
  type Settings,
} from "../lib/settings";
import { YouTubeWatcher, currentVideoId } from "./youtube-watcher";
import { isLiveStream, earliestSeekableTime } from "./live-detect";
import {
  DEFAULT_VAD_OPTIONS,
  PROTOCOL_VERSION,
  type FromVad,
  type ToVad,
} from "../workers/protocol";
import { log, warn, error } from "../lib/log";
// `?worker&url` gives us the URL of the bundled worker without invoking the
// `new Worker(...)` helper Vite emits — we need to load it ourselves via a
// blob bootstrap (see initVadWorker below).
import vadWorkerUrl from "../workers/vad-worker.ts?worker&url";

const describeError = (e: unknown): string => {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
};

// Worklet is plain JS in public/, served via the extension. Worker is bundled by Vite.
const WORKLET_URL = chrome.runtime.getURL("worklets/resampler.js");
const VAD_MODEL_URL = chrome.runtime.getURL("models/silero_vad.onnx");

interface RuntimeState {
  hud: Hud;
  mount: HudMount;
  settings: Settings;
  pipeline: AudioPipeline | null;
  vadWorker: Worker | null;
  tracker: SegmentTracker | null;
  rewind: RewindController | null;
  timeMapper: TimeMapper | null;
  currentVideo: HTMLVideoElement | null;
  videoListeners: Array<[string, EventListener]>;
  renderInterval: number | null;
}

const state: Partial<RuntimeState> = {
  videoListeners: [],
};

const waitForVideo = (timeoutMs = 30000): Promise<HTMLVideoElement> =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLVideoElement>(
      "#movie_player video, .html5-video-container video, video",
    );
    if (existing) {
      resolve(existing);
      return;
    }
    const start = Date.now();
    const observer = new MutationObserver(() => {
      const v = document.querySelector<HTMLVideoElement>("video");
      if (v) {
        observer.disconnect();
        resolve(v);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        observer.disconnect();
        reject(new Error("timed out waiting for <video>"));
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });

const cleanupForVideo = () => {
  for (const [ev, h] of state.videoListeners ?? []) {
    state.currentVideo?.removeEventListener(ev, h);
  }
  state.videoListeners = [];

  state.timeMapper?.destroy();
  state.timeMapper = null;

  state.pipeline?.destroy();
  state.pipeline = null;

  if (state.renderInterval !== null && state.renderInterval !== undefined) {
    clearInterval(state.renderInterval);
    state.renderInterval = null;
  }

  state.tracker?.reset();
  state.vadWorker?.postMessage({ type: "reset" } satisfies ToVad);

  state.currentVideo = null;
};

const attachToVideo = async (video: HTMLVideoElement, settings: Settings) => {
  state.currentVideo = video;

  state.rewind = new RewindController(video);

  const pipeline = await createAudioPipeline(video, WORKLET_URL, {
    onFrame: (pcm, tFrameStart) => {
      state.vadWorker?.postMessage(
        { type: "audio", pcm, tFrameStart } satisfies ToVad,
        [pcm.buffer],
      );
    },
  });
  state.pipeline = pipeline;

  state.timeMapper = new TimeMapper(video, pipeline.audioCtx);

  state.tracker = new SegmentTracker(settings.gapThresholdSeconds, {
    onActiveChange: (active) => {
      state.hud?.setActive(active);
    },
    onSegmentsChange: () => {
      // timeline render happens on interval
    },
  });

  // (VAD onmessage handler is already wired in initVadWorker.)

  // Reset VAD on seek/pause
  const seekHandler = () => {
    log("video seeking — reset tracker");
    state.tracker?.reset();
    state.vadWorker?.postMessage({ type: "reset" } satisfies ToVad);
  };
  const seekedHandler = () => {
    state.vadWorker?.postMessage({ type: "reset" } satisfies ToVad);
  };
  video.addEventListener("seeking", seekHandler);
  video.addEventListener("seeked", seekedHandler);
  state.videoListeners?.push(["seeking", seekHandler]);
  state.videoListeners?.push(["seeked", seekedHandler]);

  await pipeline.ensureRunning();

  // 5fps timeline render + live/DVR state refresh
  state.renderInterval = window.setInterval(() => {
    if (!state.tracker || !state.hud || !state.currentVideo) return;
    const video = state.currentVideo;
    const trackerState = state.tracker.getState();
    state.hud.renderTimeline(video.currentTime, trackerState);

    state.hud.setLive(isLiveStream(video));

    // DVR-safe active state: deactivate if the uta target has fallen out
    // of the seekable buffer (relevant for live with finite DVR window).
    const uta = trackerState.lastUtaStartMedia;
    if (uta !== null) {
      const earliest = earliestSeekableTime(video);
      const reachable = uta - state.settings!.rewindSeconds >= earliest;
      state.hud.setActive(reachable);
    }
  }, 200);
};

const handleVadMessage = (msg: FromVad) => {
  switch (msg.type) {
    case "ready":
      state.hud?.setStatus("ready", "音声認識準備完了");
      log("vad ready");
      break;
    case "speech-start": {
      const tm = state.timeMapper?.toMediaTime(msg.tStart);
      if (tm !== null && tm !== undefined) {
        state.tracker?.onSpeechStart(tm);
      } else {
        log("speech-start dropped (unstable time)");
      }
      break;
    }
    case "speech-end": {
      const tEnd = state.timeMapper?.toMediaTime(msg.tEnd);
      if (tEnd !== null && tEnd !== undefined) {
        state.tracker?.onSpeechEnd(tEnd);
      }
      break;
    }
    case "error":
      error("vad error", msg.message);
      state.hud?.setStatus("error", `VADエラー: ${msg.message}`);
      break;
  }
};

const createExtensionModuleWorker = (absoluteUrl: string): Worker => {
  // Chrome refuses `new Worker('chrome-extension://...')` from a page
  // origin like YouTube ("cannot be accessed from origin"). Work around by
  // creating a same-origin blob whose only job is to dynamic-import the real
  // worker module from the extension origin. The imported module's
  // import.meta.url then points back to chrome-extension://, so its own
  // relative imports (e.g. onnxruntime-web's wasm loader) resolve correctly.
  const bootstrap = [
    "self.addEventListener('error', (e) => { try { self.postMessage({type:'error', message:'bootstrap error: '+(e.message||String(e))}); } catch {} });",
    "self.addEventListener('unhandledrejection', (e) => { try { var r=e.reason; self.postMessage({type:'error', message:'bootstrap rejection: '+((r&&r.message)||String(r))}); } catch {} });",
    `import(${JSON.stringify(absoluteUrl)}).catch((e) => { try { self.postMessage({type:'error', message:'bootstrap import failed: '+((e&&e.message)||String(e))}); } catch {} });`,
  ].join("\n");
  const blob = new Blob([bootstrap], { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  const w = new Worker(blobUrl, { type: "module" });
  // Allow generous time for the worker to load before revoking. After
  // revocation the worker keeps running; only re-loads would fail.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  return w;
};

const initVadWorker = (): Worker => {
  const absoluteUrl = new URL(vadWorkerUrl, import.meta.url).href;
  log("vad worker url", absoluteUrl);
  const w = createExtensionModuleWorker(absoluteUrl);
  // Register handler BEFORE sending init so early ready/error messages aren't lost.
  w.onmessage = (ev: MessageEvent<FromVad>) => handleVadMessage(ev.data);
  w.onerror = (ev: ErrorEvent) => {
    error("vad worker onerror", ev.message, ev.filename, ev.lineno);
    state.hud?.setStatus(
      "error",
      `Workerエラー: ${ev.message || "unknown"}`,
    );
  };
  w.onmessageerror = (ev) => {
    error("vad worker onmessageerror", ev);
  };
  w.postMessage({
    type: "init",
    version: PROTOCOL_VERSION,
    modelUrl: VAD_MODEL_URL,
    opts: DEFAULT_VAD_OPTIONS,
  } satisfies ToVad);
  return w;
};

const main = async () => {
  log("content script starting");

  const settings = await loadSettings();
  state.settings = settings;

  const hud = new Hud(settings, {
    onRewindClick: () => {
      const tracker = state.tracker;
      const rewind = state.rewind;
      if (!tracker || !rewind) return;
      const uta = tracker.getState().lastUtaStartMedia;
      if (uta === null) return;
      rewind.rewindTo(uta, state.settings!.rewindSeconds);
    },
    onNChange: (v) => {
      state.settings!.rewindSeconds = v;
      void saveSetting("rewindSeconds", v);
    },
    onGapChange: (v) => {
      state.settings!.gapThresholdSeconds = v;
      state.tracker?.setGapThreshold(v);
      void saveSetting("gapThresholdSeconds", v);
    },
  });
  state.hud = hud;
  hud.setStatus("loading", "VADモデル読込中…");

  const mount = new HudMount(hud);
  state.mount = mount;
  mount.mount();

  onSettingsChanged((patch) => {
    Object.assign(state.settings!, patch);
    hud.updateSettings(patch);
    if (typeof patch.gapThresholdSeconds === "number") {
      state.tracker?.setGapThreshold(patch.gapThresholdSeconds);
    }
  });

  // Spawn VAD worker once and reuse across navigations
  state.vadWorker = initVadWorker();

  const watcher = new YouTubeWatcher();
  watcher.start(async () => {
    cleanupForVideo();

    if (!currentVideoId()) {
      hud.hide();
      return;
    }
    hud.show();

    try {
      const video = await waitForVideo();
      await attachToVideo(video, state.settings!);
    } catch (e) {
      warn("attachToVideo failed", describeError(e), e);
      hud.setStatus("error", `動画取得失敗: ${describeError(e)}`);
    }
  });
};

main().catch((e) => {
  error("main failed", describeError(e), e);
  try {
    state.hud?.setStatus("error", `起動失敗: ${describeError(e)}`);
  } catch {
    // ignore
  }
});
