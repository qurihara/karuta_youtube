// Karuta resampler audio worklet. Plain JS so AudioWorkletGlobalScope can load it directly.
// Downmixes input to mono, linear-resamples to 16kHz, emits 512-sample frames via port.

const TARGET_SAMPLE_RATE = 16000;
// 576 samples per frame at 16 kHz (36 ms). This is what the current Silero
// VAD ONNX model expects — earlier docs say 512, but the model the user
// downloaded from snakers4/silero-vad master in 2026 ships an STFT front-end
// that only produces correct activations at 576-sample chunks. Empirically
// 512 gives prob ≈ 0 even on clean speech, 576 gives prob > 0.99.
const FRAME_SIZE = 576;

class KarutaResampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(FRAME_SIZE);
    this.bufferPos = 0;
    this.resampleFraction = 0;
    this.lastSample = 0;
  }

  resampleAndFlush(input, sourceRate, chunkStartTime) {
    const ratio = sourceRate / TARGET_SAMPLE_RATE;
    let frac = this.resampleFraction;
    let last = this.lastSample;

    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      while (frac < 1) {
        const sample = last + (cur - last) * frac;
        this.buffer[this.bufferPos++] = sample;
        if (this.bufferPos >= FRAME_SIZE) {
          const out = this.buffer.slice();
          const tFrameStart =
            chunkStartTime +
            i / sourceRate -
            (FRAME_SIZE - 1) / TARGET_SAMPLE_RATE;
          this.port.postMessage({ pcm: out, tFrameStart }, [out.buffer]);
          this.buffer = new Float32Array(FRAME_SIZE);
          this.bufferPos = 0;
        }
        frac += ratio;
      }
      frac -= 1;
      last = cur;
    }
    this.resampleFraction = frac;
    this.lastSample = last;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;

    const len = input[0].length;
    const mono = new Float32Array(len);
    if (input.length === 1) {
      mono.set(input[0]);
    } else {
      const inv = 1 / input.length;
      for (let i = 0; i < len; i++) {
        let s = 0;
        for (let ch = 0; ch < input.length; ch++) {
          s += input[ch][i];
        }
        mono[i] = s * inv;
      }
    }

    this.resampleAndFlush(mono, sampleRate, currentTime);
    return true;
  }
}

registerProcessor("karuta-resampler", KarutaResampler);
