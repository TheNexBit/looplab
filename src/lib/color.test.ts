import { describe, expect, it } from "vitest";
import { isHex, lighten, parseHex, textOn, withAlpha } from "./color";

describe("colour helpers", () => {
  it("read short and long hex colours, and nothing else", () => {
    expect(parseHex("#ffa726")).toEqual({ r: 255, g: 167, b: 38 });
    expect(parseHex("#fa2")).toEqual({ r: 255, g: 170, b: 34 });
    expect(isHex("rgb(1 2 3)")).toBe(false);
    expect(isHex("#12345")).toBe(false);
  });

  it("make the shades of a picked colour", () => {
    expect(withAlpha("#ffa726", 0.14)).toBe("rgb(255 167 38 / 0.14)");
    expect(lighten("#000000", 0.5)).toBe("#808080");
    expect(lighten("#ffffff", -0.5)).toBe("#808080");
  });

  it("put readable text on light and dark keys", () => {
    expect(textOn("#ffee58")).toBe("#14110b");
    expect(textOn("#1a237e")).toBe("#fbfaf7");
  });
});
