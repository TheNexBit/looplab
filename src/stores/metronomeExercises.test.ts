import { describe, expect, it } from "vitest";
import {
  exercisesRequest,
  gapSilentAt,
  rhythmFits,
  sanitizeExercises,
  trainerBpmAt,
} from "./metronomeExercises";

const setup = (patch: Parameters<typeof sanitizeExercises>[0]) => sanitizeExercises(patch);

describe("metronome exercises", () => {
  it("steps the tempo like the engine does", () => {
    const up = setup({ trainerFrom: 100, trainerTo: 110, trainerStep: 4, trainerEvery: 2 });
    expect([0, 1, 2, 3, 4, 6].map((bar) => trainerBpmAt(up, bar))).toEqual([
      100, 100, 104, 104, 108, 110,
    ]);
    const down = setup({ trainerFrom: 120, trainerTo: 100, trainerStep: 4, trainerEvery: 1 });
    expect(trainerBpmAt(down, 2)).toBe(112);
  });

  it("finds the silent bars like the engine does", () => {
    const gap = setup({ gapLead: 1, gapPlay: 2, gapSilent: 1, gapGrow: false });
    expect([0, 1, 2, 3, 4, 5, 6].map((bar) => gapSilentAt(gap, bar))).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
      true,
    ]);
    const grow = setup({ gapLead: 0, gapPlay: 2, gapSilent: 1, gapGrow: true });
    expect([0, 1, 2, 3, 4, 5, 6].map((bar) => gapSilentAt(grow, bar))).toEqual([
      false,
      false,
      true,
      false,
      false,
      true,
      true,
    ]);
  });

  it("sends only the exercises that are on, the rhythm fitted to the bar", () => {
    const off = exercisesRequest(setup({}), 4, 2);
    expect(off).toEqual({ trainer: null, gap: null, muteChance: 0, rhythm: null });
    const rhythm = exercisesRequest(setup({ rhythm: true, rhythmSteps: ["accent"] }), 4, 2);
    expect(rhythm.rhythm?.steps).toHaveLength(8);
    expect(rhythm.rhythm?.steps[0]).toBe("accent");
    // Quarters only: there is no grid to write a rhythm on
    expect(rhythmFits(4, 1, 1)).toBe(false);
    expect(exercisesRequest(setup({ rhythm: true }), 4, 1).rhythm).toBeNull();
  });

  it("keeps stored values in their limits", () => {
    const stored = sanitizeExercises({
      muteChance: 5,
      trainerEvery: -3,
      rhythmSteps: ["x" as never],
    });
    expect(stored.muteChance).toBe(0.9);
    expect(stored.trainerEvery).toBe(1);
    expect(stored.rhythmSteps).toEqual([]);
  });
});
