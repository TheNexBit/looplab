import { describe, expect, it } from "vitest";
import { exportedLength, fileName, regionOf } from "./exportPlan";

const sections = [
  { id: "a", start: 0, end: 30, name: "Intro", color: 0 },
  { id: "b", start: 30, end: 60, name: "Verse/1", color: 1 },
];

describe("regionOf", () => {
  it("follows the chosen source", () => {
    const input = { loop: { start: 62, end: 75.5 }, sections, duration: 200 };
    expect(regionOf({ ...input, source: { kind: "track" } })).toEqual({
      start: 0,
      end: 200,
      label: "",
    });
    expect(regionOf({ ...input, source: { kind: "loop" } })?.label).toBe("Loop 1:02-1:15");
    expect(regionOf({ ...input, source: { kind: "section", id: "b" } })).toMatchObject({
      start: 30,
      end: 60,
    });
  });

  it("is null when the source is gone", () => {
    const input = { loop: null, sections, duration: 200 };
    expect(regionOf({ ...input, source: { kind: "loop" } })).toBeNull();
    expect(regionOf({ ...input, source: { kind: "section", id: "x" } })).toBeNull();
  });
});

describe("fileName", () => {
  const region = { start: 30, end: 60, label: "Verse/1" };

  it("names the track, the part and the sound", () => {
    expect(fileName("Song.mp3", region, { speed: 0.75, semitones: 2, cents: 0 }, "wav16")).toBe(
      "Song - Verse-1 75% +2st.wav",
    );
    expect(fileName("Song.mp3", region, { speed: 1, semitones: 0, cents: -20 }, "mp3")).toBe(
      "Song - Verse-1 -20ct.mp3",
    );
  });

  it("leaves out what is unchanged", () => {
    const whole = { start: 0, end: 100, label: "" };
    expect(fileName("My: song.flac", whole, null, "flac")).toBe("My- song.flac");
    expect(fileName("a.wav", whole, { speed: 1, semitones: 0, cents: 0 }, "wav24")).toBe("a.wav");
  });
});

describe("exportedLength", () => {
  it("counts repetitions and speed", () => {
    expect(exportedLength({ start: 10, end: 20, label: "" }, 4, 0.5)).toBe(80);
  });
});
