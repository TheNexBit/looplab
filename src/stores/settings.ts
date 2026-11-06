import { create } from "zustand";
import { t } from "@/i18n";
import type { ClickSound } from "@/lib/bindings";
import { readStored, writeStored } from "@/lib/storage";
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
  /** Magnet: dragged loop edges, markers and sections stick to nearby points */
  snap: boolean;
  /** Stopping returns to where playback started (the last clicked point), like Reaper */
  returnToStart: boolean;
  /** Count-in before playback and before every loop repetition, switched like a DAW's key */
  countIn: boolean;
  /** Its length in bars, kept while it is off */
  countInBars: number;
  /** Click on every beat while playing */
  metronome: boolean;
  /** Volume of the clicks, 0..1 */
  clickVolume: number;
  /** Sound and level (0..1) of the first beat of a bar, and of the other beats, like Reaper */
  accentSound: ClickSound;
  accentLevel: number;
  beatSound: ClickSound;
  beatLevel: number;
  /** Speed trainer: the loop starts at `trainerFrom` and speeds up by `trainerStep`… */
  trainer: boolean;
  trainerFrom: number;
  trainerTo: number;
  trainerStep: number;
  /** …every `trainerEvery` repetitions */
  trainerEvery: number;
  /** Media keys reach Looplab even while another program has the focus */
  globalMediaKeys: boolean;
  /** Beat and bar lines on the waveform (when the tempo is known); the magnet uses them */
  showGrid: boolean;
}

type NumericSetting = {
  [K in keyof Settings]: Settings[K] extends number ? K : never;
}[keyof Settings];

export const SETTING_LIMITS = {
  seekStep: { min: 1, max: 30, step: 1 },
  fineSeekStep: { min: 0.1, max: 5, step: 0.1 },
  speedStep: { min: 0.01, max: 0.25, step: 0.01 },
  countInBars: { min: 1, max: 4, step: 1 },
  clickVolume: { min: 0, max: 1, step: 0.05 },
  accentLevel: { min: 0, max: 1, step: 0.05 },
  beatLevel: { min: 0, max: 1, step: 0.05 },
  trainerFrom: { min: 0.25, max: 2, step: 0.01 },
  trainerTo: { min: 0.25, max: 2, step: 0.01 },
  trainerStep: { min: 0.01, max: 0.25, step: 0.01 },
  trainerEvery: { min: 1, max: 20, step: 1 },
} as const satisfies Record<NumericSetting, { min: number; max: number; step: number }>;

const DEFAULTS: Settings = {
  seekStep: 5,
  fineSeekStep: 1,
  speedStep: 0.05,
  followPlayhead: true,
  snap: true,
  returnToStart: true,
  countIn: false,
  countInBars: 1,
  metronome: false,
  clickVolume: 0.6,
  // The classic click: a high beep on the first beat, a lower one on the others
  accentSound: "beepHigh",
  accentLevel: 1,
  beatSound: "beepLow",
  beatLevel: 1,
  trainer: false,
  trainerFrom: 0.6,
  trainerTo: 1,
  trainerStep: 0.05,
  trainerEvery: 2,
  globalMediaKeys: false,
  showGrid: true,
};
const KEY = "looplab.settings";

/**
 * Every metronome sound, in menu order. The names in `i18n` must cover the engine's
 * `ClickSound` exactly (checked by TypeScript), so this list can never miss one.
 */
export const CLICK_SOUNDS = Object.keys(t.practice.sounds) as ClickSound[];
const isClickSound = (value: unknown): value is ClickSound =>
  CLICK_SOUNDS.includes(value as ClickSound);

/** Keeps numbers inside their limits and drops values of the wrong type (e.g. an old file). */
export function sanitize(values: Partial<Settings>): Settings {
  const result = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const value = values[key];
    if (typeof value !== typeof DEFAULTS[key]) continue;
    if (typeof value === "number") {
      const limits = SETTING_LIMITS[key as NumericSetting];
      (result as Record<string, unknown>)[key] = limits
        ? clamp(value, limits.min, limits.max)
        : value;
    } else {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  // Before the on/off key, 0 bars meant off: keep an existing count-in on
  if (typeof values.countIn !== "boolean" && typeof values.countInBars === "number") {
    result.countIn = values.countInBars > 0;
  }
  // A sound removed in a later version falls back to the classic click
  if (!isClickSound(result.accentSound)) result.accentSound = DEFAULTS.accentSound;
  if (!isClickSound(result.beatSound)) result.beatSound = DEFAULTS.beatSound;
  return result;
}

/** Preferences of this PC: kept in the WebView's local storage, so they survive updates. */
function load(): Settings {
  const stored = readStored(KEY);
  return stored && typeof stored === "object" ? sanitize(stored as Partial<Settings>) : DEFAULTS;
}

const persist = (settings: Settings) => writeStored(KEY, settings);

interface SettingsState extends Settings {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...load(),
  update: (patch) => {
    const next = sanitize({ ...get(), ...patch });
    set(next);
    persist(next);
  },
  reset: () => {
    set(DEFAULTS);
    persist(DEFAULTS);
  },
}));
