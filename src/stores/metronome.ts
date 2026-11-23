import { create } from "zustand";
import {
  BEATS_MAX,
  BEATS_MIN,
  defaultPattern,
  fitPattern,
  isValidGrouping,
  nextBeatState,
  SWING_MAX,
  SWING_STRAIGHT,
} from "@/features/metronome/beatGrid";
import type { BeatState } from "@/features/metronome/types";
import type { PlaybackStatus, VoiceLanguage } from "@/lib/bindings";
import { readStored, writeStored } from "@/lib/storage";
import { clamp } from "@/lib/time";
import type { ExerciseSetup } from "./metronomeExercises";

/** Tempo per minute: quarter notes by default, as everywhere in Looplab (and in Ableton). */
export const METRONOME_BPM = { min: 20, max: 400, step: 1, default: 120 } as const;
/** What the BPM count: quarter notes (as in DAWs) or the pulses of the bar (♪ in 4/8). */
export const TEMPO_BASES = ["quarter", "pulse"] as const;
type TempoBase = (typeof TEMPO_BASES)[number];
/** Note values a pulse can be: 2/x … 16/x. */
export const METRONOME_UNITS = [2, 4, 8, 16] as const;
type MetronomeUnit = (typeof METRONOME_UNITS)[number];
/** Clicks a pulse can be split into (1 = only the pulses). */
export const SUBDIVISIONS = [1, 2, 3, 4, 5, 6] as const;
export const CROSS = { min: 2, max: 16 } as const;
export const COUNT_IN_BARS = { min: 0, max: 4 } as const;

/** The bar, the tempo and the sounds' volume: what is kept between sessions. */
export interface MetronomeSetup {
  bpm: number;
  /** What `bpm` counts; songs and parts keep their own, so they always sound the same */
  tempoBase: TempoBase;
  beats: number;
  unit: MetronomeUnit;
  /** Pulses grouped into felt beats (7/8 as 2+2+3); null: every pulse is a beat */
  grouping: number[] | null;
  /** One per felt beat */
  states: BeatState[];
  subdivision: number;
  /** 0.5 even … 0.75 hard shuffle */
  swing: number;
  /** Cross pulses over the bar; 0 = off */
  cross: number;
  countInBars: number;
  volume: number;
}

const DEFAULTS: MetronomeSetup = {
  bpm: METRONOME_BPM.default,
  tempoBase: "quarter",
  beats: 4,
  unit: 4,
  grouping: null,
  states: defaultPattern(4),
  subdivision: 1,
  swing: SWING_STRAIGHT,
  cross: 0,
  countInBars: 0,
  volume: 0.8,
};
const KEY = "looplab.metronome";
/** The screen flash is a preference of this PC, not part of a song */
const FLASH_KEY = "looplab.metronome.flash";
/** The counting voice too: a habit of whoever practises, not part of a song */
const VOICE_KEY = "looplab.metronome.voice";

/** "uno, due, tre…" on the pulses, "e" on the subdivisions if asked. */
interface CountVoiceSetup {
  on: boolean;
  subdivisions: boolean;
  /** 0..1 */
  level: number;
  /** "one, two…" or "uno, due…" */
  language: VoiceLanguage;
}

const VOICE_DEFAULTS: CountVoiceSetup = {
  on: false,
  subdivisions: false,
  level: 0.9,
  language: "en",
};

function loadVoice(): CountVoiceSetup {
  const stored = readStored(VOICE_KEY) as Partial<CountVoiceSetup> | undefined;
  if (!stored || typeof stored !== "object") return VOICE_DEFAULTS;
  return {
    on: stored.on === true,
    subdivisions: stored.subdivisions === true,
    level:
      typeof stored.level === "number" && Number.isFinite(stored.level)
        ? clamp(stored.level, 0, 1)
        : VOICE_DEFAULTS.level,
    language: stored.language === "it" ? "it" : "en",
  };
}

const isState = (value: unknown): value is BeatState =>
  value === "accent" || value === "normal" || value === "muted";

