/**
 * A value with its sign always shown when not zero, as on the pitch and gain readouts of
 * DAWs: 2 → "+2", -3 → "-3", 0 → "0". With a unit: "+2 st".
 */
export function signed(value: number, unit?: string): string {
  const text = value > 0 ? `+${value}` : String(value);
  return unit ? `${text} ${unit}` : text;
}

/** Words for `formatAgo`, from `i18n`. */
export interface AgoWords {
  now: string;
  minutes: string;
  today: string;
  yesterday: string;
  locale: string;
}

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * When something happened, as a list of recent files says it: "adesso", "12 min fa", "oggi",
 * "ieri", then the weekday for the last week ("lun") and the date after that ("12 ott").
 */
export function formatAgo(when: Date, now: Date, words: AgoWords): string {
  const minutes = Math.floor((now.getTime() - when.getTime()) / 60_000);
  if (minutes < 1) return words.now;
  if (minutes < 60) return `${minutes} ${words.minutes}`;
  const days = Math.round((startOfDay(now) - startOfDay(when)) / 86_400_000);
  if (days <= 0) return words.today;
  if (days === 1) return words.yesterday;
  if (days < 7) return when.toLocaleDateString(words.locale, { weekday: "short" });
  const sameYear = when.getFullYear() === now.getFullYear();
  return when.toLocaleDateString(words.locale, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
