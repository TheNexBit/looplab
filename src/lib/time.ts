/** "m:ss.d" — minutes, seconds and tenths, e.g. 83.46 → "1:23.4". */
export function formatTime(seconds: number): string {
  const tenths = Math.floor(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

/** Short label for ruler ticks: "1:05" for whole seconds, "1:05.5" otherwise. */
export function formatTick(seconds: number, withTenths: boolean): string {
  return withTenths ? formatTime(seconds) : formatTime(seconds).slice(0, -2);
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
