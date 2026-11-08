import { Guitar, Play, Speech, Square, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { OptionsKey } from "@/components/ui/OptionsKey";
import { Stepper } from "@/components/ui/Stepper";
import { Tooltip } from "@/components/ui/Tooltip";
import { FretboardStrip } from "@/features/fretboard/FretboardStrip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { useFretboardStore } from "@/stores/fretboard";
import {
  COUNT_IN_BARS,
  CROSS,
  currentPulses,
  playedPart,
  SUBDIVISIONS,
  shownSetup,
  useMetronomeStore,
} from "@/stores/metronome";
import { BeatStrip } from "./BeatStrip";
import { SWING_MAX, SWING_STRAIGHT, SWING_TRIPLET } from "./beatGrid";
import { MeterMenu } from "./MeterMenu";
import { MetronomeSide, SequenceBanner } from "./MetronomeSide";
import { barAndPulse, formatElapsed } from "./meterChoices";
import { toggleMetronomeRun } from "./metronomeEngine";
import { TempoDial } from "./TempoDial";
import { TapKey } from "./TempoPanel";
import { useBeats } from "./useBeats";

const m = t.metronome;
const SUBDIVISION_LABELS: Record<number, string> = {
  1: "1",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
};

/** A labelled row of the controls, its hint on the label. */
function Control({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Tooltip label={hint}>
        <span className="panel-label cursor-help">{label}</span>
      </Tooltip>
      {children}
    </div>
  );
}

/** A control of the deck: its label printed above it, so the three columns line up. */
function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <Tooltip label={hint}>
        <span className="panel-label cursor-help">{label}</span>
      </Tooltip>
      {children}
    </div>
  );
}

function RhythmControls() {
  const subdivision = useMetronomeStore((s) => s.subdivision);
  const swing = useMetronomeStore((s) => s.swing);
  const cross = useMetronomeStore((s) => s.cross);
  const beats = useMetronomeStore((s) => s.beats);
  const update = useMetronomeStore((s) => s.update);
  // Swing moves the second click of every pair: it needs pairs in the pulse
  const swingable = subdivision % 2 === 0;

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-4 rounded-panel border border-edge bg-surface/40 px-5 py-4 sm:grid-cols-[auto_auto_auto] sm:justify-between">
      <Field label={m.subdivision} hint={m.subdivisions[subdivision] ?? ""}>
        <div role="radiogroup" aria-label={m.subdivision} className="inline-flex gap-1">
          {SUBDIVISIONS.map((value) => (
            <Tooltip key={value} label={m.subdivisions[value] ?? ""}>
              <Chip
                role="radio"
                aria-checked={value === subdivision}
                active={value === subdivision}
                onClick={() => update({ subdivision: value })}
                className="h-7 min-w-8 font-mono text-xs"
              >
                {SUBDIVISION_LABELS[value]}
              </Chip>
            </Tooltip>
          ))}
        </div>
      </Field>
      <Field label={m.swing} hint={m.swingHint}>
        <Stepper
          label={m.swing}
          value={swing}
          min={SWING_STRAIGHT}
          max={SWING_MAX}
          step={0.01}
          defaultValue={SWING_STRAIGHT}
          disabled={!swingable}
          onChange={(value) => update({ swing: value })}
          format={(value) =>
            Math.abs(value - SWING_TRIPLET) < 0.005 ? "67% ♪³" : `${Math.round(value * 100)}%`
          }
        />
      </Field>
      <Field label={m.cross} hint={m.crossHint}>
        <Stepper
          label={m.cross}
          value={cross}
          min={0}
          max={CROSS.max}
          step={1}
          defaultValue={0}
          // One pulse over the bar is no cross rhythm: from off it goes to 2, from 2 back to off
          onChange={(value) =>
            update({ cross: value === 1 ? (cross === 0 ? CROSS.min : 0) : value })
          }
          format={(value) => (value === 0 ? m.crossOff : `${value}:${beats}`)}
        />
      </Field>
    </div>
  );
}

