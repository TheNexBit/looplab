import { describe, expect, it } from "vitest";
import { formatAgo, movedWith, samePath, signed } from "./format";
import { formatLength } from "./time";

describe("signed", () => {
  it("shows the plus sign and the unit", () => {
    expect(signed(2, "st")).toBe("+2 st");
    expect(signed(-3)).toBe("-3");
    expect(signed(0, "dB")).toBe("0 dB");
  });
});

describe("formatAgo", () => {
  const words = {
    now: "adesso",
    minutes: "min fa",
    today: "oggi",
    yesterday: "ieri",
    locale: "it-IT",
  };
  const now = new Date(2026, 10, 7, 15, 0);

  it("counts minutes, then says today and yesterday", () => {
    expect(formatAgo(new Date(2026, 10, 7, 14, 59, 50), now, words)).toBe("adesso");
    expect(formatAgo(new Date(2026, 10, 7, 14, 48), now, words)).toBe("12 min fa");
    expect(formatAgo(new Date(2026, 10, 7, 8, 0), now, words)).toBe("oggi");
    expect(formatAgo(new Date(2026, 10, 6, 23, 0), now, words)).toBe("ieri");
  });

  it("names the weekday within a week, the date before", () => {
    expect(formatAgo(new Date(2026, 10, 3, 10, 0), now, words)).toMatch(/^mar/);
    expect(formatAgo(new Date(2026, 9, 12, 10, 0), now, words)).toMatch(/12 ott/);
    expect(formatAgo(new Date(2025, 9, 12, 10, 0), now, words)).toMatch(/2025/);
  });
});

describe("formatLength", () => {
  it("writes minutes and seconds, and hours when there are any", () => {
    expect(formatLength(252)).toBe("4:12");
    expect(formatLength(3725)).toBe("1:02:05");
  });
});

describe("samePath", () => {
  it("ignores case, as Windows does", () => {
    expect(samePath("C:\\Music\\Song.mp3", "c:\\music\\song.MP3")).toBe(true);
    expect(samePath("C:\\a.mp3", "C:\\b.mp3")).toBe(false);
  });

  it("never matches a missing or empty path", () => {
    expect(samePath("", "")).toBe(false);
    expect(samePath(null, null)).toBe(false);
    expect(samePath(undefined, "C:\\a.mp3")).toBe(false);
  });
});

describe("files that moved with the track", () => {
  it("follow the track's folder, also from a sibling folder", () => {
    expect(
      movedWith(
        String.raw`D:\Songs\A\song.mp3`,
        String.raw`E:\Music\A\song.mp3`,
        String.raw`D:\Songs\A\bass.wav`,
      ),
    ).toBe(String.raw`E:\Music\A\bass.wav`);
    expect(
      movedWith(
        String.raw`D:\Course\L1\Video\v.mp4`,
        String.raw`E:\Course\L1\Video\v.mp4`,
        String.raw`D:\Course\L1\Audio\b.mp3`,
      ),
    ).toBe(String.raw`E:\Course\L1\Audio\b.mp3`);
  });

  it("give nothing when the track did not move or the drives share nothing", () => {
    expect(
      movedWith(String.raw`D:\A\s.mp3`, String.raw`d:\a\s.mp3`, String.raw`D:\A\b.wav`),
    ).toBeNull();
    expect(
      movedWith(String.raw`D:\A\s.mp3`, String.raw`E:\A\s.mp3`, String.raw`F:\B\b.wav`),
    ).toBeNull();
  });
});
