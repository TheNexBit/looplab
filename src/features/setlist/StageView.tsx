import {
  AlertCircle,
  ArrowDownToLine,
  Coffee,
  Minimize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { t } from "@/i18n";
import type { SetlistSong_Serialize as Song } from "@/lib/bindings";
import { cn } from "@/lib/cn";
import { formatPercent, signed } from "@/lib/format";
import { formatElapsed, formatLength } from "@/lib/time";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { sortedSections, useMarkersStore } from "@/stores/markers";
import { currentPosition } from "@/stores/player";
import { useSetlistsStore } from "@/stores/setlists";
import { useSettingsStore } from "@/stores/settings";
import { liveElapsed, useLiveStore } from "./live";
import { KeyBadge } from "./SetlistParts";
import { isBreak, playLength, remainingFrom, setLength, songNumbers } from "./setlistMath";

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
      else if (event.key === "Escape") live.setStage(false);
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
function Chips({ song }: { song: Song }) {
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
    <div className="flex flex-wrap gap-2 text-xl">
      {chips.map((chip) => (
        <span key={chip} className="well rounded-control px-2.5 py-0.5 font-mono text-readout">
          {chip}
        </span>
      ))}
    </div>
  );
}

const clock = (date: Date) =>
  date.toLocaleTimeString(s.locale, { hour: "2-digit", minute: "2-digit" });

/** Clocks, bars and the section name that move on every frame, without re-rendering the view. */
function useLiveClocks(songs: readonly Song[], index: number, gapSeconds: number) {
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const leftRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const setRef = useRef<HTMLSpanElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);
  const gapRef = useRef<HTMLSpanElement>(null);
  const beatRef = useRef<HTMLSpanElement>(null);
  const sectionRef = useRef<HTMLSpanElement>(null);
  const nextSectionRef = useRef<HTMLSpanElement>(null);
  const song = songs[index];

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
    if (song.path && !isBreak(song)) {
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
    // When the gig ends, if it goes on from here as planned (BandHelper's projected end)
    if (endRef.current) {
      const rest = Math.max(0, total - done) + remainingFrom(songs, index + 1, gapSeconds);
      endRef.current.textContent = clock(new Date(Date.now() + rest * 1000));
    }
    // A song without file: a light on every beat of its BPM, to count it in by eye
    if (beatRef.current && song.bpm && !song.path) {
      const beat = 60 / song.bpm;
      const phase = live.phase === "playing" ? (liveElapsed(live) % beat) / beat : 1;
      beatRef.current.style.opacity = String(phase < 0.15 ? 1 : 0.15);
    }
    // The section being played and the one after it (from the song's own sections)
    if (sectionRef.current && nextSectionRef.current) {
      const sections = song.path ? sortedSections(useMarkersStore.getState().sections) : [];
      const position = currentPosition();
      const at = sections.findIndex((x) => position >= x.start && position < x.end);
      const upcoming = sections.find((x) => x.start > position);
      sectionRef.current.textContent = at >= 0 ? (sections[at]?.name ?? "") : "";
      nextSectionRef.current.textContent = upcoming ? s.stage.nextSection(upcoming.name) : "";
    }
  });
  return {
    elapsedRef,
    leftRef,
    barRef,
    setRef,
    endRef,
    gapRef,
    beatRef,
    sectionRef,
    nextSectionRef,
  };
}

function statusOf(phase: string, missing: boolean, pause: boolean): string {
  if (phase === "loading") return s.stage.loading;
  if (phase === "ready")
    return missing ? s.stage.missing : pause ? s.stage.breakReady : s.stage.ready;
  if (phase === "paused") return s.stage.paused;
  if (phase === "done") return s.stage.done;
  if (phase === "gap") return s.stage.gap;
  return "";
}

/**
 * Live mode's full-window view, made to be read from a few metres: the song being played with
 * its key and the section under way, its stage notes, how long it still lasts, the next one,
 * the set clock and when the gig will end. Space plays or pauses, the arrows or a page-turner
 * pedal (PageDown / PageUp) go to the next or previous song, Esc leaves.
 */
