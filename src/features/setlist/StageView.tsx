import { AlertCircle, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { t } from "@/i18n";
import type { SetlistSong_Serialize as Song } from "@/lib/bindings";
import { cn } from "@/lib/cn";
import { formatPercent, signed } from "@/lib/format";
import { formatElapsed, formatLength } from "@/lib/time";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { currentPosition } from "@/stores/player";
import { useSetlistsStore } from "@/stores/setlists";
import { useSettingsStore } from "@/stores/settings";
import { liveElapsed, useLiveStore } from "./live";
import { playLength, setLength } from "./setlistMath";

const s = t.setlist;

/** The keys of the stage: a page-turner pedal sends PageDown / PageUp, like the arrows. */
const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown", "PageDown"]);
const PREVIOUS_KEYS = new Set(["ArrowLeft", "ArrowUp", "PageUp"]);

function useStageKeys() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const live = useLiveStore.getState();
      let handled = true;
      if (event.key === " ") live.toggle();
      else if (NEXT_KEYS.has(event.key)) live.next();
      else if (PREVIOUS_KEYS.has(event.key)) live.previous();
      else if (event.key === "Escape") live.stop();
      else handled = false;
      // On stage no other shortcut may fire (a stray key must not open a dialog)
      event.stopPropagation();
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}

/** Live settings of a song as short chips: «+2 st», «95%», «da 0:12». */
function Chips({ song, large = false }: { song: Song; large?: boolean }) {
  const chips: string[] = [];
  if (song.semitones) chips.push(signed(song.semitones, "st"));
  if (song.speed && song.speed !== 1) chips.push(formatPercent(song.speed));
  if (song.cueIn) chips.push(s.fromTime(formatLength(song.cueIn)));
  if (song.cueOut !== null && song.length !== null && song.cueOut < song.length - 0.5) {
    chips.push(s.toTime(formatLength(song.cueOut)));
  }
  if (song.bpm) chips.push(`${Math.round(song.bpm)} BPM`);
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", large ? "text-xl" : "text-xs")}>
      {chips.map((chip) => (
        <span key={chip} className="well rounded-control px-2.5 py-0.5 font-mono text-readout">
          {chip}
        </span>
      ))}
    </div>
  );
}

/** Clocks and bars that move on every frame, without re-rendering the view. */
function useLiveClocks(song: Song | undefined) {
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const leftRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const setRef = useRef<HTMLSpanElement>(null);
  const gapRef = useRef<HTMLSpanElement>(null);
  const beatRef = useRef<HTMLSpanElement>(null);

  useAnimationFrame((now) => {
    const live = useLiveStore.getState();
    if (setRef.current) {
      setRef.current.textContent = formatElapsed(
        live.setStartedAt === null ? 0 : (now - live.setStartedAt) / 1000,
      );
    }
    if (gapRef.current) {
      gapRef.current.textContent = String(Math.max(0, Math.ceil((live.gapEnds - now) / 1000)));
    }
    if (!song) return;
    let done = 0;
    let total = playLength(song) ?? 0;
    if (song.path) {
      // Time played of the song's cue range, at its Live speed
      const first = live.parts[0];
      const last = live.parts[live.parts.length - 1];
      if (first && last) {
        const speed = song.speed ?? 1;
        total = (last.end - first.start) / speed;
        done = (currentPosition() - first.start) / speed;
      }
    } else {
      done = liveElapsed(live);
    }
    done = Math.max(0, Math.min(done, total || done));
    if (elapsedRef.current) elapsedRef.current.textContent = formatElapsed(done);
    if (leftRef.current) {
      leftRef.current.textContent = total > 0 ? `−${formatElapsed(total - done)}` : "";
    }
    if (barRef.current) {
      barRef.current.style.width = `${total > 0 ? (done / total) * 100 : 0}%`;
    }
    // A song without file: a light on every beat of its BPM, to count it in by eye
    if (beatRef.current && song.bpm && !song.path) {
      const beat = 60 / song.bpm;
      const phase = live.phase === "playing" ? (liveElapsed(live) % beat) / beat : 1;
      beatRef.current.style.opacity = String(phase < 0.15 ? 1 : 0.15);
    }
  });
  return { elapsedRef, leftRef, barRef, setRef, gapRef, beatRef };
}

/**
 * Live mode's full-window view, made to be read from a few metres: the song being played, its
 * stage notes, how long it still lasts, the next one, the set clock. Space plays or pauses,
 * the arrows or a page-turner pedal (PageDown / PageUp) go to the next or previous song, Esc
 * leaves.
 */
