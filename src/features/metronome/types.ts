/** Denominator of the time signature: which note value one pulse is. */
type BeatUnit = 2 | 4 | 8 | 16;

export interface TimeSignature {
  /** Numerator: how many pulses per bar. */
  beats: number;
  /** Denominator: which note value gets one pulse. */
  unit: BeatUnit;
  /**
   * How the pulses group into *felt* beats of unequal length — 7/8 played 2+2+3 rather than
   * as seven of the same thing. `null` is the regular case: every pulse is its own beat.
   * The entries sum to `beats`, so the bar keeps its length; only which pulses carry the
   * beats changes.
   */
  grouping?: number[] | null;
}

/**
 * What one felt beat does. A muted beat silences its subdivisions too, but keeps its place
 * in the bar: it is a rest, not a shorter bar.
 */
export type BeatState = "accent" | "normal" | "muted";
