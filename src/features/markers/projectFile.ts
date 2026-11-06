import { GAP, LEAD_IN, SPEED } from "@/features/player/limits";
import { BEATS_PER_BAR } from "@/features/practice/tempo";
import type { ChannelMode, Project_Deserialize, Project_Serialize } from "@/lib/bindings";
import { type EqData, eqFromFile, eqToRust } from "@/stores/eq";
import type { LoopOptions } from "@/stores/loop";
import type { MarkerData, SectionData } from "@/stores/markers";
import type { SavedLoopData } from "@/stores/savedLoops";

/** Project contents with every number guaranteed (JSON turns NaN into null). */
export interface ProjectData {
  markers: MarkerData[];
  sections: SectionData[];
  loop: LoopOptions & { start: number | null; end: number | null };
  loops: SavedLoopData[];
  bpm: number | null;
  beatOffset: number | null;
  beatsPerBar: number;
  speed: number;
  semitones: number;
  cents: number;
  eq: EqData;
  channels: ChannelMode;
}

const num = (value: number | null | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Reads a project from Rust; defaults come from Rust too (`default_project`). */
export function fromFile(file: Project_Serialize): ProjectData {
  return {
    markers: file.markers.map((m) => ({ ...m, time: num(m.time, 0) })),
    sections: file.sections.map((s) => ({ ...s, start: num(s.start, 0) })),
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
    bpm: typeof file.bpm === "number" && file.bpm > 0 ? file.bpm : null,
    beatOffset: typeof file.beatOffset === "number" ? file.beatOffset : null,
    beatsPerBar: file.beatsPerBar > 0 ? file.beatsPerBar : BEATS_PER_BAR.default,
    speed: num(file.speed, SPEED.default),
    semitones: file.semitones,
    cents: file.cents,
    eq: eqFromFile(file.eq),
    channels: file.channels,
  };
}

export function toFile(data: ProjectData): Project_Deserialize {
  return { version: 1, ...data, eq: eqToRust(data.eq) };
}
