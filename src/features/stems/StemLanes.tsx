import { AlertTriangle, Check, Layers, Loader2, Plus, Trash2, X } from "lucide-react";
import { ContextMenu } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Knob } from "@/components/ui/Knob";
import { MuteKey } from "@/components/ui/MuteKey";
import { menuContent, menuItem, menuSeparator } from "@/components/ui/menu";
import { Tooltip, withRightClick } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { fileNameOf, formatPercent } from "@/lib/format";
import {
  LANE_LEVEL,
  laneHeard,
  laneLabels,
  listening,
  useFileStemsStore,
} from "@/stores/fileStems";
import { sectionColor } from "@/stores/markers";
import { pickAndAddStems } from "./fileStems";

const f = t.fileStems;
const store = () => useFileStemsStore.getState();

/** With more lanes than this, each is low: name and keys on one row, no knob. */
export const COMPACT_LANES = 3;

/** The colour of lane `index`: the section palette, as the lanes of a DAW. */
export const laneColor = (index: number) => sectionColor(index);

/** The mixer's solo key: «S» with an amber lamp, on or off like Reaper's (several can be on). */
function SoloKey({ index, solo }: { index: number; solo: boolean }) {
  return (
    <Tooltip label={f.soloHint}>
      <button
        type="button"
        aria-label={f.solo}
        aria-pressed={solo}
        onClick={() => store().toggleSolo(index)}
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
 * The heads of the lanes, in a column of their own left of the detailed view (like the track
 * heads of Song Master or a DAW): never over the waveform, so a click on S or M is never a click
 * on the music. Each head is as tall as its lane: colour, name, S and M, level (name and keys on
 * one row when there are many lanes). A lane that is not heard is drawn grey.
 */
export function StemLaneHeads({ ruler }: { ruler: number }) {
  const lanes = useFileStemsStore((s) => s.lanes);
  if (lanes.length < 2) return null;
  const labels = laneLabels(lanes.map((lane) => lane.path));
  const compact = lanes.length > COMPACT_LANES;
  return (
    <div className="well flex w-44 shrink-0 flex-col overflow-hidden rounded-panel">
      {/* Level with the ruler of the waveform beside it */}
      <div
        aria-hidden
        className="shrink-0 border-b border-edge bg-[linear-gradient(var(--color-ruler-from),var(--color-ruler-to))]"
        style={{ height: ruler }}
      />
      {lanes.map((lane, index) => {
        const heard = laneHeard(lanes, index);
        const name = (
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs font-semibold",
              heard ? "text-fg" : "text-fg-subtle",
            )}
          >
            {labels[index]}
          </span>
        );
        const warning = !lane.linedUp && (
          <span title={f.notLinedUp} className="shrink-0 text-amber-400">
            <AlertTriangle className="size-3" aria-label={f.notLinedUp} />
          </span>
        );
        const keys = (
          <>
            <SoloKey index={index} solo={lane.solo} />
            <MuteKey muted={lane.mute} label={f.mute} onChange={() => store().toggleMute(index)} />
          </>
        );
        return (
          <LaneMenu key={lane.path} index={index}>
            <div
              title={withRightClick(fileNameOf(lane.path), f.headRightClick)}
              className={cn(
                "flex min-h-0 flex-1 justify-center overflow-hidden pr-1.5 pl-2",
                compact ? "flex-row items-center gap-1 py-0.5" : "flex-col gap-1 py-1",
                index > 0 && "border-t border-edge",
              )}
              style={{
                borderLeft: `3px solid ${heard ? laneColor(index) : "var(--color-border)"}`,
              }}
            >
              {compact ? (
                <>
                  {name}
                  {warning}
                  {keys}
                </>
              ) : (
                <>
                  <div className="flex min-w-0 items-center gap-1">
                    {name}
                    {warning}
                  </div>
                  <div className="flex items-center gap-1">
                    {keys}
                    <LaneLevel index={index} />
                  </div>
                </>
              )}
            </div>
          </LaneMenu>
        );
      })}
    </div>
  );
}

/**
 * The lane's right-click menu, as on a DAW's track head: solo and mute (ticked when on), level
 * back to 100%, and (for the files added to the track) taking it away. Nothing that removes sits
 * on the head.
 */
