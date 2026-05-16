import { log, warn } from "../lib/log";
import { earliestSeekableTime } from "./live-detect";

export interface RewindResult {
  attempted: number;
  target: number;
  clampedToSeekable: boolean;
}

export class RewindController {
  constructor(private readonly video: HTMLVideoElement) {}

  rewindTo(utaStartMedia: number, rewindSeconds: number): RewindResult {
    const desired = utaStartMedia - rewindSeconds;
    const earliest = earliestSeekableTime(this.video);
    const target = Math.max(earliest, desired);
    const clamped = target > desired + 1e-3;
    log("rewind", {
      utaStartMedia,
      rewindSeconds,
      desired,
      target,
      earliest,
      clamped,
    });
    try {
      this.video.currentTime = target;
      if (this.video.paused) {
        void this.video.play();
      }
    } catch (e) {
      warn("rewind failed", e);
    }
    return { attempted: desired, target, clampedToSeekable: clamped };
  }
}
