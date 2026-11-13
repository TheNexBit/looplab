import { create } from "zustand";
import { MIN_LOOP } from "@/features/player/limits";
import { t } from "@/i18n";
import type { MarkerKind } from "@/lib/bindings";
import { clamp } from "@/lib/time";

/** Number of colours in the section palette (`--color-section-*` in theme.css). */
export const SECTION_COLORS = 8;
export const sectionColor = (index: number) => `var(--color-section-${index % SECTION_COLORS})`;

export interface MarkerData {
  id: string;
  time: number;
  kind: MarkerKind;
  label: string;
}

/** A part of the track with a name, from `start` to `end` (like a Reaper region). */
export interface SectionData {
  id: string;
  start: number;
  end: number;
  name: string;
  color: number;
  /** The player's own words about it, shown while it plays */
  memo: string;
}

export type SectionRange = SectionData;

const newId = () => crypto.randomUUID();

/** Shortest section, in seconds: as short as a loop can be. */
export const MIN_SECTION = MIN_LOOP;

/** Sections in time order. */
export const sortedSections = (sections: readonly SectionData[]): SectionData[] =>
  [...sections].sort((a, b) => a.start - b.start);

/**
 * Sections of a project file. Files of versions where a section ran up to the next one have
 * no ends: each gets the next section's start, the last the end of the track.
 */
export function withEnds(
  sections: readonly (Omit<SectionData, "end"> & { end: number | null })[],
  duration: number,
): SectionData[] {
  const sorted = [...sections].sort((a, b) => a.start - b.start);
  return sorted
    .map((section, i) => ({ ...section, end: section.end ?? sorted[i + 1]?.start ?? duration }))
    .filter((section) => section.end - section.start >= MIN_SECTION);
}

/**
 * `added` placed among `sections`, which never overlap: the ones it covers lose that part
 * (one it falls inside is split in two), the ones it covers whole are gone.
 */
export function insertSection(sections: readonly SectionData[], added: SectionData): SectionData[] {
  const kept: SectionData[] = [];
  for (const section of sections) {
    if (section.end <= added.start || section.start >= added.end) {
      kept.push(section);
      continue;
    }
    if (section.start < added.start) kept.push({ ...section, end: added.start });
    if (section.end > added.end) {
      const after = { ...section, start: added.end };
      kept.push(section.start < added.start ? { ...after, id: newId() } : after);
    }
  }
  return [...kept.filter((section) => section.end - section.start >= MIN_SECTION), added];
}

/** Free room for section `id`: from the end of the section before it to the start of the next. */
export function roomAround(
  sections: readonly SectionData[],
  id: string,
  duration: number,
): { min: number; max: number } {
  const sorted = sortedSections(sections);
  const index = sorted.findIndex((section) => section.id === id);
  return {
    min: sorted[index - 1]?.end ?? 0,
    max: sorted[index + 1]?.start ?? duration,
  };
}

/** Bar number of every beat marker, counting in time order from 1. */
export function beatNumbers(markers: MarkerData[]): Map<string, number> {
  const beats = markers.filter((m) => m.kind === "beat").sort((a, b) => a.time - b.time);
  return new Map(beats.map((m, i) => [m.id, i + 1]));
}

/** Tolerance so that "next" from exactly on a marker moves past it. */
const SAME_POINT = 0.05;

/** The closest marker or section start before/after `position`, if any. */
export function neighbourPoint(
  position: number,
  direction: -1 | 1,
  markers: MarkerData[],
  sections: SectionData[],
): number | null {
  const points = [...markers.map((m) => m.time), ...sections.flatMap((s) => [s.start, s.end])];
  const candidates =
    direction > 0
      ? points.filter((p) => p > position + SAME_POINT)
      : points.filter((p) => p < position - SAME_POINT);
  if (candidates.length === 0) return null;
  return direction > 0 ? Math.min(...candidates) : Math.max(...candidates);
}

interface MarkersState {
  markers: MarkerData[];
  sections: SectionData[];
  addMarker: (kind: MarkerKind, time: number) => void;
  moveMarker: (id: string, time: number) => void;
  removeMarker: (id: string) => void;
  /** Start of the section opened by S, until S again closes it (or Esc drops it) */
  pendingSection: number | null;
  /** S: opens a section at `time`, or closes the open one there */
  markSection: (time: number, duration: number) => void;
  cancelSection: () => void;
  /** A new section from `a` to `b` (in any order); covered parts of others make room */
  addSection: (a: number, b: number, duration: number) => void;
  /** New start and end of a section, kept inside its free room and long enough */
  setSectionBounds: (id: string, start: number, end: number, duration: number) => void;
  renameSection: (id: string, name: string) => void;
  recolorSection: (id: string, color: number) => void;
  setSectionMemo: (id: string, memo: string) => void;
  removeSection: (id: string) => void;
  replace: (markers: MarkerData[], sections: SectionData[]) => void;
}

/** Markers and sections of the open track. Saved by `features/markers/projectSync.ts`. */
export const useMarkersStore = create<MarkersState>((set, get) => ({
  markers: [],
  sections: [],

  addMarker: (kind, time) =>
    set({ markers: [...get().markers, { id: newId(), time, kind, label: "" }] }),
  moveMarker: (id, time) =>
    set({ markers: get().markers.map((m) => (m.id === id ? { ...m, time } : m)) }),
  removeMarker: (id) => set({ markers: get().markers.filter((m) => m.id !== id) }),

  pendingSection: null,
  markSection: (time, duration) => {
    const open = get().pendingSection;
    if (open === null) {
      set({ pendingSection: clamp(time, 0, duration) });
      return;
    }
    set({ pendingSection: null });
    get().addSection(open, time, duration);
  },
  cancelSection: () => set({ pendingSection: null }),

  addSection: (a, b, duration) => {
    const start = clamp(Math.min(a, b), 0, duration);
    const end = clamp(Math.max(a, b), 0, duration);
    if (end - start < MIN_SECTION) return;
    const { sections } = get();
    const added: SectionData = {
      id: newId(),
      start,
      end,
      name: `${t.markers.sectionName} ${sections.length + 1}`,
      color: sections.length % SECTION_COLORS,
      memo: "",
    };
    set({ sections: insertSection(sections, added) });
  },
  setSectionBounds: (id, start, end, duration) => {
    const { min, max } = roomAround(get().sections, id, duration);
    const from = clamp(Math.min(start, end), min, max - MIN_SECTION);
    const to = clamp(Math.max(start, end), from + MIN_SECTION, max);
    set({
      sections: get().sections.map((s) => (s.id === id ? { ...s, start: from, end: to } : s)),
    });
  },
  renameSection: (id, name) =>
    set({ sections: get().sections.map((s) => (s.id === id ? { ...s, name } : s)) }),
  recolorSection: (id, color) =>
    set({ sections: get().sections.map((s) => (s.id === id ? { ...s, color } : s)) }),
  setSectionMemo: (id, memo) =>
    set({ sections: get().sections.map((s) => (s.id === id ? { ...s, memo } : s)) }),
  removeSection: (id) => set({ sections: get().sections.filter((s) => s.id !== id) }),

  replace: (markers, sections) => set({ markers, sections, pendingSection: null }),
}));
