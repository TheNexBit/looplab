import { create } from "zustand";
import { t } from "@/i18n";
import type { MarkerKind, ProjectLocation } from "@/lib/bindings";

/** Number of colours in the section palette (`--color-section-*` in theme.css). */
export const SECTION_COLORS = 8;
export const sectionColor = (index: number) => `var(--color-section-${index % SECTION_COLORS})`;

export interface MarkerData {
  id: string;
  time: number;
  kind: MarkerKind;
  label: string;
}

export interface SectionData {
  id: string;
  start: number;
  name: string;
  color: number;
  /** The player's own words about it, shown while it plays */
  memo: string;
}

export interface SectionRange extends SectionData {
  end: number;
}

/** Sections in time order, each ending where the next begins (the last at the track end). */
export function sectionRanges(sections: SectionData[], duration: number): SectionRange[] {
  const sorted = [...sections].sort((a, b) => a.start - b.start);
  return sorted.map((section, i) => ({ ...section, end: sorted[i + 1]?.start ?? duration }));
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
  const points = [...markers.map((m) => m.time), ...sections.map((s) => s.start)];
  const candidates =
    direction > 0
      ? points.filter((p) => p > position + SAME_POINT)
      : points.filter((p) => p < position - SAME_POINT);
  if (candidates.length === 0) return null;
  return direction > 0 ? Math.min(...candidates) : Math.max(...candidates);
}

const newId = () => crypto.randomUUID();

interface MarkersState {
  markers: MarkerData[];
  sections: SectionData[];
  /** Where the project was last saved; null before the first save */
  savedTo: ProjectLocation | null;
  addMarker: (kind: MarkerKind, time: number) => void;
  moveMarker: (id: string, time: number) => void;
  removeMarker: (id: string) => void;
  addSection: (time: number) => void;
  moveSection: (id: string, start: number) => void;
  renameSection: (id: string, name: string) => void;
  recolorSection: (id: string, color: number) => void;
  setSectionMemo: (id: string, memo: string) => void;
  removeSection: (id: string) => void;
  replace: (markers: MarkerData[], sections: SectionData[]) => void;
  setSavedTo: (location: ProjectLocation | null) => void;
}

/** Markers and sections of the open track. Saved by `features/markers/projectSync.ts`. */
export const useMarkersStore = create<MarkersState>((set, get) => ({
  markers: [],
  sections: [],
  savedTo: null,

  addMarker: (kind, time) =>
    set({ markers: [...get().markers, { id: newId(), time, kind, label: "" }] }),
  moveMarker: (id, time) =>
    set({ markers: get().markers.map((m) => (m.id === id ? { ...m, time } : m)) }),
  removeMarker: (id) => set({ markers: get().markers.filter((m) => m.id !== id) }),

  addSection: (time) => {
    const { sections } = get();
    // Two sections at the same instant would make one of them empty
    if (sections.some((s) => Math.abs(s.start - time) < SAME_POINT)) return;
    const number = sections.length + 1;
    set({
      sections: [
        ...sections,
        {
          id: newId(),
          start: time,
          name: `${t.markers.sectionName} ${number}`,
          color: sections.length % SECTION_COLORS,
          memo: "",
        },
      ],
    });
  },
  moveSection: (id, start) =>
    set({ sections: get().sections.map((s) => (s.id === id ? { ...s, start } : s)) }),
  renameSection: (id, name) =>
    set({ sections: get().sections.map((s) => (s.id === id ? { ...s, name } : s)) }),
  recolorSection: (id, color) =>
    set({ sections: get().sections.map((s) => (s.id === id ? { ...s, color } : s)) }),
  setSectionMemo: (id, memo) =>
    set({ sections: get().sections.map((s) => (s.id === id ? { ...s, memo } : s)) }),
  removeSection: (id) => set({ sections: get().sections.filter((s) => s.id !== id) }),

  replace: (markers, sections) => set({ markers, sections }),
  setSavedTo: (savedTo) => set({ savedTo }),
}));
