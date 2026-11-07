import type { MusicalShape } from "@/lib/music";
import { DEFAULT_SETTINGS } from "./constants";
import type { SubdivisionId, TimeSignature } from "./types";

export const MINUTES_MIN = 1;
export const MINUTES_MAX = 90;
export const BARS_MIN = 1;
export const BARS_MAX = 512;
export const CYCLES_MIN = 1;
export const CYCLES_MAX = 99;

export const DURATION_KINDS = ["minutes", "bars", "cycles"] as const;
/**
 * How a block knows it is finished.
 *
 * All three, because a practice plan is written in all three. "Warm up for five
 * minutes" is a clock; "eight bars of this lick" is musical; "six cycles of the
 * gap trainer" is the exercise counting itself. Forcing one unit on the other
 * two would mean doing arithmetic by hand at the tempo you happen to be at.
 */
export type DurationKind = (typeof DURATION_KINDS)[number];

export interface BlockDuration {
  kind: DurationKind;
  value: number;
}

export const TRAINER_KINDS = ["none", "speed", "gap", "rhythm"] as const;
/** Which exercise runs while a block plays. One at a time. */
export type TrainerKind = (typeof TRAINER_KINDS)[number];

/** What each exercise is called, wherever a block has to name one. */
export const TRAINER_LABELS: Record<TrainerKind, string> = {
  none: "Just the click",
  speed: "Speed trainer",
  gap: "Gap trainer",
  rhythm: "Rhythm pattern",
};

export interface SpeedSetup {
  step: number;
  everyBars: number;
  targetBpm: number;
}

export interface GapSetup {
  playBars: number;
  silentBars: number;
  grow: boolean;
}

/**
 * What a block asks the app to be while it plays.
 *
 * Deliberately plain data, and deliberately *not* an `EngineSettings`: a block
 * sets the tempo and the meter, but it must not carry a volume or a beat
 * pattern along with them. Those belong to the instrument, not to the plan —
 * a routine that reset your volume every four minutes would be unusable.
 *
 * `speed` and `gap` are both always present rather than a discriminated union
 * on `trainer`. Switching a block from the gap trainer to the speed trainer and
 * back should not silently throw away what you typed into the other one.
 */
export interface BlockSetup {
  bpm: number;
  timeSignature: TimeSignature;
  subdivision: SubdivisionId;
  trainer: TrainerKind;
  speed: SpeedSetup;
  gap: GapSetup;
  /**
   * The scale or chord this block is about, if it is about one.
   *
   * A reference into `core/music-theory`, not a copy of the notes — so the neck
   * lights up with it while the block plays, and a plan written today still
   * means the same scale after the definition behind it has been corrected.
   * `null` is an ordinary thing to want: not every block is about a shape.
   */
  shape: MusicalShape | null;
}

export interface RoutineBlock {
  id: string;
  /** What this stretch of the session is for: "Warm up", "Chorus riff". */
  label: string;
  duration: BlockDuration;
  setup: BlockSetup;
  /**
   * What to play during the block — "A dorian, 5th position", "bars 33-40".
   *
   * Free text, and shown rather than acted on. It is the field the fretboard
   * will eventually read, which is why it is here from the start: a plan that
   * says only "120 BPM for five minutes" is a timer, not a practice routine.
   */
  focus: string;
}

export interface Routine {
  id: string;
  name: string;
  blocks: RoutineBlock[];
}

const clampInt = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;

/** What a duration of this kind may be set to. */
export function durationLimits(kind: DurationKind): { min: number; max: number } {
  if (kind === "minutes") return { min: MINUTES_MIN, max: MINUTES_MAX };
  if (kind === "bars") return { min: BARS_MIN, max: BARS_MAX };
  return { min: CYCLES_MIN, max: CYCLES_MAX };
}

export function clampDuration(duration: BlockDuration): BlockDuration {
  const kind = DURATION_KINDS.includes(duration.kind) ? duration.kind : "minutes";
  const { min, max } = durationLimits(kind);
  return { kind, value: clampInt(duration.value, min, max) };
}

export function defaultSetup(): BlockSetup {
  return {
    bpm: DEFAULT_SETTINGS.bpm,
    timeSignature: DEFAULT_SETTINGS.timeSignature,
    subdivision: DEFAULT_SETTINGS.subdivision,
    trainer: "none",
    speed: { step: 5, everyBars: 4, targetBpm: 160 },
    gap: { playBars: 4, silentBars: 2, grow: false },
    shape: null,
  };
}

export function newBlock(label = "Block"): RoutineBlock {
  return {
    id: crypto.randomUUID(),
    label,
    duration: { kind: "minutes", value: 5 },
    setup: defaultSetup(),
    focus: "",
  };
}

/**
 * A starting routine, so the panel is never an empty page.
 *
 * Three blocks in the shape most practice takes: loosen up, work something
 * specific, then test whether it survives without the click.
 */
export function newRoutine(name = "Practice"): Routine {
  const warmUp = newBlock("Warm up");
  const work = newBlock("Work it up");
  const test = newBlock("Test it");

  work.duration = { kind: "minutes", value: 10 };
  work.setup.trainer = "speed";
  test.duration = { kind: "cycles", value: 8 };
  test.setup.trainer = "gap";

  return { id: crypto.randomUUID(), name, blocks: [warmUp, work, test] };
}
