import { ListX, Trash2 } from "lucide-react";
import { ContextMenu } from "radix-ui";
import { type RefObject, useMemo } from "react";
import { menuContent, menuItem } from "@/components/ui/menu";
import { withRightClick } from "@/components/ui/Tooltip";
import { dragAlongTime } from "@/features/markers/dragAlongTime";
import { snapSuspended } from "@/features/markers/snapHold";
import { nearestBeat } from "@/features/practice/tempo";
import { percentOfTrack, useTimeStrip } from "@/features/waveform/useTimeStrip";
import { t } from "@/i18n";
import { usePlayerStore } from "@/stores/player";
import { usePracticeStore } from "@/stores/practice";
import { type SyncPoint, useScoreStore } from "@/stores/score";
import { useSettingsStore } from "@/stores/settings";
import { activeScore } from "./activeScore";

/** Least distance a dragged point keeps from its neighbours (seconds). */
const NEIGHBOUR_GAP = 0.2;
/** More bar lines than this are not drawn (a very long score zoomed out is a grey wash). */
const MAX_BAR_LINES = 1500;

/** Where a dragged point lands: on a beat of the tempo map with the magnet on, between its neighbours. */
function landing(time: number, before: number, after: number): number {
  const { tempoMap } = usePracticeStore.getState();
  let landed = time;
  if (useSettingsStore.getState().snap && !snapSuspended() && tempoMap.length > 0) {
    landed = nearestBeat(time, tempoMap);
  }
  return Math.min(after - NEIGHBOUR_GAP, Math.max(before + NEIGHBOUR_GAP, landed));
}

/** "5", "5·2" (second time through), "fine 12" (where the last bar ends). */
function barName(point: Pick<SyncPoint, "bar" | "occurrence" | "position">) {
  const bar = `${point.bar + 1}${point.occurrence > 0 ? `·${point.occurrence + 1}` : ""}`;
  return point.position >= 1 ? t.score.endOfBar(bar) : bar;
}

/**
 * The score's sync over the detailed waveform: a flag with the bar number at each sync point
 * (click: go there; drag: move it; right-click: delete), and a faint line where every other
 * bar falls, so a tab drifting off the recording shows at a glance.
 */
export function SyncFlags({ area }: { area: RefObject<HTMLDivElement | null> }) {
  const sync = useScoreStore((s) => s.link?.sync);
  const ready = useScoreStore((s) => s.status === "ready");
  const tapping = useScoreStore((s) => s.tapping);
  const timing = useScoreStore((s) => s.timing);
  const duration = usePlayerStore((s) => s.track?.duration ?? 0);
  const strip = useTimeStrip();
  const s = t.score;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `timing` says the bars moved
  const barLines = useMemo(() => {
    const timed = activeScore.engine?.timedBars();
    if (!timed || timed.bars.length > MAX_BAR_LINES) return [];
    return timed.bars.map((b) => b.time).filter((time) => time >= 0 && time <= duration);
  }, [timing, duration]);

  if (!sync || !ready) return null;
  // In recording order: each point's neighbours are the ones before and after it in time
  const order = sync
    .map((point, index) => ({ point, index }))
    .sort((a, b) => a.point.time - b.point.time);

  return (
    <div ref={strip} className="pointer-events-none absolute top-0 bottom-0">
      {barLines.map((time) => (
        <div
          key={time}
          aria-hidden
          className="absolute top-0 bottom-0 w-px bg-fg-subtle/45"
          style={{ left: `${percentOfTrack(time, duration)}%` }}
        />
      ))}
      {order.map(({ point, index }, k) => {
        const left = `${percentOfTrack(point.time, duration)}%`;
        const before = order[k - 1]?.point.time ?? Number.NEGATIVE_INFINITY;
        const after = order[k + 1]?.point.time ?? Number.POSITIVE_INFINITY;
        const name = barName(point);
        return (
          <div key={`${point.bar}-${point.occurrence}-${point.position}`}>
            <div
              aria-hidden
              className="absolute top-0 bottom-0 w-px bg-accent/60"
              style={{ left }}
            />
            <ContextMenu.Root>
              <ContextMenu.Trigger asChild>
                <button
                  type="button"
                  data-no-seek
                  title={withRightClick(s.syncFlag(name), s.syncFlagRightClick)}
                  onPointerDown={(event) =>
                    dragAlongTime(
                      event,
                      area.current,
                      (time) =>
                        useScoreStore
                          .getState()
                          .moveSync(index, Math.max(0, landing(time, before, after))),
                      () => usePlayerStore.getState().seek(point.time),
                    )
                  }
                  className="pointer-events-auto absolute bottom-6 flex h-4 -translate-x-1/2 cursor-grab items-center gap-0.5 rounded-[2px] border border-accent/60 bg-bg-from px-1 font-mono text-[9px] leading-4 text-accent tabular whitespace-nowrap active:cursor-grabbing"
                  style={{ left }}
                >
                  <span aria-hidden>♩</span>
                  {name}
                </button>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content className={menuContent}>
                  <ContextMenu.Item
                    className={menuItem}
                    onSelect={() => useScoreStore.getState().removeSync(index)}
                  >
                    <Trash2 className="size-4" />
                    {s.syncRemove}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={menuItem}
                    onSelect={() => useScoreStore.getState().removeSyncFrom(index)}
                  >
                    <ListX className="size-4" />
                    {s.syncRemoveFrom}
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          </div>
        );
      })}
      {tapping !== null && (
        <div aria-hidden className="absolute inset-y-0 left-0 w-full bg-accent/5" />
      )}
    </div>
  );
}
