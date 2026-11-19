import type { TempoMap, TempoMarker } from "@/features/practice/tempo";
import type { SyncPoint } from "@/stores/score";
import { QUARTER_TICKS } from "./timeline";

/** One pass through a bar, with where it starts in the recording and its written meter. */
export interface TimedBar {
  bar: number;
  occurrence: number;
  /** Quarter notes in the bar, as written */
  quarters: number;
  /** Seconds in the recording where it starts */
  time: number;
  beatsPerBar: number;
  beatUnit: number;
}

/** Seconds after `from` once `quarters` quarter notes have gone by on the tempo grid `map`. */
export function afterQuarters(from: number, quarters: number, map: TempoMap): number {
  let time = from;
  let left = quarters;
  // The marker in force at `time`, then each later one in turn
  let index = map.findLastIndex((m) => m.time <= time + 1e-9);
  if (index < 0) index = 0;
  while (left > 1e-9) {
    const marker = map[index];
    if (!marker) break;
    const secondsPerQuarter = 60 / marker.bpm;
    const next = map[index + 1];
    const room = next && next.time > time ? (next.time - time) / secondsPerQuarter : Infinity;
    if (left <= room) return time + left * secondsPerQuarter;
    time = next?.time ?? time;
    left -= room;
    index += 1;
  }
  return time;
}

/**
 * Sync points that lay every bar of the score on the tempo grid, from the start of the first
 * bar at `anchor` seconds: each bar lasts as many quarter notes as the score writes, at the
 * grid's tempo where it falls. One point per bar pass.
 */
export function gridSync(bars: readonly Omit<TimedBar, "time">[], anchor: number, map: TempoMap) {
  const points: SyncPoint[] = [];
  let time = anchor;
  for (const bar of bars) {
    points.push({ bar: bar.bar, occurrence: bar.occurrence, position: 0, time });
    time = afterQuarters(time, bar.quarters, map);
  }
  return points;
}

/** Two tempos closer than this (fraction) are the same tempo played a little unevenly. */
const SAME_TEMPO = 0.03;

/**
 * The tempo map a synced score gives: a marker where the written meter changes or the tempo
 * moves by more than 3 %, each with the average tempo of its stretch. `end` is where the last
 * bar ends (seconds).
 */
export function tempoMapFromBars(bars: readonly TimedBar[], end: number): TempoMap {
  const runs: { first: TimedBar; quarters: number; seconds: number }[] = [];
  bars.forEach((bar, i) => {
    const next = bars[i + 1]?.time ?? end;
    const seconds = next - bar.time;
    if (seconds <= 0 || bar.quarters <= 0) return;
    const bpm = (bar.quarters * 60) / seconds;
    const run = runs.at(-1);
    const runBpm = run ? (run.quarters * 60) / run.seconds : 0;
    const sameMeter =
      run && run.first.beatsPerBar === bar.beatsPerBar && run.first.beatUnit === bar.beatUnit;
    if (run && sameMeter && Math.abs(bpm - runBpm) / runBpm <= SAME_TEMPO) {
      run.quarters += bar.quarters;
      run.seconds += seconds;
    } else runs.push({ first: bar, quarters: bar.quarters, seconds });
  });
  return runs.map(
    ({ first, quarters, seconds }): TempoMarker => ({
      time: first.time,
      bpm: Math.round(((quarters * 60) / seconds) * 10) / 10,
      beatsPerBar: first.beatsPerBar,
      beatUnit: first.beatUnit,
    }),
  );
}

/** Quarter notes in a bar from its length in ticks. */
export const quartersOf = (startTick: number, endTick: number) =>
  (endTick - startTick) / QUARTER_TICKS;
