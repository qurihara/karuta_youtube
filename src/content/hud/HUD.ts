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

type Attrs = Record<string, string>;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
};

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
  private readonly panelRoot: HTMLDivElement;
  private readonly debugLine: HTMLDivElement;
  private readonly debugMic: HTMLSpanElement;
  private readonly debugText: HTMLSpanElement;
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

    // Construct via DOM APIs (avoids Trusted Types restrictions that
    // YouTube enforces — innerHTML throws a TrustedTypePolicyViolationError
    // DOMException on this page).
    this.rewindBtn = el(
      "button",
      { class: "rewind-btn inactive", type: "button", title: "読みの直前に戻す" },
      [el("span", {}, ["◀"]), el("span", {}, ["読みの直前に戻す"])],
    );
    this.gearBtn = el(
      "button",
      { class: "gear-btn", type: "button", title: "詳細設定" },
      ["⚙"],
    );
    const topRow = el("div", { class: "row" }, [this.rewindBtn, this.gearBtn]);

    this.nSlider = el("input", {
      class: "n-slider",
      type: "range",
      min: "0",
      max: "5",
      step: "0.1",
    });
    this.nValue = el("span", { class: "n-value" }, ["2.0s"]);
    const nRow = el("div", { class: "row n-row" }, [
      el("span", { class: "n-label" }, ["N"]),
      this.nSlider,
      this.nValue,
    ]);

    this.canvas = el("canvas", {
      class: "timeline",
      width: "240",
      height: "24",
    });

    this.statusDot = el("span", { class: "dot loading" });
    this.statusText = el("span", { class: "status-text" }, ["起動中"]);
    this.liveBadge = el("span", { class: "live-badge" }, ["LIVE"]);
    const statusRow = el("div", { class: "status" }, [
      el("span", {}, [this.statusDot, this.statusText]),
      this.liveBadge,
    ]);

    this.gapSlider = el("input", {
      class: "gap-slider",
      type: "range",
      min: "0.5",
      max: "3",
      step: "0.1",
    });
    this.gapValue = el("span", { class: "gap-value" }, ["1.5s"]);
    const gapRow = el("div", { class: "row n-row" }, [
      el("span", { class: "n-label" }, ["無音閾値"]),
      this.gapSlider,
      this.gapValue,
    ]);
    this.settingsPanel = el("div", { class: "settings-panel" }, [gapRow]);

    this.debugMic = el("span", { class: "mic" });
    this.debugText = el("span", { class: "debug-text" }, ["—"]);
    this.debugLine = el("div", { class: "debug" }, [this.debugMic, this.debugText]);

    const panel = el("div", { class: "panel" }, [
      topRow,
      nRow,
      this.canvas,
      statusRow,
      this.debugLine,
      this.settingsPanel,
    ]);
    panel.style.setProperty(
      "--karuta-idle-opacity",
      String(this.settings.hudOpacityIdle),
    );
    this.panelRoot = panel;
    this.shadow.appendChild(panel);

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

  setDebug(text: string, micActive: boolean) {
    this.debugText.textContent = text;
    this.debugMic.classList.toggle("active", micActive);
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
