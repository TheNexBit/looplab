import { beforeEach, describe, expect, it } from "vitest";
import { stemGains, useStemsStore } from "./stems";

const store = () => useStemsStore.getState();
const names = ["drums", "bass", "other", "vocals", "guitar", "piano"];

describe("mixer of the separated tracks", () => {
  beforeEach(() => store().reset());

  it("starts with every track at full level: the original song", () => {
    expect(stemGains(names, store().channels)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("mutes and lowers single tracks", () => {
    store().toggleMute("guitar");
    store().setLevel("vocals", 0.4);
    expect(stemGains(names, store().channels)).toEqual([1, 1, 1, 0.4, 0, 1]);
  });

  it("plays only the soloed tracks while any is soloed", () => {
    store().toggleSolo("drums");
    store().toggleSolo("bass");
    store().setLevel("bass", 0.5);
    expect(stemGains(names, store().channels)).toEqual([1, 0.5, 0, 0, 0, 0]);
    store().toggleSolo("drums");
    store().toggleSolo("bass");
    expect(stemGains(names, store().channels)).toEqual([1, 0.5, 1, 1, 1, 1]);
  });

  it("keeps levels in range", () => {
    store().setLevel("piano", 3);
    store().setLevel("other", Number.NaN);
    expect(stemGains(names, store().channels)).toEqual([1, 1, 1, 1, 1, 1]);
  });
});
