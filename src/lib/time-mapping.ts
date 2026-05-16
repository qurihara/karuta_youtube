export interface Anchor {
  audioTime: number;
  mediaTime: number;
  rate: number;
  paused: boolean;
  seeking: boolean;
}

export class TimeMapper {
  private anchor: Anchor;
  private readonly video: HTMLVideoElement;
  private readonly audioCtx: AudioContext;
  private readonly listeners: Array<[string, EventListener]> = [];

  constructor(video: HTMLVideoElement, audioCtx: AudioContext) {
    this.video = video;
    this.audioCtx = audioCtx;
    this.anchor = this.snapshot();

    const refresh = () => {
      this.anchor = this.snapshot();
    };

    const events = [
      "play",
      "pause",
      "seeking",
      "seeked",
      "ratechange",
      "timeupdate",
      "loadedmetadata",
    ];
    for (const ev of events) {
      const handler = refresh as EventListener;
      this.listeners.push([ev, handler]);
      video.addEventListener(ev, handler);
    }
  }

  private snapshot(): Anchor {
    return {
      audioTime: this.audioCtx.currentTime,
      mediaTime: this.video.currentTime,
      rate: this.video.playbackRate || 1,
      paused: this.video.paused,
      seeking: this.video.seeking,
    };
  }

  /** Convert an AudioContext time (sec) to a media time (sec), or null if untrustworthy. */
  toMediaTime(audioTime: number): number | null {
    const a = this.anchor;
    if (a.seeking || a.paused) return null;
    const delta = (audioTime - a.audioTime) * a.rate;
    return a.mediaTime + delta;
  }

  /** Current media time captured from the latest anchor. */
  currentMediaTime(): number {
    return this.video.currentTime;
  }

  isStable(): boolean {
    return !this.video.seeking && !this.video.paused;
  }

  destroy(): void {
    for (const [ev, h] of this.listeners) {
      this.video.removeEventListener(ev, h);
    }
    this.listeners.length = 0;
  }
}
