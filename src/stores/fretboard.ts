import { create } from "zustand";
import { clampWindow, MAX_FRETS, MIN_FRETS } from "@/features/fretboard/fretGrid";
import {
  CUSTOM_ID,
  findTuning,
  isCustom,
  MAX_STRINGS,
  MIN_STRINGS,
  resizeTuning,
  STANDARD,
} from "@/features/fretboard/tuning";
import { type Accidental, DEFAULT_SHAPE, type MusicalShape, resolveShape } from "@/lib/music";
import { readStored, writeStored } from "@/lib/storage";

/** What the dots say: the degree in the shape (R, ♭3, 5) or the note name. */
export type FretDisplay = "degrees" | "notes";

/** Frets a neck can show, and widths of the position being studied (0 = whole neck). */
export const FRET_CHOICES = [12, 15, 22, 24] as const;
export const SPAN_CHOICES = [0, 4, 5, 6] as const;

interface FretboardConfig {
  /** The neck is drawn under the metronome */
  enabled: boolean;
  shape: MusicalShape;
  /** A preset's id, or `custom` once a string was retuned by hand */
  tuningId: string;
  /** The open strings as MIDI notes, lowest first: what everything reads */
  strings: number[];
  frets: number;
  display: FretDisplay;
  accidental: Accidental;
  /** First fret of the position being studied */
  windowFrom: number;
  /** Frets in the position; 0 shows the whole neck at full strength */
  windowSpan: number;
}

const DEFAULTS: FretboardConfig = {
  enabled: false,
  shape: DEFAULT_SHAPE,
  tuningId: "standard",
  strings: STANDARD,
  frets: MAX_FRETS,
  display: "degrees",
  accidental: "sharp",
  windowFrom: 5,
  windowSpan: 0,
};
const KEY = "looplab.fretboard";

const clampInt = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;

/** Keeps a stored setup usable: anything damaged falls back to the default. */
export function sanitizeFretboard(value: Partial<FretboardConfig>): FretboardConfig {
  const strings =
    Array.isArray(value.strings) &&
    value.strings.length >= MIN_STRINGS &&
    value.strings.every((midi) => typeof midi === "number" && midi >= 12 && midi <= 96)
      ? value.strings.slice(0, MAX_STRINGS)
      : DEFAULTS.strings;
  const shape =
    value.shape && resolveShape(value.shape) ? (value.shape as MusicalShape) : DEFAULTS.shape;
  const frets = clampInt(value.frets, MIN_FRETS, MAX_FRETS, DEFAULTS.frets);
  const windowSpan = clampInt(value.windowSpan, 0, MAX_FRETS, 0);
  return {
    enabled: value.enabled === true,
    shape,
    tuningId: typeof value.tuningId === "string" ? value.tuningId : DEFAULTS.tuningId,
    strings,
    frets,
    display: value.display === "notes" ? "notes" : "degrees",
    accidental: value.accidental === "flat" ? "flat" : "sharp",
    windowSpan,
    windowFrom: clampWindow(clampInt(value.windowFrom, 1, MAX_FRETS, 5), windowSpan, frets),
  };
}

interface FretboardState extends FretboardConfig {
  setEnabled: (enabled: boolean) => void;
  setShape: (shape: Partial<MusicalShape>) => void;
  selectTuning: (tuningId: string) => void;
  /** Retunes one string by `by` semitones (the tuning becomes custom) */
  retuneString: (index: number, by: number) => void;
  setStringCount: (count: number) => void;
  setFrets: (frets: number) => void;
  setDisplay: (display: FretDisplay) => void;
  setAccidental: (accidental: Accidental) => void;
  setWindow: (from: number, span: number) => void;
}

/**
 * The guitar neck under the metronome (MetroFlow's fretboard): the shape lit on it, the
 * instrument's tuning and the position being studied. Kept on this PC.
 * `strings` is the truth and `tuningId` only a label: retuning a string makes it custom
 * rather than leaving it called Drop D while it sounds like something else.
 */
export const useFretboardStore = create<FretboardState>((set, get) => {
  const commit = (patch: Partial<FretboardConfig>) => {
    set(patch);
    const {
      enabled,
      shape,
      tuningId,
      strings,
      frets,
      display,
      accidental,
      windowFrom,
      windowSpan,
    } = get();
    writeStored(KEY, {
      enabled,
      shape,
      tuningId,
      strings,
      frets,
      display,
      accidental,
      windowFrom,
      windowSpan,
    });
  };
  const stored = readStored(KEY);

  return {
    ...(stored && typeof stored === "object"
      ? sanitizeFretboard(stored as Partial<FretboardConfig>)
      : DEFAULTS),
    setEnabled: (enabled) => commit({ enabled }),
    setShape: (shape) => commit({ shape: { ...get().shape, ...shape } }),
    selectTuning: (tuningId) => {
      const tuning = findTuning(tuningId);
      if (tuning) commit({ tuningId, strings: tuning.strings });
    },
    retuneString: (index, by) => {
      const strings = get().strings.map((midi, at) =>
        at === index ? Math.min(96, Math.max(12, midi + by)) : midi,
      );
      commit({ strings, tuningId: isCustom(strings) ? CUSTOM_ID : get().tuningId });
    },
    setStringCount: (count) => {
      const strings = resizeTuning(
        get().strings,
        Math.min(MAX_STRINGS, Math.max(MIN_STRINGS, Math.round(count))),
      );
      commit({ strings, tuningId: isCustom(strings) ? CUSTOM_ID : get().tuningId });
    },
    setFrets: (frets) => {
      const next = clampInt(frets, MIN_FRETS, MAX_FRETS, MAX_FRETS);
      commit({ frets: next, windowFrom: clampWindow(get().windowFrom, get().windowSpan, next) });
    },
    setDisplay: (display) => commit({ display }),
    setAccidental: (accidental) => commit({ accidental }),
    setWindow: (from, span) => {
      const windowSpan = clampInt(span, 0, MAX_FRETS, 0);
      commit({ windowSpan, windowFrom: clampWindow(from, windowSpan, get().frets) });
    },
  };
});
