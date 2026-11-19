import { describe, expect, it } from "vitest";
import { type BarSpan, buildTimeline, QUARTER_TICKS } from "./timeline";

const Q = QUARTER_TICKS;

/** Bars of `beats` quarter notes at `bpm`, one after the other; `bars` = [bar index, beats]. */
function spans(list: [number, number][], bpm = 120): BarSpan[] {
  let tick = 0;
  const seen = new Map<number, number>();
  return list.map(([bar, beats]) => {
    const occurrence = seen.get(bar) ?? 0;
    seen.set(bar, occurrence + 1);
    const span = {
      bar,
      occurrence,
      startTick: tick,
      endTick: tick + beats * Q,
      tempos: [{ tick, bpm }],
    };
    tick += beats * Q;
    return span;
  });
}

describe("buildTimeline", () => {
  it("follows the written tempo with no sync points", () => {
    const t = buildTimeline(
      spans([
        [0, 4],
        [1, 4],
      ]),
      [],
    );
    // 120 bpm: a quarter is half a second
    expect(t.seconds(4 * Q)).toBeCloseTo(2);
    expect(t.tick(3)).toBeCloseTo(6 * Q);
  });

  it("shifts everything to a single sync point", () => {
    const t = buildTimeline(
      spans([
        [0, 4],
        [1, 4],
      ]),
      [{ bar: 0, occurrence: 0, position: 0, time: 1.5 }],
    );
    expect(t.seconds(0)).toBeCloseTo(1.5);
    expect(t.seconds(4 * Q)).toBeCloseTo(3.5);
    expect(t.tick(1.5)).toBeCloseTo(0);
  });

  it("stretches by the written lengths between two points: a 7/4 bar lasts longer", () => {
    // Bar 0 in 7/4, bar 1 in 4/4; the first starts at 10 s, the second ends at 21 s
    const t = buildTimeline(
      spans([
        [0, 7],
        [1, 4],
      ]),
      [
        { bar: 0, occurrence: 0, position: 0, time: 10 },
        { bar: 1, occurrence: 0, position: 1, time: 21 },
      ],
    );
    // 11 quarters in 11 s: bar 1 starts 7 s after bar 0
    expect(t.seconds(7 * Q)).toBeCloseTo(17);
    expect(t.tick(17)).toBeCloseTo(7 * Q);
  });

  it("tells the passes of a repeated bar apart", () => {
    const t = buildTimeline(
      spans([
        [0, 4],
        [0, 4],
        [1, 4],
      ]),
      [],
    );
    expect(t.tickOf(0, 1, 0)).toBe(4 * Q);
    expect(t.tickOf(0, 2, 0)).toBeNull();
    expect(t.spanAt(5 * Q)?.occurrence).toBe(1);
  });

  it("follows tempo changes written in the score", () => {
    const bars: BarSpan[] = [
      { bar: 0, occurrence: 0, startTick: 0, endTick: 4 * Q, tempos: [{ tick: 0, bpm: 60 }] },
      {
        bar: 1,
        occurrence: 0,
        startTick: 4 * Q,
        endTick: 8 * Q,
        tempos: [{ tick: 4 * Q, bpm: 120 }],
      },
    ];
    const t = buildTimeline(bars, []);
    expect(t.seconds(4 * Q)).toBeCloseTo(4);
    expect(t.seconds(8 * Q)).toBeCloseTo(6);
    expect(t.tick(5)).toBeCloseTo(6 * Q);
  });

  it("keeps the tick inside the score", () => {
    const t = buildTimeline(spans([[0, 4]]), []);
    expect(t.tick(-5)).toBe(0);
    expect(t.tick(100)).toBe(4 * Q);
  });
});
