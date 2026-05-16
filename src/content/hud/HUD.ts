import type { Settings } from "../../lib/settings";
import type { SegmentTrackerState } from "../segment-tracker";
import { TimelineRenderer } from "./timeline";
import cssText from "./styles.css?inline";

export type HudStatus = "loading" | "ready" | "error";

export interface HudCallbacks {
  onRewindClick(): void;
  onNChange(value: number): void;
  onGapChange(value: number): void;
}

export class Hud {
  private readonly host: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private readonly rewindBtn: HTMLButtonElement;
  private readonly nSlider: HTMLInputElement;
  private readonly nValue: HTMLSpanElement;
  private readonly gapSlider: HTMLInputElement;
  private readonly gapValue: HTMLSpanElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly settingsPanel: HTMLDivElement;
  private readonly gearBtn: HTMLButtonElement;
  private readonly statusDot: HTMLSpanElement;
  private readonly statusText: HTMLSpanElement;
  private readonly liveBadge: HTMLSpanElement;
  private readonly timeline: TimelineRenderer;

  private active = false;
  private settings: Settings;

  constructor(initialSettings: Settings, private readonly cb: HudCallbacks) {
    this.settings = { ...initialSettings };

    this.host = document.createElement("div");
    this.host.id = "karuta-hud-root";
    this.shadow = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = cssText;
    this.shadow.appendChild(style);

    const panel = document.createElement("div");
    panel.className = "panel";
    panel.style.setProperty("--karuta-idle-opacity", String(this.settings.hudOpacityIdle));

    panel.innerHTML = `
      <div class="row">
        <button class="rewind-btn inactive" type="button" title="読みの直前に戻す">
          <span>◀</span><span>読みの直前に戻す</span>
        </button>
        <button class="gear-btn" type="button" title="詳細設定">⚙</button>
      </div>
      <div class="row n-row">
        <span class="n-label">N</span>
        <input class="n-slider" type="range" min="0" max="5" step="0.1" />
        <span class="n-value">2.0s</span>
      </div>
      <canvas class="timeline" width="240" height="24"></canvas>
      <div class="status">
        <span><span class="dot loading"></span><span class="status-text">起動中</span></span>
        <span class="live-badge">LIVE</span>
      </div>
      <div class="settings-panel">
        <div class="row n-row">
          <span class="n-label">無音閾値</span>
          <input class="gap-slider" type="range" min="0.5" max="3" step="0.1" />
          <span class="gap-value">1.5s</span>
        </div>
      </div>
    `;

    this.shadow.appendChild(panel);

    this.rewindBtn = panel.querySelector(".rewind-btn") as HTMLButtonElement;
    this.nSlider = panel.querySelector(".n-slider") as HTMLInputElement;
    this.nValue = panel.querySelector(".n-value") as HTMLSpanElement;
    this.gapSlider = panel.querySelector(".gap-slider") as HTMLInputElement;
    this.gapValue = panel.querySelector(".gap-value") as HTMLSpanElement;
    this.canvas = panel.querySelector(".timeline") as HTMLCanvasElement;
    this.settingsPanel = panel.querySelector(".settings-panel") as HTMLDivElement;
    this.gearBtn = panel.querySelector(".gear-btn") as HTMLButtonElement;
    this.statusDot = panel.querySelector(".dot") as HTMLSpanElement;
    this.statusText = panel.querySelector(".status-text") as HTMLSpanElement;
    this.liveBadge = panel.querySelector(".live-badge") as HTMLSpanElement;

    this.nSlider.value = String(this.settings.rewindSeconds);
    this.nValue.textContent = `${this.settings.rewindSeconds.toFixed(1)}s`;
    this.gapSlider.value = String(this.settings.gapThresholdSeconds);
    this.gapValue.textContent = `${this.settings.gapThresholdSeconds.toFixed(1)}s`;

    this.timeline = new TimelineRenderer(this.canvas);

    this.bind();
  }

  private bind() {
    this.rewindBtn.addEventListener("click", () => {
      if (!this.active) return;
      this.cb.onRewindClick();
    });

    this.nSlider.addEventListener("input", () => {
      const v = parseFloat(this.nSlider.value);
      this.nValue.textContent = `${v.toFixed(1)}s`;
      this.settings.rewindSeconds = v;
      this.cb.onNChange(v);
    });

    this.gapSlider.addEventListener("input", () => {
      const v = parseFloat(this.gapSlider.value);
      this.gapValue.textContent = `${v.toFixed(1)}s`;
      this.settings.gapThresholdSeconds = v;
      this.cb.onGapChange(v);
    });

    this.gearBtn.addEventListener("click", () => {
      this.settingsPanel.classList.toggle("open");
    });
  }

  attach(parent: Node) {
    if (this.host.parentNode !== parent) {
      parent.appendChild(this.host);
    }
  }

  detach() {
    this.host.remove();
  }

  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    this.rewindBtn.classList.toggle("active", active);
    this.rewindBtn.classList.toggle("inactive", !active);
  }

  setStatus(status: HudStatus, text: string) {
    this.statusDot.classList.remove("loading", "ready", "error");
    this.statusDot.classList.add(status);
    this.statusText.textContent = text;
  }

  setLive(isLive: boolean) {
    this.liveBadge.classList.toggle("on", isLive);
  }

  updateSettings(patch: Partial<Settings>) {
    Object.assign(this.settings, patch);
    if (typeof patch.rewindSeconds === "number") {
      this.nSlider.value = String(patch.rewindSeconds);
      this.nValue.textContent = `${patch.rewindSeconds.toFixed(1)}s`;
    }
    if (typeof patch.gapThresholdSeconds === "number") {
      this.gapSlider.value = String(patch.gapThresholdSeconds);
      this.gapValue.textContent = `${patch.gapThresholdSeconds.toFixed(1)}s`;
    }
    if (typeof patch.hudOpacityIdle === "number") {
      const panel = this.shadow.querySelector(".panel") as HTMLDivElement;
      panel.style.setProperty("--karuta-idle-opacity", String(patch.hudOpacityIdle));
    }
  }

  renderTimeline(nowMedia: number, state: SegmentTrackerState) {
    this.timeline.render({
      nowMedia,
      windowSeconds: this.settings.timelineSeconds,
      segments: state.segments,
      utaStartMedia: state.lastUtaStartMedia,
      inSpeechStart: state.currentSpeechStartMedia,
    });
  }

  hide() {
    this.host.style.display = "none";
  }

  show() {
    this.host.style.display = "";
  }
}