function LaneMenu({ index, children }: { index: number; children: ReactNode }) {
  const solo = useFileStemsStore((s) => s.lanes[index]?.solo ?? false);
  const mute = useFileStemsStore((s) => s.lanes[index]?.mute ?? false);
  const tick = (
    <ContextMenu.ItemIndicator className="ml-auto pl-4">
      <Check className="size-4" />
    </ContextMenu.ItemIndicator>
  );
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContent}>
          <ContextMenu.CheckboxItem
            className={menuItem}
            checked={solo}
            onCheckedChange={() => store().toggleSolo(index)}
          >
            {f.solo}
            {tick}
          </ContextMenu.CheckboxItem>
          <ContextMenu.CheckboxItem
            className={menuItem}
            checked={mute}
            onCheckedChange={() => store().toggleMute(index)}
          >
            {f.mute}
            {tick}
          </ContextMenu.CheckboxItem>
          <ContextMenu.Item
            className={menuItem}
            onSelect={() => store().setLevel(index, LANE_LEVEL.default)}
          >
            {f.levelReset}
          </ContextMenu.Item>
          {index > 0 && (
            <>
              <ContextMenu.Separator className={menuSeparator} />
              <ContextMenu.Item className={menuItem} onSelect={() => void store().remove(index)}>
                <Trash2 className="size-4" />
                {f.removeLane}
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** The lane's level: a small knob (only with few lanes: they are tall enough). */
function LaneLevel({ index }: { index: number }) {
  const level = useFileStemsStore((s) => s.lanes[index]?.level ?? 1);
  const mute = useFileStemsStore((s) => s.lanes[index]?.mute ?? false);
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
 * «Listen»: which lanes are heard, as a row of keys (like an A/B switch): «All», or one lane
 * alone. The lit key is what you hear; a click switches without stopping the music. The keys go
 * onto more rows when the title is narrow: none is ever hidden.
 */
function ListenSwitch() {
  const lanes = useFileStemsStore((s) => s.lanes);
  const now = listening(lanes);
  const labels = laneLabels(lanes.map((lane) => lane.path));
  const key = (lit: boolean) =>
    cn(
      "inline-flex h-6 min-w-0 items-center gap-1.5 px-2 text-[11px] transition-[filter] hover:brightness-125",
      lit ? "bg-well font-semibold text-accent" : "text-fg-muted hover:text-fg",
    );
  const lamp = (lit: boolean) => (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        lit ? "bg-accent shadow-[0_0_6px_var(--color-accent)]" : "bg-led-off",
      )}
    />
  );
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-[11px] text-fg-subtle">{f.listen}</span>
      <fieldset
        aria-label={f.listen}
        className="hw m-0 flex min-w-0 flex-wrap divide-x divide-edge overflow-hidden rounded-control p-0"
      >
        <button
          type="button"
          aria-pressed={now === null}
          title={f.listenAllHint}
          className={key(now === null)}
          onClick={() => store().listenTo(null)}
        >
          {lamp(now === null)}
          {f.listenAll}
        </button>
        {lanes.map((lane, index) => (
          <button
            key={lane.path}
            type="button"
            aria-pressed={now === index}
            title={f.listenOneHint(labels[index] ?? "")}
            className={key(now === index)}
            onClick={() => store().listenTo(index)}
          >
            {lamp(now === index)}
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: laneColor(index) }}
            />
            <span className="max-w-40 truncate">{labels[index]}</span>
          </button>
        ))}
      </fieldset>
    </div>
  );
}

/** What was left out of the last opening, until dismissed. */
function StemsNotice() {
  const notice = useFileStemsStore((s) => s.notice);
  if (!notice) return null;
  return (
    <span className="flex min-w-0 items-center gap-1 text-[11px] text-amber-400">
      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate" title={notice}>
        {notice}
      </span>
      <button
        type="button"
        aria-label={f.dismissNotice}
        title={f.dismissNotice}
        onClick={() => store().dismissNotice()}
        className="shrink-0 rounded-control text-fg-subtle hover:text-fg"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/**
 * The stems in the waveform panel title: how many lanes, «Listen» (all or one lane alone), add a
 * file, close the stems, and what was left out. While files are lined up, a spinner.
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
    if (error) {
      return (
        <span className="text-[11px] text-red-400">
          {f.failed}: {t.errors[error.kind] ?? f.unreadable}
        </span>
      );
    }
    return <StemsNotice />;
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold tracking-[0.08em] text-accent uppercase">
        <Layers className="size-3.5" aria-hidden />
        {f.title(lanes)}
      </span>
      <ListenSwitch />
      <Tooltip label={f.addHint}>
        <Button
          variant="hardware"
          className="h-6 px-2 text-[11px]"
          onClick={() => void pickAndAddStems()}
        >
          <Plus className="size-3.5" />
          {f.add}
        </Button>
      </Tooltip>
      <Tooltip label={f.closeHint}>
        <Button
          variant="hardware"
          className="h-6 px-2 text-[11px]"
          onClick={() => void store().close()}
        >
          <X className="size-3.5" />
          {f.close}
        </Button>
      </Tooltip>
      <StemsNotice />
    </div>
  );
}
