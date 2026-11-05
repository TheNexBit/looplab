import { describe, expect, it } from "vitest";
import {
  formatFrequency,
  frequencyToX,
  gainToY,
  parseFrequency,
  xToFrequency,
  yToGain,
} from "./scale";

describe("EQ scale", () => {
  it("maps frequencies on a log scale and back", () => {
    expect(frequencyToX(20)).toBe(0);
    expect(frequencyToX(20_000)).toBeCloseTo(1);
    expect(frequencyToX(632.5)).toBeCloseTo(0.5, 2);
    expect(xToFrequency(frequencyToX(1_234))).toBeCloseTo(1_234);
  });

  it("puts 0 dB in the middle", () => {
    expect(gainToY(0)).toBe(0.5);
    expect(yToGain(0)).toBe(18);
    expect(yToGain(2)).toBe(-18);
  });

  it("reads and writes frequencies like a musician types them", () => {
    expect(parseFrequency("1.5k")).toBe(1_500);
    expect(parseFrequency("1,5 kHz")).toBe(1_500);
    expect(parseFrequency("250")).toBe(250);
    expect(formatFrequency(250)).toBe("250 Hz");
    expect(formatFrequency(3_000)).toBe("3.00 kHz");
  });
});
