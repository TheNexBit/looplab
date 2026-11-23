import { ContextMenu } from "radix-ui";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useId, useRef } from "react";
import { cn } from "@/lib/cn";
import { followPointer } from "@/lib/followPointer";
import { clamp } from "@/lib/time";
import { useWheelSteps } from "@/lib/useWheelSteps";
import { shareOf, valueAt } from "./knobTurn";
import { menuContent } from "./menu";
import { Tooltip } from "./Tooltip";

/** The knob turns through 270°, from 7:30 to 4:30 on a clock face, like the knobs of a mixer. */
const SWEEP_FROM = 0.75 * Math.PI;
const SWEEP = 1.5 * Math.PI;
/** Pixels of mouse travel (up or down) that turn the knob from end to end; Shift: ten times finer. */
const TRAVEL_PX = 160;

const angleOf = (share: number) => SWEEP_FROM + SWEEP * share;

/** An arc of the ring, from `a0` to `a1` (radians), in the 100 × 100 drawing. */
function arc(radius: number, a0: number, a1: number) {
  const at = (a: number) => `${50 + radius * Math.cos(a)} ${50 + radius * Math.sin(a)}`;
  return `M ${at(a0)} A ${radius} ${radius} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${at(a1)}`;
}

interface KnobProps {
  /** Full name (tooltip, screen readers) */
  label: string;
  /** Written beside the knob (short in a crowded bar) */
  caption: string;
  /** What it does, after the name in the tooltip */
  hint?: string;
  value: number;
  /** The value now, read at each wheel notch and drag move (they come before a re-render) */
  current: () => number;
  min: number;
  max: number;
  /** Smallest change: what a drag moves by */
  step: number;
  /** What a wheel notch or an arrow key moves by (default: `step`), e.g. 5% on a level */
  notch?: number;
  /** Double-click goes back to it; a `centered` knob lights the ring from it */
  defaultValue: number;
  /**
   * The default sits straight up and the ring lights from it both ways (speed, pitch), instead
   * of lighting from the minimum
   */
  centered?: boolean;
  onChange: (value: number) => void;
  /** The value as the display shows it */
  format: (value: number) => string;
  /** Silenced (a muted level): ring and display go grey, the value stays */
  off?: boolean;
  /** "md": the dock's knobs; "sm": inside a panel title or a module */
  size?: "sm" | "md";
  /** "stack": caption over the display, beside the knob; "row": all on one line */
  layout?: "stack" | "row";
  /** Right-click menu items (presets, fine tuning…); a corner mark shows there is one */
  menu?: ReactNode;
  /** What the right button opens, said in the tooltip */
  rightClick?: string;
  /** Keys after the display (a mute key) */
  children?: ReactNode;
  className?: string;
}

/**
 * A knob as on a mixer, with its value in an amber display: drag up or down (Shift: fine),
 * turn the wheel (one step a notch), arrow keys, double-click for the default value. The
 * right button opens `menu`. One look for every level and setting of the app.
 */
