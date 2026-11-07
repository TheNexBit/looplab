import { create } from "zustand";
import { GAP, LEAD_IN, MIN_LOOP } from "@/features/player/limits";
import { clamp } from "@/lib/time";

export interface LoopRegion {
  start: number;
  end: number;
}

export interface LoopOptions {
  enabled: boolean;
  /** Seconds played before the start on every repetition */
  leadIn: number;
  /** Seconds of silence between repetitions */
  gap: number;
}

const clampLeadIn = (seconds: number) => clamp(seconds, LEAD_IN.min, LEAD_IN.max);
const clampGap = (seconds: number) => clamp(seconds, GAP.min, GAP.max);

/** Ordered, inside the track and long enough; `null` if it cannot be. */
export function normalizeRegion(a: number, b: number, duration: number): LoopRegion | null {
  const start = clamp(Math.min(a, b), 0, duration);
  const end = clamp(Math.max(a, b), 0, duration);
  return end - start >= MIN_LOOP ? { start, end } : null;
}

/**
 * The loop moved by its own length, to the phrase before (`-1`) or after (`1`), kept inside
 * the track; `null` when it cannot move that way.
 */
export function shiftedRegion(
  region: LoopRegion,
  direction: -1 | 1,
  duration: number,
): LoopRegion | null {
  const length = region.end - region.start;
  const start = clamp(region.start + direction * length, 0, Math.max(0, duration - length));
  return Math.abs(start - region.start) < 1e-9 ? null : { start, end: start + length };
}

/** The loop made `factor` times as long from the same start, inside the track; `null` if unchanged. */
export function resizedRegion(
  region: LoopRegion,
  factor: number,
  duration: number,
): LoopRegion | null {
  const end = clamp(
    region.start + (region.end - region.start) * factor,
    region.start + MIN_LOOP,
    duration,
  );
  return Math.abs(end - region.end) < 1e-9 ? null : { start: region.start, end };
}

/** Where each repetition begins: the loop start minus the lead-in. */
export const restartAt = (region: LoopRegion, leadIn: number) => Math.max(0, region.start - leadIn);

/**
 * Where the playhead is once `elapsed` seconds of playback have passed since `from`,
 * following loop wraps (and the silent gap) like the engine does.
 */
export function advanceInLoop(
  from: number,
  elapsed: number,
  region: LoopRegion | null,
  options: LoopOptions,
): number {
  const position = from + elapsed;
  if (!region || !options.enabled || from >= region.end || position < region.end) return position;
  const restart = restartAt(region, options.leadIn);
  const cycle = region.end - restart + options.gap;
  const over = (position - region.end) % cycle;
  return over < options.gap ? restart : restart + (over - options.gap);
}

/**
 * Track-time seconds still to wait in the gap (silence and count-in) before the next
 * repetition, at the moment `advanceInLoop` describes; 0 while the track is playing.
 */
export function loopWait(
  from: number,
  elapsed: number,
  region: LoopRegion | null,
  options: LoopOptions,
): number {
  const position = from + elapsed;
  if (!region || !options.enabled || from >= region.end || position < region.end) return 0;
  const restart = restartAt(region, options.leadIn);
  const cycle = region.end - restart + options.gap;
  const over = (position - region.end) % cycle;
  return over < options.gap ? options.gap - over : 0;
}

interface LoopState extends LoopOptions {
  /** Set by "[" before "]" exists, or by a drag on the waveform */
  start: number | null;
  end: number | null;
  /** The usable region, when both ends make one */
  region: () => LoopRegion | null;
  setRegion: (a: number, b: number, duration: number) => void;
  setStart: (time: number, duration: number) => void;
  setEnd: (time: number, duration: number) => void;
  toggle: () => void;
  setLeadIn: (seconds: number) => void;
  setGap: (seconds: number) => void;
  clear: () => void;
  /** Puts back a loop saved in a project file. */
  restore: (saved: LoopOptions & { start: number | null; end: number | null }) => void;
}

/** The A-B loop. Kept in sync with the engine by `features/player/syncEngine.ts`. */
export const useLoopStore = create<LoopState>((set, get) => ({
  enabled: false,
  leadIn: LEAD_IN.default,
  gap: GAP.default,
  start: null,
  end: null,

  region: () => {
    const { start, end } = get();
    return start !== null && end !== null && end - start >= MIN_LOOP ? { start, end } : null;
  },

  setRegion: (a, b, duration) => {
    const region = normalizeRegion(a, b, duration);
    if (region) set({ ...region, enabled: true });
  },

  setStart: (time, duration) => {
    const { end } = get();
    if (end !== null && end - time >= MIN_LOOP) get().setRegion(time, end, duration);
    else set({ start: clamp(time, 0, duration), end: null, enabled: false });
  },

  setEnd: (time, duration) => {
    const { start } = get();
    if (start !== null && time - start >= MIN_LOOP) get().setRegion(start, time, duration);
  },

  toggle: () => {
    if (get().region()) set({ enabled: !get().enabled });
  },

  setLeadIn: (seconds) => set({ leadIn: clampLeadIn(seconds) }),
  setGap: (seconds) => set({ gap: clampGap(seconds) }),
  clear: () => set({ start: null, end: null, enabled: false }),
  restore: (saved) =>
    set({
      start: saved.start,
      end: saved.end,
      enabled: saved.enabled,
      leadIn: clampLeadIn(saved.leadIn),
      gap: clampGap(saved.gap),
    }),
}));
