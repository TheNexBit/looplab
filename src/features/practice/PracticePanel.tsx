import { Crosshair, Hand, NotebookPen, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { NumberField, parseNumber } from "@/components/ui/NumberField";
import { Slider } from "@/components/ui/Slider";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatSpeed } from "@/features/player/limits";
import { t } from "@/i18n";
import { useDiaryStore } from "@/stores/diary";
import { useLoopStore } from "@/stores/loop";
import { usePlayerStore } from "@/stores/player";
import { usePracticeStore } from "@/stores/practice";
import { SETTING_LIMITS, useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import { setDownbeatHere, tapBeat } from "./actions";
import { formatDuration, trackSummary } from "./diaryStats";
import { TimeSignaturePicker } from "./TimeSignaturePicker";
import { BPM, COUNT_IN_CHOICES, repetitionsToNextStep } from "./tempo";
import { trainerPlan } from "./trainer";

const p = t.practice;
/** Percentages are typed as numbers: "75" → 0.75. */
const parsePercent = (text: string) => {
  const value = parseNumber(text);
  return value === null ? null : value / 100;
};
const FIELD = "well h-6 w-16 rounded-control";

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="panel-label">{title}</h3>
      {children}
      {hint && <p className="text-[11px] text-fg-subtle">{hint}</p>}
    </section>
  );
}

