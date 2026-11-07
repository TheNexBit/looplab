import { describe, expect, it } from "vitest";
import { sanitizeSetup } from "@/stores/metronome";
import { barAndPulse, formatElapsed, groupingChoices, tempoMarking } from "./meterChoices";

describe("metronome choices", () => {
  it("groups a bar in every way of twos, threes and fours, fewest groups first", () => {
    expect(groupingChoices(7)).toEqual([
      [3, 4],
      [4, 3],
      [2, 2, 3],
      [2, 3, 2],
      [3, 2, 2],
    ]);
    expect(groupingChoices(4)).toEqual([]);
    for (const grouping of groupingChoices(15)) {
      expect(grouping.reduce((sum, size) => sum + size, 0)).toBe(15);
    }
    expect(groupingChoices(32).length).toBeLessThanOrEqual(16);
  });

  it("names the tempo the Italian way", () => {
    expect(tempoMarking(50)).toBe("Largo");
    expect(tempoMarking(120)).toBe("Allegro");
    expect(tempoMarking(250)).toBe("Prestissimo");
  });

  it("reads the bar and the pulse, count-in bars before the first", () => {
    expect(barAndPulse(0, 7)).toEqual({ bar: 1, pulse: 0 });
    expect(barAndPulse(9.5, 7)).toEqual({ bar: 2, pulse: 2 });
    expect(barAndPulse(-3, 4)).toEqual({ bar: 0, pulse: 1 });
    expect(formatElapsed(187.9)).toBe("3:07");
  });

  it("keeps a stored setup usable", () => {
    const setup = sanitizeSetup({ beats: 7, grouping: [2, 2, 2], states: ["muted"], bpm: 9999 });
    // A grouping that does not add up is dropped: every pulse is a beat again
    expect(setup.grouping).toBeNull();
    expect(setup.states).toHaveLength(7);
    expect(setup.states[0]).toBe("muted");
    expect(setup.bpm).toBe(400);
  });
});
