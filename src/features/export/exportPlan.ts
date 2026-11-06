import type { ExportFormat } from "@/lib/bindings";
import { signed } from "@/lib/format";
import { formatTick } from "@/lib/time";
import type { LoopRegion } from "@/stores/loop";
import type { SectionRange } from "@/stores/markers";

/** What gets exported, like the "source" of a DAW render. */
export type ExportSource = { kind: "loop" } | { kind: "section"; id: string } | { kind: "track" };

export const REPEAT_CHOICES = [1, 2, 4, 8] as const;

export const FORMATS: { id: ExportFormat; extension: string; needsFfmpeg: boolean }[] = [
  { id: "wav16", extension: "wav", needsFfmpeg: false },
  { id: "wav24", extension: "wav", needsFfmpeg: false },
  { id: "flac", extension: "flac", needsFfmpeg: true },
  { id: "mp3", extension: "mp3", needsFfmpeg: true },
];

export const extensionOf = (format: ExportFormat) =>
  FORMATS.find((f) => f.id === format)?.extension ?? "wav";

export interface PlanInput {
  source: ExportSource;
  loop: LoopRegion | null;
  sections: SectionRange[];
  duration: number;
}

export interface Region {
  start: number;
  end: number;
  /** Short name for the file: the section name, "Loop 1:02-1:15", or "" for the whole track */
  label: string;
}

/** The time span `source` stands for, or null when it no longer exists (no loop, section deleted). */
export function regionOf({ source, loop, sections, duration }: PlanInput): Region | null {
  if (source.kind === "track") return { start: 0, end: duration, label: "" };
  if (source.kind === "loop") {
    if (!loop) return null;
    // Whole seconds: short, and no dots in the file name
    const label = `Loop ${formatTick(Math.floor(loop.start), false)}-${formatTick(Math.floor(loop.end), false)}`;
    return { ...loop, label };
  }
  const section = sections.find((s) => s.id === source.id);
  return section ? { start: section.start, end: section.end, label: section.name } : null;
}

/** Characters Windows does not allow in file names become a dash. */
const safe = (text: string) =>
  text
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/**
 * "Song - Chorus 75% +2st.wav": the track name, what was exported and how it sounds,
 * so several exports of the same song never collide.
 */
export function fileName(
  trackName: string,
  region: Region,
  sound: { speed: number; semitones: number; cents: number } | null,
  format: ExportFormat,
): string {
  const base = trackName.replace(/\.[^.]+$/, "");
  const parts = [safe(base)];
  if (region.label) parts.push("-", safe(region.label));
  if (sound) {
    if (Math.round(sound.speed * 100) !== 100) parts.push(`${Math.round(sound.speed * 100)}%`);
    const st = sound.semitones ? `${signed(sound.semitones)}st` : "";
    const ct = sound.cents ? `${signed(sound.cents)}ct` : "";
    if (st || ct) parts.push(`${st}${ct}`);
  }
  return `${parts.join(" ")}.${extensionOf(format)}`;
}

/** Seconds the exported file lasts. */
export const exportedLength = (region: Region, repeats: number, speed: number) =>
  ((region.end - region.start) * repeats) / speed;
