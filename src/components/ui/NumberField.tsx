import { type KeyboardEvent, useState } from "react";
import { cn } from "@/lib/cn";
import { clamp } from "@/lib/time";

export interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Change per ↑ / ↓ key press */
  step: number;
  onChange: (value: number) => void;
  /** Text shown while not editing, e.g. 0.75 → "75%" */
  format: (value: number) => string;
  /** Typed text → value, e.g. "75" → 0.75; `null` rejects it. Defaults to a plain number. */
  parse?: (text: string) => number | null;
  disabled?: boolean;
  className?: string;
}

/** Plain number, accepting a comma as decimal separator and ignoring units like "%". */
export function parseNumber(text: string): number | null {
  const value = Number.parseFloat(text.replace(",", ".").replace(/[^\d.+-]/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** Value that can be typed: click, type, Enter. ↑ / ↓ step it, Esc cancels. */
export function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  parse = parseNumber,
  disabled = false,
  className,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = parse(draft);
    if (parsed !== null) onChange(clamp(parsed, min, max));
    setDraft(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      commit();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setDraft(null);
      event.currentTarget.blur();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      setDraft(null);
      onChange(clamp(value + (event.key === "ArrowUp" ? step : -step), min, max));
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      disabled={disabled}
      value={draft ?? format(value)}
      onFocus={(event) => {
        setDraft(format(value));
        event.currentTarget.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={cn(
        "h-6 w-16 rounded-control border border-transparent bg-transparent px-1.5 text-right font-mono text-xs text-lcd-fg tabular transition-colors",
        "hover:border-border focus:border-accent focus:bg-well focus:outline-none disabled:pointer-events-none",
        className,
      )}
    />
  );
}
