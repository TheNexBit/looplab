/** Small colour helpers for the custom colours of Settings → Appearance (hex in, CSS out). */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** "#ffa726" or "#fa2" → its channels; `null` for anything else. */
export function parseHex(hex: string): Rgb | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return null;
  const digits =
    match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
  const value = Number.parseInt(digits, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export const isHex = (value: unknown): value is string =>
  typeof value === "string" && parseHex(value) !== null;

const channel = (value: number) =>
  Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, "0");

export const toHex = ({ r, g, b }: Rgb) => `#${channel(r)}${channel(g)}${channel(b)}`;

/** `hex` see-through: `alpha` 0..1, as `rgb(r g b / a)`. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${alpha})`;
}

/** `hex` moved towards white by `amount` (0..1); a negative amount moves it towards black. */
export function lighten(hex: string, amount: number): string {
  const rgb = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  const target = amount >= 0 ? 255 : 0;
  const k = Math.abs(amount);
  return toHex({
    r: rgb.r + (target - rgb.r) * k,
    g: rgb.g + (target - rgb.g) * k,
    b: rgb.b + (target - rgb.b) * k,
  });
}

/** Relative luminance (WCAG), 0 = black, 1 = white. */
export function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
}

/** Dark or light text, whichever reads better on a `hex` background. */
export const textOn = (hex: string) => (luminance(hex) > 0.35 ? "#14110b" : "#fbfaf7");
