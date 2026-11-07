/** "m:ss.d" — minutes, seconds and tenths, e.g. 83.46 → "1:23.4". */
export function formatTime(seconds: number): string {
  const tenths = Math.floor(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

/** Length of a track: "4:12", or "1:02:05" from an hour up. */
export function formatLength(seconds: number): string {
  const total = Math.round(Math.max(0, seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/** Short label for ruler ticks: "1:05" for whole seconds, "1:05.5" otherwise. */
export function formatTick(seconds: number, withTenths: boolean): string {
  return withTenths ? formatTime(seconds) : formatTime(seconds).slice(0, -2);
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
