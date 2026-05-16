// Shared VAD configuration. Previously this file also defined a worker
// message protocol; VAD now runs on the main thread (see src/content/vad.ts)
// because MV3 + YouTube CSP refuse Workers from chrome-extension:// and
// blob: URLs from the page origin.

export interface VADOptions {
  sampleRate: 16000;
  frameSize: number;
  speechThreshold: number;
  negativeThreshold: number;
  minSpeechMs: number;
  minSilenceMs: number;
  speechPadMs: number;
}

export const DEFAULT_VAD_OPTIONS: VADOptions = {
  sampleRate: 16000,
  // Current Silero VAD ONNX (2026 build, "spox2" producer) needs 576 samples
  // per chunk at 16 kHz. Older docs say 512 — that's the v5 model. Feeding
  // 512 silently produces ~0 probability on clean speech.
  frameSize: 576,
  speechThreshold: 0.5,
  negativeThreshold: 0.35,
  minSpeechMs: 250,
  minSilenceMs: 200,
  speechPadMs: 100,
};
