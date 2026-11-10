import { describe, expect, it } from "vitest";
import {
  beatsBetween,
  countInSeconds,
  markerIndexAt,
  nearestBeat,
  repetitionsToNextStep,
  sanitizeTempoMap,
  tapTempo,
  trainerSpeed,
} from "./tempo";

describe("tapTempo", () => {
  it("needs two taps", () => {
    expect(tapTempo([], 1)).toBeNull();
    expect(tapTempo([1000], 1)).toBeNull();
  });

  it("averages the recent intervals", () => {
    expect(tapTempo([0, 500, 1000, 1500], 1)).toBe(120);
  });

  it("gives the tempo of the original track when slowed down", () => {
    // Heard at 60 BPM while playing at half speed: the track is at 120
    expect(tapTempo([0, 1000, 2000], 0.5)).toBe(120);
  });

  it("starts over after a long pause", () => {
    expect(tapTempo([0, 400, 5000, 5500], 1)).toBe(120);
  });
});

describe("countInSeconds", () => {
  const fourFour = { time: 0, bpm: 120, beatsPerBar: 4, beatUnit: 4 };

  it("is zero without a tempo or bars", () => {
    expect(countInSeconds(1, [])).toBe(0);
    expect(countInSeconds(0, [fourFour])).toBe(0);
  });

  it("lasts the counted bars", () => {
    expect(countInSeconds(1, [fourFour])).toBe(2);
    expect(countInSeconds(2, [fourFour])).toBe(4);
  });

  it("counts eighths in x/8 meters", () => {
    // 7/8 at 120 quarters per minute: 7 eighths of 0.25 s
    expect(countInSeconds(1, [{ ...fourFour, beatsPerBar: 7, beatUnit: 8 }])).toBe(1.75);
  });

  it("counts in the meter where playback starts", () => {
    const map = [fourFour, { time: 8, bpm: 120, beatsPerBar: 7, beatUnit: 8 }];
    expect(countInSeconds(1, map, 4)).toBe(2);
    expect(countInSeconds(1, map, 9)).toBe(1.75);
  });
});

describe("speed trainer", () => {
  const plan = { from: 0.6, to: 0.8, step: 0.05, every: 2 };

  it("rises by one step every few repetitions", () => {
    expect(trainerSpeed(plan, 0)).toBe(0.6);
    expect(trainerSpeed(plan, 1)).toBe(0.6);
    expect(trainerSpeed(plan, 2)).toBe(0.65);
    expect(trainerSpeed(plan, 5)).toBe(0.7);
  });

  it("stops at the target", () => {
    expect(trainerSpeed(plan, 100)).toBe(0.8);
    expect(repetitionsToNextStep(plan, 100)).toBeNull();
  });

  it("counts down to the next step", () => {
    expect(repetitionsToNextStep(plan, 0)).toBe(2);
    expect(repetitionsToNextStep(plan, 3)).toBe(1);
  });

  it("never goes below the start when the target is lower", () => {
    expect(trainerSpeed({ ...plan, to: 0.5 }, 10)).toBe(0.6);
  });
});

describe("beat grid", () => {
  const grid = [{ time: 0.25, bpm: 120, beatsPerBar: 4, beatUnit: 4 }];

  it("finds the nearest beat", () => {
    expect(nearestBeat(0.95, grid)).toBe(0.75);
    expect(nearestBeat(1.1, grid)).toBe(1.25);
  });

  it("lists the beats in a window, bars marked, before the offset too", () => {
    expect(beatsBetween(-0.3, 2.3, grid)).toEqual([
      { time: -0.25, bar: false },
      { time: 0.25, bar: true },
      { time: 0.75, bar: false },
      { time: 1.25, bar: false },
      { time: 1.75, bar: false },
      { time: 2.25, bar: true },
    ]);
  });

  it("follows odd meters", () => {
    const fiveFour = [{ time: 0, bpm: 60, beatsPerBar: 5, beatUnit: 4 }];
    expect(
      beatsBetween(0, 10, fiveFour)
        .filter((b) => b.bar)
        .map((b) => b.time),
    ).toEqual([0, 5, 10]);
  });

  it("puts x/8 beats on eighths", () => {
    const sevenEight = [{ time: 0, bpm: 60, beatsPerBar: 7, beatUnit: 8 }];
    // An eighth lasts 0.5 s at 60 quarters per minute: bars every 3.5 s
    expect(
      beatsBetween(0, 7, sevenEight)
        .filter((b) => b.bar)
        .map((b) => b.time),
    ).toEqual([0, 3.5, 7]);
  });

  it("changes meter and tempo on a marker, which is a first beat of its own", () => {
    // Two bars of 4/4 at 60, then 7/8 at 120 (eighths of 0.25 s) from 8 s
    const map = [
      { time: 0, bpm: 60, beatsPerBar: 4, beatUnit: 4 },
      { time: 8, bpm: 120, beatsPerBar: 7, beatUnit: 8 },
    ];
    const beats = beatsBetween(6, 10, map);
    expect(beats.slice(0, 3)).toEqual([
      { time: 6, bar: false },
      { time: 7, bar: false },
      { time: 8, bar: true },
    ]);
    expect(beats.filter((b) => b.bar).map((b) => b.time)).toEqual([8, 9.75]);
    expect(markerIndexAt(map, 7.99)).toBe(0);
    expect(markerIndexAt(map, 8)).toBe(1);
    expect(nearestBeat(8.1, map)).toBe(8);
    expect(nearestBeat(8.2, map)).toBe(8.25);
  });

  it("drops a marker that is not usable and keeps the later of two on the same moment", () => {
    const map = sanitizeTempoMap([
      { time: 4, bpm: 100, beatsPerBar: 3, beatUnit: 4 },
      { time: 0, bpm: 120, beatsPerBar: 4, beatUnit: 4 },
      { time: 4, bpm: 90, beatsPerBar: 5, beatUnit: 8 },
      { time: 2, bpm: Number.NaN, beatsPerBar: 4, beatUnit: 4 },
      { time: 6, bpm: 100, beatsPerBar: 4, beatUnit: 3 },
    ]);
    expect(map.map((m) => [m.time, m.bpm])).toEqual([
      [0, 120],
      [4, 90],
    ]);
  });
});
