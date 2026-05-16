export const PROTOCOL_VERSION = 1;

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

export type ToVad =
  | {
      type: "init";
      version: number;
      modelUrl: string;
      opts: VADOptions;
    }
  | {
      type: "audio";
      pcm: Float32Array;
      tFrameStart: number;
    }
  | { type: "reset" }
  | { type: "configure"; opts: Partial<VADOptions> };

export type FromVad =
  | { type: "ready" }
  | { type: "speech-start"; tStart: number }
  | { type: "speech-end"; tStart: number; tEnd: number }
  | { type: "error"; message: string };
