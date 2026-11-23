import { Maximize2, Minus, Pause, Play, Plus, Repeat } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { useCurrentMemo } from "@/features/markers/CurrentMemo";
import { TimeDisplay } from "@/features/player/TimeDisplay";
import { t } from "@/i18n";
import { formatPercent } from "@/lib/format";
import { formatTime } from "@/lib/time";
import { useLoopStore } from "@/stores/loop";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { setMini } from "./miniMode";

const m = t.mini;

/**
 * The whole window in mini mode: play, loop, position, speed and the track, on one slim
 * bar that stays above a score, a tab or a lesson video. Every shortcut still works.
 */
export function MiniBar() {
  const playing = usePlayerStore((s) => s.playing);
  const hasTrack = usePlayerStore((s) => s.track !== null);
  const name = usePlayerStore((s) => s.track?.name);
  const speed = usePlayerStore((s) => s.speed);
  const enabled = useLoopStore((s) => s.enabled);
  // The usable region as two numbers (a selector must not build a new object)
  const regionStart = useLoopStore((s) => s.region()?.start ?? null);
  const regionEnd = useLoopStore((s) => s.region()?.end ?? null);
  const region =
    regionStart !== null && regionEnd !== null ? { start: regionStart, end: regionEnd } : null;
  const { togglePlay, setSpeed } = usePlayerStore.getState();
  const step = useSettingsStore((s) => s.speedStep);
  const playLabel = playing ? t.transport.pause : t.transport.play;
  const memo = useCurrentMemo();

  return (
    <div className="flex h-full items-center gap-2 bg-[linear-gradient(var(--color-dock-from),var(--color-dock-to))] px-2">
      <Tooltip label={playLabel} shortcut="playPause">
        <Button
          variant="hardware"
          size="play"
          led="green"
          active={playing}
          disabled={!hasTrack}
          onClick={togglePlay}
          aria-label={playLabel}
        >
          {playing ? (
            <Pause className="size-[18px] fill-loop text-loop" />
          ) : (
            <Play className="size-[18px] fill-current" />
          )}
        </Button>
      </Tooltip>
      <Tooltip label={t.transport.loop} shortcut="loopToggle">
        <Button
          variant="hardware"
          size="key"
          led="green"
          disabled={!region}
          active={enabled && region !== null}
          onClick={useLoopStore.getState().toggle}
          aria-label={t.transport.loop}
          aria-pressed={enabled}
        >
          <Repeat className="size-4" />
        </Button>
      </Tooltip>
      <TimeDisplay />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-fg">{name ?? t.app.noFile}</p>
        {memo ? (
          <p className="truncate text-[11px] text-accent" title={memo.text}>
            {memo.name}: {memo.text}
          </p>
        ) : (
          region && (
            <p className="truncate font-mono text-[11px] text-fg-subtle tabular">
              {t.transport.loop} {formatTime(region.start)} → {formatTime(region.end)}
            </p>
          )
        )}
      </div>
      <div className="well flex items-center gap-1 rounded-panel p-1">
        <Button
          size="icon"
          className="size-6"
          disabled={!hasTrack}
          onClick={() => setSpeed(speed - step)}
          aria-label={t.shortcuts.speedDown}
        >
          <Minus className="size-3.5" />
        </Button>
        <Tooltip label={t.transport.speed}>
          <span className="w-11 text-center font-mono text-xs text-readout tabular">
            {formatPercent(speed)}
          </span>
        </Tooltip>
        <Button
          size="icon"
          className="size-6"
          disabled={!hasTrack}
          onClick={() => setSpeed(speed + step)}
          aria-label={t.shortcuts.speedUp}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      <Tooltip label={m.leave} shortcut="toggleMini">
        <Button
          variant="hardware"
          size="icon"
          onClick={() => void setMini(false)}
          aria-label={m.leave}
        >
          <Maximize2 className="size-4" />
        </Button>
      </Tooltip>
    </div>
  );
}
