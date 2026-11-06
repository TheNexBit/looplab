import type { DiaryRecord } from "@/stores/diary";

/** Local date as the diary stores it: "2026-11-06". */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The `count` days up to `today`, oldest first. */
export function lastDays(today: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (count - 1 - i));
    return localDay(day);
  });
}

const samePath = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export interface TrackSummary {
  /** Seconds practised today */
  today: number;
  total: number;
  /** Seconds on each of the last 7 days, oldest first */
  week: { day: string; seconds: number }[];
  maxSpeed: number;
}

/** Practice of one track: today, in total and over the last week. */
export function trackSummary(entries: DiaryRecord[], path: string, now: Date): TrackSummary {
  const mine = entries.filter((e) => samePath(e.path, path));
  const today = localDay(now);
  const seconds = (day: string) =>
    mine.filter((e) => e.day === day).reduce((sum, e) => sum + e.seconds, 0);
  return {
    today: seconds(today),
    total: mine.reduce((sum, e) => sum + e.seconds, 0),
    week: lastDays(now, 7).map((day) => ({ day, seconds: seconds(day) })),
    maxSpeed: mine.reduce((max, e) => Math.max(max, e.maxSpeed), 0),
  };
}

export interface TrackRow {
  path: string;
  name: string;
  total: number;
  days: number;
  maxSpeed: number;
  lastDay: string;
}

/** One row per track, the most recently practised first. */
export function tracksPractised(entries: DiaryRecord[]): TrackRow[] {
  const rows = new Map<string, TrackRow>();
  for (const e of entries) {
    const key = e.path.toLowerCase();
    const row = rows.get(key);
    if (row) {
      row.total += e.seconds;
      row.days += 1;
      row.maxSpeed = Math.max(row.maxSpeed, e.maxSpeed);
      if (e.day >= row.lastDay) {
        row.lastDay = e.day;
        row.name = e.name;
      }
    } else {
      rows.set(key, {
        path: e.path,
        name: e.name,
        total: e.seconds,
        days: 1,
        maxSpeed: e.maxSpeed,
        lastDay: e.day,
      });
    }
  }
  return [...rows.values()].sort((a, b) => b.lastDay.localeCompare(a.lastDay));
}

/** "1 h 05 min", "12 min", "< 1 min". */
export function formatDuration(seconds: number, unit = { hour: "h", minute: "min" }): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return `< 1 ${unit.minute}`;
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes} ${unit.minute}`;
  return `${hours} ${unit.hour} ${String(minutes % 60).padStart(2, "0")} ${unit.minute}`;
}