/** Play / stop, count-in, volume, and a readout of the bar and the time since the start. */
function MetronomeTransport() {
  const running = useMetronomeStore((s) => s.running);
  const countInBars = useMetronomeStore((s) => s.countInBars);
  const volume = useMetronomeStore((s) => s.volume);
  const update = useMetronomeStore((s) => s.update);
  const barRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);

  useAnimationFrame((now) => {
    const state = useMetronomeStore.getState();
    const pulses = currentPulses(now);
    const { beats } = shownSetup(state);
    const part = playedPart(state);
    if (barRef.current) {
      if (pulses === null) {
        barRef.current.textContent = m.ready;
      } else {
        const { bar, pulse } = barAndPulse(pulses, beats);
        const ofBars = part ? `/${part.bars}` : "";
        barRef.current.textContent =
          pulses < 0
            ? `${m.countingIn} ${pulse + 1}/${beats}`
            : `${m.bar} ${bar}${ofBars} · ${pulse + 1}/${beats}`;
      }
    }
    if (timeRef.current) {
      timeRef.current.textContent = formatElapsed(
        state.running ? (now - state.startedAt) / 1000 : 0,
      );
    }
  });

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-edge bg-[linear-gradient(var(--color-dock-from),var(--color-dock-to))] px-4 py-3">
      <Tooltip label={running ? m.stop : m.start} shortcut="playPause">
        <Button
          variant="hardware"
          size="lg-key"
          active={running}
          led="amber"
          onClick={toggleMetronomeRun}
          aria-label={running ? m.stop : m.start}
          aria-pressed={running}
        >
          {running ? (
            <Square className="size-5 fill-current" />
          ) : (
            <Play className="size-5 fill-current" />
          )}
        </Button>
      </Tooltip>
      <Control label={m.countIn} hint={m.countInHint}>
        <Stepper
          label={m.countIn}
          value={countInBars}
          min={COUNT_IN_BARS.min}
          max={COUNT_IN_BARS.max}
          step={1}
          defaultValue={0}
          onChange={(value) => update({ countInBars: value })}
          format={(value) => (value === 0 ? m.countInOff : m.bars(value))}
        />
      </Control>
      <FlashKey />
      <NeckKey />
      <VoiceKey />
      <div className="lcd flex h-10 items-center gap-4 rounded-panel px-3 font-mono text-sm tabular">
        <span ref={barRef} className="min-w-36 text-lcd-fg lcd-glow" />
        <Tooltip label={m.elapsed}>
          <span ref={timeRef} className="text-lcd-dim" />
        </Tooltip>
      </div>
      <div className="ml-auto">
        <Control label={m.volume} hint={m.volume}>
          <Stepper
            label={m.volume}
            value={volume}
            min={0}
            max={1}
            step={0.05}
            defaultValue={0.8}
            onChange={(value) => update({ volume: value })}
            format={(value) => `${Math.round(value * 100)}%`}
          />
        </Control>
      </div>
    </div>
  );
}

/** ON / OFF key with a lamp, like the count-in key of a DAW: the screen flash. */
function FlashKey() {
  const flash = useMetronomeStore((s) => s.flash);
  const setFlash = useMetronomeStore((s) => s.setFlash);
  return (
    <Tooltip label={m.flashHint}>
      <Button
        variant="hardware"
        size="lg-key"
        active={flash}
        led="amber"
        onClick={() => setFlash(!flash)}
        aria-label={m.flash}
        aria-pressed={flash}
      >
        <Sun className="size-4" />
      </Button>
    </Tooltip>
  );
}

/**
 * ON / OFF key with a lamp: the counting voice. The right button opens its options (the "e"
 * on the subdivisions, its volume), like the keys of a DAW.
 */
