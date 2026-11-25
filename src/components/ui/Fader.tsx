import { Slider as RadixSlider } from "radix-ui";
import { useRef } from "react";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import { clamp } from "@/lib/time";
import { useWheelSteps } from "@/lib/useWheelSteps";
import { Tooltip } from "./Tooltip";

/**
 * An upright fader, as on a mixing desk: drag it, turn the wheel (one step a notch),
 * double-click it for `reset`. Levels 0..1 unless `min`/`max` say otherwise.
 */
export function Fader({
  label,
  short,
  hint,
  value,
  current,
  reset,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
  heightClassName = "h-11",
  disabled = false,
}: {
  label: string;
  /** Written under the fader */
  short: string;
  hint: string;
  value: number;
  /** The value now, read at each wheel notch (fast notches come before a re-render) */
  current: () => number;
  reset: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Height of the groove, as a Tailwind class */
  heightClassName?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useWheelSteps(ref, (notch) => {
    if (!disabled) onChange(clamp(Math.round((current() + notch * step) * 100) / 100, min, max));
  });
  return (
    <Tooltip label={`${label} ${formatPercent(value)} — ${hint}`}>
      <div
        ref={ref}
        className={cn("flex max-w-full flex-col items-center gap-1", disabled && "opacity-40")}
      >
        <RadixSlider.Root
          orientation="vertical"
          className={cn("relative flex w-4 touch-none flex-col items-center", heightClassName)}
          value={[value]}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onValueChange={([next]) => next !== undefined && onChange(next)}
          onDoubleClick={() => !disabled && onChange(reset)}
          aria-label={label}
        >
          <RadixSlider.Track className="relative w-1 grow rounded-[2px] bg-well shadow-[inset_0_1px_1px_var(--color-shade),0_1px_0_var(--color-sheen)]">
            <RadixSlider.Range className="absolute w-full rounded-[2px] bg-accent/70" />
          </RadixSlider.Track>
          <RadixSlider.Thumb className="hw block h-3 w-5 rounded-[2px] bg-[linear-gradient(var(--color-thumb-from),var(--color-thumb-to))] transition-[filter] hover:brightness-125" />
        </RadixSlider.Root>
        <span className="panel-label whitespace-nowrap text-[10px] leading-none tracking-[0.02em]">
          {short}
        </span>
      </div>
    </Tooltip>
  );
}
