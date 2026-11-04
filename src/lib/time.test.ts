import { describe, expect, it } from "vitest";
import { clamp, formatTick, formatTime } from "./time";

describe("formatTime", () => {
  it("shows minutes, seconds and tenths", () => {
    expect(formatTime(0)).toBe("0:00.0");
    expect(formatTime(83.46)).toBe("1:23.4");
    expect(formatTime(600)).toBe("10:00.0");
  });

  it("never shows negative time", () => {
    expect(formatTime(-2)).toBe("0:00.0");
  });

  it("does not round up into the next second", () => {
    expect(formatTime(59.99)).toBe("0:59.9");
  });
});

describe("formatTick", () => {
  it("drops tenths when not needed", () => {
    expect(formatTick(65, false)).toBe("1:05");
    expect(formatTick(65.5, true)).toBe("1:05.5");
  });
});

describe("clamp", () => {
  it("keeps values in range", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});
