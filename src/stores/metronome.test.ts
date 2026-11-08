import { describe, expect, it } from "vitest";
import { pulsesPerMinute, quartersPerMinute, sanitizeSetup } from "./metronome";

describe("what the BPM count", () => {
  it("counts quarters by default: 4/8 at 120 plays 240 eighths a minute", () => {
    const tempo = { bpm: 120, unit: 8, tempoBase: "quarter" } as const;
    expect(pulsesPerMinute(tempo)).toBe(240);
    expect(quartersPerMinute(tempo)).toBe(120);
  });

  it("counts the pulses when asked: 4/8 at 120 plays 120 eighths, as 4/4 at 120", () => {
    const tempo = { bpm: 120, unit: 8, tempoBase: "pulse" } as const;
    expect(pulsesPerMinute(tempo)).toBe(120);
    expect(quartersPerMinute(tempo)).toBe(60);
    expect(pulsesPerMinute({ ...tempo, unit: 4 })).toBe(120);
  });

  it("keeps old saved setups on quarters", () => {
    expect(sanitizeSetup({ bpm: 100 }).tempoBase).toBe("quarter");
    expect(sanitizeSetup({ tempoBase: "pulse" }).tempoBase).toBe("pulse");
  });
});
