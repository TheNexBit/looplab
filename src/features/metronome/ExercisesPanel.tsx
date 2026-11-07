import { Eraser, Sparkles } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { ChoiceKeys } from "@/components/ui/ChoiceKeys";
import { OnOffKey } from "@/components/ui/OnOffKey";
import { Stepper } from "@/components/ui/Stepper";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { currentPulses, shownSetup, useMetronomeStore } from "@/stores/metronome";
import {
  type ExerciseSetup,
  gapSilentAt,
  EXERCISE_LIMITS as L,
  rhythmCells,
  rhythmFits,
  trainerBpmAt,
  useExercisesStore,
} from "@/stores/metronomeExercises";
import {
  DIFFICULTIES,
  type Difficulty,
  defaultSteps,
  fitSteps,
  generatePattern,
  type RhythmStep,
  strumDirection,
} from "./rhythmPattern";

const e = t.metronome.exercises;

/** One exercise: its name (hint on hover), its on/off key, its settings and a live line. */
function Exercise({
  title,
  hint,
  on,
  onChange,
  children,
}: {
  title: string;
  hint: string;
  on: boolean;
  onChange: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 border-b border-border pb-3 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <Tooltip label={hint}>
          <h3 className="panel-label cursor-help">{title}</h3>
        </Tooltip>
        <OnOffKey label={title} on={on} onChange={onChange} />
      </div>
      <div className={cn("space-y-1.5", !on && "opacity-60")}>{children}</div>
    </section>
  );
}

/** A setting of an exercise: a label and − / + (the wheel works too). */
function Amount({
  label,
  setting,
  format,
}: {
  label: string;
  setting: keyof typeof L;
  format: (value: number) => string;
}) {
  const value = useExercisesStore((s) => s[setting] as number);
  const limits = L[setting];
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-fg-muted">{label}</span>
      <Stepper
        label={label}
        value={value}
        min={limits.min}
        max={limits.max}
        step={limits.step}
        onChange={(next) => useExercisesStore.getState().update({ [setting]: next })}
        format={format}
      />
    </div>
  );
}

const bpm = (value: number) => `${value} BPM`;
const bars = (value: number) => t.metronome.bars(value);
const percent = (value: number) => `${Math.round(value * 100)}%`;

