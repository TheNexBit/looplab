import { create } from "zustand";
import type { AppError } from "@/lib/bindings";

/** One separated track in the mixer, as saved in the project. */
export interface StemChannelData {
  /** "vocals", "drums", "bass", "guitar", "piano", "other" */
  name: string;
  /** 0..1 */
  level: number;
  mute: boolean;
  solo: boolean;
}

/** Where the separation of the open song stands. */
export type StemsPhase =
  | { kind: "idle" }
  | { kind: "running"; progress: number }
  | { kind: "error"; error: AppError };

/** The order of the mixer, as in a band's desk: voice first, the rest last. */
export const STEM_ORDER = ["vocals", "guitar", "bass", "drums", "piano", "other"] as const;

export const STEM_LEVEL = { min: 0, max: 1, step: 0.05, default: 1 } as const;

interface StemsState {
  /** Separated tracks of the open song, in the engine's order; null while it has none */
  names: string[] | null;
  /** The mixer, saved in the project (kept even before the song is separated) */
  channels: StemChannelData[];
  phase: StemsPhase;
  setNames: (names: string[] | null) => void;
  setPhase: (phase: StemsPhase) => void;
  setLevel: (name: string, level: number) => void;
  toggleMute: (name: string) => void;
  toggleSolo: (name: string) => void;
  /** Every track back to full level, nothing muted or soloed: the original song */
  reset: () => void;
  /** The mixer of a project just opened */
  replace: (channels: readonly StemChannelData[]) => void;
}

const fresh = (name: string): StemChannelData => ({
  name,
  level: STEM_LEVEL.default,
  mute: false,
  solo: false,
});

const clampLevel = (level: number) =>
  Number.isFinite(level) ? Math.min(STEM_LEVEL.max, Math.max(STEM_LEVEL.min, level)) : 1;

export const useStemsStore = create<StemsState>((set, get) => {
  /** Changes one channel, creating it if the mixer did not have it yet */
  const edit = (name: string, patch: (channel: StemChannelData) => StemChannelData) => {
    const { channels } = get();
    const found = channels.some((c) => c.name === name);
    const next = found
      ? channels.map((c) => (c.name === name ? patch(c) : c))
      : [...channels, patch(fresh(name))];
    set({ channels: next });
  };
  return {
    names: null,
    channels: [],
    phase: { kind: "idle" },
    setNames: (names) => set({ names }),
    setPhase: (phase) => set({ phase }),
    setLevel: (name, level) => edit(name, (c) => ({ ...c, level: clampLevel(level) })),
    toggleMute: (name) => edit(name, (c) => ({ ...c, mute: !c.mute })),
    toggleSolo: (name) => edit(name, (c) => ({ ...c, solo: !c.solo })),
    reset: () => set({ channels: [] }),
    replace: (channels) =>
      set({
        channels: channels
          .filter((c) => typeof c.name === "string")
          .map((c) => ({ ...c, level: clampLevel(c.level) })),
      }),
  };
});

/** A channel of the mixer, or a fresh one at full level. */
export function channelOf(channels: readonly StemChannelData[], name: string): StemChannelData {
  return channels.find((c) => c.name === name) ?? fresh(name);
}

/**
 * The level the engine gets for each of `names`: with any track soloed only the soloed
 * ones are heard, as in a DAW; a muted track is silent; otherwise its fader.
 */
export function stemGains(names: readonly string[], channels: readonly StemChannelData[]) {
  const all = names.map((name) => channelOf(channels, name));
  const soloing = all.some((c) => c.solo);
  return all.map((c) => (c.mute || (soloing && !c.solo) ? 0 : c.level));
}
