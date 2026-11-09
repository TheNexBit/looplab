import { Minus, Plus } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/cn";
import { clamp } from "@/lib/time";
import { useWheelSteps } from "@/lib/useWheelSteps";
import { smallKey } from "./menu";

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Text of the value, e.g. 1.2 → "120%" */
  format: (value: number) => string;
  /** Double-click on the value goes back to it */
  defaultValue?: number;
  disabled?: boolean;
}

/** Rounds away the float noise of repeated steps (0.1 + 0.2). */
const tidy = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Value changed with − and +, or with the wheel over it, like the value fields of a DAW:
 * nothing to type. Double-click the value for its default.
 */
export function Stepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  defaultValue,
  disabled = false,
}: StepperProps) {
  const ref = useRef<HTMLFieldSetElement>(null);
  const move = (direction: 1 | -1) => {
    if (disabled) return;
    const next = tidy(clamp(value + direction * step, min, max));
    if (next !== value) onChange(next);
  };
  useWheelSteps(ref, move);

  return (
    <fieldset
      ref={ref}
      aria-label={label}
      className={cn("inline-flex shrink-0 items-center gap-1", disabled && "opacity-40")}
    >
      <button
        type="button"
        aria-label={`${label} −`}
        disabled={disabled || value <= min}
        onClick={() => move(-1)}
        className={smallKey}
      >
        <Minus className="size-3" />
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`${label}: ${format(value)}`}
        className="well inline-flex h-6 min-w-14 cursor-default items-center justify-center rounded-control px-1.5 font-mono text-xs text-readout tabular"
        onDoubleClick={() => defaultValue !== undefined && !disabled && onChange(defaultValue)}
      >
        {format(value)}
      </button>
      <button
        type="button"
        aria-label={`${label} +`}
        disabled={disabled || value >= max}
        onClick={() => move(1)}
        className={smallKey}
      >
        <Plus className="size-3" />
      </button>
    </fieldset>
  );
}
