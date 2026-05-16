import { log, warn } from "../lib/log";

const sourceNodes = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

export interface AudioPipelineHandlers {
  onFrame(pcm: Float32Array, tFrameStart: number): void;
}

export interface AudioPipeline {
  audioCtx: AudioContext;
  source: MediaElementAudioSourceNode;
  worklet: AudioWorkletNode;
  analyser: AnalyserNode;
  /** Peak amplitude observed in the most recent AnalyserNode sample (0..1). */
  probeAnalyser(): number;
  destroy(): void;
  ensureRunning(): Promise<void>;
}

export async function createAudioPipeline(
  video: HTMLVideoElement,
  workletUrl: string,
  handlers: AudioPipelineHandlers,
): Promise<AudioPipeline> {
  const audioCtx = new AudioContext({ latencyHint: "interactive" });
  await audioCtx.audioWorklet.addModule(workletUrl);

  let source = sourceNodes.get(video);
  if (!source) {
    source = audioCtx.createMediaElementSource(video);
    sourceNodes.set(video, source);
  } else {
    warn("Reusing existing MediaElementSource for this video");
  }

  const worklet = new AudioWorkletNode(audioCtx, "karuta-resampler", {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
  });

  worklet.port.onmessage = (ev: MessageEvent) => {
    const data = ev.data as { pcm?: Float32Array; tFrameStart?: number };
    if (data && data.pcm instanceof Float32Array && typeof data.tFrameStart === "number") {
      handlers.onFrame(data.pcm, data.tFrameStart);
    }
  };

  // Parallel diagnostic path. AnalyserNode taps the raw source signal at
  // native sample rate, independent of the worklet/resampler. If this also
  // reads zero, the issue is upstream (YouTube isn't actually feeding
  // audio into the MediaElementAudioSourceNode).
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;
  const probeBuf = new Float32Array(analyser.fftSize);

  source.connect(audioCtx.destination);
  source.connect(worklet);
  source.connect(analyser);

  const probeAnalyser = (): number => {
    analyser.getFloatTimeDomainData(probeBuf);
    let peak = 0;
    for (let i = 0; i < probeBuf.length; i++) {
      const a = probeBuf[i] < 0 ? -probeBuf[i] : probeBuf[i];
      if (a > peak) peak = a;
    }
    return peak;
  };

  const vAny = video as unknown as { audioTracks?: { length: number } };
  log("audio pipeline created", {
    sampleRate: audioCtx.sampleRate,
    state: audioCtx.state,
    videoSrc: video.currentSrc?.slice(0, 80),
    audioTracks: vAny.audioTracks?.length ?? null,
  });

  const ensureRunning = async () => {
    if (audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
        log("audioCtx resumed, state=" + audioCtx.state);
      } catch (e) {
        warn("audioCtx.resume() failed", e);
      }
    }
  };

  const destroy = () => {
    try {
      worklet.port.onmessage = null;
      worklet.disconnect();
    } catch {
      // ignore
    }
    try {
      source!.disconnect(worklet);
    } catch {
      // ignore
    }
    // Note: we intentionally do NOT close audioCtx so the MediaElementSource
    // remains valid if the same <video> is reused. The source stays connected
    // to destination so user keeps hearing audio.
  };

  return { audioCtx, source, worklet, analyser, probeAnalyser, destroy, ensureRunning };
}
