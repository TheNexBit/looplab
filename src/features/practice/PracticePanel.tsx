import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { NumberField, parsePercent } from "@/components/ui/NumberField";
import { t } from "@/i18n";
import { formatPercent } from "@/lib/format";
import { useDiaryStore } from "@/stores/diary";
import { useLoopStore } from "@/stores/loop";
import { usePlayerStore } from "@/stores/player";
import { usePracticeStore } from "@/stores/practice";
import { SETTING_LIMITS, useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import { formatDuration, trackSummary } from "./diaryStats";
import { Group } from "./Group";
import { ReferenceGroup } from "./ReferenceGroup";
import { repetitionsToNextStep } from "./tempo";
import { trainerPlan } from "./trainer";

const p = t.practice;
const FIELD = "well h-6 w-16 rounded-control";

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
        format={formatPercent}
        parse={parsePercent}
        className={FIELD}
      />
    </div>
  );

  return (
    <Group
      title={p.trainer}
      hint={p.trainerHint}
      action={
        <Chip
          active={settings.trainer}
          aria-pressed={settings.trainer}
          onClick={() => settings.update({ trainer: !settings.trainer })}
        >
          {p.trainerOn}
        </Chip>
      }
    >
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
            <p className="text-readout">
              {p.repetition} {repetitions + 1} · {formatPercent(speed)}
            </p>
            {settings.trainer && (
              <p className="text-readout-dim">
                {toNext === null ? p.atTarget : `${p.nextStep} ${toNext} ${p.repetitionsUnit}`}
              </p>
            )}
          </>
        ) : (
          <p className="text-readout-dim">{p.needsLoop}</p>
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
    <Group
      title={t.diary.title}
      hint={t.diary.hint}
      action={
        <Button variant="ghost" onClick={() => useUiStore.getState().openDialog("diary")}>
          <NotebookPen className="size-3.5" />
          {t.diary.open}
        </Button>
      }
    >
      <div className="well space-y-2 rounded-control px-2.5 py-2">
        <div className="flex justify-between font-mono text-[11px] tabular">
          <span className="text-readout">
            {t.diary.today} {formatDuration(summary.today)}
          </span>
          <span className="text-readout-dim">
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
    </Group>
  );
}

/**
 * Side panel tab: the speed trainer, the reference note and the diary. Tempo, metronome and count-in live in the
 * transport dock (`TempoModule`), where every DAW keeps them.
 */
export function PracticePanel() {
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-3">
      <TrainerGroup />
      <ReferenceGroup />
      <DiaryGroup />
    </div>
  );
}
