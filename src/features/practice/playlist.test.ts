import { describe, expect, it } from "vitest";
import { afterPass } from "./playlist";

const steps = [
  { loopId: "verse", repeats: 2 },
  { loopId: "chorus", repeats: 1 },
];

describe("practice playlist", () => {
  it("plays a step as many times as asked, then the next one", () => {
    expect(afterPass(steps, 0, 1)).toEqual({ current: 0, pass: 2 });
    expect(afterPass(steps, 0, 2)).toEqual({ current: 1, pass: 1 });
  });

  it("ends after the last pass of the last step", () => {
    expect(afterPass(steps, 1, 1)).toBeNull();
  });
});
