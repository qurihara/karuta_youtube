import { isLivePathUrl } from "./youtube-watcher";

/**
 * Live判定。複数のヒントを合わせて判定する:
 * - URLが /live/<id> 形式
 * - video.duration が Infinity (HLS/DASH live stream)
 * - YouTubeプレイヤーの .ytp-live クラスや live-badge
 */
export const isLiveStream = (video: HTMLVideoElement | null): boolean => {
  if (isLivePathUrl()) return true;
  if (video && !Number.isFinite(video.duration)) return true;
  if (document.querySelector(".ytp-live")) return true;
  if (document.querySelector(".ytp-live-badge")) return true;
  return false;
};

/**
 * DVRバッファの最古時刻 (seekable範囲の先頭)。
 * 通常動画ではほぼ0、ライブでは数十秒〜数時間前を返す。
 */
export const earliestSeekableTime = (video: HTMLVideoElement): number => {
  try {
    if (video.seekable && video.seekable.length > 0) {
      return video.seekable.start(0);
    }
  } catch {
    // ignore
  }
  return 0;
};