export function StageView() {
  const setlistId = useLiveStore((st) => st.setlistId);
  const index = useLiveStore((st) => st.index);
  const phase = useLiveStore((st) => st.phase);
  const missing = useLiveStore((st) => st.missing);
  const setlist = useSetlistsStore((st) => st.setlists.find((x) => x.id === setlistId));
  const mode = useSettingsStore((st) => st.liveMode);
  const songs = setlist?.songs ?? [];
  const song = songs[index];
  const nextSong = songs[index + 1];
  const clocks = useLiveClocks(songs, index, setlist?.gapSeconds ?? 0);
  useStageKeys();

  if (!setlist) return null;
  const total = setLength(songs).seconds;
  const numbers = songNumbers(songs);
  const live = useLiveStore.getState();
  const pause = !!song && isBreak(song);
  const status = statusOf(phase, missing, pause);

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
            {song ? (numbers.get(song.id) ?? "—") : "—"}/{numbers.size}
          </p>
        </div>
        <div className="text-right">
          <p className="panel-label text-fg-subtle">{s.stage.setClock}</p>
          <p className="font-mono text-2xl text-readout tabular">
            <span ref={clocks.setRef}>0:00</span>
            <span className="text-base text-fg-subtle"> / {formatLength(total)}</span>
          </p>
        </div>
        <div className="text-right" title={s.stage.endsAtHint}>
          <p className="panel-label text-fg-subtle">{s.stage.endsAt}</p>
          <p className="font-mono text-2xl tabular">
            <span ref={clocks.endRef}>—</span>
          </p>
        </div>
        <Button variant="hardware" className="h-10 px-3" onClick={() => live.stop()}>
          <X className="size-4" />
          {s.leaveSet}
        </Button>
        <Button variant="hardware" className="h-10 px-3" onClick={() => live.setStage(false)}>
          <Minimize2 className="size-4" />
          {s.stage.exit}
          <kbd className="ml-1 text-[10px] text-fg-subtle">Esc</kbd>
        </Button>
      </header>

      {/* The song being played, as big as the window allows */}
      <main className="flex min-h-0 flex-1 flex-col justify-center gap-5">
        {song ? (
          <>
            <div className="flex items-center gap-4">
              {pause && <Coffee className="size-14 shrink-0 text-accent" aria-hidden />}
              {!song.path && !pause && song.bpm && (
                <span
                  ref={clocks.beatRef}
                  aria-hidden
                  className="size-6 shrink-0 rounded-full bg-accent shadow-[0_0_16px_var(--color-accent)]"
                />
              )}
              <h2
                className={cn(
                  "min-w-0 text-[clamp(2.5rem,7vw,6rem)] leading-none font-bold break-words",
                  pause && "text-fg-muted",
                )}
              >
                {song.title || s.untitledSong}
              </h2>
              <KeyBadge songKey={song.key} large />
            </div>
            {!pause && <Chips song={song} />}
            <p className="flex items-baseline gap-4 text-[clamp(1.25rem,2.4vw,2rem)]">
              <span ref={clocks.sectionRef} className="font-semibold text-accent" />
              <span ref={clocks.nextSectionRef} className="text-fg-subtle" />
            </p>
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
          <p className="panel-label flex items-center gap-2 text-fg-subtle">
            {s.stage.next}
            {song?.segue && (
              <span className="flex items-center gap-1 text-accent">
                <ArrowDownToLine className="size-3.5" />
                {s.stage.segueNext}
              </span>
            )}
          </p>
          {nextSong ? (
            <p className="flex items-baseline gap-3 truncate text-2xl font-semibold">
              <span className={cn("truncate", isBreak(nextSong) && "text-fg-muted italic")}>
                {nextSong.title || s.untitledSong}
              </span>
              <KeyBadge songKey={nextSong.key} />
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
