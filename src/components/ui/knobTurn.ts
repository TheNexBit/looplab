import { clamp } from "@/lib/time";

/**
 * Where a value sits on the knob's turn, 0..1. A `centered` knob puts its default straight
 * up whatever the range (speed 25–200%: 100% at 12 o'clock), each half spread evenly.
 */
export function shareOf(value: number, min: number, max: number, pivot: number | null) {
  const v = clamp(value, min, max);
  if (pivot === null) return (v - min) / (max - min);
  return v < pivot ? (0.5 * (v - min)) / (pivot - min) : 0.5 + (0.5 * (v - pivot)) / (max - pivot);
}

/** The value at a share of the turn (the inverse of `shareOf`). */
export function valueAt(share: number, min: number, max: number, pivot: number | null) {
  const s = clamp(share, 0, 1);
  if (pivot === null) return min + s * (max - min);
  return s < 0.5 ? min + (s / 0.5) * (pivot - min) : pivot + ((s - 0.5) / 0.5) * (max - pivot);
}
