import { parseNumber } from "@/components/ui/NumberField";
import { clamp } from "@/lib/time";
import { FREQUENCY, GAIN } from "@/stores/eq";

const DECADES = Math.log10(FREQUENCY.max / FREQUENCY.min);

/** Frequency ↔ horizontal position (0..1) on a log scale, like the ear hears it. */
export const frequencyToX = (hz: number) => Math.log10(hz / FREQUENCY.min) / DECADES;
export const xToFrequency = (x: number) =>
  clamp(FREQUENCY.min * 10 ** (clamp(x, 0, 1) * DECADES), FREQUENCY.min, FREQUENCY.max);

/** Gain ↔ vertical position (0 = top = loudest). */
export const gainToY = (db: number) => (GAIN.max - db) / (GAIN.max - GAIN.min);
export const yToGain = (y: number) =>
  clamp(GAIN.max - y * (GAIN.max - GAIN.min), GAIN.min, GAIN.max);

/** Frequencies at which the curve is evaluated, spread evenly on the log scale. */
export const CURVE_POINTS = Array.from({ length: 200 }, (_, i) => xToFrequency(i / 199));

export const formatFrequency = (hz: number) =>
  hz >= 1_000 ? `${(hz / 1_000).toFixed(hz >= 10_000 ? 1 : 2)} kHz` : `${Math.round(hz)} Hz`;

/** "250", "1.5k", "1,5 kHz" → Hz. */
export function parseFrequency(text: string): number | null {
  const value = parseNumber(text);
  if (value === null) return null;
  return /k/i.test(text) ? value * 1_000 : value;
}
