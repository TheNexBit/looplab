/** Note value the metronome subdivides each beat into. */
export type SubdivisionId = "quarter" | "eighth" | "triplet" | "sixteenth";

/** Denominator of the time signature. Only simple/compound meters we support. */
export type BeatUnit = 2 | 4 | 8;

export interface TimeSignature {
  /** Numerator: how many pulses per bar. */
  beats: number;
  /** Denominator: which note value gets one pulse. */
  unit: BeatUnit;
  /**
   * How those pulses group into *felt* beats of unequal length — 7/8 played
   * 2+2+3 rather than as seven of the same thing. `null` is the regular case,
   * where every pulse is its own beat.
   *
   * The entries must sum to `beats`, so the bar keeps exactly the length it had.
   * That is what makes an additive meter cheap here: the bar, the tempo and the
   * cross rhythm are all untouched, and only which pulses count as beats — and
   * therefore carry the accent and the main click — changes.
   */
  grouping?: number[] | null;
}

export interface SubdivisionDef {
  id: SubdivisionId;
  label: string;
  /** How many clicks fit in one beat. */
  ticksPerBeat: number;
}

/**
 * Which click voice a tick should use.
 *
 * `strum-down` and `strum-up` are the rhythm trainer's two pick directions:
 * a down-stroke reads fuller and lower, an up-stroke brighter and shorter, so a
 * guitarist hears which way the hand moves without looking. They always synth,
 * never a user sample — a down and an up must stay distinguishable by ear.
 */
export type ClickVoice = "accent" | "normal" | "subdivision" | "cross" | "strum-down" | "strum-up";

/**
 * What one beat of the bar does.
 *
 * `muted` silences the beat *and* any subdivisions inside it, but the beat
 * still occupies its place in the grid — it is a rest, not a shorter bar.
 * Muting beats is how a player practises an off-beat feel or drops the click
 * on the bar they want to hear themselves on.
 */
export type BeatState = "accent" | "normal" | "muted";

/**
 * One click's place in the grid, before anything outside the grid has had a
 * say about whether it sounds. What `BarCursor` can know on its own.
 */
export interface GridTick {
  time: number;
  /** Monotonic counter since `start()`, useful for debugging drift. */
  tickIndex: number;
  /** 0-based position of the tick inside its bar (counts subdivisions). */
  tickInBar: number;
  /** 0-based beat inside the bar. */
  beatInBar: number;
  /** 0-based bar since `start()`. */
  barIndex: number;
  /** True when the tick lands on a beat rather than between beats. */
  isBeat: boolean;
  /** True on the first beat of the bar. */
  isDownbeat: boolean;
  voice: ClickVoice;
  /**
   * True when this tick should make no sound. It is still queued and still
   * reported, so the beat indicator keeps moving through a muted beat.
   */
  muted: boolean;
}

/**
 * One click, already placed on the AudioContext timeline.
 * `time` is an absolute `AudioContext.currentTime` value — never a wall clock.
 */
export interface ScheduledTick extends GridTick {
  /**
   * True when a bar gate silenced the whole bar this tick belongs to.
   *
   * Separate from `muted` because the two answer different questions. `muted`
   * is the player's accent pattern — a property of the bar's shape, the same
   * every bar. `silenced` is an exercise turning the click off for a stretch,
   * and the UI needs to say so differently: a muted beat is how the bar is
   * written, a silenced bar is the metronome deliberately leaving you alone.
   */
  silenced: boolean;
  /**
   * True on the preparatory bars a count-in plays before the real bar 0.
   *
   * Count-in bars run at negative `barIndex`, sound plainly whatever the accent
   * pattern says, and are pushed to the visual queue so the beat indicator
   * counts them off — but they are never emitted to `onTick`, so nothing that
   * advances by the bar (a setlist, the speed trainer, a routine) counts the
   * lead-in as part of the exercise. The real practice begins at bar 0.
   */
  countIn: boolean;
}

/**
 * Decides whether a whole bar sounds. Returns true to let it through.
 *
 * The engine consults this per tick rather than reading a flag someone flips
 * from outside, and that is the entire point: clicks are scheduled up to the
 * look-ahead before they are heard, so a flag toggled when a bar *starts*
 * would arrive after that bar's first clicks were already queued. A predicate
 * over `barIndex` cannot be late.
 */
export type BarGate = (barIndex: number) => boolean;

/** What a step gate decides for one tick. */
export interface StepDecision {
  /** True when this tick is a rest and must make no sound. */
  silent: boolean;
  /** The voice a sounding tick uses, overriding the grid's own choice. */
  voice: ClickVoice;
}

/**
 * Decides what a single tick does, at the grid's own resolution.
 *
 * Where `BarGate` silences whole bars, a `StepGate` speaks per tick: it is how
 * a rhythm exercise turns the plain subdivision grid into a pattern of notes
 * and rests, choosing the voice for each note and silencing the rests. While
 * one is installed it *owns* the click — the beat pattern's own accents and
 * mutes step aside, so the exercise is never fighting the metronome underneath
 * it.
 *
 * Consulted per tick as each click is placed, for the same reason as `BarGate`:
 * a decision read off a flag when a bar starts would arrive after that bar's
 * first clicks were already scheduled.
 *
 * Only ever asked about main-grid ticks (`tickInBar >= 0`); a cross rhythm has
 * its own scheduling path and is not a position in this grid.
 */
export type StepGate = (tick: GridTick) => StepDecision;

export interface EngineSettings {
  /** Beats per minute. The meter groups these beats; it never rescales them. */
  bpm: number;
  timeSignature: TimeSignature;
  subdivision: SubdivisionId;
  /** Master output level, 0..1. */
  volume: number;
  /**
   * What each beat of the bar does, one entry per beat.
   *
   * Kept the same length as `timeSignature.beats` — `fitPattern` in
   * `beat-grid` is the only thing that should resize it, so the two can never
   * drift apart and leave a beat with no state.
   */
  beatPattern: BeatState[];
  /**
   * How a pair of clicks divides the space it shares, 0.5 … 0.75.
   *
   * 0.5 is even — no swing. 2/3 is the jazz eighth, the pair falling 2:1 as if
   * it had been written as triplets. 0.75 is a hard shuffle. Everything between
   * is playable, because the amount of swing is a matter of feel and of style,
   * not a switch: the same tune swings differently at 90 and at 240.
   *
   * The pair keeps its total length, so the beat, the bar and the tempo are
   * untouched — only the placement inside the pair moves. Subdivisions with an
   * odd number of clicks per beat have no pairs and ignore this entirely.
   */
  swing: number;
  /**
   * A second pulse laid across the bar: `n` evenly spaced clicks per bar,
   * against the bar's own beats. 3 in a bar of 4/4 is three against four.
   * `null` is off.
   *
   * It divides the *bar*, not the beat — that is what makes it a polyrhythm
   * rather than another subdivision. Subdivisions nest inside a beat and stay
   * in phase with it; a cross rhythm deliberately does not, and only meets the
   * beat again at the bar line.
   */
  crossRhythm: number | null;
}

/** Custom samples for the two user-facing slots. `null` falls back to the synth voice. */
export interface ClickSamples {
  accent: AudioBuffer | null;
  normal: AudioBuffer | null;
}

export type TickListener = (tick: ScheduledTick) => void;
