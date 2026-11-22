import { describe, expect, it } from "vitest";
import { type ScoreHeader, tidyHeader } from "./scoreHeader";

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