export function StageView() {
  const setlistId = useLiveStore((st) => st.setlistId);
  const index = useLiveStore((st) => st.index);
  const phase = useLiveStore((st) => st.phase);
  const missing = useLiveStore((st) => st.missing);
  const setlist = useSetlistsStore((st) => st.setlists.find((x) => x.id === setlistId));
  const mode = useSettingsStore((st) => st.liveMode);
  const song = setlist?.songs[index];
  const nextSong = setlist?.songs[index + 1];
  const clocks = useLiveClocks(song);
  useStageKeys();

  if (!setlist) return null;
  const total = setLength(setlist.songs).seconds;
  const live = useLiveStore.getState();

  const status =
    phase === "loading"
      ? s.stage.loading
      : phase === "ready"
        ? missing
          ? s.stage.missing
          : s.stage.ready
        : phase === "paused"
          ? s.stage.paused
          : phase === "done"
            ? s.stage.done
            : phase === "gap"
              ? s.stage.gap
              : "";

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={s.stage.title}
      className="fixed inset-0 z-50 flex flex-col gap-6 bg-bg-to px-10 py-6 text-fg"
    >
      {/* Top: the set */}
      <header className="flex items-center gap-6">
        <div className="min-w-0 flex-1">
          <p className="panel-label text-accent">
            {mode === "changes" ? s.stage.changesTitle : s.stage.title}
          </p>
          <h1 className="truncate text-lg font-semibold">
            {setlist.name || s.untitled}
            {setlist.venue && <span className="text-fg-subtle"> · {setlist.venue}</span>}
          </h1>
        </div>
        <div className="text-right">
          <p className="panel-label text-fg-subtle">{s.stage.song}</p>
          <p className="font-mono text-2xl tabular">
            {Math.min(index + 1, setlist.songs.length)}/{setlist.songs.length}
          </p>
        </div>
        <div className="text-right">
          <p className="panel-label text-fg-subtle">{s.stage.setClock}</p>
          <p className="font-mono text-2xl text-readout tabular">
            <span ref={clocks.setRef}>0:00</span>
            <span className="text-base text-fg-subtle"> / {formatLength(total)}</span>
          </p>
        </div>
        <Button variant="hardware" className="h-10 px-3" onClick={() => live.stop()}>
          <X className="size-4" />
          {s.stage.exit}
          <kbd className="ml-1 text-[10px] text-fg-subtle">Esc</kbd>
        </Button>
      </header>

      {/* The song being played, as big as the window allows */}
      <main className="flex min-h-0 flex-1 flex-col justify-center gap-5">
        {song ? (
          <>
            <div className="flex items-center gap-4">
              {!song.path && song.bpm && (
                <span
                  ref={clocks.beatRef}
                  aria-hidden
                  className="size-6 shrink-0 rounded-full bg-accent shadow-[0_0_16px_var(--color-accent)]"
                />
              )}
              <h2 className="min-w-0 text-[clamp(2.5rem,7vw,6rem)] leading-none font-bold break-words">
                {song.title || s.untitledSong}
              </h2>
            </div>
            <Chips song={song} large />
            {song.notes && (
              <p className="max-w-5xl text-[clamp(1.25rem,2.6vw,2.25rem)] leading-snug whitespace-pre-wrap text-fg-muted">
                {song.notes}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <div className="well h-3 overflow-hidden rounded-full">
                <div ref={clocks.barRef} className="h-full w-0 bg-accent" />
              </div>
              <div className="flex items-baseline justify-between font-mono tabular">
                <span ref={clocks.elapsedRef} className="text-3xl">
                  0:00
                </span>
                <span ref={clocks.leftRef} className="text-5xl font-semibold text-readout" />
              </div>
            </div>
          </>
        ) : (
          <h2 className="text-4xl font-bold">{s.stage.done}</h2>
        )}
        {status && (
          <p
            className={cn(
              "flex items-center gap-2 text-2xl",
              missing ? "text-red-400" : "text-accent",
            )}
          >
            {missing && <AlertCircle className="size-6" />}
            {status}
            {phase === "gap" && <span ref={clocks.gapRef} className="font-mono tabular" />}
          </p>
        )}
      </main>

      {/* Bottom: what comes next, and the transport */}
      <footer className="flex items-center gap-6 border-t border-border pt-4">
        <div className="min-w-0 flex-1">
          <p className="panel-label text-fg-subtle">{s.stage.next}</p>
          {nextSong ? (
            <p className="flex items-baseline gap-3 truncate text-2xl font-semibold">
              <span className="truncate">{nextSong.title || s.untitledSong}</span>
              {playLength(nextSong) !== null && (
                <span className="font-mono text-base text-fg-subtle tabular">
                  {formatLength(playLength(nextSong) ?? 0)}
                </span>
              )}
            </p>
          ) : (
            <p className="text-2xl text-fg-subtle">{s.stage.lastSong}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="hardware"
            size="lg-icon"
            title={s.stage.previousHint}
            aria-label={s.stage.previous}
            onClick={() => live.previous()}
          >
            <SkipBack className="size-5" />
          </Button>
          <Button
            variant="hardware"
            className="h-14 w-20"
            active={phase === "playing"}
            disabled={phase === "loading" || phase === "done" || missing}
            title={s.stage.playHint}
            aria-label={phase === "playing" ? s.stage.pause : s.stage.play}
            onClick={() => live.toggle()}
          >
            {phase === "playing" ? <Pause className="size-7" /> : <Play className="size-7" />}
          </Button>
          <Button
            variant="hardware"
            size="lg-icon"
            title={s.stage.nextHint}
            aria-label={s.stage.nextSong}
            disabled={!nextSong}
            onClick={() => live.next()}
          >
            <SkipForward className="size-5" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
