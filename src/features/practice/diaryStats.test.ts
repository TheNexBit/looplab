import { describe, expect, it } from "vitest";
import type { DiaryRecord } from "@/stores/diary";
import { formatDuration, lastDays, localDay, trackSummary, tracksPractised } from "./diaryStats";

const entry = (day: string, path: string, seconds: number, maxSpeed = 1): DiaryRecord => ({
  day,
  path,
  name: path.split("\\").at(-1) ?? path,
  seconds,
  maxSpeed,
});

const now = new Date(2026, 10, 6, 18, 0); // 6 November 2026, local time

describe("diary statistics", () => {
  it("writes local dates", () => {
    expect(localDay(now)).toBe("2026-11-06");
    expect(lastDays(now, 3)).toEqual(["2026-11-04", "2026-11-05", "2026-11-06"]);
  });

  it("sums a track's practice today, this week and in total", () => {
    const entries = [
      entry("2026-10-01", "D:\\a.mp3", 600, 0.7),
      entry("2026-11-05", "D:\\a.mp3", 300, 0.8),
      entry("2026-11-06", "d:\\A.MP3", 120, 0.75),
      entry("2026-11-06", "D:\\b.mp3", 999),
    ];
    const summary = trackSummary(entries, "D:\\a.mp3", now);
    expect(summary.today).toBe(120);
    expect(summary.total).toBe(1020);
    expect(summary.maxSpeed).toBe(0.8);
    expect(summary.week.map((d) => d.seconds)).toEqual([0, 0, 0, 0, 0, 300, 120]);
  });

  it("lists tracks, the most recent first", () => {
    const rows = tracksPractised([
      entry("2026-11-01", "D:\\a.mp3", 60, 0.6),
      entry("2026-11-06", "D:\\b.mp3", 30),
      entry("2026-11-03", "D:\\a.mp3", 60, 0.9),
    ]);
    expect(rows.map((r) => [r.name, r.total, r.days, r.lastDay])).toEqual([
      ["b.mp3", 30, 1, "2026-11-06"],
      ["a.mp3", 120, 2, "2026-11-03"],
    ]);
    expect(rows[1]?.maxSpeed).toBe(0.9);
  });

  it("formats durations", () => {
    expect(formatDuration(20)).toBe("< 1 min");
    expect(formatDuration(12 * 60 + 30)).toBe("12 min");
    expect(formatDuration(65 * 60)).toBe("1 h 05 min");
  });
});
