import { defaultPattern, SWING_STRAIGHT } from "./beatGrid";
import type { EngineSettings } from "./types";

export const BPM_MIN = 20;
export const BPM_MAX = 300;

/** Tap tempo averages the intervals between the last N taps. */
export const TAP_HISTORY_SIZE = 5;
/** A gap longer than this starts a fresh tap series. */
export const TAP_RESET_MS = 2000;

export const DEFAULT_SETTINGS: EngineSettings = {
  bpm: 120,
  timeSignature: { beats: 4, unit: 4 },
  subdivision: "quarter",
  volume: 0.8,
  beatPattern: defaultPattern(4),
  swing: SWING_STRAIGHT,
  crossRhythm: null,
};

export function clampBpm(bpm: number): number {
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm)));
}
