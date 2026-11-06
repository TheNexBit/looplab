import { Slider as RadixSlider } from "radix-ui";
import { cn } from "@/lib/cn";
import { NumberField, type NumberFieldProps } from "./NumberField";

interface SliderProps extends NumberFieldProps {
  defaultValue: number;
  /** Width of the track, as a Tailwind class */
  trackClassName?: string;
  /** Width of the label, to line up several sliders */
  labelClassName?: string;
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
  labelClassName,
}: SliderProps) {
  return (
    <div className={cn("flex items-center gap-2", disabled && "opacity-40", className)}>
      <span className={cn("panel-label", labelClassName)}>{label}</span>
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
        {/* Fader: a groove cut into the panel, amber up to the value, a ridged cap */}
        <RadixSlider.Track className="relative h-1 grow rounded-[2px] bg-well shadow-[inset_0_1px_1px_#000,0_1px_0_rgb(255_255_255/0.06)]">
          <RadixSlider.Range className="absolute h-full rounded-[2px] bg-accent/70" />
        </RadixSlider.Track>
        <RadixSlider.Thumb className="hw block h-5 w-3 rounded-[2px] bg-[linear-gradient(#64676d,#3b3d42)] transition-[filter] hover:brightness-125" />
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
