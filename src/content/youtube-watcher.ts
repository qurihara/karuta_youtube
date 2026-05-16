import { log } from "../lib/log";

export type NavCallback = (url: string) => void;

const LIVE_PATH_RE = /^\/live\/([A-Za-z0-9_-]{6,})\/?$/;

const parseVideoLocation = (
  url: string,
): { videoId: string; livePath: boolean } | null => {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("youtube.com")) return null;
    if (u.pathname === "/watch") {
      const v = u.searchParams.get("v");
      return v ? { videoId: v, livePath: false } : null;
    }
    const live = u.pathname.match(LIVE_PATH_RE);
    if (live) return { videoId: live[1], livePath: true };
    return null;
  } catch {
    return null;
  }
};

export const isVideoPage = (url: string): boolean =>
  parseVideoLocation(url) !== null;

export const currentVideoId = (): string | null =>
  parseVideoLocation(location.href)?.videoId ?? null;

export const isLivePathUrl = (url: string = location.href): boolean =>
  parseVideoLocation(url)?.livePath ?? false;

export class YouTubeWatcher {
  private lastVideoId: string | null = null;
  private lastPath = location.pathname;
  private observer: MutationObserver | null = null;
  private cb: NavCallback | null = null;

  start(cb: NavCallback): void {
    this.cb = cb;
    this.lastVideoId = currentVideoId();

    // Patch history.pushState/replaceState to receive SPA navigations.
    // Content scripts run in an isolated world but share the document,
    // so listen for popstate and also poll on rAF via MutationObserver
    // on title.
    window.addEventListener("popstate", this.onLocationChanged);

    const titleEl = document.querySelector("title");
    if (titleEl) {
      this.observer = new MutationObserver(() => this.onLocationChanged());
      this.observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    }

    // Also poll href every 1s as a safety net
    setInterval(() => this.onLocationChanged(), 1000);

    // Initial fire
    if (isVideoPage(location.href)) {
      cb(location.href);
    }
  }

  private onLocationChanged = () => {
    if (location.pathname !== this.lastPath || currentVideoId() !== this.lastVideoId) {
      this.lastPath = location.pathname;
      const vid = currentVideoId();
      this.lastVideoId = vid;
      log("nav change", { path: this.lastPath, videoId: vid });
      this.cb?.(location.href);
    }
  };

  stop(): void {
    window.removeEventListener("popstate", this.onLocationChanged);
    this.observer?.disconnect();
    this.observer = null;
  }

  static isVideoPage = isVideoPage;
}
