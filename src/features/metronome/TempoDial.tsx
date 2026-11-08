import { ChevronDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { useWheelSteps } from "@/lib/useWheelSteps";
import {
  METRONOME_BPM,
  pulsesPerMinute,
  quartersPerMinute,
  shownSetup,
  useMetronomeStore,
} from "@/stores/metronome";
import {
  angleOf,
  arcPath,
  C,
  FASTER_ARC,
  polar,
  RADIUS,
  SHOULDER_STROKE,
  SIZE,
  SLOWER_ARC,
  SPAN,
  START_DEG,
  SWEEP_DEG,
  shoulderCentre,
  TICKS,
} from "./dialGeometry";
import { tempoMarking } from "./meterChoices";
import { NOTE, nudgeBpm, TempoBaseItems } from "./TempoPanel";
import { restartAnimation, useBeats } from "./useBeats";

const m = t.metronome;

/** Press and hold to run through the scale, like a hardware key: one step, then repeats. */
function useHold(step: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const stop = () => {
    window.clearTimeout(timer.current);
    window.clearInterval(timer.current);
    timer.current = undefined;
  };
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearInterval(timer.current);
    },
    [],
  );
  return {
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      step();
      stop();
      timer.current = window.setTimeout(() => {
        timer.current = window.setInterval(step, 60);
      }, 380);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  };
}

type ShoulderState = "idle" | "hover" | "press";

