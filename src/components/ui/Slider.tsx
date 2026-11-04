import { Slider as RadixSlider } from "radix-ui";
import { cn } from "@/lib/cn";

interface SliderProps {
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Text shown next to the slider, e.g. "100%". */
  format: (value: number) => string;
  disabled?: boolean;
  className?: string;
}

/**
 * Slider with its value always visible. Double-click resets to `defaultValue`.
 * The editable numeric field arrives with the first real control (phase 3).
 */
export function Slider({
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  onChange,
  format,
  disabled = false,
  className,
}: SliderProps) {
  return (
    <div className={cn("flex items-center gap-3", disabled && "opacity-40", className)}>
      <span className="text-xs text-fg-muted">{label}</span>
      <RadixSlider.Root
        className="relative flex h-5 w-28 touch-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([next]) => next !== undefined && onChange(next)}
        onDoubleClick={() => onChange(defaultValue)}
        aria-label={label}
      >
        <RadixSlider.Track className="relative h-1 grow rounded-full bg-surface-hover">
          <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
        </RadixSlider.Track>
        <RadixSlider.Thumb className="block size-3.5 rounded-full bg-fg shadow transition-transform hover:scale-110" />
      </RadixSlider.Root>
      <span className="w-14 text-right text-xs text-fg tabular">{format(value)}</span>
    </div>
  );
}