export function Knob({
  label,
  caption,
  hint,
  value,
  current,
  min,
  max,
  step,
  notch = step,
  defaultValue,
  centered = false,
  onChange,
  format,
  off = false,
  size = "md",
  layout = "stack",
  menu,
  rightClick,
  children,
  className,
}: KnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const pivot = centered ? defaultValue : null;
  // The body's shading: one gradient per knob (React's ids hold colons, not allowed in url())
  const shade = `knob-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const set = (next: number) => {
    const snapped = Math.round(clamp(next, min, max) / step) * step;
    // Steps like 0.01 leave float dust (0.7000000001): keep the step's own decimals
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));
    const clean = Number(snapped.toFixed(decimals));
    if (clean !== current()) onChange(clean);
  };
  useWheelSteps(knobRef, (turn) => set(current() + turn * notch));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    knobRef.current?.focus();
    let lastY = event.clientY;
    // The turn follows the hand smoothly; the steps only show in what is sent
    let turn = shareOf(current(), min, max, pivot);
    followPointer(event, (move) => {
      const travel = (lastY - move.clientY) * (move.shiftKey ? 0.1 : 1);
      lastY = move.clientY;
      turn = clamp(turn + travel / TRAVEL_PX, 0, 1);
      set(valueAt(turn, min, max, pivot));
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
    };
    const by = steps[event.key];
    if (by === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    set(current() + by * (event.shiftKey ? step : notch));
  };

  const angle = angleOf(shareOf(value, min, max, pivot));
  const from = centered ? angleOf(0.5) : SWEEP_FROM;
  const [lit0, lit1] = angle < from ? [angle, from] : [from, angle];
  const px = size === "md" ? 40 : 24;
  const ring = off ? "var(--color-fg-subtle)" : "var(--color-accent)";
  const text = format(value);

  const knob = (
    <div
      ref={knobRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={text}
      onPointerDown={onPointerDown}
      onDoubleClick={() => set(defaultValue)}
      onKeyDown={onKeyDown}
      className="relative shrink-0 cursor-ns-resize touch-none rounded-full outline-none focus-visible:ring-1 focus-visible:ring-accent"
      style={{ width: px, height: px }}
    >
      <svg viewBox="0 0 100 100" className="size-full" aria-hidden>
        <defs>
          <radialGradient id={shade} cx="40%" cy="32%" r="75%">
            <stop offset="0" stopColor="var(--color-thumb-from)" />
            <stop offset="1" stopColor="var(--color-thumb-to)" />
          </radialGradient>
        </defs>
        <path
          d={arc(43, SWEEP_FROM, SWEEP_FROM + SWEEP)}
          fill="none"
          stroke="var(--color-led-off)"
          strokeWidth={8}
          strokeLinecap="round"
        />
        {lit1 - lit0 > 0.01 && (
          <path
            d={arc(43, lit0, lit1)}
            fill="none"
            stroke={ring}
            strokeWidth={8}
            strokeLinecap="round"
          />
        )}
        <circle
          cx={50}
          cy={50}
          r={31}
          fill={`url(#${shade})`}
          stroke="var(--color-edge)"
          strokeWidth={2}
        />
        <line
          x1={50 + 9 * Math.cos(angle)}
          y1={50 + 9 * Math.sin(angle)}
          x2={50 + 26 * Math.cos(angle)}
          y2={50 + 26 * Math.sin(angle)}
          stroke={off ? "var(--color-fg-subtle)" : "var(--color-fg)"}
          strokeWidth={6}
          strokeLinecap="round"
        />
      </svg>
      {menu && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 bottom-0 size-[5px] bg-fg-subtle [clip-path:polygon(100%_0,100%_100%,0_100%)]"
        />
      )}
    </div>
  );

  const display = (
    <span
      className={cn(
        "lcd rounded-control px-1 text-center font-mono tabular leading-[18px]",
        size === "md" ? "h-5 w-[52px] text-[11px]" : "h-[18px] w-11 text-[10px] leading-4",
        off && "text-fg-subtle [text-shadow:none]",
      )}
    >
      {text}
    </span>
  );
  const name = (
    <span className="text-[10px] leading-none font-medium tracking-[0.1em] whitespace-nowrap text-fg-subtle uppercase">
      {caption}
    </span>
  );

  const body = (
    <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
      {knob}
      {layout === "stack" ? (
        <div className="flex flex-col items-start gap-1">
          {name}
          {display}
          {children}
        </div>
      ) : (
        <>
          {name}
          {display}
          {children}
        </>
      )}
    </div>
  );

  const tooltip = `${label} ${text}${hint ? ` — ${hint}` : ""}`;
  if (!menu) return <Tooltip label={tooltip}>{body}</Tooltip>;
  return (
    <ContextMenu.Root>
      <Tooltip label={tooltip} rightClick={rightClick}>
        <ContextMenu.Trigger asChild>{body}</ContextMenu.Trigger>
      </Tooltip>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContent}>{menu}</ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
