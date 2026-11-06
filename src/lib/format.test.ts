import { describe, expect, it } from "vitest";
import { signed } from "./format";

describe("signed", () => {
  it("shows the plus sign and the unit", () => {
    expect(signed(2, "st")).toBe("+2 st");
    expect(signed(-3)).toBe("-3");
    expect(signed(0, "dB")).toBe("0 dB");
  });
});
