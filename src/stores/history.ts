import { create } from "zustand";
import type { TempoMap } from "@/features/practice/tempo";
import { useLoopStore } from "./loop";
import { type MarkerData, type SectionData, useMarkersStore } from "./markers";
import { usePracticeStore } from "./practice";
import { type SavedLoopData, useSavedLoopsStore } from "./savedLoops";
import { type SyncPoint, useScoreStore } from "./score";

/** Changes closer together than this are one step (a drag is one step, not hundreds). */
const SETTLE_MS = 400;
const LIMIT = 100;

/** What undo and redo restore: the editing work on the timeline. */
export interface EditState {
  markers: MarkerData[];
  sections: SectionData[];
  loop: { start: number | null; end: number | null; enabled: boolean };
  savedLoops: SavedLoopData[];
  tempoMap: TempoMap;
  /** Sync of the linked score (null without one) */
  scoreSync: SyncPoint[] | null;
}

function capture(): EditState {
  const { markers, sections } = useMarkersStore.getState();
  const { start, end, enabled } = useLoopStore.getState();
  return {
    markers,
    sections,
    loop: { start, end, enabled },
    savedLoops: useSavedLoopsStore.getState().loops,
    tempoMap: usePracticeStore.getState().tempoMap,
    scoreSync: useScoreStore.getState().link?.sync ?? null,
  };
}

const same = (a: EditState, b: EditState) =>
  a.markers === b.markers &&
  a.sections === b.sections &&
  a.savedLoops === b.savedLoops &&
  a.tempoMap === b.tempoMap &&
  a.scoreSync === b.scoreSync &&
  a.loop.start === b.loop.start &&
  a.loop.end === b.loop.end &&
  a.loop.enabled === b.loop.enabled;

interface HistoryState {
  past: EditState[];
  future: EditState[];
  undo: () => void;
  redo: () => void;
  /** Forgets every step: called once a track's project has been loaded. */
  reset: () => void;
}

/**
 * Undo / redo of markers, sections, the loop, saved loops, the tempo map and the score sync. It watches those stores:
 * the state before a burst of changes becomes one step once they settle.
 */
export const useHistoryStore = create<HistoryState>((set, get) => {
  /** The state after the last settled change */
  let settled = capture();
  /** A burst of changes is under way; `settled` is the state before it */
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let restoring = false;

  const settle = () => {
    clearTimeout(timer);
    pending = false;
    settled = capture();
  };

  const onChange = () => {
    if (restoring) return;
    const now = capture();
    if (same(now, settled)) return;
    if (!pending) {
      pending = true;
      set({ past: [...get().past, settled].slice(-LIMIT), future: [] });
    }
    clearTimeout(timer);
    timer = setTimeout(settle, SETTLE_MS);
  };

  const restore = (state: EditState) => {
    restoring = true;
    useMarkersStore.getState().replace(state.markers, state.sections);
    useLoopStore.setState(state.loop);
    useSavedLoopsStore.getState().replace(state.savedLoops);
    usePracticeStore.getState().setTempoMap(state.tempoMap);
    if (state.scoreSync) useScoreStore.getState().setSync(state.scoreSync);
    restoring = false;
    settled = state;
  };

  useMarkersStore.subscribe(onChange);
  useLoopStore.subscribe(onChange);
  useSavedLoopsStore.subscribe(onChange);
  // Only the map itself: the playhead moving the focus is no edit
  usePracticeStore.subscribe((state, previous) => {
    if (state.tempoMap !== previous.tempoMap) onChange();
  });

  // Only the sync: the view (zoom, staves…) and the score being loaded are no edits
  useScoreStore.subscribe((state, previous) => {
    if (state.link?.sync !== previous.link?.sync && state.link?.file === previous.link?.file)
      onChange();
  });

  return {
    past: [],
    future: [],
    undo: () => {
      if (pending) settle();
      const previous = get().past.at(-1);
      if (!previous) return;
      set({ past: get().past.slice(0, -1), future: [...get().future, settled] });
      restore(previous);
    },
    redo: () => {
      if (pending) settle();
      const next = get().future.at(-1);
      if (!next) return;
      set({ future: get().future.slice(0, -1), past: [...get().past, settled] });
      restore(next);
    },
    reset: () => {
      settle();
      set({ past: [], future: [] });
    },
  };
});
