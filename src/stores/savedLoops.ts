import { create } from "zustand";
import { t } from "@/i18n";
import { restartAt, useLoopStore } from "./loop";
import { trackDuration, usePlayerStore } from "./player";

export interface SavedLoopData {
  id: string;
  name: string;
  /** Seconds */
  start: number;
  end: number;
  /** The player's own words about it, shown while it plays */
  memo: string;
}

const newId = () => crypto.randomUUID();

interface SavedLoopsState {
  loops: SavedLoopData[];
  /** Keeps the current loop under a new name; does nothing without a loop or if already saved. */
  saveCurrent: () => void;
  rename: (id: string, name: string) => void;
  setMemo: (id: string, memo: string) => void;
  remove: (id: string) => void;
  /** Makes a saved loop the current one and moves the playhead to where it starts. */
  recall: (id: string) => void;
  replace: (loops: SavedLoopData[]) => void;
}

/** Loops kept by name for the open track. Saved in the project file by `projectSync.ts`. */
export const useSavedLoopsStore = create<SavedLoopsState>((set, get) => ({
  loops: [],

  saveCurrent: () => {
    const region = useLoopStore.getState().region();
    if (!region) return;
    const { loops } = get();
    // The same loop saved twice would only be a duplicate
    if (loops.some((loop) => loop.start === region.start && loop.end === region.end)) return;
    const name = `${t.savedLoops.defaultName} ${loops.length + 1}`;
    set({ loops: [...loops, { id: newId(), name, ...region, memo: "" }] });
  },
  rename: (id, name) =>
    set({ loops: get().loops.map((loop) => (loop.id === id ? { ...loop, name } : loop)) }),
  setMemo: (id, memo) =>
    set({ loops: get().loops.map((loop) => (loop.id === id ? { ...loop, memo } : loop)) }),
  remove: (id) => set({ loops: get().loops.filter((loop) => loop.id !== id) }),
  recall: (id) => {
    const saved = get().loops.find((loop) => loop.id === id);
    if (!saved) return;
    const loop = useLoopStore.getState();
    loop.setRegion(saved.start, saved.end, trackDuration());
    usePlayerStore.getState().seek(restartAt(saved, loop.leadIn));
  },
  replace: (loops) => set({ loops }),
}));
