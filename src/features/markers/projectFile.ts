import { GAP, LEAD_IN, SPEED } from "@/features/player/limits";
import { BEATS_PER_BAR, sanitizeTempoMap, type TempoMap } from "@/features/practice/tempo";
import type { ChannelMode, Project_Deserialize, Project_Serialize } from "@/lib/bindings";
import { type EqData, eqFromFile, eqToRust } from "@/stores/eq";
import type { LoopOptions } from "@/stores/loop";
import { type MarkerData, type SectionData, withEnds } from "@/stores/markers";
import type { PlaylistStepData } from "@/stores/playlist";
import type { SavedLoopData } from "@/stores/savedLoops";

/** Project contents with every number guaranteed (JSON turns NaN into null). */
export interface ProjectData {
  markers: MarkerData[];
  sections: SectionData[];
  loop: LoopOptions & { start: number | null; end: number | null };
  loops: SavedLoopData[];
  playlist: PlaylistStepData[];
  /** Seconds: where the playhead was */
  position: number;
  bpm: number | null;
  beatOffset: number | null;
  beatsPerBar: number;
  beatUnit: number;
  /** Where tempo and meter change; the four fields above repeat its first marker (or the draft) */
  tempoMap: TempoMap;
  speed: number;
  semitones: number;
  cents: number;
  eq: EqData;
  channels: ChannelMode;
}

const num = (value: number | null | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * Reads a project from Rust; defaults come from Rust too (`default_project`). `duration` ends
 * the last section of files that kept only where sections start.
 */
export function fromFile(file: Project_Serialize, duration = 0): ProjectData {
  return {
    markers: file.markers.map((m) => ({ ...m, time: num(m.time, 0) })),
    sections: withEnds(
      file.sections.map((s) => ({
        ...s,
        start: num(s.start, 0),
        end: typeof s.end === "number" ? s.end : null,
      })),
      duration,
    ),
    loop: {
      enabled: file.loop.enabled,
      start: file.loop.start ?? null,
      end: file.loop.end ?? null,
      leadIn: num(file.loop.leadIn, LEAD_IN.default),
      gap: num(file.loop.gap, GAP.default),
    },
    loops: file.loops
      .map((l) => ({ ...l, start: num(l.start, 0), end: num(l.end, 0) }))
      .filter((l) => l.end > l.start),
    playlist: (file.playlist ?? []).filter((step) => step.repeats > 0),
    position: Math.max(0, num(file.position, 0)),
    bpm: typeof file.bpm === "number" && file.bpm > 0 ? file.bpm : null,
    beatOffset: typeof file.beatOffset === "number" ? file.beatOffset : null,
    beatsPerBar: file.beatsPerBar > 0 ? file.beatsPerBar : BEATS_PER_BAR.default,
    beatUnit: file.beatUnit > 0 ? file.beatUnit : 4,
    tempoMap: tempoMapOf(file),
    speed: num(file.speed, SPEED.default),
    semitones: file.semitones,
    cents: file.cents,
    eq: eqFromFile(file.eq),
    channels: file.channels,
  };
}

/**
 * The tempo map of a file. Files from before tempo maps kept a single tempo: that is their map,
 * one marker on their first beat.
 */
function tempoMapOf(file: Project_Serialize): TempoMap {
  const saved = sanitizeTempoMap(
    (file.tempoMap ?? []).map((m) => ({
      time: m.time ?? Number.NaN,
      bpm: m.bpm ?? Number.NaN,
      beatsPerBar: m.beatsPerBar,
      beatUnit: m.beatUnit,
    })),
  );
  if (saved.length > 0) return saved;
  if (typeof file.bpm !== "number" || file.bpm <= 0) return [];
  return sanitizeTempoMap([
    {
      time: typeof file.beatOffset === "number" ? file.beatOffset : 0,
      bpm: file.bpm,
      beatsPerBar: file.beatsPerBar > 0 ? file.beatsPerBar : BEATS_PER_BAR.default,
      beatUnit: file.beatUnit > 0 ? file.beatUnit : 4,
    },
  ]);
}

export function toFile(data: ProjectData): Project_Deserialize {
  return { version: 1, ...data, eq: eqToRust(data.eq) };
}
