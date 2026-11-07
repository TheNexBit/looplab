import { describe, expect, it } from "vitest";
import { beatsInBar, isValidGrouping } from "./beatGrid";
import { gapPositionAt } from "./gapCycle";
import { generateRandomSetup } from "./randomSetup";
import { fitSteps, loopPositionAt, strumDirection } from "./rhythmPattern";

/** Repeatable numbers in [0, 1), so a random test always checks the same cases. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

describe("gap trainer", () => {
  const config = { countInBars: 1, playBars: 2, silentBars: 1, grow: false };

  it("counts in, plays, then leaves a gap, cycle after cycle", () => {
    const phases = [0, 1, 2, 3, 4, 5, 6].map((bar) => gapPositionAt(bar, config).phase);
    expect(phases).toEqual(["count-in", "play", "play", "silent", "play", "play", "silent"]);
    expect(gapPositionAt(4, config).cycleIndex).toBe(1);
  });

  it("grows the gap by a bar every cycle", () => {
    const grow = { ...config, countInBars: 0, grow: true };
    // Cycle 0: 2 play + 1 silent; cycle 1: 2 play + 2 silent
    expect(gapPositionAt(3, grow)).toMatchObject({ cycleIndex: 1, phase: "play" });
    expect(gapPositionAt(6, grow)).toMatchObject({ cycleIndex: 1, phase: "silent", silentBars: 2 });
  });
});

describe("rhythm trainer", () => {
  it("picks down on the pulse and up in between, starting again every beat", () => {
    expect([0, 1, 2, 3].map((tick) => strumDirection(tick, "eighth"))).toEqual([
      "down",
      "up",
      "down",
      "up",
    ]);
    expect([0, 1, 2, 3].map((tick) => strumDirection(tick, "triplet"))).toEqual([
      "down",
      "up",
      "down",
      "down",
    ]);
  });

  it("mutes one repetition after every few", () => {
    const muted = [0, 1, 2, 3, 4, 5].map((bar) => loopPositionAt(bar, 1, 2).muted);
    expect(muted).toEqual([false, false, true, false, false, true]);
    expect(fitSteps(["note"], 3)).toEqual(["note", "rest", "rest"]);
  });
});

describe("random meter", () => {
  it("always gives a playable bar", () => {
    const rng = seeded(7);
    for (let run = 0; run < 200; run += 1) {
      const { timeSignature, bpm, crossRhythm } = generateRandomSetup(rng);
      expect(timeSignature.beats).toBeGreaterThanOrEqual(2);
      if (timeSignature.grouping) {
        expect(isValidGrouping(timeSignature.grouping, timeSignature.beats)).toBe(true);
      }
      expect(bpm).toBeGreaterThan(0);
      // A cross rhythm equal to the felt beats would be no cross rhythm at all
      if (crossRhythm !== null) expect(crossRhythm).not.toBe(beatsInBar(timeSignature));
    }
  });
});
