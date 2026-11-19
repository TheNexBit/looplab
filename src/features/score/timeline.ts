/**
 * Where the score's bars fall in the recording.
 *
 * The score has its own clock (ticks, at the written tempo); the recording has seconds. Sync
 * points pin a place of the score (bar, time through the bar, position in it) to a second of
 * the recording. Between two of them the recording follows the score's own tempo, stretched
 * to fit: a 7/4 bar lasts longer than a 4/4 one, a slower written tempo stays slower. Before
 * the first and after the last point the nearest stretch carries on. No points: the score's
 * own tempo from 0 s. One point: the same, shifted to it.
 */

/** Ticks in a quarter note, as in alphaTab's MIDI. */
export const QUARTER_TICKS = 960;

/** One time through a bar, in playback order (a repeated bar appears once per pass). */
export interface BarSpan {
  /** Index of the bar as written (0-based) */
  bar: number;
  /** Which time through it (0 = first, 1 = second pass of a repeat…) */
  occurrence: number;
  startTick: number;
  endTick: number;
  /** Tempo changes inside the bar, the first at `startTick`; quarter notes per minute */
  tempos: { tick: number; bpm: number }[];
  /** Written meter (7/8 → 7 and 8); 4/4 when unknown */
  beatsPerBar?: number;
  beatUnit?: number;
}

export interface ScorePoint {
  bar: number;
  occurrence: number;
  /** 0..1 through the bar */
  position: number;
  /** Seconds in the recording */
  time: number;
}

export interface Timeline {
  /** Seconds in the recording where the score's `tick` is heard. */
  seconds(tick: number): number;
  /** The score's tick heard at `seconds` of the recording (clamped to the score). */
  tick(seconds: number): number;
  /** Tick of a place in the score, `null` if the score has no such bar pass. */
  tickOf(bar: number, occurrence: number, position: number): number | null;
  /** The bar pass playing at `tick` (the last one for a tick past the end). */
  spanAt(tick: number): BarSpan | null;
  readonly endTick: number;
}

/** Element `i` of a sorted number array (callers stay in range; 0 keeps the types honest). */
const at = (values: number[], i: number) => values[i] ?? 0;

/** Index of the last element `<= x` in a sorted array, -1 if none. */
function lastAtOrBefore(sorted: number[], x: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (at(sorted, mid) <= x) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Linear map between two sorted arrays. Extrapolates from the nearest segment. */
function interpolate(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (n === 0) return x;
  if (n === 1) return at(ys, 0) + (x - at(xs, 0));
  // Segment i-1..i holding x, clamped to the first and last segments
  const i = Math.min(n - 1, Math.max(1, lastAtOrBefore(xs, x) + 1));
  const x0 = at(xs, i - 1);
  const span = at(xs, i) - x0;
  if (span <= 0) return at(ys, i);
  return at(ys, i - 1) + ((x - x0) / span) * (at(ys, i) - at(ys, i - 1));
}

export function buildTimeline(bars: BarSpan[], points: ScorePoint[]): Timeline {
  // The score's own clock: milliseconds at the written tempo, at every tempo change
  const tempoTicks: number[] = [];
  const tempoMs: number[] = [];
  const tempoBpm: number[] = [];
  let ms = 0;
  let lastTick = bars[0]?.startTick ?? 0;
  let bpm = bars[0]?.tempos[0]?.bpm ?? 120;
  const msPerTick = (b: number) => 60000 / (Math.max(1, b) * QUARTER_TICKS);
  for (const span of bars) {
    const changes = span.tempos.length > 0 ? span.tempos : [{ tick: span.startTick, bpm }];
    for (const change of changes) {
      ms += (change.tick - lastTick) * msPerTick(bpm);
      lastTick = change.tick;
      bpm = change.bpm;
      tempoTicks.push(change.tick);
      tempoMs.push(ms);
      tempoBpm.push(bpm);
    }
  }
  const endTick = bars.at(-1)?.endTick ?? 0;

  const synthMs = (tick: number) => {
    const i = lastAtOrBefore(tempoTicks, tick);
    if (i < 0) return (tick - at(tempoTicks, 0)) * msPerTick(tempoBpm[0] ?? 120);
    return at(tempoMs, i) + (tick - at(tempoTicks, i)) * msPerTick(at(tempoBpm, i));
  };
  const synthTick = (time: number) => {
    const i = lastAtOrBefore(tempoMs, time);
    if (i < 0) return at(tempoTicks, 0) + time / msPerTick(tempoBpm[0] ?? 120);
    return at(tempoTicks, i) + (time - at(tempoMs, i)) / msPerTick(at(tempoBpm, i));
  };

  const starts = bars.map((b) => b.startTick);
  const spanAt = (tick: number) => {
    const i = lastAtOrBefore(starts, tick);
    return bars[Math.max(0, i)] ?? null;
  };
  const tickOf = (bar: number, occurrence: number, position: number) => {
    const span = bars.find((b) => b.bar === bar && b.occurrence === occurrence);
    if (!span) return null;
    const p = Math.min(1, Math.max(0, position));
    return span.startTick + p * (span.endTick - span.startTick);
  };

  // Sync anchors: score clock (ms) → recording (ms), sorted, both always moving forward (a
  // point that would make time stand still or run back is left out: the map stays invertible)
  const anchors: { synth: number; media: number }[] = [];
  const sorted = points
    .map((p) => {
      const tick = tickOf(p.bar, p.occurrence, p.position);
      return tick === null ? null : { synth: synthMs(tick), media: p.time * 1000 };
    })
    .filter((a): a is { synth: number; media: number } => a !== null)
    .sort((a, b) => a.synth - b.synth);
  for (const anchor of sorted) {
    const last = anchors.at(-1);
    if (!last || (anchor.synth > last.synth && anchor.media > last.media)) anchors.push(anchor);
  }
  const synthAxis = anchors.map((a) => a.synth);
  const mediaAxis = anchors.map((a) => a.media);
  const clampTick = (tick: number) => Math.min(endTick, Math.max(bars[0]?.startTick ?? 0, tick));

  return {
    seconds: (tick) => interpolate(synthAxis, mediaAxis, synthMs(tick)) / 1000,
    tick: (seconds) => clampTick(synthTick(interpolate(mediaAxis, synthAxis, seconds * 1000))),
    tickOf,
    spanAt,
    endTick,
  };
}
