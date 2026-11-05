import { Slider as RadixSlider } from "radix-ui";
import { cn } from "@/lib/cn";
import { NumberField, type NumberFieldProps } from "./NumberField";

interface SliderProps extends NumberFieldProps {
  defaultValue: number;
  /** Width of the track, as a Tailwind class */
  trackClassName?: string;
}

/**
 * Slider with an editable value next to it. Double-click the slider to reset to `defaultValue`.
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
  parse,
  disabled = false,
  className,
  trackClassName = "w-28",
}: SliderProps) {
  return (
    <div className={cn("flex items-center gap-2", disabled && "opacity-40", className)}>
      <span className="text-xs text-fg-muted">{label}</span>
      <RadixSlider.Root
        className={cn("relative flex h-5 touch-none items-center", trackClassName)}
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
      <NumberField
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        format={format}
        parse={parse}
        disabled={disabled}
      />
    </div>
  );
}