/** − or + drawn as a thick piece of the ring's own opening, with a real button over it. */
function Shoulder({ arc, sign }: { arc: [number, number]; sign: 1 | -1 }) {
  const [state, setState] = useState<ShoulderState>("idle");
  const hold = useHold(() => nudgeBpm(sign));
  const [x, y] = shoulderCentre(arc);
  const glyph = SHOULDER_STROKE * 0.38;
  const lit = state === "press";
  const ink = lit ? "var(--color-on-accent)" : "var(--color-fg)";
  return (
    <g>
      <path
        d={arcPath(RADIUS, arc[0], arc[1])}
        fill="none"
        strokeWidth={SHOULDER_STROKE}
        strokeLinecap="round"
        stroke={
          lit
            ? "var(--color-accent)"
            : state === "hover"
              ? "var(--color-surface-hover)"
              : "var(--color-surface)"
        }
        style={{ transition: "stroke 120ms ease-out" }}
      />
      <line
        x1={x - glyph}
        y1={y}
        x2={x + glyph}
        y2={y}
        stroke={ink}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      {sign === 1 && (
        <line
          x1={x}
          y1={y - glyph}
          x2={x}
          y2={y + glyph}
          stroke={ink}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      )}
      {/* The hit area: a fat transparent copy of the shoulder */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the − / + keys are also on the keyboard (↑ ↓, + −) */}
      <path
        d={arcPath(RADIUS, arc[0] - 4, arc[1] + 4)}
        fill="none"
        stroke="transparent"
        strokeWidth={SHOULDER_STROKE + 14}
        className="cursor-pointer"
        aria-label={`${m.tempo} ${sign === 1 ? "+" : "−"}`}
        {...hold}
        onPointerDown={(event) => {
          setState("press");
          hold.onPointerDown(event);
        }}
        onPointerUp={() => {
          setState("hover");
          hold.onPointerUp();
        }}
        onPointerEnter={() => setState("hover")}
        onPointerLeave={() => {
          setState("idle");
          hold.onPointerLeave();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      />
    </g>
  );
}

/**
 * The tempo as MetroFlow's dial: a gauge from 20 to 400 that fills up to the tempo, the
 * number on a round display inside it. Turn it by dragging around the ring (finer the
 * farther out), with the wheel, ↑ ↓ or the − / + in its opening (hold to run); double-click
 * for 120. Every beat breathes the arc and an accent lights the whole ring, so the click is
 * seen out of the corner of an eye. Its label (or the right button) opens what the BPM count.
 */
export function TempoDial({ compact = false }: { compact?: boolean }) {
  const bpm = useMetronomeStore((s) => shownSetup(s).bpm);
  const unit = useMetronomeStore((s) => shownSetup(s).unit);
  const tempoBase = useMetronomeStore((s) => shownSetup(s).tempoBase);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useWheelSteps(wrap, (step) => nudgeBpm(step));

  const rounded = Math.round(bpm);
  const tempo = { bpm: rounded, unit, tempoBase };
  const counted = tempoBase === "pulse" ? (NOTE[unit] ?? "") : NOTE[4];
  const other =
    unit === 4
      ? null
      : tempoBase === "pulse"
        ? m.pulseRate(NOTE[4] ?? "", Math.round(quartersPerMinute(tempo)))
        : m.pulseRate(NOTE[unit] ?? "", Math.round(pulsesPerMinute(tempo)));

  // Angular drag: the pointer's angle around the centre moves the value; precision grows
  // with the distance from the centre, the trick of pro audio knobs
  const drag = useRef<{ angle: number; value: number } | null>(null);
  const geometry = (event: ReactPointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    return {
      deg: (Math.atan2(dy, dx) * 180) / Math.PI,
      dist: Math.hypot(dx, dy) * (SIZE / box.width),
    };
  };
  const setBpm = (value: number) => {
    const next = Math.round(Math.min(METRONOME_BPM.max, Math.max(METRONOME_BPM.min, value)));
    if (next !== Math.round(useMetronomeStore.getState().bpm)) {
      useMetronomeStore.getState().update({ bpm: next });
    }
  };

  // The beat, outside React: a copy of the arc breathes, an accent lights the whole ring
  // and a ring lands on the rim from outside
  const breath = useRef<SVGPathElement>(null);
  const accentBreath = useRef<SVGPathElement>(null);
  const strike = useRef<SVGCircleElement>(null);
  useBeats((kind) => {
    if (kind === "accent") {
      restartAnimation(accentBreath.current, "dial-breath");
      restartAnimation(strike.current, "dial-strike");
    } else {
      restartAnimation(breath.current, "dial-breath");
    }
  });

  const knobAngle = angleOf(rounded);
  const [knobX, knobY] = polar(RADIUS, knobAngle);
  const tempoArc = arcPath(RADIUS, START_DEG, Math.max(START_DEG + 0.01, knobAngle));
  const fullRing = arcPath(RADIUS, START_DEG, START_DEG + SWEEP_DEG);

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <Tooltip label={m.tempoHint} rightClick={m.tempoBaseRight}>
        <div
          ref={wrap}
          role="slider"
          tabIndex={0}
          aria-label={m.tempo}
          aria-valuemin={METRONOME_BPM.min}
          aria-valuemax={METRONOME_BPM.max}
          aria-valuenow={rounded}
          aria-valuetext={`${rounded} BPM`}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 10 : 1;
            let by = 0;
            if (event.key === "ArrowUp" || event.key === "ArrowRight") by = step;
            else if (event.key === "ArrowDown" || event.key === "ArrowLeft") by = -step;
            if (by === 0) return;
            event.preventDefault();
            event.stopPropagation();
            nudgeBpm(by);
          }}
          className={cn(
            "relative aspect-square shrink-0 rounded-full outline-none focus-visible:ring-1 focus-visible:ring-accent",
            compact ? "w-[min(240px,26vh)]" : "w-[min(340px,46vh)]",
          )}
        >
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            aria-hidden="true"
            className="size-full cursor-grab touch-none overflow-visible outline-none select-none active:cursor-grabbing"
            onPointerDown={(event) => {
              if (event.button !== 0 || (event.target as Element).closest("button")) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                angle: geometry(event).deg,
                value: useMetronomeStore.getState().bpm,
              };
            }}
            onPointerMove={(event) => {
              const current = drag.current;
              if (!current) return;
              const { deg, dist } = geometry(event);
              let delta = deg - current.angle;
              if (delta > 180) delta -= 360;
              if (delta < -180) delta += 360;
              current.angle = deg;
              const precision = Math.min(1, (RADIUS + 24) / Math.max(dist, 1));
              current.value = Math.min(
                METRONOME_BPM.max,
                Math.max(METRONOME_BPM.min, current.value + (delta / SWEEP_DEG) * SPAN * precision),
              );
              setBpm(current.value);
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onDoubleClick={() => setBpm(METRONOME_BPM.default)}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenuOpen(true);
            }}
          >
            {/* Recessed plate the gauge sits on */}
            <circle
              cx={C}
              cy={C}
              r={RADIUS + 22}
              fill="var(--color-well)"
              stroke="var(--color-edge)"
              strokeWidth={1}
            />
            {/* Scale */}
            {TICKS.map((tick) => {
              const angle = angleOf(tick.value);
              const [x1, y1] = polar(RADIUS - (tick.major ? 16 : 9), angle);
              const [x2, y2] = polar(RADIUS - 4, angle);
              const [tx, ty] = polar(RADIUS - 30, angle);
              return (
                <g key={tick.value}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={tick.major ? "var(--color-fg-muted)" : "var(--color-fg-subtle)"}
                    strokeWidth={tick.major ? 2 : 1}
                    strokeLinecap="round"
                    opacity={tick.major ? 0.8 : 0.45}
                  />
                  {tick.major && (
                    <text
                      x={tx}
                      y={ty}
                      fill="var(--color-fg-subtle)"
                      fontSize={10}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="font-mono tabular"
                    >
                      {tick.value}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Track and the arc up to the tempo */}
            <path
              d={fullRing}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth={8}
              strokeLinecap="round"
            />
            <path
              d={tempoArc}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={8}
              strokeLinecap="round"
              style={{ filter: "drop-shadow(0 0 4px var(--color-accent-soft))" }}
            />

            {/* The beat */}
            <path
              ref={breath}
              d={tempoArc}
              fill="none"
              stroke="var(--color-accent-hover)"
              strokeWidth={14}
              strokeLinecap="round"
              opacity={0}
              style={{ "--breath-opacity": 0.75 } as CSSProperties}
            />
            <path
              ref={accentBreath}
              d={fullRing}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={16}
              strokeLinecap="round"
              opacity={0}
              style={{ "--breath-opacity": 1 } as CSSProperties}
            />
            <circle
              ref={strike}
              cx={C}
              cy={C}
              r={RADIUS}
              fill="none"
              stroke="var(--color-accent-hover)"
              strokeWidth={4.5}
              opacity={0}
              style={{ transformOrigin: "center", transformBox: "fill-box" }}
            />

            <Shoulder arc={SLOWER_ARC} sign={-1} />
            <Shoulder arc={FASTER_ARC} sign={1} />

            {/* Knob */}
            <circle
              cx={knobX}
              cy={knobY}
              r={10}
              fill="var(--color-lcd)"
              stroke="var(--color-accent)"
              strokeWidth={4}
            />

            {/* Round display with the number */}
            <circle
              cx={C}
              cy={C}
              r={74}
              fill="var(--color-lcd)"
              stroke="var(--color-edge)"
              strokeWidth={1.5}
            />
            <foreignObject x={C - 74} y={C - 62} width={148} height={124}>
              <div className="flex size-full flex-col items-center justify-center gap-0.5">
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    aria-label={m.tempoBase}
                    onDoubleClick={(event) => event.stopPropagation()}
                    className="flex cursor-pointer items-center gap-0.5 rounded-sm px-1 text-[9px] font-medium tracking-[0.16em] text-lcd-dim uppercase hover:text-lcd-fg focus-visible:outline-none"
                  >
                    BPM {counted}
                    <ChevronDown className="size-2.5" />
                  </button>
                </DropdownMenu.Trigger>
                <span className="font-mono text-[50px] leading-none font-medium text-lcd-fg tabular lcd-glow">
                  {rounded}
                </span>
                <span className="font-mono text-[10px] text-lcd-dim">{tempoMarking(rounded)}</span>
                {other && <span className="font-mono text-[10px] text-lcd-dim">{other}</span>}
              </div>
            </foreignObject>
          </svg>
        </div>
      </Tooltip>
      <DropdownMenu.Portal>
        <TempoBaseItems />
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
