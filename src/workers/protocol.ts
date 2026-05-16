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
  frameSize: 512,
  speechThreshold: 0.5,
  negativeThreshold: 0.35,
  minSpeechMs: 250,
  minSilenceMs: 200,
  speechPadMs: 100,
};
