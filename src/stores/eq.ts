import { create } from "zustand";
import type {
  BandKind,
  ChannelMode,
  EqSettings_Deserialize,
  EqSettings_Serialize,
} from "@/lib/bindings";

export interface BandData {
  enabled: boolean;
  kind: BandKind;
  frequency: number;
  gain: number;
  q: number;
}

export interface EqData {
  bypass: boolean;
  bands: BandData[];
}

/** Limits of the band controls. */
export const FREQUENCY = { min: 20, max: 20_000 } as const;
export const GAIN = { min: -18, max: 18, step: 0.5 } as const;
export const Q = { min: 0.1, max: 10, step: 0.1 } as const;

/** Shelves and peaks have a gain; pass filters only cut. */
export const hasGain = (kind: BandKind) => kind !== "highPass" && kind !== "lowPass";

const num = (value: number | null | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Settings as they come from Rust (numbers may be null in JSON). */
export function eqFromFile(file: EqSettings_Serialize): EqData {
  return {
    bypass: file.bypass,
    bands: file.bands.map((band) => ({
      enabled: band.enabled,
      kind: band.kind,
      frequency: num(band.frequency, 1_000),
      gain: num(band.gain, 0),
      q: num(band.q, 1),
    })),
  };
}

/** Settings in the shape Rust expects: always exactly `BANDS` (5) bands, which every EqData has. */
export function eqToRust(data: EqData): EqSettings_Deserialize {
  return {
    bypass: data.bypass,
    bands: data.bands as unknown as EqSettings_Deserialize["bands"],
  };
}

interface EqState {
  settings: EqData;
  channels: ChannelMode;
  /** Flat settings from Rust, used by the "Flat" preset */
  flat: EqData | null;
  setBand: (index: number, patch: Partial<BandData>) => void;
  setBypass: (bypass: boolean) => void;
  setSettings: (settings: EqData) => void;
  setChannels: (mode: ChannelMode) => void;
  setFlat: (flat: EqData) => void;
}

/** Equaliser and channel mode of the open track. Sent to the engine by `syncEngine.ts`. */
export const useEqStore = create<EqState>((set, get) => ({
  settings: { bypass: false, bands: [] },
  channels: "stereo",
  flat: null,
  setBand: (index, patch) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        bands: settings.bands.map((band, i) => (i === index ? { ...band, ...patch } : band)),
      },
    });
  },
  setBypass: (bypass) => set({ settings: { ...get().settings, bypass } }),
  setSettings: (settings) => set({ settings }),
  setChannels: (channels) => set({ channels }),
  setFlat: (flat) => set({ flat }),
}));