/** What the bar being heard means for the exercises, updated on every display frame. */
function LiveLine({ render }: { render: (bar: number, setup: ExerciseSetup) => string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useAnimationFrame(() => {
    if (!ref.current) return;
    const pulses = currentPulses();
    const { beats } = shownSetup(useMetronomeStore.getState());
    ref.current.textContent =
      pulses === null || pulses < 0
        ? " "
        : render(Math.floor(pulses / beats), useExercisesStore.getState());
  });
  return (
    <p ref={ref} className="well rounded-control px-2 py-1 font-mono text-[11px] text-readout" />
  );
}

function TrainerExercise() {
  const on = useExercisesStore((s) => s.trainer);
  return (
    <Exercise
      title={e.trainer}
      hint={e.trainerHint}
      on={on}
      onChange={(trainer) => useExercisesStore.getState().update({ trainer })}
    >
      <Amount label={e.from} setting="trainerFrom" format={bpm} />
      <Amount label={e.to} setting="trainerTo" format={bpm} />
      <Amount label={e.step} setting="trainerStep" format={(v) => `± ${v}`} />
      <Amount label={e.every} setting="trainerEvery" format={bars} />
      {on && (
        <LiveLine
          render={(bar, setup) => {
            const now = trainerBpmAt(setup, bar);
            const left = setup.trainerEvery - (bar % setup.trainerEvery);
            return now === setup.trainerTo ? e.trainerDone(now) : e.trainerNow(now, left);
          }}
        />
      )}
    </Exercise>
  );
}

function GapExercise() {
  const on = useExercisesStore((s) => s.gap);
  const grow = useExercisesStore((s) => s.gapGrow);
  return (
    <Exercise
      title={e.gap}
      hint={e.gapHint}
      on={on}
      onChange={(gap) => useExercisesStore.getState().update({ gap })}
    >
      <Amount label={e.gapLead} setting="gapLead" format={bars} />
      <Amount label={e.gapPlay} setting="gapPlay" format={bars} />
      <Amount label={e.gapSilent} setting="gapSilent" format={bars} />
      <div className="flex items-center justify-between gap-2">
        <Tooltip label={e.gapGrowHint}>
          <span className="cursor-help text-xs text-fg-muted">{e.gapGrow}</span>
        </Tooltip>
        <OnOffKey
          label={e.gapGrow}
          on={grow}
          onChange={(gapGrow) => useExercisesStore.getState().update({ gapGrow })}
        />
      </div>
      {on && (
        <LiveLine
          render={(bar, setup) => (gapSilentAt(setup, bar) ? e.gapSilentNow : e.gapPlayNow)}
        />
      )}
    </Exercise>
  );
}

function MuteExercise() {
  const on = useExercisesStore((s) => s.mute);
  return (
    <Exercise
      title={e.mute}
      hint={e.muteHint}
      on={on}
      onChange={(mute) => useExercisesStore.getState().update({ mute })}
    >
      <Amount label={e.muteChance} setting="muteChance" format={percent} />
    </Exercise>
  );
}

const stepLook: Record<RhythmStep, string> = {
  rest: "hw text-fg-subtle",
  note: "border-edge bg-accent/45 text-fg",
  accent: "border-edge bg-accent font-semibold text-on-accent",
};

function RhythmExercise() {
  const on = useExercisesStore((s) => s.rhythm);
  const barsCount = useExercisesStore((s) => s.rhythmBars);
  const steps = useExercisesStore((s) => s.rhythmSteps);
  const guide = useExercisesStore((s) => s.rhythmGuide);
  const beats = useMetronomeStore((s) => s.beats);
  const subdivision = useMetronomeStore((s) => s.subdivision);
  const fits = rhythmFits(beats, subdivision, barsCount);
  const cells = rhythmCells(beats, subdivision, barsCount);
  const perBar = beats * subdivision;
  const shown = fitSteps(steps, cells);
  const update = useExercisesStore.getState().update;
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Light the cell being played
  useAnimationFrame(() => {
    const pulses = currentPulses();
    const lit =
      pulses === null || pulses < 0 ? -1 : Math.floor(pulses * subdivision) % Math.max(1, cells);
    cellRefs.current.forEach((cell, index) => {
      if (cell) cell.dataset.lit = String(index === lit);
    });
  });

  const generate = (difficulty: Difficulty) =>
    update({
      rhythmSteps: generatePattern({
        perBar,
        bars: barsCount,
        ticksPerBeat: subdivision,
        difficulty,
      }),
    });

  return (
    <Exercise
      title={e.rhythm}
      hint={e.rhythmHint}
      on={on}
      onChange={(rhythm) =>
        update({
          rhythm,
          // A first rhythm to start from, instead of an empty grid
          ...(rhythm && steps.every((s) => s === "rest")
            ? { rhythmSteps: defaultSteps(perBar, cells) }
            : {}),
        })
      }
    >
      {!fits ? (
        <p className="text-xs text-fg-subtle">{e.rhythmNeeds}</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-fg-muted">{e.rhythmBars}</span>
            <ChoiceKeys
              label={e.rhythmBars}
              value={String(barsCount)}
              choices={[
                ["1", bars(1)],
                ["2", bars(2)],
              ]}
              onChange={(value) => update({ rhythmBars: Number(value) })}
            />
          </div>
          <div
            className="grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${Math.min(perBar, 16)}, minmax(0, 1fr))` }}
          >
            {shown.map((step, index) => {
              const tick = index % perBar;
              const down = strumDirection(tick, subdivisionId(subdivision)) === "down";
              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: one cell per click of the grid
                  key={index}
                  type="button"
                  ref={(cell) => {
                    cellRefs.current[index] = cell;
                  }}
                  title={e.rhythmCell(index + 1, e.rhythmSteps[step])}
                  onClick={() => useExercisesStore.getState().cycleStep(index, cells)}
                  className={cn(
                    "flex h-7 items-center justify-center rounded-[3px] border text-[11px] data-[lit=true]:ring-1 data-[lit=true]:ring-fg",
                    stepLook[step],
                    tick % subdivision === 0 && "ml-0.5",
                  )}
                >
                  {step === "rest" ? "·" : down ? "↓" : "↑"}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Sparkles className="size-3.5 text-fg-subtle" aria-hidden />
            {DIFFICULTIES.map((difficulty) => (
              <Button
                key={difficulty}
                variant="hardware"
                className="h-6 px-2"
                onClick={() => generate(difficulty)}
              >
                {e.difficulties[difficulty]}
              </Button>
            ))}
            <Tooltip label={e.clear}>
              <Button
                variant="hardware"
                size="icon"
                className="ml-auto size-6"
                onClick={() => update({ rhythmSteps: [] })}
                aria-label={e.clear}
              >
                <Eraser className="size-3.5" />
              </Button>
            </Tooltip>
          </div>
          <Amount
            label={e.rhythmTest}
            setting="rhythmTestEvery"
            format={(v) => (v === 0 ? t.metronome.crossOff : e.rhythmTestEvery(v))}
          />
          <div className="flex items-center justify-between gap-2">
            <Tooltip label={e.rhythmGuideHint}>
              <span className="cursor-help text-xs text-fg-muted">{e.rhythmGuide}</span>
            </Tooltip>
            <OnOffKey
              label={e.rhythmGuide}
              on={guide}
              onChange={(rhythmGuide) => update({ rhythmGuide })}
            />
          </div>
        </>
      )}
    </Exercise>
  );
}

/** MetroFlow's names of the subdivisions the rhythm is written in. */
function subdivisionId(subdivision: number) {
  return subdivision === 3 ? "triplet" : subdivision === 4 ? "sixteenth" : "eighth";
}

/** The exercises of the metronome. Each one can be on with the others. */
export function ExercisesPanel() {
  return (
    <div className="flex flex-col gap-3">
      <TrainerExercise />
      <GapExercise />
      <MuteExercise />
      <RhythmExercise />
    </div>
  );
}
