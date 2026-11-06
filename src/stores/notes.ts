import { create } from "zustand";

/** Where the note view listens: around the playhead, or the average over the whole loop. */
export type NotesMode = "playhead" | "loop";

const PREFS_KEY = "looplab.notes";

interface Prefs {
  open: boolean;
  mode: NotesMode;
}

function loadPrefs(): Prefs {
  const fallback: Prefs = { open: false, mode: "playhead" };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return fallback;
  }
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
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ open, mode }));
    } catch {
      // Storage unavailable: the view starts closed next time
    }
  };
  return {
    ...loadPrefs(),
    toggle: () => save({ open: !get().open }),
    setMode: (mode) => save({ mode }),
  };
});
