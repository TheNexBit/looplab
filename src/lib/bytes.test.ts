import { describe, expect, it } from "vitest";
import { formatBytes } from "./bytes";

describe("formatBytes", () => {
  it("picks the unit and uses a decimal comma", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(1.25 * 1024 ** 3)).toBe("1,3 GB");
    expect(formatBytes(250 * 1024 ** 2)).toBe("250 MB");
  });
});
