import { describe, expect, it } from "vitest";
import {
  afterSong,
  breakItem,
  cueRange,
  daysTo,
  fadeGain,
  livePlan,
  moved,
  playLength,
  remainingFrom,
  setLength,
  songFromFile,
  songNumbers,
  songWithoutFile,
  titleOf,
  todayIso,
} from "./setlistMath";

describe("setlist math", () => {
  it("names a song after its file", () => {
    expect(titleOf("C:\\Gig\\Highway Star.mp3")).toBe("Highway Star");
    expect(titleOf("/a/.hidden")).toBe(".hidden");
  });

  it("measures a song from its cues and Live speed", () => {
    const song = { ...songFromFile("a.mp3", 200), cueIn: 20, cueOut: 180, speed: 0.8 };
    expect(cueRange(song)).toEqual({ start: 20, end: 180 });
    expect(playLength(song)).toBeCloseTo(200);
    expect(playLength(songFromFile("b.mp3"))).toBeNull();
    expect(playLength({ ...songWithoutFile("Jam"), length: 300 })).toBe(300);
    // A cue out before the cue in is ignored
    expect(cueRange({ ...songFromFile("c.mp3", 100), cueIn: 50, cueOut: 10 })).toEqual({
      start: 50,
      end: 100,
    });
  });

  it("adds up the set and counts the songs of unknown length", () => {
    const songs = [songFromFile("a.mp3", 100), songFromFile("b.mp3"), songWithoutFile("Jam")];
    expect(setLength(songs)).toEqual({ seconds: 340, unknown: 1 });
  });

  it("counts the days to the gig", () => {
    const today = new Date(2026, 10, 24);
    expect(todayIso(today)).toBe("2026-11-24");
    expect(daysTo("2026-11-24", today)).toBe(0);
    expect(daysTo("2026-12-01", today)).toBe(7);
    expect(daysTo("2026-11-20", today)).toBe(-4);
  });

  it("moves a song", () => {
    expect(moved(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moved(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moved(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });

  it("plans the changes rehearsal: head and tail of each song", () => {
    const range = { start: 0, end: 200 };
    expect(livePlan(range, "set", 10)).toEqual([range]);
    expect(livePlan(range, "changes", 10)).toEqual([
      { start: 0, end: 10 },
      { start: 190, end: 200 },
    ]);
    expect(livePlan({ start: 0, end: 15 }, "changes", 10)).toEqual([{ start: 0, end: 15 }]);
  });

  it("counts breaks in the set but not as songs", () => {
    const songs = [
      songFromFile("a.mp3", 100),
      { ...breakItem("Pausa"), length: 600 },
      { ...songFromFile("b.mp3", 50), segue: true },
      songFromFile("c.mp3", 50),
    ];
    expect(setLength(songs).seconds).toBe(800);
    expect([...songNumbers(songs).values()]).toEqual([1, 2, 3]);
    // Gap after «a» and none after the break, the segue or the last song
    expect(remainingFrom(songs, 0, 10)).toBe(810);
  });

  it("decides what follows a song: segue, break, stop after, auto-advance, gap", () => {
    const song = songFromFile("a.mp3", 100);
    const next = songFromFile("b.mp3", 100);
    const pause = breakItem("Pausa");
    expect(afterSong(song, next, true, 3)).toBe("gap");
    expect(afterSong(song, next, true, 0)).toBe("play");
    expect(afterSong(song, next, false, 3)).toBe("wait");
    expect(afterSong({ ...song, stopAfter: true }, next, true, 3)).toBe("wait");
    expect(afterSong({ ...song, segue: true }, next, false, 3)).toBe("play");
    expect(afterSong(song, pause, false, 3)).toBe("play");
    expect(afterSong(pause, next, true, 3)).toBe("wait");
  });
});

describe("fade out at the cue out", () => {
  const part = { start: 0, end: 100 };
  it("is full level before the fade and silent at the cue out", () => {
    expect(fadeGain(90, part, 3)).toBe(1);
    expect(fadeGain(97, part, 3)).toBe(1);
    expect(fadeGain(100, part, 3)).toBe(0);
    expect(fadeGain(105, part, 3)).toBe(0);
  });

  it("fades evenly to the ear (squared curve) and stays off without a length", () => {
    expect(fadeGain(98.5, part, 3)).toBeCloseTo(0.25);
    expect(fadeGain(99, part, null)).toBe(1);
  });

  it("lasts the same as heard at a slower Live speed", () => {
    // At half speed 3 s as heard are 1.5 s of the file
    expect(fadeGain(98.5, part, 3, 0.5)).toBe(1);
    expect(fadeGain(99.25, part, 3, 0.5)).toBeCloseTo(0.25);
  });

  it("never lasts longer than the part: it starts at full level with it", () => {
    const short = { start: 10, end: 13 };
    expect(fadeGain(10, short, 12)).toBe(1);
    expect(fadeGain(11.5, short, 12)).toBeCloseTo(0.25);
  });
});
