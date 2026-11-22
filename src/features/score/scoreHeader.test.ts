import { describe, expect, it } from "vitest";
import { type ScoreHeader, tidyHeader, tidyTexts } from "./scoreHeader";

const header = (fields: Partial<ScoreHeader>): ScoreHeader => ({
  title: "",
  subTitle: "",
  artist: "",
  album: "",
  words: "",
  music: "",
  copyright: "",
  tab: "",
  instructions: "",
  ...fields,
});

describe("tidyHeader", () => {
  it("moves the title's later lines into the subtitle", () => {
    const score = header({ title: "Module 02 \nExercise 03: Basic Shapes" });
    tidyHeader(score);
    expect(score.title).toBe("Module 02");
    expect(score.subTitle).toBe("Exercise 03: Basic Shapes");
  });

  it("keeps an existing subtitle after the moved lines", () => {
    const score = header({ title: "A\r\nB", subTitle: "C" });
    tidyHeader(score);
    expect(score).toMatchObject({ title: "A", subTitle: "B · C" });
  });

  it("joins other fields on one line and leaves one-line fields alone", () => {
    const score = header({ title: "Song", artist: "One\n\nTwo", album: "Album" });
    tidyHeader(score);
    expect(score).toMatchObject({
      title: "Song",
      subTitle: "",
      artist: "One · Two",
      album: "Album",
    });
  });
});

describe("tidyTexts", () => {
  it("joins beat texts and section names on one line", () => {
    const beat = { text: "Position shifts!\r\nKeep it light" };
    const plain = { text: "Slow" };
    const section = { text: "Intro\nA", marker: "A" };
    tidyTexts({
      masterBars: [{ section }, { section: null }],
      tracks: [{ staves: [{ bars: [{ voices: [{ beats: [beat, plain, { text: null }] }] }] }] }],
    });
    expect(beat.text).toBe("Position shifts! Keep it light");
    expect(plain.text).toBe("Slow");
    expect(section).toEqual({ text: "Intro A", marker: "A" });
  });
});