function VoiceKey() {
  const voice = useMetronomeStore((s) => s.voice);
  const setVoice = useMetronomeStore((s) => s.setVoice);
  return (
    <OptionsKey
      label={m.voiceHint}
      rightClick={m.voiceRight}
      size="lg-key"
      active={voice.on}
      led="amber"
      onClick={() => setVoice({ on: !voice.on })}
      aria-label={m.voice}
      aria-pressed={voice.on}
      panelClassName="w-72 space-y-3 p-3"
      panel={
        <>
          <div className="flex items-center justify-between gap-3">
            <Tooltip label={m.voiceSubdivisionsHint}>
              <span className="text-xs text-fg">{m.voiceSubdivisions}</span>
            </Tooltip>
            <Chip
              active={voice.subdivisions}
              onClick={() => setVoice({ subdivisions: !voice.subdivisions })}
              aria-pressed={voice.subdivisions}
            >
              {voice.subdivisions ? "ON" : "OFF"}
            </Chip>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-fg">{m.voiceLevel}</span>
            <Stepper
              label={m.voiceLevel}
              value={voice.level}
              min={0}
              max={1}
              step={0.05}
              defaultValue={0.9}
              onChange={(level) => setVoice({ level })}
              format={(value) => `${Math.round(value * 100)}%`}
            />
          </div>
        </>
      }
    >
      <Speech className="size-4" />
    </OptionsKey>
  );
}

/** ON / OFF key with a lamp: the guitar neck under the metronome. */
function NeckKey() {
  const enabled = useFretboardStore((s) => s.enabled);
  const setEnabled = useFretboardStore((s) => s.setEnabled);
  return (
    <Tooltip label={m.neck.toggleHint}>
      <Button
        variant="hardware"
        size="lg-key"
        active={enabled}
        led="amber"
        onClick={() => setEnabled(!enabled)}
        aria-label={m.neck.title}
        aria-pressed={enabled}
      >
        <Guitar className="size-4" />
      </Button>
    </Tooltip>
  );
}

/** The whole metronome lights up on every beat when the flash is on. */
function ScreenFlash() {
  const flash = useMetronomeStore((s) => s.flash);
  const ref = useRef<HTMLDivElement>(null);
  useBeats((kind) => {
    if (!flash) return;
    // Started from code on every beat: a CSS class left over from the last beat would keep
    // the animation from starting again (it flashed only once)
    const accent = kind === "accent";
    ref.current?.animate([{ opacity: accent ? 0.28 : 0.1 }, { opacity: 0 }], {
      duration: accent ? 220 : 160,
      easing: "ease-out",
    });
  });
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 bg-accent opacity-0"
    />
  );
}

/** The controls of the own setup: resting while a sequence plays its own parts. */
function Editable({ children }: { children: ReactNode }) {
  const locked = useMetronomeStore((s) => s.sequence !== null);
  return <div className={locked ? "pointer-events-none opacity-50" : undefined}>{children}</div>;
}

/**
 * The metronome on its own, also without a track: tempo and bar on displays, the bar to
 * click, the rhythm keys, and its own transport at the foot. Space starts and stops it.
 * Beside it the exercises, the songs and the sequences.
 */
export function MetronomeView() {
  // With the neck shown the dial gives up some height, so both fit without scrolling
  const neck = useFretboardStore((s) => s.enabled);
  return (
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1">
        <ScreenFlash />
        {/* Centred with auto margins, not justify-center: when it does not fit, it scrolls
            from the top instead of cutting the dial off above */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-6 py-5">
          <div
            className={cn(
              "mx-auto my-auto flex w-full max-w-4xl flex-col",
              neck ? "gap-3.5" : "gap-5",
            )}
          >
            <SequenceBanner />
            <Editable>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
                <div className="justify-self-end">
                  <MeterMenu />
                </div>
                <TempoDial compact={neck} />
                <div className="justify-self-start">
                  <TapKey />
                </div>
              </div>
            </Editable>
            <section className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="panel-label">{m.accents}</h3>
                <span className="text-[11px] text-fg-subtle">{m.accentsHint}</span>
              </div>
              <Editable>
                <BeatStrip />
              </Editable>
            </section>
            <Editable>
              <RhythmControls />
            </Editable>
            <FretboardStrip />
          </div>
        </div>
        <MetronomeSide />
      </div>
      <MetronomeTransport />
    </div>
  );
}
