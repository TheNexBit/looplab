/**
 * A value with its sign always shown when not zero, as on the pitch and gain readouts of
 * DAWs: 2 → "+2", -3 → "-3", 0 → "0". With a unit: "+2 st".
 */
export function signed(value: number, unit?: string): string {
  const text = value > 0 ? `+${value}` : String(value);
  return unit ? `${text} ${unit}` : text;
}
