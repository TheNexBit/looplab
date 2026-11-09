import { Guitar, Play, Speech, Square, Sun } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { OptionsKey } from "@/components/ui/OptionsKey";
import { Stepper } from "@/components/ui/Stepper";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { useFretboardStore } from "@/stores/fretboard";
import {
  COUNT_IN_BARS,
  currentPulses,
  playedPart,
  shownSetup,
  useMetronomeStore,
} from "@/stores/metronome";
import { barAndPulse, formatElapsed } from "./meterChoices";
import { toggleMetronomeRun } from "./metronomeEngine";

const m = t.metronome;

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

/** Play / stop, count-in, volume, and a readout of the bar and the time since the start. */
export function MetronomeTransport() {
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
            <span className="text-xs text-fg">{m.voiceLanguage}</span>
            <span className="flex gap-1">
              {(["en", "it"] as const).map((language) => (
                <Chip
                  key={language}
                  active={voice.language === language}
                  onClick={() => setVoice({ language })}
                >
                  {language === "en" ? "English" : "Italiano"}
                </Chip>
              ))}
            </span>
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
