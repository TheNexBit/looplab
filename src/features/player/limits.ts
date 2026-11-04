/** Ranges of the playback controls. Shared by the UI and, later, by validation. */
export const SPEED = { min: 0.25, max: 2, step: 0.01, default: 1 } as const;
export const SEMITONES = { min: -12, max: 12, step: 1, default: 0 } as const;
export const CENTS = { min: -50, max: 50, step: 1, default: 0 } as const;
