/**
 * Ranges of the playback controls offered by the UI.
 * The engine accepts a wider speed range (`MIN_SPEED`/`MAX_SPEED` in engine.rs) and clamps to it.
 */
export const SPEED = { min: 0.25, max: 2, step: 0.01, default: 1 } as const;
export const SPEED_PRESETS = [0.5, 0.75, 1] as const;
export const SEMITONES = { min: -12, max: 12, step: 1, default: 0 } as const;
export const CENTS = { min: -50, max: 50, step: 1, default: 0 } as const;
/** Seconds played before the loop start on every repetition. */
export const LEAD_IN = { min: 0, max: 10, step: 0.5, default: 0 } as const;
/** Seconds of silence between repetitions. */
export const GAP = { min: 0, max: 10, step: 0.5, default: 0 } as const;
/** Shortest loop, in seconds: anything shorter is treated as a click. */
export const MIN_LOOP = 0.05;
