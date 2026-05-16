import { log } from "../lib/log";

export interface Segment {
  mediaStart: number;
  mediaEnd: number;
  isUtaCandidate: boolean;
}

export interface SegmentTrackerState {
  segments: Segment[];
  lastUtaStartMedia: number | null;
  inSpeech: boolean;
  currentSpeechStartMedia: number | null;
  lastSpeechEndMedia: number | null;
}

export interface SegmentTrackerCallbacks {
  onActiveChange(active: boolean, utaStartMedia: number | null): void;
  onSegmentsChange(state: SegmentTrackerState): void;
}

const MAX_SEGMENTS = 200;

export class SegmentTracker {
  private state: SegmentTrackerState = {
    segments: [],
    lastUtaStartMedia: null,
    inSpeech: false,
    currentSpeechStartMedia: null,
    lastSpeechEndMedia: null,
  };

  private gapThresholdSeconds: number;
  private readonly cb: SegmentTrackerCallbacks;

  constructor(gapThresholdSeconds: number, cb: SegmentTrackerCallbacks) {
    this.gapThresholdSeconds = gapThresholdSeconds;
    this.cb = cb;
  }

  setGapThreshold(seconds: number): void {
    this.gapThresholdSeconds = seconds;
  }

  getState(): SegmentTrackerState {
    return this.state;
  }

  reset(): void {
    const wasActive = this.state.lastUtaStartMedia !== null;
    this.state = {
      segments: [],
      lastUtaStartMedia: null,
      inSpeech: false,
      currentSpeechStartMedia: null,
      lastSpeechEndMedia: null,
    };
    if (wasActive) {
      this.cb.onActiveChange(false, null);
    }
    this.cb.onSegmentsChange(this.state);
  }

  onSpeechStart(mediaTime: number): void {
    if (this.state.inSpeech) {
      log("speech-start while already in speech, ignoring", mediaTime);
      return;
    }
    this.state.inSpeech = true;
    this.state.currentSpeechStartMedia = mediaTime;

    let prevGap = Infinity;
    if (this.state.lastSpeechEndMedia !== null) {
      prevGap = mediaTime - this.state.lastSpeechEndMedia;
    }

    const isUta = prevGap >= this.gapThresholdSeconds;
    if (isUta) {
      this.state.lastUtaStartMedia = mediaTime;
      log("uta candidate", { mediaTime, prevGap });
      this.cb.onActiveChange(true, mediaTime);
    } else {
      log("speech-start (short gap, breath)", { mediaTime, prevGap });
    }
    this.cb.onSegmentsChange(this.state);
  }

  onSpeechEnd(mediaEnd: number): void {
    if (!this.state.inSpeech || this.state.currentSpeechStartMedia === null) {
      return;
    }
    const seg: Segment = {
      mediaStart: this.state.currentSpeechStartMedia,
      mediaEnd,
      isUtaCandidate:
        this.state.lastUtaStartMedia === this.state.currentSpeechStartMedia,
    };
    this.state.segments.push(seg);
    if (this.state.segments.length > MAX_SEGMENTS) {
      this.state.segments.shift();
    }
    this.state.inSpeech = false;
    this.state.currentSpeechStartMedia = null;
    this.state.lastSpeechEndMedia = mediaEnd;
    log("speech-end", seg);
    this.cb.onSegmentsChange(this.state);
  }
}
