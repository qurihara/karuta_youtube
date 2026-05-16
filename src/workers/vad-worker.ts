import * as ort from "onnxruntime-web";
import type { FromVad, ToVad, VADOptions } from "./protocol";
import { DEFAULT_VAD_OPTIONS, PROTOCOL_VERSION } from "./protocol";

let session: ort.InferenceSession | null = null;
let opts: VADOptions = { ...DEFAULT_VAD_OPTIONS };

// Silero v5 stateful inputs:
// - input: Float32Array [1, 512]
// - state: Float32Array [2, 1, 128]
// - sr: BigInt64 scalar
let state = new Float32Array(2 * 1 * 128);
const stateDims = [2, 1, 128];

// Streaming state for hysteresis
let inSpeech = false;
let lastTransitionTime = 0;
let consecutiveSpeechMs = 0;
let consecutiveSilenceMs = 0;
let pendingStartTime = 0;
let lastSpeechFrameTime = 0;

const post = (msg: FromVad, transfer?: Transferable[]) => {
  if (transfer && transfer.length) {
    (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer);
  } else {
    (self as DedicatedWorkerGlobalScope).postMessage(msg);
  }
};

const resetStreamState = () => {
  state.fill(0);
  inSpeech = false;
  lastTransitionTime = 0;
  consecutiveSpeechMs = 0;
  consecutiveSilenceMs = 0;
  pendingStartTime = 0;
  lastSpeechFrameTime = 0;
};

async function init(modelUrl: string, version: number, initOpts: VADOptions) {
  if (version !== PROTOCOL_VERSION) {
    post({ type: "error", message: `protocol version mismatch (worker=${PROTOCOL_VERSION}, host=${version})` });
    return;
  }
  opts = initOpts;
  try {
    const base = modelUrl.substring(0, modelUrl.lastIndexOf("/") + 1);
    const wasmBase = base.replace(/models\/$/, "assets/");
    ort.env.wasm.wasmPaths = wasmBase;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.logLevel = "warning";

    // Fetch the model ourselves so we can fail fast with a clear error if
    // the file is missing (otherwise ort can hang opaquely).
    const res = await fetch(modelUrl);
    if (!res.ok) {
      throw new Error(`model fetch ${res.status} ${res.statusText} (${modelUrl})`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());

    session = await ort.InferenceSession.create(buf, {
      executionProviders: ["wasm"],
    });
    resetStreamState();
    post({ type: "ready" });
  } catch (e) {
    const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    post({ type: "error", message: `vad init failed: ${message}` });
  }
}

async function processFrame(pcm: Float32Array, tFrameStart: number) {
  if (!session) return;
  if (pcm.length !== opts.frameSize) return;

  const frameDurMs = (opts.frameSize / opts.sampleRate) * 1000;

  let prob = 0;
  try {
    const inputTensor = new ort.Tensor("float32", pcm, [1, pcm.length]);
    const stateTensor = new ort.Tensor("float32", state, stateDims);
    const srTensor = new ort.Tensor("int64", BigInt64Array.from([BigInt(opts.sampleRate)]), []);
    const feeds: Record<string, ort.Tensor> = {
      input: inputTensor,
      state: stateTensor,
      sr: srTensor,
    };
    const results = await session.run(feeds);
    const outputName = session.outputNames.find((n) => n === "output") ?? session.outputNames[0];
    const newStateName = session.outputNames.find((n) => n === "stateN") ?? session.outputNames[1];
    const outProb = results[outputName].data as Float32Array;
    prob = outProb[0];
    const newState = results[newStateName].data as Float32Array;
    state = new Float32Array(newState);
  } catch (e) {
    post({ type: "error", message: `vad inference failed: ${(e as Error).message}` });
    return;
  }

  // Hysteresis state machine
  if (!inSpeech) {
    if (prob >= opts.speechThreshold) {
      if (consecutiveSpeechMs === 0) {
        pendingStartTime = tFrameStart - (opts.speechPadMs / 1000);
      }
      consecutiveSpeechMs += frameDurMs;
      consecutiveSilenceMs = 0;
      if (consecutiveSpeechMs >= opts.minSpeechMs) {
        inSpeech = true;
        lastTransitionTime = pendingStartTime;
        lastSpeechFrameTime = tFrameStart;
        post({ type: "speech-start", tStart: pendingStartTime });
      }
    } else {
      consecutiveSpeechMs = 0;
    }
  } else {
    if (prob < opts.negativeThreshold) {
      consecutiveSilenceMs += frameDurMs;
      if (consecutiveSilenceMs >= opts.minSilenceMs) {
        inSpeech = false;
        const tEnd = lastSpeechFrameTime + (opts.speechPadMs / 1000);
        post({ type: "speech-end", tStart: lastTransitionTime, tEnd });
        consecutiveSilenceMs = 0;
        consecutiveSpeechMs = 0;
      }
    } else {
      consecutiveSilenceMs = 0;
      if (prob >= opts.speechThreshold) {
        lastSpeechFrameTime = tFrameStart + (opts.frameSize / opts.sampleRate);
      }
    }
  }
}

self.onmessage = async (ev: MessageEvent<ToVad>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case "init":
        await init(msg.modelUrl, msg.version, msg.opts);
        break;
      case "audio":
        await processFrame(msg.pcm, msg.tFrameStart);
        break;
      case "reset":
        resetStreamState();
        break;
      case "configure":
        opts = { ...opts, ...msg.opts };
        break;
    }
  } catch (e) {
    const m = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    post({ type: "error", message: `worker handler failed (${msg.type}): ${m}` });
  }
};

self.addEventListener("error", (ev: ErrorEvent) => {
  post({ type: "error", message: `worker error: ${ev.message} @ ${ev.filename}:${ev.lineno}` });
});

self.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
  const reason = ev.reason instanceof Error ? `${ev.reason.name}: ${ev.reason.message}` : String(ev.reason);
  post({ type: "error", message: `unhandled rejection: ${reason}` });
});
