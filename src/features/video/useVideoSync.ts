import type { RefObject } from "react";
import { useAnimationFrame } from "@/lib/useAnimationFrame";

export interface Clock {
  /** Seconds the audio engine is playing right now */
  position: number;
  playing: boolean;
  speed: number;
}

/** Beyond this the video jumps; below it the playback rate is nudged, which is invisible. */
const SEEK_THRESHOLD = 0.25;
/** Accuracy kept while paused (one frame at 25 fps). */
const PAUSED_TOLERANCE = 0.04;
/** Largest speed nudge used to catch up, as a share of the speed. */
const MAX_NUDGE = 0.1;

/**
 * Makes a muted <video> follow the audio clock: same speed, drift corrected by tiny
 * playback-rate changes, seeking only when the gap is large. Audio stays the master.
 */
export function useVideoSync(ref: RefObject<HTMLVideoElement | null>, clock: () => Clock) {
  useAnimationFrame(() => {
    const video = ref.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA || video.seeking) return;
    const { position, playing, speed } = clock();

    if (!playing) {
      if (!video.paused) video.pause();
      if (Math.abs(video.currentTime - position) > PAUSED_TOLERANCE) video.currentTime = position;
      return;
    }

    const drift = video.currentTime - position;
    if (Math.abs(drift) > SEEK_THRESHOLD) {
      video.currentTime = position;
    } else {
      const nudge = Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, -drift * 2));
      video.playbackRate = speed * (1 + nudge);
    }
    if (video.paused) void video.play().catch(() => {});
  });
}