/** Keeps a stored setup inside its limits; anything unusable falls back to the default. */
export function sanitizeSetup(value: Partial<MetronomeSetup>): MetronomeSetup {
  const number = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? clamp(v, min, max) : fallback;
  const beats = Math.round(number(value.beats, DEFAULTS.beats, BEATS_MIN, BEATS_MAX));
  const unit = (METRONOME_UNITS as readonly number[]).includes(value.unit as number)
    ? (value.unit as MetronomeUnit)
    : DEFAULTS.unit;
  const grouping = isValidGrouping(value.grouping, beats) ? value.grouping : null;
  const felt = grouping ? grouping.length : beats;
  const states = Array.isArray(value.states) ? value.states.filter(isState) : [];
  const subdivision = (SUBDIVISIONS as readonly number[]).includes(value.subdivision as number)
    ? (value.subdivision as number)
    : DEFAULTS.subdivision;
  const cross = Math.round(number(value.cross, 0, 0, CROSS.max));
  return {
    bpm: number(value.bpm, DEFAULTS.bpm, METRONOME_BPM.min, METRONOME_BPM.max),
    tempoBase: value.tempoBase === "pulse" ? "pulse" : "quarter",
    beats,
    unit,
    grouping,
    states: states.length > 0 ? fitPattern(states, felt) : defaultPattern(felt),
    subdivision,
    swing: number(value.swing, SWING_STRAIGHT, SWING_STRAIGHT, SWING_MAX),
    cross: cross < CROSS.min ? 0 : cross,
    countInBars: Math.round(number(value.countInBars, 0, COUNT_IN_BARS.min, COUNT_IN_BARS.max)),
    volume: number(value.volume, DEFAULTS.volume, 0, 1),
  };
}

function load(): MetronomeSetup {
  const stored = readStored(KEY);
  return stored && typeof stored === "object"
    ? sanitizeSetup(stored as Partial<MetronomeSetup>)
    : DEFAULTS;
}

interface MetronomeState extends MetronomeSetup {
  /** The metronome mode is on screen */
  open: boolean;
  running: boolean;
  /** Last position the engine reported (pulses from bar 0) and when it arrived */
  pulses: number;
  pulsesAt: number;
  /** When it was started (performance.now), for the elapsed time */
  startedAt: number;
  taps: number[];
  /** A sequence being played: its parts in order; null: the metronome's own bar */
  sequence: PlayedSequence | null;
  /** Part of the sequence being played, as the engine reports it */
  segment: number;
  /** The screen flashes on every beat (stronger on the accents) */
  flash: boolean;
  setFlash: (flash: boolean) => void;
  voice: CountVoiceSetup;
  setVoice: (patch: Partial<CountVoiceSetup>) => void;
  setOpen: (open: boolean) => void;
  /** Plays a sequence from its first part (null: back to the own bar) */
  playSequence: (sequence: PlayedSequence | null) => void;
  setRunning: (running: boolean) => void;
  update: (patch: Partial<MetronomeSetup>) => void;
  /** New meter: the accents are kept where they still fit */
  setMeter: (beats: number, unit: MetronomeUnit, grouping: number[] | null) => void;
  /** Accent → normal → muted → accent, like a click on a beat in MetroFlow */
  cycleBeat: (index: number) => void;
  addTap: (time: number) => void;
  applyStatus: (status: PlaybackStatus) => void;
}

const MAX_TAPS = 8;
/** Before this long after the start, an engine report of "stopped" is an old one. */
const START_GRACE_MS = 500;

/** A part of a sequence: a whole setup (bar, tempo, exercises) for some bars. */
export interface PlayedPart {
  name: string;
  setup: MetronomeSetup;
  exercises: ExerciseSetup;
  bars: number;
  /** What to play in this part ("riff della strofa", "scala di La minore") */
  note: string;
}

export interface PlayedSequence {
  id: string;
  name: string;
  parts: PlayedPart[];
  repeat: boolean;
}

