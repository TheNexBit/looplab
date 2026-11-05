import { create } from "zustand";
import { clamp } from "@/lib/time";

export interface Settings {
  /** Seconds moved by ← / → */
  seekStep: number;
  /** Seconds moved by Shift + ← / → */
  fineSeekStep: number;
  /** Speed change per + / −, as a fraction (0.05 = 5%) */
  speedStep: number;
  /** Scroll the detailed view with the playhead while playing */
  followPlayhead: boolean;
}

export const SETTING_LIMITS = {
  seekStep: { min: 1, max: 30, step: 1 },
  fineSeekStep: { min: 0.1, max: 5, step: 0.1 },
  speedStep: { min: 0.01, max: 0.25, step: 0.01 },
} as const;

const DEFAULTS: Settings = { seekStep: 5, fineSeekStep: 1, speedStep: 0.05, followPlayhead: true };
const KEY = "looplab.settings";

/** Preferences of this PC: kept in the WebView's local storage, so they survive updates. */
function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

interface SettingsState extends Settings {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const persist = () => {
    const { seekStep, fineSeekStep, speedStep, followPlayhead } = get();
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ seekStep, fineSeekStep, speedStep, followPlayhead }),
      );
    } catch {
      // Storage unavailable: the settings last until the app closes
    }
  };
  return {
    ...load(),
    update: (patch) => {
      const next = { ...get(), ...patch };
      set({
        seekStep: clamp(next.seekStep, SETTING_LIMITS.seekStep.min, SETTING_LIMITS.seekStep.max),
        fineSeekStep: clamp(
          next.fineSeekStep,
          SETTING_LIMITS.fineSeekStep.min,
          SETTING_LIMITS.fineSeekStep.max,
        ),
        speedStep: clamp(
          next.speedStep,
          SETTING_LIMITS.speedStep.min,
          SETTING_LIMITS.speedStep.max,
        ),
        followPlayhead: next.followPlayhead,
      });
      persist();
    },
    reset: () => {
      set(DEFAULTS);
      persist();
    },
  };
});
