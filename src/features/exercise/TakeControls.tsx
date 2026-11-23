import { RefreshCw } from "lucide-react";
import { smallKey } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import type { ExerciseFile } from "@/stores/exercise";
import { COARSE_STEP, FRAME_STEP, nudge, realign, shiftTo } from "./exerciseSync";

/** «+0,173 s» / «−12 ms»: a shift as the user reads it. */
function formatShift(seconds: number): string {
  const sign = seconds < 0 ? "−" : "+";
  const abs = Math.abs(seconds);
  if (abs < 1) return `${sign}${Math.round(abs * 1000)} ms`;
  return `${sign}${abs.toFixed(3).replace(".", ",")} s`;
}

const LAMP: Record<ExerciseFile["lineUp"], string> = {
  pending: "bg-led-off",
  sound: "bg-loop shadow-[0_0_5px_var(--color-loop)]",
  hand: "bg-accent shadow-[0_0_5px_var(--color-accent)]",
  noSound: "bg-accent/50",
  mismatch: "bg-cue",
};

/** Lamp of how a file is lined up, its meaning in the hint. */
export function LineUpLamp({ file }: { file: ExerciseFile }) {
  return (
    <span
      role="img"
      aria-label={t.exercise.lineUp[file.lineUp]}
      title={t.exercise.lineUp[file.lineUp]}
      className={cn("size-1.5 shrink-0 rounded-full", LAMP[file.lineUp])}
    />
  );
}

/**
 * How a file of the take is lined up, and the keys to move it by hand (−/+ like a DAW's nudge)
 * or line it up again from its sound. The open track itself is the reference: nothing to move.
 */
export function NudgeRow({
  file,
  isTrack,
  fine,
}: {
  file: ExerciseFile;
  isTrack: boolean;
  /** Audio steps (10 ms) instead of video frames */
  fine?: boolean;
}) {
  const small = fine ? 0.01 : FRAME_STEP;
  const steps: [string, string, number][] = [
    ["«", t.exercise.tenthBack, -COARSE_STEP],
    ["‹", fine ? t.exercise.milliBack : t.exercise.frameBack, -small],
    ["›", fine ? t.exercise.milliForward : t.exercise.frameForward, small],
    ["»", t.exercise.tenthForward, COARSE_STEP],
  ];
  return (
    <div className="flex flex-col gap-1.5 px-2.5 py-1.5">
      <p className="flex items-center gap-2 text-xs text-fg-muted">
        <LineUpLamp file={file} />
        {isTrack ? t.exercise.thisTrack : t.exercise.lineUp[file.lineUp]}
      </p>
      {!isTrack && (
        <div className="flex items-center gap-1">
          <span className="panel-label mr-1" title={t.exercise.nudgeHint}>
            {t.exercise.nudge}
          </span>
          {steps.map(([glyph, label, seconds]) => (
            <Tooltip key={label} label={label}>
              <button
                type="button"
                aria-label={label}
                className={smallKey}
                onClick={() => nudge(file.path, seconds)}
              >
                {glyph}
              </button>
            </Tooltip>
          ))}
          <span className="ml-1 min-w-20 font-mono text-[11px] text-fg tabular">
            {formatShift(shiftTo(file.path) ?? file.shift ?? 0)}
          </span>
          <Tooltip label={t.exercise.realign}>
            <button
              type="button"
              aria-label={t.exercise.realign}
              className={cn(smallKey, "ml-auto")}
              onClick={() => realign(file.path)}
            >
              <RefreshCw className="size-3" />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
