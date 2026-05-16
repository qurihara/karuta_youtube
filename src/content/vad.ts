// Main-thread VAD. We can't use a Worker on YouTube: Chrome's MV3 rejects
// `new Worker('chrome-extension://...')` from a page origin ("cannot be
// accessed from origin"), and YouTube's CSP `script-src` (used as
// `worker-src` fallback) doesn't allow `blob:` either. Inference is small
// per frame (~1–5ms for Silero) so running on the content script's main
// thread is fine. YouTube CSP includes `'unsafe-eval'`, so onnxruntime-web's
// WASM compilation is permitted.
import * as ort from "onnxruntime-web";
import { DEFAULT_VAD_OPTIONS, type VADOptions } from "../workers/protocol";
import { log, warn } from "../lib/log";

export interface VADCallbacks {
  onReady?(): void;
  onSpeechStart(tStart: number): void;
  onSpeechEnd(tStart: number, tEnd: number): void;
  onError(message: string): void;
}

const STATE_DIMS = [2, 1, 128];

export interface VADStats {
  ready: boolean;
  framesProcessed: number;
  lastProb: number;
  maxProb: number;
  lastPeak: number;
  maxPeak: number;
  agcGain: number;
  inSpeech: boolean;
  speechSegments: number;
  lastFrameAt: number;
}

// Simple peak-tracking AGC. Karuta videos can be mastered quietly and/or
// the user can have the YouTube volume slider below 100 %, both of which
// attenuate the samples reaching MediaElementAudioSourceNode and starve
// Silero VAD. We push the recent peak toward TARGET_PEAK with a one-shot
// attack and a ~1s release.
const AGC_TARGET_PEAK = 0.5;
const AGC_MAX_GAIN = 32;
const AGC_RELEASE_PER_FRAME = 0.98; // ~31 frames per second at 32ms each

export class MainThreadVAD {
  private session: ort.InferenceSession | null = null;
  private state = new Float32Array(2 * 1 * 128);
  private opts: VADOptions = { ...DEFAULT_VAD_OPTIONS };
  private queue: Promise<unknown> = Promise.resolve();

  // hysteresis state
  private inSpeech = false;
  private lastTransitionTime = 0;
  private consecutiveSpeechMs = 0;
  private consecutiveSilenceMs = 0;
  private pendingStartTime = 0;
  private lastSpeechFrameTime = 0;

  // AGC state
  private runningPeak = 0;
  private currentGain = 1;

  // diagnostics
  private framesProcessed = 0;
  private lastProb = 0;
  private maxProb = 0;
  private lastPeak = 0;
  private maxPeak = 0;
  private speechSegments = 0;
  private lastFrameAt = 0;

  constructor(private readonly cb: VADCallbacks) {}

  getStats(): VADStats {
    return {
      ready: this.session !== null,
      framesProcessed: this.framesProcessed,
      lastProb: this.lastProb,
      maxProb: this.maxProb,
      lastPeak: this.lastPeak,
      maxPeak: this.maxPeak,
      agcGain: this.currentGain,
      inSpeech: this.inSpeech,
      speechSegments: this.speechSegments,
      lastFrameAt: this.lastFrameAt,
    };
  }

  async init(modelUrl: string, wasmBase: string): Promise<void> {
    try {
      ort.env.wasm.wasmPaths = wasmBase;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.logLevel = "warning";

      const res = await fetch(modelUrl);
      if (!res.ok) {
        throw new Error(`model fetch ${res.status} ${res.statusText} (${modelUrl})`);
      }
      const buf = new Uint8Array(await res.arrayBuffer());

      this.session = await ort.InferenceSession.create(buf, {
        executionProviders: ["wasm"],
      });
      // Surface the model signature so we can confirm we're hitting the
      // Silero v5 ports ("input"/"state"/"sr" → "output"/"stateN").
      // Wrong names or shapes would normally throw at run-time, but a
      // model that returns prob 0 forever needs verification.
      const meta = (this.session as unknown as {
        inputMetadata?: Record<string, { type?: string; dims?: unknown[] }>;
        outputMetadata?: Record<string, { type?: string; dims?: unknown[] }>;
      });
      log(
        "VAD model loaded:",
        JSON.stringify({
          inputs: this.session.inputNames,
          outputs: this.session.outputNames,
          inputMetadata: meta.inputMetadata
            ? Object.fromEntries(
                Object.entries(meta.inputMetadata).map(([k, v]) => [
                  k,
                  { type: v.type, dims: v.dims },
                ]),
              )
            : null,
          outputMetadata: meta.outputMetadata
            ? Object.fromEntries(
                Object.entries(meta.outputMetadata).map(([k, v]) => [
                  k,
                  { type: v.type, dims: v.dims },
                ]),
              )
            : null,
        }),
      );
      this.reset();
      await this.runSelfTest();
      this.cb.onReady?.();
    } catch (e) {
      const m = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      this.cb.onError(`init failed: ${m}`);
    }
  }