function TempoGroup() {
  const bpm = usePracticeStore((s) => s.bpm);
  const hasTrack = usePlayerStore((s) => s.track !== null);
  const showGrid = useSettingsStore((s) => s.showGrid);
  return (
    <Group title={p.tempo} hint={p.bpmHint}>
      <div className="flex flex-wrap items-center gap-1.5">
        <NumberField
          label={p.bpm}
          value={bpm ?? BPM.default}
          min={BPM.min}
          max={BPM.max}
          step={BPM.step}
          onChange={(value) => usePracticeStore.getState().setBpm(value)}
          format={(value) => (bpm === null ? p.noBpm : `${value} ${p.bpm}`)}
          className={`${FIELD} w-24`}
        />
        <Tooltip label={p.tapHint} shortcut="tapTempo">
          <Button variant="hardware" disabled={!hasTrack} onClick={tapBeat}>
            <Hand className="size-3.5" />
            {p.tap}
          </Button>
        </Tooltip>
        {bpm !== null && (
          <Button
            size="icon"
            className="size-6"
            onClick={() => usePracticeStore.getState().setBpm(null)}
            aria-label={p.clearBpm}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Tooltip label={p.gridHint}>
          <Chip
            active={showGrid}
            aria-pressed={showGrid}
            onClick={() => useSettingsStore.getState().update({ showGrid: !showGrid })}
          >
            {p.grid}
          </Chip>
        </Tooltip>
        <TimeSignaturePicker />
        <Tooltip label={p.downbeatHint} shortcut="setDownbeat">
          <Button variant="hardware" disabled={!hasTrack || bpm === null} onClick={setDownbeatHere}>
            <Crosshair className="size-3.5" />
            {p.downbeat}
          </Button>
        </Tooltip>
      </div>
    </Group>
  );
}

function ClickGroup() {
  const settings = useSettingsStore();
  const hasBpm = usePracticeStore((s) => s.bpm !== null);
  return (
    <>
      <Group title={p.countIn} hint={p.countInHint}>
        <div className="flex flex-wrap gap-1">
          {COUNT_IN_CHOICES.map((bars) => (
            <Chip
              key={bars}
              active={settings.countInBars === bars}
              aria-pressed={settings.countInBars === bars}
              onClick={() => settings.update({ countInBars: bars })}
            >
              {bars === 0 ? p.countInOff : bars === 1 ? p.oneBar : `${bars} ${p.bars}`}
            </Chip>
          ))}
        </div>
      </Group>
      <Group title={p.metronome} hint={p.metronomeHint}>
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            active={settings.metronome}
            aria-pressed={settings.metronome}
            onClick={() => settings.update({ metronome: !settings.metronome })}
          >
            {p.metronome}
          </Chip>
          <Slider
            label={p.volume}
            value={settings.clickVolume}
            defaultValue={0.6}
            min={SETTING_LIMITS.clickVolume.min}
            max={SETTING_LIMITS.clickVolume.max}
            step={SETTING_LIMITS.clickVolume.step}
            onChange={(clickVolume) => settings.update({ clickVolume })}
            format={(value) => `${Math.round(value * 100)}%`}
            parse={parsePercent}
            trackClassName="w-16"
          />
        </div>
      </Group>
      {!hasBpm && (settings.countInBars > 0 || settings.metronome) && (
        <p className="well rounded-control px-2 py-1.5 text-[11px] text-lcd-fg">{p.needsTempo}</p>
      )}
    </>
  );
}

function TrainerGroup() {
  const settings = useSettingsStore();
  const repetitions = usePracticeStore((s) => s.repetitions);
  const speed = usePlayerStore((s) => s.speed);
  const hasLoop = useLoopStore((s) => s.enabled && s.region() !== null);
  const toNext = repetitionsToNextStep(trainerPlan(settings), repetitions);
  const L = SETTING_LIMITS;

  const percentField = (key: "trainerFrom" | "trainerTo" | "trainerStep", label: string) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-fg-muted">{label}</span>
      <NumberField
        label={`${p.trainer}: ${label}`}
        value={settings[key]}
        min={L[key].min}
        max={L[key].max}
        step={L[key].step}
        onChange={(value) => settings.update({ [key]: value })}
        format={formatSpeed}
        parse={parsePercent}
        className={FIELD}
      />
    </div>
  );

  return (
    <Group title={p.trainer} hint={p.trainerHint}>
      <Chip
        active={settings.trainer}
        aria-pressed={settings.trainer}
        onClick={() => settings.update({ trainer: !settings.trainer })}
      >
        {p.trainerOn}
      </Chip>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {percentField("trainerFrom", p.from)}
        {percentField("trainerTo", p.to)}
        {percentField("trainerStep", p.step)}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-fg-muted">{p.every}</span>
          <NumberField
            label={`${p.trainer}: ${p.every}`}
            value={settings.trainerEvery}
            min={L.trainerEvery.min}
            max={L.trainerEvery.max}
            step={L.trainerEvery.step}
            onChange={(value) => settings.update({ trainerEvery: Math.round(value) })}
            format={(value) => `${value} ${p.repetitionsUnit}`}
            className={FIELD}
          />
        </div>
      </div>
      {/* Live readout, like the display of a training machine */}
      <div className="well space-y-0.5 rounded-control px-2.5 py-1.5 font-mono text-[11px] tabular">
        {hasLoop ? (
          <>
            <p className="text-lcd-fg">
              {p.repetition} {repetitions + 1} · {formatSpeed(speed)}
            </p>
            {settings.trainer && (
              <p className="text-lcd-dim">
                {toNext === null ? p.atTarget : `${p.nextStep} ${toNext} ${p.repetitionsUnit}`}
              </p>
            )}
          </>
        ) : (
          <p className="text-lcd-dim">{p.needsLoop}</p>
        )}
      </div>
    </Group>
  );
}

function DiaryGroup() {
  const entries = useDiaryStore((s) => s.entries);
  const path = usePlayerStore((s) => s.track?.path);
  if (!path) return null;
  const summary = trackSummary(entries, path, new Date());
  const longest = Math.max(60, ...summary.week.map((day) => day.seconds));
  return (
    <Group title={t.diary.title} hint={t.diary.hint}>
      <div className="well space-y-2 rounded-control px-2.5 py-2">
        <div className="flex justify-between font-mono text-[11px] tabular">
          <span className="text-lcd-fg">
            {t.diary.today} {formatDuration(summary.today)}
          </span>
          <span className="text-lcd-dim">
            {t.diary.total} {formatDuration(summary.total)}
          </span>
        </div>
        {/* Last 7 days, like the level meters of a mixer */}
        <div className="flex h-10 items-end gap-1" role="img" aria-label={t.diary.week}>
          {summary.week.map(({ day, seconds }) => (
            <div
              key={day}
              title={`${day}: ${formatDuration(seconds)}`}
              className={
                seconds > 0
                  ? "flex-1 rounded-[1px] bg-accent/70"
                  : "flex-1 rounded-[1px] bg-led-off/60"
              }
              style={{ height: `${Math.max(6, (seconds / longest) * 100)}%` }}
            />
          ))}
        </div>
      </div>
      <Button variant="hardware" onClick={() => useUiStore.getState().openDialog("diary")}>
        <NotebookPen className="size-3.5" />
        {t.diary.open}
      </Button>
    </Group>
  );
}

/** Side panel tab: tempo, count-in, metronome, the speed trainer and the diary. */
export function PracticePanel() {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <TempoGroup />
      <ClickGroup />
      <TrainerGroup />
      <DiaryGroup />
    </div>
  );
}
