import { type RefObject, useEffect, useRef } from "react";
import { clamp } from "@/lib/time";
import { useAnimationFrame } from "@/lib/useAnimationFrame";

export interface Clock {
  /** Seconds the audio engine is playing right now */
  position: number;
  playing: boolean;
  speed: number;
}

/** Beyond this gap the video jumps; below it the playback rate is nudged, which is invisible. */
const SEEK_THRESHOLD = 0.3;
/** After a jump, let it settle this long before jumping again (only nudging meanwhile). */
const SEEK_COOLDOWN_MS = 800;
/** A clock moving back by more than this is a loop restart or a user seek: jump at once. */
const JUMP_BACK = 0.2;
/** Accuracy kept while paused (one frame at 25 fps). */
const PAUSED_TOLERANCE = 0.04;
/** Gaps smaller than this are left alone, so the rate does not flutter. */
const DEAD_ZONE = 0.03;
/** Largest speed nudge used to catch up, as a share of the speed. */
const MAX_NUDGE = 0.25;
/** First guess of how long a jump takes; then measured on the actual file. */
const INITIAL_SEEK_SECONDS = 0.15;

/**
 * Makes a muted <video> follow the audio clock. Audio stays the master.
 *
 * Seeking is slow on files with few keyframes, and the audio keeps moving meanwhile, so
 * a naive "seek when out of sync" can chase its own tail and stutter. Instead the time
 * a seek takes is measured, each seek aims that far ahead, and after a seek only small
 * speed nudges close the remaining gap.
 */
export function useVideoSync(ref: RefObject<HTMLVideoElement | null>, clock: () => Clock) {
  const state = useRef({
    requestedAt: 0,
    lastSeekAt: 0,
    seekSeconds: INITIAL_SEEK_SECONDS,
    lastPosition: 0,
  });

  // Learn how long seeks take on this file (moving average)
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const onSeeked = () => {
      const s = state.current;
      if (s.requestedAt === 0) return;
      const took = (performance.now() - s.requestedAt) / 1000;
      s.seekSeconds = Math.min(1.5, s.seekSeconds * 0.6 + took * 0.4);
      s.requestedAt = 0;
    };
    video.addEventListener("seeked", onSeeked);
    return () => video.removeEventListener("seeked", onSeeked);
  });

  useAnimationFrame((now) => {
    const video = ref.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA || video.seeking) return;
    const s = state.current;
    const { position, playing, speed } = clock();
    const jumpedBack = position < s.lastPosition - JUMP_BACK;
    s.lastPosition = position;

    const seek = (target: number) => {
      s.requestedAt = now;
      s.lastSeekAt = now;
      video.currentTime = Math.max(0, target);
    };

    if (!playing) {
      if (!video.paused) video.pause();
      video.playbackRate = speed;
      if (Math.abs(video.currentTime - position) > PAUSED_TOLERANCE) seek(position);
      return;
    }

    const drift = video.currentTime - position;
    const settled = now - s.lastSeekAt > SEEK_COOLDOWN_MS;
    if (jumpedBack || (Math.abs(drift) > SEEK_THRESHOLD && settled)) {
      // Aim where the audio will be once the seek has finished
      seek(position + s.seekSeconds * speed);
      video.playbackRate = speed;
    } else if (Math.abs(drift) > DEAD_ZONE) {
      const nudge = clamp(-drift * 1.5, -MAX_NUDGE, MAX_NUDGE);
      video.playbackRate = speed * (1 + nudge);
    } else {
      video.playbackRate = speed;
    }
    if (video.paused) void video.play().catch(() => {});
  });
}
