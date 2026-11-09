import { describe, expect, it } from "vitest";
import { defaultSteps, fitSteps, generatePattern, strumDirection } from "./rhythmPattern";

/** Repeatable numbers in [0, 1), so a random test always checks the same cases. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

describe("rhythm trainer", () => {
  it("picks down on the pulse and up in between, starting again every beat", () => {
    expect([0, 1, 2, 3].map((tick) => strumDirection(tick, 2))).toEqual([
      "down",
      "up",
      "down",
      "up",
    ]);
    expect([0, 1, 2, 3].map((tick) => strumDirection(tick, 3))).toEqual([
      "down",
      "up",
      "down",
      "down",
    ]);
  });

  it("keeps the grid the length asked for", () => {
    expect(fitSteps(["note"], 3)).toEqual(["note", "rest", "rest"]);
    expect(defaultSteps(8, 8)[0]).toBe("accent");
    // Any other length: just the accented downbeat of every bar
    const plain = defaultSteps(4, 12);
    expect(plain.filter((step) => step === "accent")).toHaveLength(3);
    expect(plain[4]).toBe("accent");
  });

  it("never generates a silent bar", () => {
    const rng = seeded(7);
    for (let run = 0; run < 200; run += 1) {
      const steps = generatePattern({
        perBar: 8,
        bars: 2,
        ticksPerBeat: 2,
        difficulty: "hard",
        rng,
      });
      expect(steps).toHaveLength(16);
      for (const bar of [0, 1]) {
        expect(steps.slice(bar * 8, bar * 8 + 8).some((step) => step !== "rest")).toBe(true);
      }
    }
  });
});
