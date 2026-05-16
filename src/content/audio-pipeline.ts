import { log, warn } from "../lib/log";

const sourceNodes = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

export interface AudioPipelineHandlers {
  onFrame(pcm: Float32Array, tFrameStart: number): void;
}

export interface AudioPipeline {
  audioCtx: AudioContext;
  source: MediaElementAudioSourceNode;
  worklet: AudioWorkletNode;
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

  source.connect(audioCtx.destination);
  source.connect(worklet);

  log("audio pipeline created", {
    sampleRate: audioCtx.sampleRate,
    state: audioCtx.state,
  });

  const ensureRunning = async () => {
    if (audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
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

  return { audioCtx, source, worklet, destroy, ensureRunning };
}
