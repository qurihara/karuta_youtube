// Main-thread VAD. We can't use a Worker on YouTube: Chrome's MV3 rejects
// `new Worker('chrome-extension://...')` from a page origin ("cannot be
// accessed from origin"), and YouTube's CSP `script-src` (used as
// `worker-src` fallback) doesn't allow `blob:` either. Inference is small
// per frame (~1–5ms for Silero) so running on the content script's main
// thread is fine. YouTube CSP includes `'unsafe-eval'`, so onnxruntime-web's
// WASM compilation is permitted.
import * as ort from "onnxruntime-web";
import { DEFAULT_VAD_OPTIONS, type VADOptions } from "../workers/protocol";

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
  inSpeech: boolean;
  speechSegments: number;
  lastFrameAt: number;
}

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

  // diagnostics
  private framesProcessed = 0;
  private lastProb = 0;
  private speechSegments = 0;
  private lastFrameAt = 0;

  constructor(private readonly cb: VADCallbacks) {}

  getStats(): VADStats {
    return {
      ready: this.session !== null,
      framesProcessed: this.framesProcessed,
      lastProb: this.lastProb,
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
      this.reset();
      this.cb.onReady?.();
    } catch (e) {
      const m = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      this.cb.onError(`init failed: ${m}`);
    }
  }

  reset(): void {
    this.state.fill(0);
    this.inSpeech = false;
    this.consecutiveSpeechMs = 0;
    this.consecutiveSilenceMs = 0;
    this.pendingStartTime = 0;
    this.lastSpeechFrameTime = 0;
    this.lastTransitionTime = 0;
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

    const inputTensor = new ort.Tensor("float32", pcm, [1, pcm.length]);
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
    this.lastFrameAt = tFrameStart;

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