/** The metronome on its own: its bar and tempo (kept on this PC) and where it is. */
export const useMetronomeStore = create<MetronomeState>((set, get) => {
  const save = () => {
    const { bpm, tempoBase, beats, unit, grouping, states, subdivision, swing, cross } = get();
    const { countInBars, volume } = get();
    writeStored(KEY, {
      bpm,
      tempoBase,
      beats,
      unit,
      grouping,
      states,
      subdivision,
      swing,
      cross,
      countInBars,
      volume,
    });
  };
  return {
    ...load(),
    open: false,
    running: false,
    pulses: 0,
    pulsesAt: 0,
    startedAt: 0,
    taps: [],
    sequence: null,
    segment: 0,
    flash: readStored(FLASH_KEY) === true,
    setFlash: (flash) => {
      set({ flash });
      writeStored(FLASH_KEY, flash);
    },
    voice: loadVoice(),
    setVoice: (patch) => {
      const voice = { ...get().voice, ...patch };
      voice.level = clamp(voice.level, 0, 1);
      set({ voice });
      writeStored(VOICE_KEY, voice);
    },
    setOpen: (open) => set(open ? { open } : { open, running: false, sequence: null }),
    playSequence: (sequence) => {
      set({ sequence, segment: 0, running: false });
      if (sequence) get().setRunning(true);
    },
    setRunning: (running) =>
      set({
        running,
        startedAt: performance.now(),
        segment: 0,
        // Until the engine reports, the count-in is where it starts
        pulses: running ? -get().countInBars * shownSetup(get()).beats : 0,
        pulsesAt: performance.now(),
      }),
    update: (patch) => {
      set(sanitizeSetup({ ...get(), ...patch }));
      save();
    },
    setMeter: (beats, unit, grouping) => {
      const felt = grouping && isValidGrouping(grouping, beats) ? grouping.length : beats;
      get().update({ beats, unit, grouping, states: fitPattern(get().states, felt) });
    },
    cycleBeat: (index) => {
      const states = [...get().states];
      const state = states[index];
      if (state === undefined) return;
      states[index] = nextBeatState(state);
      get().update({ states });
    },
    addTap: (time) => set({ taps: [...get().taps, time].slice(-MAX_TAPS) }),
    applyStatus: (status) => {
      const state = get();
      if (!state.running) return;
      // The engine stopped by itself: a sequence that does not repeat is over
      if (!status.metronomeRunning && performance.now() - state.startedAt > START_GRACE_MS) {
        set({ running: false });
        return;
      }
      set({
        pulses: status.metronomePulses ?? state.pulses,
        pulsesAt: performance.now(),
        segment: status.metronomeSegment ?? 0,
      });
    },
  };
});

type Tempo = Pick<MetronomeSetup, "bpm" | "unit" | "tempoBase">;

/** Pulses per minute at the setup's tempo (a pulse is the note value of the numerator). */
export function pulsesPerMinute(setup: Tempo): number {
  return setup.tempoBase === "pulse" ? setup.bpm : (setup.bpm * setup.unit) / 4;
}

/** Quarter notes per minute at the setup's tempo. */
export function quartersPerMinute(setup: Tempo): number {
  return setup.tempoBase === "pulse" ? (setup.bpm * 4) / setup.unit : setup.bpm;
}

/** Pulses per second at the current tempo. */
export function pulsesPerSecond(setup: Tempo): number {
  return pulsesPerMinute(setup) / 60;
}

/** The part of the sequence being played, if one is. */
export function playedPart(
  state: Pick<MetronomeState, "sequence" | "segment">,
): PlayedPart | undefined {
  return state.sequence?.parts[state.segment] ?? state.sequence?.parts[0];
}

/** What the screen shows: the part of the sequence being played, or the own setup. */
export function shownSetup(state: MetronomeState): MetronomeSetup {
  return playedPart(state)?.setup ?? state;
}

/** Where the metronome is now, in pulses (between two reports it runs on at the tempo). */
export function currentPulses(now = performance.now()): number | null {
  const state = useMetronomeStore.getState();
  if (!state.running) return null;
  return state.pulses + ((now - state.pulsesAt) / 1000) * pulsesPerSecond(shownSetup(state));
}
