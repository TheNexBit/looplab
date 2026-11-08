import { t } from "@/i18n";

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Disk sizes the Windows way (1 KB = 1024 B), in the language's number format: "1,2 GB". */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toLocaleString(t.common.locale, { maximumFractionDigits: digits })} ${UNITS[unit]}`;
}
