import { create } from "zustand";
import { readPrefs, writeStored } from "@/lib/storage";

/** Where the note view listens: around the playhead, or the average over the whole loop. */
export type NotesMode = "playhead" | "loop";

const PREFS_KEY = "looplab.notes";

interface Prefs {
  open: boolean;
  mode: NotesMode;
}

interface NotesState extends Prefs {
  toggle: () => void;
  setMode: (mode: NotesMode) => void;
}

/** The note view under the waveform. Its layout is a per-machine convenience. */
export const useNotesStore = create<NotesState>((set, get) => {
  const save = (patch: Partial<Prefs>) => {
    set(patch);
    const { open, mode } = get();
    writeStored(PREFS_KEY, { open, mode });
  };
  return {
    ...readPrefs<Prefs>(PREFS_KEY, { open: false, mode: "playhead" }),
    toggle: () => save({ open: !get().open }),
    setMode: (mode) => save({ mode }),
  };
});
