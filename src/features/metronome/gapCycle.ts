export const BARS_MIN = 1;
export const BARS_MAX = 32;
export const COUNT_IN_MIN = 0;
export const COUNT_IN_MAX = 8;

export interface GapCycleConfig {
  /** Bars of click before the first gap. 0 goes straight into the cycle. */
  countInBars: number;
  /** Bars the click is heard for, every cycle. */
  playBars: number;
  /** Bars of silence. The starting length when the gap grows. */
  silentBars: number;
  /** Lengthens the silence by one bar every cycle. */
  grow: boolean;
}

export type GapPhase = "count-in" | "play" | "silent";

export interface GapPosition {
  phase: GapPhase;
  /**
   * Where this bar sits in its group: within the count-in, or within the
   * current cycle (so a silent bar's index is at or past `playBars`).
   */
  index: number;
  /** 0-based cycle since the count-in ended. -1 during the count-in itself. */
  cycleIndex: number;
  playBars: number;
  /** The silence *this* cycle gets, which grows when `grow` is set. */
  silentBars: number;
}

/**
 * The silence a given cycle gets.
 *
 * Split out because two things need it and they must not disagree: the gate
 * deciding which bars sound, and the panel drawing the cycles you have not
 * reached yet. A diagram that lies about how long the next gap is would be
 * worse than no diagram — the growing gap is the whole exercise.
 */
export function silentBarsForCycle(config: GapCycleConfig, cycleIndex: number): number {
  if (!config.grow) return config.silentBars;
  return Math.min(BARS_MAX, config.silentBars + cycleIndex);
}

/**
 * Where a bar falls in the play/silence cycle. Pure, and the only place the
 * arithmetic lives.
 *
 * The gate asks it to decide whether a bar sounds; the panel asks it to draw
 * the diagram. One function, one answer — a second copy of this would
 * eventually disagree with what is being heard, and a diagram that lies about
 * when the silence starts is worse than no diagram.
 */
export function gapPositionAt(barsSinceStart: number, config: GapCycleConfig): GapPosition {
  const { countInBars, playBars, grow } = config;

  if (barsSinceStart < countInBars) {
    return {
      phase: "count-in",
      index: barsSinceStart,
      cycleIndex: -1,
      playBars,
      silentBars: config.silentBars,
    };
  }

  let remaining = barsSinceStart - countInBars;
  let cycleIndex = 0;

  if (grow) {
    // Every cycle is a bar longer than the last, so there is no divisor to
    // divide by — walk them. It converges quickly: the cycles grow while the
    // distance stays fixed, so this is a handful of steps even after an hour.
    while (remaining >= playBars + silentBarsForCycle(config, cycleIndex)) {
      remaining -= playBars + silentBarsForCycle(config, cycleIndex);
      cycleIndex += 1;
    }
  } else {
    const cycle = playBars + config.silentBars;
    cycleIndex = Math.floor(remaining / cycle);
    remaining %= cycle;
  }

  const silentBars = silentBarsForCycle(config, cycleIndex);

  return {
    phase: remaining < playBars ? "play" : "silent",
    index: remaining,
    cycleIndex,
    playBars,
    silentBars,
  };
}
