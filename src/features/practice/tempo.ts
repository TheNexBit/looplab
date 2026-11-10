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
export const BEATS_PER_BAR = { min: 1, max: 32, step: 1, default: 4 } as const;

/**
 * A tempo marker, like those of Reaper: from `time` (a first beat of a bar) on, this tempo and
 * this meter, until the next marker. A track played to a click has one; a band that drifts or
 * a prog song that keeps changing meter has many.
 */
export interface TempoMarker {
  /** Seconds: the first beat of a bar */
  time: number;
  /** Quarter notes per minute */
  bpm: number;
  /** Time signature: beats in a bar over the note value of a beat (7/8 → 7 and 8) */
  beatsPerBar: number;
  beatUnit: number;
  /** Proposed by the tempo analysis and untouched since: a new analysis may replace it */
  auto?: boolean;
}

/** Where tempo and meter change, sorted by time; empty while the tempo is unknown. */
export type TempoMap = TempoMarker[];

/** The marker as the user's own: no longer "proposed" by the analysis. */
export const yours = ({ time, bpm, beatsPerBar, beatUnit }: TempoMarker): TempoMarker => ({
  time,
  bpm,
  beatsPerBar,
  beatUnit,
});

/** Seconds per beat of a marker: a quarter in x/4, an eighth in x/8. */
export const beatSeconds = (marker: TempoMarker) => (60 / marker.bpm) * (4 / marker.beatUnit);

/** Two markers closer than this (seconds) are one: the later one wins. */
const SAME_TIME = 0.001;

/** Sorted, without unusable markers and without two on the same moment. */
export function sanitizeTempoMap(markers: readonly Partial<TempoMarker>[]): TempoMap {
  const usable = markers
    .filter(
      (m): m is TempoMarker =>
        typeof m.time === "number" &&
        Number.isFinite(m.time) &&
        typeof m.bpm === "number" &&
        Number.isFinite(m.bpm) &&
        m.bpm > 0 &&
        typeof m.beatsPerBar === "number" &&
        m.beatsPerBar >= 1 &&
        typeof m.beatUnit === "number" &&
        (BEAT_UNITS as readonly number[]).includes(m.beatUnit),
    )
    .map((m) => ({
      time: m.time,
      bpm: Math.min(BPM.max, Math.max(BPM.min, m.bpm)),
      beatsPerBar: Math.round(Math.min(BEATS_PER_BAR.max, m.beatsPerBar)),
      beatUnit: m.beatUnit,
      ...(m.auto ? { auto: true } : {}),
    }))
    .sort((a, b) => a.time - b.time);
  const kept: TempoMap = [];
  for (const marker of usable) {
    const last = kept.at(-1);
    if (last && marker.time - last.time < SAME_TIME) kept[kept.length - 1] = marker;
    else kept.push(marker);
  }
  return kept;
}

/** Index of the marker in force at `time`; the first one before it starts (its grid extends back). */
export function markerIndexAt(map: TempoMap, time: number): number {
  let index = 0;
  for (let i = 1; i < map.length; i++) {
    if ((map[i]?.time ?? Infinity) <= time) index = i;
    else break;
  }
  return index;
}

/** The marker in force at `time`, or null without a tempo. */
export const markerAt = (map: TempoMap, time: number): TempoMarker | null =>
  map[markerIndexAt(map, time)] ?? null;

/**
 * Seconds of a count-in of `bars` before `time`, in the tempo and meter in force there, at the
 * track's original speed (0 when off or without a tempo).
 */
export function countInSeconds(bars: number, map: TempoMap, time = 0): number {
  const marker = markerAt(map, time);
  return marker ? bars * marker.beatsPerBar * beatSeconds(marker) : 0;
}

/**
 * Every beat between `start` and `end` (seconds, both included), each with whether it starts a
 * bar. Each marker rules until the next one, whose time is a first beat of its own; the first
 * marker's grid also runs back before it.
 */
export function beatsBetween(
  start: number,
  end: number,
  map: TempoMap,
): { time: number; bar: boolean }[] {
  const beats: { time: number; bar: boolean }[] = [];
  map.forEach((marker, i) => {
    const from = i === 0 ? start : Math.max(start, marker.time);
    const next = map[i + 1]?.time;
    if (next !== undefined && next <= start) return;
    const length = beatSeconds(marker);
    const first = Math.ceil((from - marker.time) / length - 1e-9);
    for (let index = first; ; index++) {
      // Integer index: adding `length` repeatedly would drift
      const time = marker.time + index * length;
      if (time > end || (next !== undefined && time >= next - SAME_TIME)) break;
      const bar = ((index % marker.beatsPerBar) + marker.beatsPerBar) % marker.beatsPerBar === 0;
      beats.push({ time, bar });
    }
  });
  return beats;
}

/** The beat of `map` closest to `time` (the time itself without a tempo). */
export function nearestBeat(time: number, map: TempoMap): number {
  const marker = markerAt(map, time);
  if (!marker) return time;
  const reach = Math.max(...map.map(beatSeconds));
  let best = time;
  let distance = Infinity;
  for (const beat of beatsBetween(time - reach, time + reach, map)) {
    const d = Math.abs(beat.time - time);
    if (d < distance) {
      best = beat.time;
      distance = d;
    }
  }
  return best;
}
