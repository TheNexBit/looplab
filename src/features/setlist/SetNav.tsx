import { ChevronLeft, ChevronRight, ListMusic, MonitorPlay, X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { useCompact } from "@/components/ui/FitBar";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { useSetlistsStore } from "@/stores/setlists";
import { useSettingsStore } from "@/stores/settings";
import { useLiveStore } from "./live";
import { isBreak, songNumbers } from "./setlistMath";

const s = t.setlist;
/** The notice after leaving set mode goes away by itself after this long (ms). */
const NOTICE_MS = 10_000;

/** Auto-advance as a lamp key, like a DAW's transport switches. */
function AutoKey() {
  const on = useSettingsStore((st) => st.setlistAutoAdvance);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={s.autoAdvance}
      title={s.autoAdvanceHint}
      onClick={() => useSettingsStore.getState().update({ setlistAutoAdvance: !on })}
      className={cn(
        "hw inline-flex h-7 shrink-0 items-center gap-1.5 rounded-control px-2 text-[10px] font-semibold tracking-[0.08em] uppercase",
        "hover:brightness-125 active:translate-y-px",
        on ? "text-accent" : "text-fg-subtle",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          on ? "bg-accent shadow-[0_0_6px_var(--color-accent)]" : "bg-led-off",
        )}
      />
      {s.autoShort}
    </button>
  );
}

/**
 * The set bar in the top bar while set mode is on (in place of the lesson navigation): which
 * setlist, the song number, previous / next, auto-advance, the Stage view and the way out.
 */
export function SetNav() {
  const setlistId = useLiveStore((st) => st.setlistId);
  const index = useLiveStore((st) => st.index);
  const setlist = useSetlistsStore((st) => st.setlists.find((x) => x.id === setlistId));
  const compact = useCompact();
  if (!setlist) return null;
  const live = useLiveStore.getState();
  const numbers = songNumbers(setlist.songs);
  const song = setlist.songs[index];
  const number = song && !isBreak(song) ? numbers.get(song.id) : undefined;

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-control border border-accent/50 bg-accent-soft py-0.5 pr-0.5 pl-2">
      <ListMusic className="size-4 shrink-0 text-accent" aria-hidden />
      {!compact && (
        <span className="max-w-36 truncate text-xs font-medium" title={setlist.name}>
          {setlist.name || s.untitled}
        </span>
      )}
      <Tooltip label={s.previousSong} shortcut="previousLesson">
        <Button size="icon" aria-label={s.previousSong} onClick={() => live.previous()}>
          <ChevronLeft className="size-4" />
        </Button>
      </Tooltip>
      <span className="min-w-10 text-center font-mono text-xs tabular" title={song?.title}>
        {number ?? "—"}/{numbers.size}
      </span>
      <Tooltip label={s.nextSongKey} shortcut="nextLesson">
        <Button
          size="icon"
          aria-label={s.nextSongKey}
          disabled={index >= setlist.songs.length - 1}
          onClick={() => live.next()}
        >
          <ChevronRight className="size-4" />
        </Button>
      </Tooltip>
      <AutoKey />
      <Button
        variant="hardware"
        className="h-7"
        title={s.stageHint}
        onClick={() => live.setStage(true)}
      >
        <MonitorPlay className="size-4" />
        {!compact && s.stageKey}
      </Button>
      <Button size="icon" title={s.leaveSet} aria-label={s.leaveSet} onClick={() => live.stop()}>
        <X className="size-4" />
      </Button>
    </div>
  );
}

/** «Setlist closed: you opened a track that is not in it · Back to the setlist». */
export function LeftSetNotice() {
  const left = useLiveStore((st) => st.left);
  const name = useSetlistsStore(
    (st) => st.setlists.find((x) => x.id === left?.setlistId)?.name ?? "",
  );
  useEffect(() => {
    if (!left) return;
    const timeout = setTimeout(() => useLiveStore.getState().dismissLeft(), NOTICE_MS);
    return () => clearTimeout(timeout);
  }, [left]);
  if (!left) return null;
  return (
    <div
      role="status"
      className="absolute bottom-4 left-1/2 z-40 flex max-w-[min(40rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-panel border border-edge bg-bg-from px-4 py-2 text-sm shadow-lg"
    >
      <ListMusic className="size-4 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">{s.leftNotice(name || s.untitled)}</span>
      <Button
        variant="hardware"
        onClick={() => {
          useLiveStore.getState().dismissLeft();
          void useLiveStore.getState().start(left.setlistId, left.index);
        }}
      >
        {s.backToSet}
      </Button>
      <Button
        size="icon"
        aria-label={t.library.dismiss}
        onClick={() => useLiveStore.getState().dismissLeft()}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
