import { beatsInBar } from "./beatGrid";
import type { BeatUnit, TimeSignature } from "./types";

/** Numerators the shuffle draws from — long enough to reach the odd meters, not silly. */
const BEATS_MIN = 2;
const BEATS_MAX = 13;

/** A practice tempo, not the whole dial: fast enough to matter, slow enough to play. */
const BPM_MIN = 60;
const BPM_MAX = 176;

/** Cross rhythms the shuffle offers, before the bar's own beat count is removed. */
const CROSS_CHOICES = [2, 3, 4, 5, 6, 7];

/** Odds the shuffle leaves the cross rhythm off — plenty of bars want no polyrhythm. */
const CROSS_OFF_CHANCE = 0.4;

export interface RandomSetup {
  timeSignature: TimeSignature;
  crossRhythm: number | null;
  bpm: number;
}

/** Inclusive integer in [min, max]. */
function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

/** Fisher–Yates, on a copy. */
function shuffle<T>(rng: () => number, items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * A grouping of 2s and 3s that sums to `beats`, or `null` for a plain meter.
 *
 * Twos and threes are the only cells an additive meter is built from — a 4 is
 * two 2s, so admitting it would just be a coarser 2. Every integer above one is
 * some sum of them, so a partition always exists; the number of 3s is chosen at
 * random among those that leave an even remainder, and the cells are shuffled so
 * 11 is as likely to fall 3+3+3+2 as 2+3+3+3.
 *
 * A partition of all 2s, or one with a single cell, is not really additive — it
 * is a plain even bar — so it comes back as `null`.
 */
function randomGrouping(rng: () => number, beats: number): number[] | null {
  // k threes such that (beats - 3k) is even and ≥ 0. 3k and k share parity, so
  // k must match beats' parity for the remaining twos to divide evenly.
  const threeChoices: number[] = [];
  for (let k = beats % 2; k * 3 <= beats; k += 2) threeChoices.push(k);
  const threes = pick(rng, threeChoices);
  const twos = (beats - threes * 3) / 2;

  const cells = [
    ...Array.from({ length: threes }, () => 3),
    ...Array.from({ length: twos }, () => 2),
  ];

  // One cell, or no 3 at all, is a plain even bar, not an additive one.
  if (cells.length <= 1 || threes === 0) return null;
  return shuffle(rng, cells);
}

/**
 * A whole meter, cross rhythm and tempo at once, applied by one press of Random.
 *
 * Pure, with an injectable rng, the way `generatePattern` in the rhythm trainer
 * is — so the constraints can be tested without spinning a clock. Those
 * constraints are what keep it a random *meter* rather than random noise: the
 * grouping is a real partition of the numerator, the denominator matches whether
 * the bar is additive, and the cross rhythm never equals the bar's own beat
 * count (which would be no cross rhythm at all).
 */
export function generateRandomSetup(rng: () => number = Math.random): RandomSetup {
  const beats = randInt(rng, BEATS_MIN, BEATS_MAX);
  const grouping = randomGrouping(rng, beats);

  // Additive bars live in eighths; plain bars pick a denominator for variety.
  const unit: BeatUnit = grouping ? 8 : pick(rng, [4, 8] as const);
  const timeSignature: TimeSignature = { beats, unit, grouping };

  const felt = beatsInBar(timeSignature);
  const crossCandidates = CROSS_CHOICES.filter((cross) => cross !== felt);
  const crossRhythm =
    rng() < CROSS_OFF_CHANCE || crossCandidates.length === 0 ? null : pick(rng, crossCandidates);

  const bpm = randInt(rng, BPM_MIN, BPM_MAX);

  return { timeSignature, crossRhythm, bpm };
}
