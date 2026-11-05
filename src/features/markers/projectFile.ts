import { CENTS, GAP, LEAD_IN, SEMITONES, SPEED } from "@/features/player/limits";
import type { Project_Deserialize, Project_Serialize } from "@/lib/bindings";
import type { LoopOptions } from "@/stores/loop";
import type { MarkerData, SectionData } from "@/stores/markers";

/** Project contents with every number guaranteed (JSON turns NaN into null). */
export interface ProjectData {
  markers: MarkerData[];
  sections: SectionData[];
  loop: LoopOptions & { start: number | null; end: number | null };
  speed: number;
  semitones: number;
  cents: number;
}

const num = (value: number | null | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const emptyProject = (): ProjectData => ({
  markers: [],
  sections: [],
  loop: { enabled: false, start: null, end: null, leadIn: LEAD_IN.default, gap: GAP.default },
  speed: SPEED.default,
  semitones: SEMITONES.default,
  cents: CENTS.default,
});

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
    speed: num(file.speed, SPEED.default),
    semitones: file.semitones,
    cents: file.cents,
  };
}

export function toFile(data: ProjectData): Project_Deserialize {
  return { version: 1, ...data };
}
