import type { AlignBar, AlignedBar, ScoreNote } from "@/lib/bindings";
import type { SyncPoint } from "@/stores/score";
import { type BarSpan, buildTimeline, type Timeline } from "./timeline";

/** A note of the tab, as heard: absolute ticks (playback order) and where it is played. */
export interface TabNote {
  /** Index of the bar pass (playback order) it belongs to */
  span: number;
  tick: number;
  endTick: number;
  midi: number;
  /** 0..1 */
  velocity: number;
  /** 1 = lowest string; 0 for notes with no string (a piano) */
  string: number;
  fret: number;
  /** Strings of its instrument (0 without strings) */
  strings: number;
  /** Muted (x): drawn on the neck, never played by the synth */
  dead: boolean;
}

/** Notes heard together (a beat): what the neck lights up at once. */
export interface NeckChord {
  start: number;
  end: number;
  notes: { string: number; fret: number; dead: boolean }[];
}

/**
 * The synth's notes in seconds of the recording, transposed like the track (cents too). Dead notes and
 * notes that end where they start are left out.
 */
export function synthNotes(notes: readonly TabNote[], timeline: Timeline, semitones: number) {
  const out: ScoreNote[] = [];
  for (const note of notes) {
    if (note.dead) continue;
    const time = timeline.seconds(note.tick);
    const end = timeline.seconds(note.endTick);
    const midi = note.midi + semitones;
    if (!(end > time) || midi < 0 || midi > 127) continue;
    out.push({ time, length: end - time, midi, velocity: note.velocity });
  }
  return out;
}

/** The chords of a tab (stringed notes only), in seconds of the recording, in time order. */
export function neckChords(notes: readonly TabNote[], timeline: Timeline): NeckChord[] {
  const chords: NeckChord[] = [];
  let current: NeckChord | null = null;
  let currentTick = Number.NaN;
  for (const note of notes) {
    if (note.string <= 0) continue;
    if (!current || note.tick !== currentTick) {
      current = {
        start: timeline.seconds(note.tick),
        end: timeline.seconds(note.endTick),
        notes: [],
      };
      currentTick = note.tick;
      chords.push(current);
    }
    current.end = Math.max(current.end, timeline.seconds(note.endTick));
    current.notes.push({ string: note.string, fret: note.fret, dead: note.dead });
  }
  return chords;
}

/** Index of the chord heard at `seconds` (the last one started), -1 before the first. */
export function chordAt(chords: readonly NeckChord[], seconds: number): number {
  let lo = 0;
  let hi = chords.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((chords[mid]?.start ?? 0) <= seconds + 1e-6) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * What the automatic sync gets: every bar pass with its length at the written tempo and when
 * its notes start (0..1 of the bar), notes struck together as one group.
 */
export function alignBars(spans: readonly BarSpan[], notes: readonly TabNote[]): AlignBar[] {
  const written = buildTimeline([...spans], []);
  const bars: AlignBar[] = spans.map((span) => ({
    seconds: written.seconds(span.endTick) - written.seconds(span.startTick),
    onsets: [],
  }));
  for (const note of notes) {
    const span = spans[note.span];
    const bar = bars[note.span];
    if (!span || !bar || note.dead) continue;
    const length = span.endTick - span.startTick;
    if (length <= 0) continue;
    const at = (note.tick - span.startTick) / length;
    const last = bar.onsets[bar.onsets.length - 1];
    if (last && Math.abs((last.at ?? 0) - at) < 1e-9) {
      if (!last.midis.includes(note.midi)) last.midis.push(note.midi);
    } else bar.onsets.push({ at, midis: [note.midi] });
  }
  return bars;
}

/** Bars found with less confidence than this are reported to be checked by eye. */
const UNSURE = 0.2;
/** A bar start within this of where the points around it put it needs no point of its own. */
const KEEP_SECONDS = 0.03;

/**
 * Sync points from the bar starts found by the automatic sync (one per bar pass, plus the end
 * of the last): as few as keep every bar within 30 ms of where it was found, so the flags
 * stay readable. Also the bar passes that matched poorly, to be checked.
 */
export function syncFromAligned(
  spans: readonly BarSpan[],
  found: readonly AlignedBar[],
): { sync: SyncPoint[]; unsure: number[] } {
  const last = spans[spans.length - 1];
  if (!last || found.length < 2) return { sync: [], unsure: [] };
  // Every bar start and the end, in score ticks and recording seconds
  const all = spans
    .map((span, i) => ({ tick: span.startTick, time: found[i]?.time, index: i }))
    .concat([{ tick: last.endTick, time: found[spans.length]?.time, index: spans.length }])
    .filter((p): p is { tick: number; time: number; index: number } => typeof p.time === "number");
  if (all.length < 2) return { sync: [], unsure: [] };

  // Keeps the first and the last, then splits wherever a bar strays from the line between
  // the kept points around it (like simplifying a drawn line)
  const keep = new Set<number>([0, all.length - 1]);
  const split = (from: number, to: number) => {
    const a = all[from];
    const b = all[to];
    if (!a || !b || to - from < 2) return;
    let worst = -1;
    let distance = KEEP_SECONDS;
    for (let i = from + 1; i < to; i++) {
      const p = all[i];
      if (!p) continue;
      const predicted = a.time + ((p.tick - a.tick) / (b.tick - a.tick)) * (b.time - a.time);
      const off = Math.abs(predicted - p.time);
      if (off > distance) {
        distance = off;
        worst = i;
      }
    }
    if (worst < 0) return;
    keep.add(worst);
    split(from, worst);
    split(worst, to);
  };
  split(0, all.length - 1);

  const sync: SyncPoint[] = [...keep]
    .sort((x, y) => x - y)
    .map((k) => {
      const p = all[k];
      if (!p) return null;
      if (p.index === spans.length) {
        return { bar: last.bar, occurrence: last.occurrence, position: 1, time: p.time };
      }
      const span = spans[p.index];
      return span
        ? { bar: span.bar, occurrence: span.occurrence, position: 0, time: p.time }
        : null;
    })
    .filter((p): p is SyncPoint => p !== null);
  const unsure = found
    .slice(0, spans.length)
    .map((f, i) => ((f.confidence ?? 0) < UNSURE ? i : -1))
    .filter((i) => i >= 0);
  return { sync, unsure };
}

/** Bar passes as ranges of written bar numbers (1-based) for a message: "3, 7-9". */
export function barRanges(spans: readonly BarSpan[], indexes: readonly number[]): string {
  const numbers = [...new Set(indexes.map((i) => (spans[i]?.bar ?? 0) + 1))].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = numbers[0];
  let previous = start;
  for (const n of numbers.slice(1).concat([Number.NaN])) {
    if (start === undefined || previous === undefined) break;
    if (n === previous + 1) {
      previous = n;
      continue;
    }
    parts.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = n;
    previous = n;
  }
  return parts.join(", ");
}
