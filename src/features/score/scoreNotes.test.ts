import { describe, expect, it } from "vitest";
import {
  alignBars,
  barRanges,
  chordAt,
  neckChords,
  syncFromAligned,
  synthNotes,
  type TabNote,
} from "./scoreNotes";
import { type BarSpan, buildTimeline, QUARTER_TICKS } from "./timeline";

const Q = QUARTER_TICKS;

/** `count` bars of 4/4 at 120 bpm (2 s each), bar indexes as listed (repeats allowed). */
function spans(bars: number[]): BarSpan[] {
  const seen = new Map<number, number>();
  return bars.map((bar, i) => {
    const occurrence = seen.get(bar) ?? 0;
    seen.set(bar, occurrence + 1);
    return {
      bar,
      occurrence,
      startTick: i * 4 * Q,
      endTick: (i + 1) * 4 * Q,
      tempos: [{ tick: i * 4 * Q, bpm: 120 }],
    };
  });
}

function note(span: number, beat: number, midi: number, extra: Partial<TabNote> = {}): TabNote {
  const tick = span * 4 * Q + beat * Q;
  return {
    span,
    tick,
    endTick: tick + Q,
    midi,
    velocity: 0.8,
    string: 1,
    fret: midi - 40,
    strings: 6,
    dead: false,
    ...extra,
  };
}

describe("synthNotes", () => {
  it("places notes in recording seconds, transposed, without dead notes", () => {
    const timeline = buildTimeline(spans([0, 1]), []);
    const notes = synthNotes(
      [note(0, 0, 40), note(0, 1, 45, { dead: true }), note(1, 2, 52)],
      timeline,
      -2,
    );
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ midi: 38 });
    expect(notes[0]?.time).toBeCloseTo(0);
    expect(notes[0]?.length).toBeCloseTo(0.5);
    expect(notes[1]?.time).toBeCloseTo(3);
  });
});

describe("synthNotes with cents", () => {
  it("keeps a transposition in cents instead of rounding it", () => {
    const timeline = buildTimeline(spans([0]), []);
    const notes = synthNotes([note(0, 0, 40)], timeline, -2.7);
    expect(notes[0]?.midi).toBeCloseTo(37.3);
  });
});

describe("neckChords and chordAt", () => {
  it("groups notes struck together and finds the one heard", () => {
    const timeline = buildTimeline(spans([0]), []);
    const chords = neckChords(
      [note(0, 0, 40), note(0, 0, 47, { string: 2 }), note(0, 2, 45)],
      timeline,
    );
    expect(chords).toHaveLength(2);
    expect(chords[0]?.notes).toHaveLength(2);
    expect(chordAt(chords, -0.1)).toBe(-1);
    expect(chordAt(chords, 0.2)).toBe(0);
    expect(chordAt(chords, 1)).toBe(1);
    expect(chordAt(chords, 5)).toBe(1);
  });
});

describe("alignBars", () => {
  it("gives each bar pass its written length and note groups", () => {
    const bars = alignBars(spans([0, 1, 0]), [
      note(0, 0, 40),
      note(0, 0, 47),
      note(0, 2, 45),
      note(2, 1, 50),
    ]);
    expect(bars).toHaveLength(3);
    expect(bars[0]?.seconds).toBeCloseTo(2);
    expect(bars[0]?.onsets).toEqual([
      { at: 0, midis: [40, 47] },
      { at: 0.5, midis: [45] },
    ]);
    expect(bars[1]?.onsets).toEqual([]);
    expect(bars[2]?.onsets).toEqual([{ at: 0.25, midis: [50] }]);
  });
});

describe("syncFromAligned", () => {
  it("keeps only the points needed for a steady tempo", () => {
    const s = spans([0, 1, 2, 3]);
    // Steady 2.2 s bars from 1 s
    const found = [0, 1, 2, 3, 4].map((i) => ({ time: 1 + i * 2.2, confidence: 0.9 }));
    const { sync, unsure } = syncFromAligned(s, found);
    expect(sync).toEqual([
      { bar: 0, occurrence: 0, position: 0, time: 1 },
      { bar: 3, occurrence: 0, position: 1, time: 1 + 4 * 2.2 },
    ]);
    expect(unsure).toEqual([]);
  });

  it("adds a point where the tempo changes, and reports unsure bars", () => {
    const s = spans([0, 1, 2, 3]);
    const times = [0, 2, 4, 5.5, 7];
    const found = times.map((time, i) => ({ time, confidence: i === 2 ? 0.1 : 0.9 }));
    const { sync, unsure } = syncFromAligned(s, found);
    expect(sync.map((p) => p.time)).toEqual([0, 4, 7]);
    expect(unsure).toEqual([2]);
  });

  it("gives nothing without results", () => {
    expect(syncFromAligned(spans([0]), []).sync).toEqual([]);
  });
});

describe("barRanges", () => {
  it("writes bar numbers as ranges", () => {
    const s = spans([0, 1, 2, 3, 4, 5, 6]);
    expect(barRanges(s, [0, 2, 3, 4, 6])).toBe("1, 3-5, 7");
    expect(barRanges(s, [])).toBe("");
  });
});
