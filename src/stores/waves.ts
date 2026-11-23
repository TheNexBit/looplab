import { create } from "zustand";

/** The panel right above the waveforms, which gives or takes room when the waveform's edge is dragged. */
export interface WavesNeighbour {
  /** Its size on screen, in CSS pixels */
  shown: () => number;
  resize: (size: number) => void;
}

interface WavesState {
  /**
   * Height the waveforms need, in CSS pixels: their title, overview, sections and the detailed
   * view at its least height. Score and video above never take it (they shrink first).
   */
  reserve: number;
  neighbour: WavesNeighbour | null;
  setReserve: (reserve: number) => void;
  /** Called by the layout docked right above the waveforms; returns how to take it back. */
  claimNeighbour: (neighbour: WavesNeighbour) => () => void;
}

/** Before the waveforms are measured once: title, normal overview, sections and a default detail. */
const FIRST_GUESS = 280;

/** The room of the waveforms under score and video (`WaveformPanel` measures it). */
export const useWavesStore = create<WavesState>((set, get) => ({
  reserve: FIRST_GUESS,
  neighbour: null,
  setReserve: (reserve) => {
    if (Math.abs(reserve - get().reserve) >= 1) set({ reserve: Math.round(reserve) });
  },
  claimNeighbour: (neighbour) => {
    set({ neighbour });
    return () => {
      if (get().neighbour === neighbour) set({ neighbour: null });
    };
  },
}));
