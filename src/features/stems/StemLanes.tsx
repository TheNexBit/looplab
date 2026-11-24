import { AlertTriangle, Layers, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { Knob } from "@/components/ui/Knob";
import { MuteKey } from "@/components/ui/MuteKey";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { fileNameOf, formatPercent } from "@/lib/format";
import { LANE_LEVEL, laneHeard, laneLabels, useFileStemsStore } from "@/stores/fileStems";
import { sectionColor } from "@/stores/markers";
import { pickAndAddStems } from "./fileStems";

const f = t.fileStems;
const store = () => useFileStemsStore.getState();

/** With more lanes than this, each is too low for its knob: name and keys only. */
const KNOB_LANES = 3;

/** The colour of lane `index`: the section palette, as the lanes of a DAW. */
export const laneColor = (index: number) => sectionColor(index);

/** The mixer's solo key: «S» with an amber lamp; Ctrl+click adds the lane to the others. */
function SoloKey({ index, solo }: { index: number; solo: boolean }) {
  return (
    <Tooltip label={f.soloHint}>
      <button
        type="button"
        aria-label={f.solo}
        aria-pressed={solo}
        onClick={(event) => store().toggleSolo(index, event.ctrlKey || event.metaKey)}
        className={cn(
          "hw inline-flex h-[18px] shrink-0 items-center gap-1 rounded-control px-1.5 text-[9px] font-semibold transition-[filter] hover:brightness-125",
          solo ? "text-fg" : "text-fg-muted",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            solo ? "bg-accent shadow-[0_0_6px_var(--color-accent)]" : "bg-led-off",
          )}
        />
        S
      </button>
    </Tooltip>
  );
}

/**
 * The heads of the lanes, one small row over the left edge of each (like the track heads of a
 * DAW): colour, name, S and M, level. A lane that is not heard is drawn grey.
 */
export function StemLaneHeads({ top }: { top: number }) {
  const lanes = useFileStemsStore((s) => s.lanes);
  if (lanes.length < 2) return null;
  const labels = laneLabels(lanes.map((lane) => lane.path));
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col" style={{ top }}>
      {lanes.map((lane, index) => {
        const heard = laneHeard(lanes, index);
        return (
          <div
            key={lane.path}
            className={cn(
              "relative flex min-h-0 flex-1 items-start",
              index > 0 && "border-t border-edge/70",
            )}
          >
            <div
              // The head takes its own clicks: they never move the playhead
              onPointerDown={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
              className={cn(
                "pointer-events-auto m-1 flex min-w-0 items-center gap-1.5 overflow-hidden rounded-control border border-edge/60 bg-bg-from/85 py-0.5 pr-1.5 pl-2 shadow-sm backdrop-blur-[2px]",
                !heard && "opacity-75",
              )}
              style={{ borderLeft: `3px solid ${laneColor(index)}` }}
            >
              <span
                title={fileNameOf(lane.path)}
                className={cn(
                  "max-w-36 truncate text-xs font-semibold",
                  heard ? "text-fg" : "text-fg-subtle",
                )}
              >
                {labels[index]}
              </span>
              {!lane.linedUp && (
                <span title={f.notLinedUp} className="shrink-0 text-amber-400">
                  <AlertTriangle className="size-3" aria-label={f.notLinedUp} />
                </span>
              )}
              <SoloKey index={index} solo={lane.solo} />
              <MuteKey
                muted={lane.mute}
                label={f.mute}
                onChange={() => store().toggleMute(index)}
              />
              <LaneLevel index={index} />
              {index > 0 && (
                <button
                  type="button"
                  title={f.removeLane}
                  aria-label={f.removeLane}
                  onClick={() => void store().remove(index)}
                  className="shrink-0 rounded-control text-fg-subtle hover:text-fg"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The lane's level: a small knob, shown when the lane is tall enough. */
function LaneLevel({ index }: { index: number }) {
  const level = useFileStemsStore((s) => s.lanes[index]?.level ?? 1);
  const mute = useFileStemsStore((s) => s.lanes[index]?.mute ?? false);
  const count = useFileStemsStore((s) => s.lanes.length);
  // Only where there is room: the keys always stay
  if (count > KNOB_LANES) return null;
  return (
    <Knob
      label={f.level}
      caption=""
      value={level}
      current={() => store().lanes[index]?.level ?? 1}
      min={LANE_LEVEL.min}
      max={LANE_LEVEL.max}
      step={LANE_LEVEL.step}
      notch={0.05}
      defaultValue={LANE_LEVEL.default}
      onChange={(value) => store().setLevel(index, value)}
      format={formatPercent}
      off={mute}
      size="sm"
      layout="row"
    />
  );
}

/**
 * The stems in the waveform panel title: how many lanes, the X key that goes from one lane to
 * the next alone, add a file, back to the track alone. While files are lined up, a spinner.
 */
export function StemsBar() {
  const lanes = useFileStemsStore((s) => s.lanes.length);
  const loading = useFileStemsStore((s) => s.loading);
  const error = useFileStemsStore((s) => s.error);
  if (loading) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        {f.loading}
      </span>
    );
  }
  if (lanes < 2) {
    return error ? (
      <span className="text-[11px] text-red-400" title={error.detail}>
        {f.failed}
      </span>
    ) : null;
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex items-center gap-1 text-[11px] font-semibold tracking-[0.08em] text-accent uppercase">
        <Layers className="size-3.5" aria-hidden />
        {f.title(lanes)}
      </span>
      <Tooltip label={f.cycleHint} shortcut="cycleStemSolo">
        <Button
          variant="hardware"
          className="h-6 px-2 text-[11px]"
          onClick={() => store().cycleSolo()}
        >
          {f.cycle}
          <Kbd shortcut="cycleStemSolo" />
        </Button>
      </Tooltip>
      <Tooltip label={f.addHint}>
        <Button
          variant="hardware"
          size="icon"
          className="size-6"
          aria-label={f.add}
          onClick={() => void pickAndAddStems()}
        >
          <Plus className="size-3.5" />
        </Button>
      </Tooltip>
      <Tooltip label={f.closeHint}>
        <Button
          size="icon"
          className="size-6"
          aria-label={f.close}
          onClick={() => void store().close()}
        >
          <X className="size-3.5" />
        </Button>
      </Tooltip>
    </div>
  );
}
