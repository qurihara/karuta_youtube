import { Hud } from "./HUD";

export class HudMount {
  private currentParent: Node | null = null;
  private fullscreenHandler: (() => void) | null = null;

  constructor(private readonly hud: Hud) {}

  mount() {
    this.attachToCurrentTarget();
    this.fullscreenHandler = () => this.attachToCurrentTarget();
    document.addEventListener("fullscreenchange", this.fullscreenHandler);
    document.addEventListener("webkitfullscreenchange", this.fullscreenHandler);
  }

  private attachToCurrentTarget() {
    const fsEl = (document.fullscreenElement ??
      (document as unknown as { webkitFullscreenElement?: Element })
        .webkitFullscreenElement) as Element | null;
    const target = (fsEl ?? document.body) as Element;
    if (this.currentParent === target) return;
    this.currentParent = target;
    this.hud.attach(target);
  }

  unmount() {
    if (this.fullscreenHandler) {
      document.removeEventListener("fullscreenchange", this.fullscreenHandler);
      document.removeEventListener("webkitfullscreenchange", this.fullscreenHandler);
      this.fullscreenHandler = null;
    }
    this.hud.detach();
    this.currentParent = null;
  }
}
