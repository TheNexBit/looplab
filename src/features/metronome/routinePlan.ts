import { barDuration } from "./beatGrid";
import type { BlockDuration, Routine, RoutineBlock } from "./routineTypes";

/**
 * How long one cycle of a block's exercise lasts, in bars.
 *
 * Asked per cycle rather than once, because cycles are not all the same length:
 * the gap trainer's "widen the gap" makes every cycle a bar longer than the
 * last, so "six cycles" is a sum and not a multiplication.
 */
export type CycleBars = (block: RoutineBlock, cycleIndex: number) => number;

/** Bars `count` cycles of a block add up to. */
export function barsForCycles(block: RoutineBlock, count: number, cycleBars: CycleBars): number {
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    total += Math.max(1, Math.round(cycleBars(block, index)));
  }
  return total;
}

/**
 * Bars a block runs for, or `null` when it is measured by the clock instead.
 *
 * A block counted in minutes has no bar count: how many bars fit in five
 * minutes depends on a tempo the speed trainer may be moving while it plays.
 * The runner watches the clock for those and ends them on the next bar line,
 * so a block still never stops mid-bar.
 */
export function blockBars(block: RoutineBlock, cycleBars: CycleBars): number | null {
  const { kind, value } = block.duration;
  if (kind === "minutes") return null;
  if (kind === "bars") return value;
  return barsForCycles(block, value, cycleBars);
}

/**
 * Roughly how long a block takes, in seconds.
 *
 * An estimate and nothing more: a block of bars whose speed trainer is winding
 * the tempo up finishes sooner than this says, because every bar after the
 * first step is shorter than the one it was measured at. Good enough for "this
 * routine is about half an hour", which is all it is used for.
 */
export function blockSeconds(block: RoutineBlock, cycleBars: CycleBars): number {
  if (block.duration.kind === "minutes") return block.duration.value * 60;
  const bars = blockBars(block, cycleBars) ?? 0;
  return bars * barDuration(block.setup.bpm, block.setup.timeSignature);
}

export function routineSeconds(routine: Routine, cycleBars: CycleBars): number {
  return routine.blocks.reduce((total, block) => total + blockSeconds(block, cycleBars), 0);
}

/** "6 min", "1h 05". Rounded up: a routine never takes less than it says. */
export function formatSeconds(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${`${minutes % 60}`.padStart(2, "0")}`;
}

/** The unit line under a duration field, so "cycles" says what a cycle is here. */
export function durationHint(duration: BlockDuration, block: RoutineBlock): string {
  if (duration.kind !== "cycles") return "";
  if (block.setup.trainer === "gap") return "A cycle is one stretch of click plus its silence.";
  if (block.setup.trainer === "speed") return "A cycle is one step up the tempo.";
  if (block.setup.trainer === "rhythm") return "A cycle is one time through the pattern.";
  return "No exercise is running, so a cycle is one bar.";
}
