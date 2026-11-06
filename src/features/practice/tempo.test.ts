import { describe, expect, it } from "vitest";
import { countInSeconds, repetitionsToNextStep, tapTempo, trainerSpeed } from "./tempo";

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
  it("is zero without a tempo or beats", () => {
    expect(countInSeconds(4, null)).toBe(0);
    expect(countInSeconds(0, 120)).toBe(0);
  });

  it("lasts the counted beats", () => {
    expect(countInSeconds(4, 120)).toBe(2);
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
