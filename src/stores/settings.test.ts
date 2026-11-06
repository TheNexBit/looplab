import { describe, expect, it } from "vitest";
import { sanitize } from "./settings";

describe("settings saved by an older version", () => {
  it("keep a count-in that was on, with its length", () => {
    const old = sanitize({ countInBars: 2 } as never);
    expect(old.countIn).toBe(true);
    expect(old.countInBars).toBe(2);
  });

  it("turn '0 bars' into a count-in that is off, one bar long when switched on", () => {
    const old = sanitize({ countInBars: 0 } as never);
    expect(old.countIn).toBe(false);
    expect(old.countInBars).toBe(1);
  });

  it("respect the on/off key once it exists", () => {
    expect(sanitize({ countIn: false, countInBars: 4 }).countIn).toBe(false);
  });

  it("fall back to the classic click for an unknown sound", () => {
    expect(sanitize({ accentSound: "gong" } as never).accentSound).toBe("beepHigh");
  });
});

describe("choice settings", () => {
  it("fall back to the default for an unknown choice", () => {
    expect(sanitize({ waveStyle: "spiky", wheel: "scroll" } as never)).toMatchObject({
      waveStyle: "filled",
      wheel: "scroll",
    });
  });
});