  private async runSelfTest(): Promise<void> {
    if (!this.session) return;
    const N = this.opts.frameSize;
    const SR = this.opts.sampleRate;

    const cases: Array<{ name: string; sig: Float32Array }> = [
      {
        name: "all_zeros",
        sig: new Float32Array(N),
      },
      {
        name: "sine_440hz_0.3",
        sig: (() => {
          const s = new Float32Array(N);
          for (let i = 0; i < N; i++)
            s[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / SR);
          return s;
        })(),
      },
      {
        name: "white_noise_0.3",
        sig: (() => {
          const s = new Float32Array(N);
          for (let i = 0; i < N; i++) s[i] = (Math.random() - 0.5) * 0.6;
          return s;
        })(),
      },
      {
        name: "modulated_noise_speechlike",
        sig: (() => {
          // White noise modulated by ~5Hz syllabic envelope at peak 0.5.
          const s = new Float32Array(N);
          for (let i = 0; i < N; i++) {
            const env = 0.5 * Math.abs(Math.sin((2 * Math.PI * 5 * i) / SR));
            s[i] = (Math.random() - 0.5) * env * 2;
          }
          return s;
        })(),
      },
    ];

    const results: Record<string, number[]> = {};
    for (const c of cases) {
      let testState = new Float32Array(2 * 1 * 128);
      const probs: number[] = [];
      // Feed the same signal 10 times so the LSTM state can adapt.
      for (let f = 0; f < 10; f++) {
        const input = new ort.Tensor("float32", c.sig, [1, N]);
        const state = new ort.Tensor("float32", testState, STATE_DIMS);
        const sr = new ort.Tensor(
          "int64",
          BigInt64Array.from([BigInt(SR)]),
          [],
        );
        try {
          const out = await this.session.run({ input, state, sr });
          const oName =
            this.session.outputNames.find((n) => n === "output") ??
            this.session.outputNames[0];
          const sName =
            this.session.outputNames.find((n) => n === "stateN") ??
            this.session.outputNames[1];
          probs.push(+(out[oName].data as Float32Array)[0].toFixed(6));
          testState = new Float32Array(out[sName].data as Float32Array);
        } catch (e) {
          warn("self-test threw on", c.name, "frame", f, (e as Error).message);
          break;
        }
      }
      results[c.name] = probs;
    }
    log("VAD self-test results:", JSON.stringify(results));
  }

  reset(): void {
    this.state.fill(0);
    this.inSpeech = false;
    this.consecutiveSpeechMs = 0;
    this.consecutiveSilenceMs = 0;
    this.pendingStartTime = 0;
    this.lastSpeechFrameTime = 0;
    this.lastTransitionTime = 0;
    this.runningPeak = 0;
    this.currentGain = 1;
    // Drain queued frames so the next frame starts cleanly after a seek.
    this.queue = Promise.resolve();
  }

  configure(opts: Partial<VADOptions>): void {
    this.opts = { ...this.opts, ...opts };
  }

  /** Queue a frame for inference. Events delivered via callbacks. */
  processFrame(pcm: Float32Array, tFrameStart: number): void {
    this.queue = this.queue
      .then(() => this.runFrame(pcm, tFrameStart))
      .catch((e) => {
        const m = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        this.cb.onError(`inference: ${m}`);
      });
  }

