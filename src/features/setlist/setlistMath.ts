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
/** A song without file: planned length, 15 s steps. */
export const PLANNED_LENGTH = { min: 30, max: 1800, step: 15 } as const;
/** A break between sets: 1 to 60 minutes, by the minute. */
export const BREAK_LENGTH = { min: 60, max: 3600, step: 60, default: 900 } as const;

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
    kind: "song",
    path,
    title: titleOf(path),
    length,
    cueIn: null,
    cueOut: null,
    semitones: null,
    speed: null,
    bpm: null,
    notes: "",
    key: null,
    segue: false,
    stopAfter: false,
    fadeOut: null,
  };
}

export function songWithoutFile(title: string): Song {
  return { ...songFromFile(""), path: null, title, length: DEFAULT_SONG_LENGTH, bpm: 120 };
}

/** A break between sets («Pausa», «Bis»): a title and a length, nothing to play. */
export function breakItem(title: string): Song {
  return { ...songFromFile(""), kind: "break", path: null, title, length: BREAK_LENGTH.default };
}

export const isBreak = (song: Song) => song.kind === "break";

/** Where Live starts and stops in the file (seconds), or null when the length is unknown. */
export function cueRange(song: Song): { start: number; end: number } | null {
  if (song.length === null) return null;
  const start = Math.min(song.cueIn ?? 0, song.length);
  const end = Math.min(song.cueOut ?? song.length, song.length);
  return end > start ? { start, end } : { start, end: song.length };
}

/** How long the song lasts on stage: its cue range at its Live speed (planned length without file). */
export function playLength(song: Song): number | null {
  if (!song.path || isBreak(song)) return song.length;
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

/**
 * Seconds still to play from song `index` on (its whole length; the gaps between songs too,
 * except after a segue), for the projected end of the gig.
 */
export function remainingFrom(songs: readonly Song[], index: number, gapSeconds: number): number {
  let seconds = 0;
  for (let i = index; i < songs.length; i += 1) {
    const song = songs[i] as Song;
    seconds += playLength(song) ?? 0;
    const last = i === songs.length - 1;
    if (!last && !song.segue && !isBreak(song)) seconds += gapSeconds;
  }
  return seconds;
}

/** The songs only (breaks left out), each with its number in the set: 1, 2, 3… */
export function songNumbers(songs: readonly Song[]): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const song of songs) if (!isBreak(song)) numbers.set(song.id, numbers.size + 1);
  return numbers;
}

/**
 * What follows when a song of the set ends. A segue starts the next one at once (a medley), a
 * break starts its countdown at once; after a break, after a song marked «Stop after», or with
 * auto-advance off, the next one waits for the key; otherwise it starts after the gap (at once
 * with 0 s).
 */
export function afterSong(
  current: Song | undefined,
  next: Song,
  autoAdvance: boolean,
  gapSeconds: number,
): "play" | "wait" | "gap" {
  if (current?.segue || isBreak(next)) return "play";
  if (!current || isBreak(current) || current.stopAfter || !autoAdvance) return "wait";
  return gapSeconds > 0 ? "gap" : "play";
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

/** Fade out lengths offered in the Live settings (seconds as heard). */
export const FADE_OUT_CHOICES = [1, 2, 3, 5, 8, 12] as const;
/** The length a fade starts with when it is switched on. */
export const FADE_OUT_DEFAULT = 3;

/**
 * Track level while a part fades out towards its `end` (seconds in the file): 1 until the fade
 * starts, then down to 0 at `end`. `seconds` is the fade as heard: at a slower Live speed the
 * file moves less in that time. A fade longer than the part starts with it, never lower. The
 * curve is squared, so the ear hears an even fade.
 */
export function fadeGain(
  position: number,
  part: { start: number; end: number },
  seconds: number | null,
  speed = 1,
): number {
  if (!seconds || seconds <= 0) return 1;
  const span = Math.min(seconds * speed, part.end - part.start);
  if (span <= 0) return 1;
  const left = (part.end - position) / span;
  const linear = Math.min(1, Math.max(0, left));
  return linear * linear;
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
