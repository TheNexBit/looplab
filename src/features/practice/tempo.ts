/** Tempo limits, in quarter notes per minute (as in DAWs, whatever the time signature). */
export const BPM = { min: 30, max: 300, step: 1, default: 120 } as const;
/** Bars offered for the count-in, as in DAWs (it is switched off with its own key). */
export const COUNT_IN_CHOICES = [1, 2, 4] as const;
/** The time signatures offered first, like the menu of a DAW. */
export const TIME_SIGNATURES = [
  [2, 4],
  [3, 4],
  [4, 4],
  [5, 4],
  [7, 4],
  [3, 8],
  [5, 8],
  [6, 8],
  [7, 8],
  [9, 8],
  [12, 8],
] as const;
/** Note values a beat can have: the bottom number of a time signature. */
export const BEAT_UNITS = [2, 4, 8, 16] as const;

/** Taps further apart than this start a new measurement. */
const TAP_RESET_MS = 2_000;
/** Intervals averaged: enough to steady a human tap, few enough to follow a change. */
const TAP_WINDOW = 4;

/**
 * Tempo from the times (ms) of the last taps, or null with fewer than two recent ones.
 * Taps follow what is heard, so the result is divided by the playback speed to give
 * the tempo of the original track.
 */
export function tapTempo(taps: number[], speed: number): number | null {
  const recent: number[] = [];
  for (const time of [...taps].reverse()) {
    const newer = recent.at(-1);
    if (newer !== undefined && newer - time > TAP_RESET_MS) break;
    recent.push(time);
    if (recent.length > TAP_WINDOW) break;
  }
  if (recent.length < 2) return null;
  const first = recent.at(-1) ?? 0;
  const last = recent[0] ?? 0;
  const interval = (last - first) / (recent.length - 1);
  if (interval <= 0) return null;
  return Math.round((60_000 / interval / speed) * 10) / 10;
}

/** Seconds of a count-in of `bars` at the track's original speed (0 when off or without a tempo). */
export function countInSeconds(bars: number, grid: BeatGrid | null): number {
  return grid ? bars * grid.beatsPerBar * beatSeconds(grid) : 0;
}

export interface TrainerPlan {
  /** Speeds as fractions (0.7 = 70%) */
  from: number;
  to: number;
  step: number;
  /** Repetitions played at each speed */
  every: number;
}

/**
 * Speed after `repetitions` complete repetitions: it starts at `from` and rises by
 * `step` every `every` repetitions, never past `to`.
 */
export function trainerSpeed(plan: TrainerPlan, repetitions: number): number {
  const steps = Math.floor(repetitions / Math.max(1, plan.every));
  const speed = plan.from + steps * plan.step;
  const capped = plan.to >= plan.from ? Math.min(plan.to, speed) : plan.from;
  return Math.round(capped * 100) / 100;
}

/** Repetitions still to play before the next speed step; null once the target is reached. */
export function repetitionsToNextStep(plan: TrainerPlan, repetitions: number): number | null {
  if (trainerSpeed(plan, repetitions) >= plan.to) return null;
  const every = Math.max(1, plan.every);
  return every - (repetitions % every);
}

/** Beats in a bar: the grid draws a stronger line, and the metronome a higher click, on the first. */
export const BEATS_PER_BAR = { min: 1, max: 16, step: 1, default: 4 } as const;

export interface BeatGrid {
  /** Quarter notes per minute */
  bpm: number;
  /** Seconds: a moment on the first beat of a bar */
  offset: number;
  /** Time signature: beats in a bar over the note value of a beat (7/8 → 7 and 8) */
  beatsPerBar: number;
  beatUnit: number;
}

/** Seconds per beat: a quarter in x/4, an eighth in x/8. */
export const beatSeconds = (grid: BeatGrid) => (60 / grid.bpm) * (4 / grid.beatUnit);

/** The beat of `grid` closest to `time`. */
export function nearestBeat(time: number, grid: BeatGrid): number {
  const length = beatSeconds(grid);
  return grid.offset + Math.round((time - grid.offset) / length) * length;
}

/** Every beat between `start` and `end` (seconds), each with whether it starts a bar. */
export function beatsBetween(
  start: number,
  end: number,
  grid: BeatGrid,
): { time: number; bar: boolean }[] {
  const length = beatSeconds(grid);
  const first = Math.ceil((start - grid.offset) / length);
  const last = Math.floor((end - grid.offset) / length);
  const beats = [];
  for (let index = first; index <= last; index++) {
    // Integer index: adding `length` repeatedly would drift
    const bar = ((index % grid.beatsPerBar) + grid.beatsPerBar) % grid.beatsPerBar === 0;
    beats.push({ time: grid.offset + index * length, bar });
  }
  return beats;
}
