import { describe, expect, it } from "vitest";
import { sanitizeSetup } from "./metronome";
import { partSeconds, sanitizeLibrary } from "./metronomeLibrary";

describe("metronome library", () => {
  it("times a part from its tempo, bar and bars", () => {
    // 7/8 at 120 quarters a minute: an eighth is 0.25 s, a bar 1.75 s
    const setup = sanitizeSetup({ bpm: 120, beats: 7, unit: 8 });
    expect(partSeconds({ setup, bars: 4 })).toBeCloseTo(7);
  });

  it("repairs what was stored, dropping what makes no sense", () => {
    const library = sanitizeLibrary({
      songs: [{ name: "Schism", setup: { bpm: 9999, beats: 7, unit: 8 } }],
      sequences: [{ name: "Riscaldamento", parts: [{ bars: -3 }, { bars: 16, note: "riff" }] }],
    });
    expect(library.songs[0]?.setup.bpm).toBe(400);
    expect(library.songs[0]?.id).toBeTruthy();
    const parts = library.sequences[0]?.parts ?? [];
    expect(parts.map((p) => p.bars)).toEqual([1, 16]);
    expect(parts[1]?.note).toBe("riff");
    expect(sanitizeLibrary("broken")).toEqual({ songs: [], sequences: [] });
  });
});
