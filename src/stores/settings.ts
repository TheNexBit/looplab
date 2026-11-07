import { create } from "zustand";
import {
  INSTRUMENTS,
  type Instrument,
  REFERENCE_PITCH,
  REFERENCE_TUNING_IDS,
  type ReferenceTuning,
} from "@/features/practice/reference";
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
  /** …of the clicks between beats (subdivisions, pulses inside a group) and of the cross rhythm */
  subSound: ClickSound;
  subLevel: number;
  crossSound: ClickSound;
  crossLevel: number;
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
  /** Look of the waveform: min/max bars, only their outline, or the upper half (like Reaper's rectified view) */
  waveStyle: WaveStyle;
  /** Vertical zoom of the waveforms: quiet passages grow, peaks are cut at the edge */
  waveZoom: number;
  /** Thickness of the playhead line, in pixels */
  playheadWidth: number;
  /** Faint lines down the detailed view at every ruler label */
  rulerLines: boolean;
  /** The line through the middle of the detailed view */
  centerLine: boolean;
  /** While playing, a light shade from the start point to the playhead: where stopping returns */
  cueShade: boolean;
  /** A line at the foot of the window says what is under the pointer, like Ableton's Info View */
  infoBar: boolean;
  /** At start-up: the empty screen, or the last track opened (if it still exists) */
  startup: Startup;
  /** Plain wheel over the waveform: zoom (Shift scrolls), like Reaper, or the other way round */
  wheel: WheelAction;
  /** How fast the wheel zooms or scrolls, 1 = normal */
  wheelSpeed: number;
  /** Double-click on the waveform: nothing more than a click, or play from there */
  doubleClick: DoubleClick;
  /** Following the playhead: keep it in the middle, or turn the page at the edge like Reaper */
  followMode: FollowMode;
  /** What the detailed view shows when a track opens */
  openView: OpenView;
  /** Reopening a track puts the playhead back where it was, like Reaper's saved edit cursor */
  resumePosition: boolean;
  /** After dragging a new loop: the playhead stays, goes to the loop start, or plays from there */
  afterLoop: AfterLoop;
  /** Reference note: the A the strings are tuned from (Hz), its level 0..1, instrument and tuning */
  referencePitch: number;
  referenceLevel: number;
  referenceInstrument: Instrument;
  referenceTuning: ReferenceTuning;
}

/** The values of the settings that are a choice among a few, in menu order. */
export const SETTING_CHOICES = {
  waveStyle: ["filled", "outline", "half"],
  startup: ["empty", "last"],
  wheel: ["zoom", "scroll"],
  doubleClick: ["none", "play"],
  followMode: ["center", "page"],
  openView: ["start", "whole"],
  afterLoop: ["stay", "start", "play"],
} as const;
export type WaveStyle = (typeof SETTING_CHOICES.waveStyle)[number];
export type Startup = (typeof SETTING_CHOICES.startup)[number];
export type WheelAction = (typeof SETTING_CHOICES.wheel)[number];
export type DoubleClick = (typeof SETTING_CHOICES.doubleClick)[number];
export type FollowMode = (typeof SETTING_CHOICES.followMode)[number];
export type OpenView = (typeof SETTING_CHOICES.openView)[number];
export type AfterLoop = (typeof SETTING_CHOICES.afterLoop)[number];
type ChoiceSetting = keyof typeof SETTING_CHOICES;

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
  subLevel: { min: 0, max: 1, step: 0.05 },
  crossLevel: { min: 0, max: 1, step: 0.05 },
  trainerFrom: { min: 0.25, max: 2, step: 0.01 },
  trainerTo: { min: 0.25, max: 2, step: 0.01 },
  trainerStep: { min: 0.01, max: 0.25, step: 0.01 },
  trainerEvery: { min: 1, max: 20, step: 1 },
  waveZoom: { min: 1, max: 4, step: 0.5 },
  playheadWidth: { min: 1, max: 3, step: 1 },
  wheelSpeed: { min: 0.5, max: 2, step: 0.25 },
  referencePitch: REFERENCE_PITCH,
  referenceLevel: { min: 0.05, max: 1, step: 0.05 },
} as const satisfies Record<NumericSetting, { min: number; max: number; step: number }>;

const DEFAULTS: Settings = {
  seekStep: 5,
  fineSeekStep: 1,
  speedStep: 0.05,
  followPlayhead: true,
  snap: true,
  returnToStart: true,
  resumePosition: true,
  countIn: false,
  countInBars: 1,
  metronome: false,
  clickVolume: 0.6,
  // The classic click: a high beep on the first beat, a lower one on the others
  accentSound: "beepHigh",
  accentLevel: 1,
  beatSound: "beepLow",
  beatLevel: 1,
  // Softer than the beats, so the pulse stays clear; the cross rhythm lower, to follow it against them
  subSound: "woodLow",
  subLevel: 0.45,
  crossSound: "cowbell",
  crossLevel: 0.7,
  trainer: false,
  trainerFrom: 0.6,
  trainerTo: 1,
  trainerStep: 0.05,
  trainerEvery: 2,
  globalMediaKeys: false,
  showGrid: true,
  waveStyle: "filled",
  waveZoom: 1,
  playheadWidth: 1,
  rulerLines: true,
  centerLine: true,
  // Off: on very colourful tracks it tires the eyes
  cueShade: false,
  infoBar: false,
  startup: "empty",
  wheel: "zoom",
  wheelSpeed: 1,
  doubleClick: "none",
  followMode: "center",
  openView: "start",
  // A loop is made to be played: start from its beginning, and stopping returns there
  afterLoop: "start",
  referencePitch: REFERENCE_PITCH.default,
  referenceLevel: 0.5,
  referenceInstrument: "guitar",
  referenceTuning: "standard",
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
  if (!isClickSound(result.subSound)) result.subSound = DEFAULTS.subSound;
  if (!isClickSound(result.crossSound)) result.crossSound = DEFAULTS.crossSound;
  if (!INSTRUMENTS.includes(result.referenceInstrument)) {
    result.referenceInstrument = DEFAULTS.referenceInstrument;
  }
  if (!REFERENCE_TUNING_IDS.includes(result.referenceTuning)) {
    result.referenceTuning = DEFAULTS.referenceTuning;
  }
  for (const key of Object.keys(SETTING_CHOICES) as ChoiceSetting[]) {
    const allowed: readonly string[] = SETTING_CHOICES[key];
    if (!allowed.includes(result[key])) (result as Record<string, unknown>)[key] = DEFAULTS[key];
  }
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
  /** Only `keys` back to their default (the "Default values" key of one settings tab) */
  resetSome: (keys: readonly (keyof Settings)[]) => void;
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
  resetSome: (keys) => {
    const patch: Partial<Settings> = {};
    for (const key of keys) (patch as Record<string, unknown>)[key] = DEFAULTS[key];
    get().update(patch);
  },
}));
