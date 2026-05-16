import type { Segment } from "../segment-tracker";

export interface TimelineRenderInput {
  nowMedia: number;
  windowSeconds: number;
  segments: Segment[];
  utaStartMedia: number | null;
  inSpeechStart: number | null;
}

export class TimelineRenderer {
  private ctx: CanvasRenderingContext2D | null;
  private dpr: number;
  private width = 0;
  private height = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.resize();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    if (this.ctx) {
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
  }

  render(input: TimelineRenderInput): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { nowMedia, windowSeconds, segments, utaStartMedia, inSpeechStart } = input;
    const w = this.width;
    const h = this.height;
    if (w <= 0 || h <= 0) return;

    const tMin = nowMedia - windowSeconds;
    const xOf = (t: number) => ((t - tMin) / windowSeconds) * w;

    ctx.clearRect(0, 0, w, h);

    // Speech bars
    ctx.fillStyle = "rgba(226, 232, 240, 0.65)";
    for (const seg of segments) {
      if (seg.mediaEnd < tMin) continue;
      if (seg.mediaStart > nowMedia) continue;
      const x1 = Math.max(0, xOf(seg.mediaStart));
      const x2 = Math.min(w, xOf(seg.mediaEnd));
      if (x2 > x1) {
        ctx.fillRect(x1, 4, x2 - x1, h - 8);
      }
    }

    // Currently-active speech (no end yet)
    if (inSpeechStart !== null && inSpeechStart < nowMedia) {
      const x1 = Math.max(0, xOf(inSpeechStart));
      const x2 = Math.min(w, xOf(nowMedia));
      ctx.fillStyle = "rgba(59, 130, 246, 0.55)";
      if (x2 > x1) ctx.fillRect(x1, 4, x2 - x1, h - 8);
    }

    // Uta start marker (blue triangle on top)
    if (utaStartMedia !== null && utaStartMedia >= tMin && utaStartMedia <= nowMedia) {
      const x = xOf(utaStartMedia);
      ctx.fillStyle = "#2563eb";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - 5, 6);
      ctx.lineTo(x + 5, 6);
      ctx.closePath();
      ctx.fill();
    }

    // Current playhead
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w - 0.5, 0);
    ctx.lineTo(w - 0.5, h);
    ctx.stroke();
  }
}
