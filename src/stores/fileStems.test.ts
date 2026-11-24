import { describe, expect, it } from "vitest";
import { laneGains, laneLabels, nextSolo } from "./fileStems";

const lane = (level = 1, mute = false, solo = false) => ({ level, mute, solo });

describe("stems from files", () => {
  it("hears every lane at its level, only the soloed ones with a solo, never a muted one", () => {
    expect(laneGains([lane(0.5), lane()])).toEqual([0.5, 1]);
    expect(laneGains([lane(1, false, true), lane()])).toEqual([1, 0]);
    expect(laneGains([lane(1, true, true), lane(0.7, false, true)])).toEqual([0, 0.7]);
  });

  it("X goes to the next lane alone, round and round", () => {
    expect(nextSolo([{ solo: false }, { solo: false }])).toBe(1);
    expect(nextSolo([{ solo: false }, { solo: true }])).toBe(0);
    expect(nextSolo([{ solo: true }, { solo: false }, { solo: false }])).toBe(1);
    expect(nextSolo([{ solo: true }, { solo: true }, { solo: false }])).toBe(1);
  });

  it("names the lanes by what tells them apart", () => {
    expect(
      laneLabels([
        "C:\\JTC\\05 Shifting Sands Solo\\Shifting Sands Solo.mp3",
        "C:\\JTC\\05 Shifting Sands Solo\\Shifting Sands Solo Backing.mp3",
      ]),
    ).toEqual(["Shifting Sands Solo", "Backing"]);
    expect(laneLabels(["a/Guitar.wav", "a/Drums.wav"])).toEqual(["Guitar", "Drums"]);
    expect(laneLabels(["a/Song_mix.wav", "a/Song_click.wav"])).toEqual(["mix", "click"]);
  });
});
