import { describe, expect, it } from "vitest";
import { parsePeaks, pickLevel } from "./peaks";

/** Same bytes as `binary_layout_matches_the_ui_reader` in peaks.rs, plus a second level. */
function sample(): ArrayBuffer {
  const bytes = new Uint8Array(8 + (8 + 4) + (8 + 2));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 48_000, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, 32, true);
  view.setUint32(12, 2, true);
  bytes.set([0x81, 127, 0xf6, 50], 16); // (-127, 127), (-10, 50)
  view.setUint32(20, 64, true);
  view.setUint32(24, 1, true);
  bytes.set([0x81, 127], 28);
  return bytes.buffer;
}

describe("parsePeaks", () => {
  it("reads header and levels", () => {
    const peaks = parsePeaks(sample());
    expect(peaks.sampleRate).toBe(48_000);
    expect(peaks.levels.map((l) => l.binFrames)).toEqual([32, 64]);
    expect(Array.from(peaks.levels[0]?.data ?? [])).toEqual([-127, 127, -10, 50]);
  });
});

describe("pickLevel", () => {
  const peaks = parsePeaks(sample());

  it("uses the coarsest level that keeps one bin per pixel", () => {
    expect(pickLevel(peaks, 100).binFrames).toBe(64);
    expect(pickLevel(peaks, 40).binFrames).toBe(32);
  });

  it("falls back to the finest level when zoomed in deeply", () => {
    expect(pickLevel(peaks, 1).binFrames).toBe(32);
  });
});
