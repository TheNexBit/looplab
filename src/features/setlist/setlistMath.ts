import type { SetlistSong_Serialize as Song } from "@/lib/bindings";
import { fileNameOf } from "@/lib/format";

/** Planned length of a new song without file, seconds. */
export const DEFAULT_SONG_LENGTH = 240;
/** Ranges of the Live settings, the same as the player's. */
export const LIVE_SPEED = { min: 0.5, max: 1.5, step: 0.01, default: 1 } as const;
export const LIVE_SEMITONES = { min: -12, max: 12, step: 1, default: 0 } as const;
export const LIVE_BPM = { min: 20, max: 400, step: 1, default: 120 } as const;
export const LIMIT_MINUTES = { min: 0, max: 300, step: 5 } as const;
export const GAP_SECONDS = { min: 0, max: 60, step: 1 } as const;
/** A song without file: planned length, 30 s steps. */
export const PLANNED_LENGTH = { min: 30, max: 1800, step: 15 } as const;

/** A file's name without its extension: «Highway Star.mp3» → «Highway Star». */
export function titleOf(path: string): string {
  const name = fileNameOf(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

let made = 0;
/** An id for a new song, unique in this run and across runs. */
export function newSongId(): string {
  made += 1;
  return `song-${Date.now().toString(36)}-${made}`;
}

export function songFromFile(path: string, length: number | null = null): Song {
  return {
    id: newSongId(),
    path,
    title: titleOf(path),
    length,
    cueIn: null,
    cueOut: null,
    semitones: null,
    speed: null,
    bpm: null,
    notes: "",
  };
}

export function songWithoutFile(title: string): Song {
  return { ...songFromFile(""), path: null, title, length: DEFAULT_SONG_LENGTH, bpm: 120 };
}

/** Where Live starts and stops in the file (seconds), or null when the length is unknown. */
export function cueRange(song: Song): { start: number; end: number } | null {
  if (song.length === null) return null;
  const start = Math.min(song.cueIn ?? 0, song.length);
  const end = Math.min(song.cueOut ?? song.length, song.length);
  return end > start ? { start, end } : { start, end: song.length };
}

/** How long the song lasts on stage: its cue range at its Live speed (planned length without file). */
export function playLength(song: Song): number | null {
  if (!song.path) return song.length;
  const range = cueRange(song);
  if (!range) return null;
  return (range.end - range.start) / (song.speed ?? 1);
}

/** The set's length and how many songs have no known length (their files never read). */
export function setLength(songs: readonly Song[]): { seconds: number; unknown: number } {
  let seconds = 0;
  let unknown = 0;
  for (const song of songs) {
    const length = playLength(song);
    if (length === null) unknown += 1;
    else seconds += length;
  }
  return { seconds, unknown };
}

/** Whole days from today to the gig (`YYYY-MM-DD`), negative once it is past. */
export function daysTo(date: string, today = new Date()): number {
  const [year, month, day] = date.split("-").map(Number);
  const gig = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((gig - now) / 86_400_000);
}

/** Today as `YYYY-MM-DD` (local day). */
export function todayIso(today = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

/** The list with the item at `from` moved to `to` (both clamped). */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const result = [...list];
  if (from < 0 || from >= result.length) return result;
  const [item] = result.splice(from, 1);
  const target = Math.max(0, Math.min(to, result.length));
  result.splice(target, 0, item as T);
  return result;
}

/**
 * The parts of a song Live plays. «Set»: the whole cue range. «Changes»: only `seconds` after
 * the start and `seconds` before the end (one part when they meet), to rehearse going from one
 * song into the next.
 */
export function livePlan(
  range: { start: number; end: number },
  mode: "set" | "changes",
  seconds: number,
): { start: number; end: number }[] {
  if (mode === "set" || range.end - range.start <= seconds * 2) return [range];
  return [
    { start: range.start, end: range.start + seconds },
    { start: range.end - seconds, end: range.end },
  ];
}
