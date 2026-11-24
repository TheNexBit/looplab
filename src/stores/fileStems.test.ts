import { describe, expect, it } from "vitest";
import { laneGains, laneLabels, listening, nextSolo } from "./fileStems";

const lane = (level = 1, mute = false, solo = false) => ({ level, mute, solo });
const s = (solo: boolean, mute = false) => ({ solo, mute });

describe("stems from files", () => {
  it("hears every lane at its level, only the soloed ones with a solo, never a muted one", () => {
    expect(laneGains([lane(0.5), lane()])).toEqual([0.5, 1]);
    expect(laneGains([lane(1, false, true), lane()])).toEqual([1, 0]);
    expect(laneGains([lane(1, true, true), lane(0.7, false, true)])).toEqual([0, 0.7]);
  });

  it("Listen lights only what is heard; next goes all → first → second → all", () => {
    expect(listening([s(false), s(false)])).toBeNull();
    expect(listening([s(false), s(true)])).toBe(1);
    expect(listening([s(true), s(true)])).toBeUndefined();
    // A muted lane: «All» is not what is heard, nothing is lit
    expect(listening([s(false, true), s(false)])).toBeUndefined();
    expect(listening([s(true, true), s(false)])).toBeUndefined();
    expect(nextSolo([s(false), s(false)])).toBe(0);
    expect(nextSolo([s(true), s(false)])).toBe(1);
    expect(nextSolo([s(false), s(true)])).toBeNull();
  });

  it("names the lanes by what tells them apart, never twice the same", () => {
    expect(
      laneLabels([
        "C:\\JTC\\05 Shifting Sands Solo\\Shifting Sands Solo.mp3",
        "C:\\JTC\\05 Shifting Sands Solo\\Shifting Sands Solo Backing.mp3",
      ]),
    ).toEqual(["Shifting Sands Solo", "Backing"]);
    expect(laneLabels(["a/Guitar.wav", "a/Drums.wav"])).toEqual(["Guitar", "Drums"]);
    expect(laneLabels(["a/Song_mix.wav", "a/Song_click.wav"])).toEqual(["mix", "click"]);
    expect(laneLabels(["a/Solo.mp3", "a/Solo.mp4", "a/Solo Backing.mp3"])).toEqual([
      "Solo (mp3)",
      "Solo (mp4)",
      "Backing",
    ]);
    expect(laneLabels(["a/x/Take.wav", "b/Take.wav"])).toEqual(["Take (wav) 1", "Take (wav) 2"]);
  });
});