  private async runFrame(pcm: Float32Array, tFrameStart: number): Promise<void> {
    if (!this.session) return;
    if (pcm.length !== this.opts.frameSize) return;

    const frameDurMs = (this.opts.frameSize / this.opts.sampleRate) * 1000;

    // Measure raw peak before AGC (for diagnostics).
    let rawPeak = 0;
    for (let i = 0; i < pcm.length; i++) {
      const a = pcm[i] < 0 ? -pcm[i] : pcm[i];
      if (a > rawPeak) rawPeak = a;
    }
    this.lastPeak = rawPeak;

    // Update running peak with attack=immediate, release per frame.
    this.runningPeak = Math.max(
      rawPeak,
      this.runningPeak * AGC_RELEASE_PER_FRAME,
    );
    this.currentGain =
      this.runningPeak > 0.001
        ? Math.min(AGC_MAX_GAIN, AGC_TARGET_PEAK / this.runningPeak)
        : 1;

    // Apply gain with hard clip. Reuse a scratch buffer to avoid GC churn.
    const boosted = new Float32Array(pcm.length);
    const g = this.currentGain;
    for (let i = 0; i < pcm.length; i++) {
      let s = pcm[i] * g;
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      boosted[i] = s;
    }

    const inputTensor = new ort.Tensor("float32", boosted, [1, boosted.length]);
    const stateTensor = new ort.Tensor("float32", this.state, STATE_DIMS);
    const srTensor = new ort.Tensor(
      "int64",
      BigInt64Array.from([BigInt(this.opts.sampleRate)]),
      [],
    );
    const results = await this.session.run({
      input: inputTensor,
      state: stateTensor,
      sr: srTensor,
    });
    const outputName =
      this.session.outputNames.find((n) => n === "output") ??
      this.session.outputNames[0];
    const newStateName =
      this.session.outputNames.find((n) => n === "stateN") ??
      this.session.outputNames[1];
    const prob = (results[outputName].data as Float32Array)[0];
    this.state = new Float32Array(results[newStateName].data as Float32Array);

    this.framesProcessed++;
    this.lastProb = prob;
    if (prob > this.maxProb) this.maxProb = prob;
    if (rawPeak > this.maxPeak) this.maxPeak = rawPeak;
    this.lastFrameAt = tFrameStart;

    // Dump detail for a handful of early frames and then periodically
    // for frames with a noteworthy raw peak (≥ 0.05). This lets us see
    // what the model is actually returning without spamming the console.
    if (
      this.framesProcessed <= 5 ||
      this.framesProcessed % 200 === 0 ||
      (rawPeak >= 0.05 && this.framesProcessed % 30 === 0)
    ) {
      log(
        "vad frame",
        this.framesProcessed,
        JSON.stringify({
          rawPeak: +rawPeak.toFixed(4),
          gain: +this.currentGain.toFixed(2),
          boostedPeak: +(rawPeak * this.currentGain).toFixed(4),
          prob: +prob.toFixed(6),
          firstRaw: Array.from(pcm.slice(0, 5)).map((x) => +x.toFixed(4)),
          firstBoosted: Array.from(boosted.slice(0, 5)).map(
            (x) => +x.toFixed(4),
          ),
        }),
      );
    }

    // Hysteresis state machine
    if (!this.inSpeech) {
      if (prob >= this.opts.speechThreshold) {
        if (this.consecutiveSpeechMs === 0) {
          // Clamp so we never emit a negative AudioContext time near t=0.
          this.pendingStartTime = Math.max(
            0,
            tFrameStart - this.opts.speechPadMs / 1000,
          );
        }
        this.consecutiveSpeechMs += frameDurMs;
        this.consecutiveSilenceMs = 0;
        if (this.consecutiveSpeechMs >= this.opts.minSpeechMs) {
          this.inSpeech = true;
          this.lastTransitionTime = this.pendingStartTime;
          this.lastSpeechFrameTime = tFrameStart;
          this.speechSegments++;
          this.cb.onSpeechStart(this.pendingStartTime);
        }
      } else {
        this.consecutiveSpeechMs = 0;
      }
    } else {
      if (prob < this.opts.negativeThreshold) {
        this.consecutiveSilenceMs += frameDurMs;
        if (this.consecutiveSilenceMs >= this.opts.minSilenceMs) {
          this.inSpeech = false;
          const tEnd = this.lastSpeechFrameTime + this.opts.speechPadMs / 1000;
          this.cb.onSpeechEnd(this.lastTransitionTime, tEnd);
          this.consecutiveSilenceMs = 0;
          this.consecutiveSpeechMs = 0;
        }
      } else {
        this.consecutiveSilenceMs = 0;
        if (prob >= this.opts.speechThreshold) {
          this.lastSpeechFrameTime =
            tFrameStart + this.opts.frameSize / this.opts.sampleRate;
        }
      }
    }
  }
}
