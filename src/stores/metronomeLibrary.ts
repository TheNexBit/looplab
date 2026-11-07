import { create } from "zustand";
import { readStored, writeStored } from "@/lib/storage";
import {
  type MetronomeSetup,
  type PlayedPart,
  type PlayedSequence,
  sanitizeSetup,
  useMetronomeStore,
} from "./metronome";
import { type ExerciseSetup, sanitizeExercises, useExercisesStore } from "./metronomeExercises";

/**
 * Songs and sequences of the metronome, kept on this PC, as MetroFlow's songs, setlists and
 * routines. A song is a whole setup with a name (bar, tempo, exercises). A sequence is a list
 * of parts played in order, each a setup for some bars: a setlist of songs, a practice
 * routine (warm-up at 80 for 32 bars, then the riff at 120…) or the bars of a prog song
 * (4 × 7/8, 2 × 5/4…), all the same thing.
 */

export interface Song {
  id: string;
  name: string;
  setup: MetronomeSetup;
  exercises: ExerciseSetup;
}

export interface Part extends PlayedPart {
  id: string;
}

export interface SavedSequence {
  id: string;
  name: string;
  parts: Part[];
  repeat: boolean;
}

export const PART_BARS = { min: 1, max: 512, default: 4 } as const;
const KEY = "looplab.metronomeLibrary";

const newId = () => crypto.randomUUID();

/** The current setup of the metronome and its exercises, as a copy. */
function currentSetup(): { setup: MetronomeSetup; exercises: ExerciseSetup } {
  return {
    setup: sanitizeSetup(useMetronomeStore.getState()),
    exercises: sanitizeExercises(useExercisesStore.getState()),
  };
}

const text = (value: unknown, fallback: string) =>
  typeof value === "string" ? value.slice(0, 200) : fallback;

function sanitizeSong(value: Partial<Song>): Song {
  return {
    id: text(value.id, newId()),
    name: text(value.name, ""),
    setup: sanitizeSetup(value.setup ?? {}),
    exercises: sanitizeExercises(value.exercises ?? {}),
  };
}

function sanitizePart(value: Partial<Part>): Part {
  const bars = typeof value.bars === "number" && Number.isFinite(value.bars) ? value.bars : 0;
  return {
    ...sanitizeSong(value),
    bars: Math.round(Math.min(PART_BARS.max, Math.max(PART_BARS.min, bars || PART_BARS.default))),
    note: text(value.note, ""),
  };
}

function sanitizeSequence(value: Partial<SavedSequence>): SavedSequence {
  return {
    id: text(value.id, newId()),
    name: text(value.name, ""),
    parts: Array.isArray(value.parts) ? value.parts.map(sanitizePart) : [],
    repeat: value.repeat === true,
  };
}

interface Library {
  songs: Song[];
  sequences: SavedSequence[];
}

/** Stored songs and sequences, with anything unusable repaired or dropped. */
export function sanitizeLibrary(value: unknown): Library {
  const stored = (value && typeof value === "object" ? value : {}) as Partial<Library>;
  return {
    songs: Array.isArray(stored.songs) ? stored.songs.map(sanitizeSong) : [],
    sequences: Array.isArray(stored.sequences) ? stored.sequences.map(sanitizeSequence) : [],
  };
}

/** Seconds a part lasts at its tempo (count-in apart; the speed trainer is ignored). */
export function partSeconds(part: Pick<PlayedPart, "setup" | "bars">): number {
  const { bpm, beats, unit } = part.setup;
  return (((60 / bpm) * 4) / unit) * beats * part.bars;
}

/** A sequence ready for the engine. */
export const toPlayed = (sequence: SavedSequence): PlayedSequence => ({
  id: sequence.id,
  name: sequence.name,
  repeat: sequence.repeat,
  parts: sequence.parts,
});

interface LibraryState extends Library {
  saveSong: (name: string) => void;
  /** Puts a song's bar, tempo and exercises on the metronome */
  loadSong: (id: string) => void;
  renameSong: (id: string, name: string) => void;
  removeSong: (id: string) => void;
  addSequence: (name: string) => string;
  renameSequence: (id: string, name: string) => void;
  removeSequence: (id: string) => void;
  setRepeat: (id: string, repeat: boolean) => void;
  /** Adds a part: the current setup, or a saved song */
  addPart: (sequenceId: string, songId?: string) => void;
  updatePart: (
    sequenceId: string,
    partId: string,
    patch: Partial<Pick<Part, "bars" | "note" | "name">>,
  ) => void;
  movePart: (sequenceId: string, partId: string, by: -1 | 1) => void;
  removePart: (sequenceId: string, partId: string) => void;
}

export const useLibraryStore = create<LibraryState>((set, get) => {
  const save = (library: Partial<Library>) => {
    set(library);
    const { songs, sequences } = get();
    writeStored(KEY, { songs, sequences });
  };
  const editSequence = (id: string, change: (sequence: SavedSequence) => SavedSequence) =>
    save({ sequences: get().sequences.map((s) => (s.id === id ? change(s) : s)) });

  return {
    ...sanitizeLibrary(readStored(KEY)),
    saveSong: (name) => save({ songs: [...get().songs, { id: newId(), name, ...currentSetup() }] }),
    loadSong: (id) => {
      const song = get().songs.find((s) => s.id === id);
      if (!song) return;
      useMetronomeStore.getState().update(song.setup);
      useExercisesStore.getState().update(song.exercises);
    },
    renameSong: (id, name) =>
      save({ songs: get().songs.map((s) => (s.id === id ? { ...s, name } : s)) }),
    removeSong: (id) => save({ songs: get().songs.filter((s) => s.id !== id) }),
    addSequence: (name) => {
      const id = newId();
      save({ sequences: [...get().sequences, { id, name, parts: [], repeat: false }] });
      return id;
    },
    renameSequence: (id, name) => editSequence(id, (s) => ({ ...s, name })),
    removeSequence: (id) => save({ sequences: get().sequences.filter((s) => s.id !== id) }),
    setRepeat: (id, repeat) => editSequence(id, (s) => ({ ...s, repeat })),
    addPart: (sequenceId, songId) => {
      const song = songId ? get().songs.find((s) => s.id === songId) : undefined;
      const source = song ?? { name: "", ...currentSetup() };
      const part: Part = {
        id: newId(),
        name: source.name,
        setup: source.setup,
        exercises: source.exercises,
        bars: PART_BARS.default,
        note: "",
      };
      editSequence(sequenceId, (s) => ({ ...s, parts: [...s.parts, part] }));
    },
    updatePart: (sequenceId, partId, patch) =>
      editSequence(sequenceId, (s) => ({
        ...s,
        parts: s.parts.map((p) => (p.id === partId ? sanitizePart({ ...p, ...patch }) : p)),
      })),
    movePart: (sequenceId, partId, by) =>
      editSequence(sequenceId, (s) => {
        const parts = [...s.parts];
        const from = parts.findIndex((p) => p.id === partId);
        const to = from + by;
        const moved = parts[from];
        if (from < 0 || to < 0 || to >= parts.length || !moved) return s;
        parts.splice(from, 1);
        parts.splice(to, 0, moved);
        return { ...s, parts };
      }),
    removePart: (sequenceId, partId) =>
      editSequence(sequenceId, (s) => ({ ...s, parts: s.parts.filter((p) => p.id !== partId) })),
  };
});
