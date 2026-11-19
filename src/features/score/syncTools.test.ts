import { describe, expect, it } from "vitest";
import type { TempoMap } from "@/features/practice/tempo";
import { afterQuarters, gridSync, type TimedBar, tempoMapFromBars } from "./syncTools";

const grid = (bpm: number, time = 0): TempoMap => [{ time, bpm, beatsPerBar: 4, beatUnit: 4 }];

describe("afterQuarters", () => {
  it("counts quarters at the grid's tempo", () => {
    expect(afterQuarters(1, 4, grid(120))).toBeCloseTo(3);
  });

  it("crosses a tempo change", () => {
    const map: TempoMap = [
      { time: 0, bpm: 60, beatsPerBar: 4, beatUnit: 4 },
      { time: 2, bpm: 120, beatsPerBar: 4, beatUnit: 4 },
    ];
    // 2 quarters at 60 (2 s), then 2 at 120 (1 s)
    expect(afterQuarters(0, 4, map)).toBeCloseTo(3);
  });
});

describe("gridSync", () => {
  it("lays bars of different meters on the grid from the anchor", () => {
    const bars = [
      { bar: 0, occurrence: 0, quarters: 3.5, beatsPerBar: 7, beatUnit: 8 },
      { bar: 1, occurrence: 0, quarters: 4, beatsPerBar: 4, beatUnit: 4 },
      { bar: 1, occurrence: 1, quarters: 4, beatsPerBar: 4, beatUnit: 4 },
    ];
    const points = gridSync(bars, 2, grid(120));
    expect(points.map((p) => p.time)).toEqual([2, 3.75, 5.75]);
    expect(points[2]).toMatchObject({ bar: 1, occurrence: 1, position: 0 });
  });
});

describe("tempoMapFromBars", () => {
  const bar = (time: number, quarters: number, beatsPerBar: number, beatUnit = 4): TimedBar => ({
    bar: 0,
    occurrence: 0,
    quarters,
    time,
    beatsPerBar,
    beatUnit,
  });

  it("starts a marker where the meter changes, with the tempo played", () => {
    // Two bars of 7/4 at 120, then two of 4/4 at 120
    const map = tempoMapFromBars([bar(1, 7, 7), bar(4.5, 7, 7), bar(8, 4, 4), bar(10, 4, 4)], 12);
    expect(map).toEqual([
      { time: 1, bpm: 120, beatsPerBar: 7, beatUnit: 4 },
      { time: 8, bpm: 120, beatsPerBar: 4, beatUnit: 4 },
    ]);
  });

  it("keeps one marker for small unevenness, a new one for a real change", () => {
    const map = tempoMapFromBars([bar(0, 4, 4), bar(2.02, 4, 4), bar(4, 4, 4), bar(5.5, 4, 4)], 7);
    expect(map).toHaveLength(2);
    expect(map[1]?.time).toBe(4);
    expect(map[1]?.bpm).toBe(160);
  });
});
