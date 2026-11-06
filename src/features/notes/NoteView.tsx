import { useRef, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { useCanvas } from "@/features/waveform/useCanvas";
import { t } from "@/i18n";
import { commands } from "@/lib/bindings";
import { themeColor } from "@/lib/theme";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { useEqStore } from "@/stores/eq";
import { normalizeRegion, useLoopStore } from "@/stores/loop";
import { type NotesMode, useNotesStore } from "@/stores/notes";
import { currentPosition, usePlayerStore } from "@/stores/player";
import {
  FLOOR_DB,
  HIGHEST_NOTE,
  isBlack,
  keyLevels,
  keySpan,
  LOWEST_NOTE,
  NOTE_COUNT,
  NOTE_RANGE_DB,
  noteName,
  noteOfPoint,
  strongestNotes,
} from "./noteMath";

const n = t.notes;
/** Requests while playing: a dozen a second follows the music without loading the CPU. */
const LIVE_INTERVAL_MS = 80;
/** Decibels shown above the keys, counted down from the loudest point. */
const SHOWN_DB = 60;
/** Share of the canvas height taken by the keyboard. */
const KEYBOARD_SHARE = 0.38;

interface Picture {
  levels: (number | null)[];
  keys: number[];
  notes: number[];
}

const EMPTY: Picture = { levels: [], keys: keyLevels([]), notes: [] };

/** What is being analysed now: a stable text key, so a new request goes out only on change. */
function currentRequest(mode: NotesMode) {
  const player = usePlayerStore.getState();
  const semitones = player.semitones + player.cents / 100;
  const channels = useEqStore.getState().channels;
  if (mode === "loop") {
    const { start, end } = useLoopStore.getState();
    const region =
      start !== null && end !== null && player.track
        ? normalizeRegion(start, end, player.track.duration)
        : null;
    if (!region) return null;
    return { start: region.start, end: region.end, channels, semitones };
  }
  const position = currentPosition();
  return { start: position, end: position, channels, semitones };
}

function draw(canvas: HTMLCanvasElement, width: number, height: number, picture: Picture) {
  const ctx = canvas.getContext("2d");
  if (!ctx || width === 0) return;
  ctx.clearRect(0, 0, width, height);
  const accent = themeColor("accent");
  const keyboardTop = Math.round(height * (1 - KEYBOARD_SHARE));
  const unit = width / NOTE_COUNT;
  const top = Math.max(...picture.keys);
  const lit = new Set(picture.notes);
  /** 0 for keys far below the loudest, 1 for the loudest */
  const strength = (db: number) =>
    Math.min(1, Math.max(0, (db - (top - NOTE_RANGE_DB)) / NOTE_RANGE_DB));

  // Faint octave lines behind the curve, on every C
  ctx.fillStyle = themeColor("grid");
  for (let midi = LOWEST_NOTE; midi <= HIGHEST_NOTE; midi++) {
    if (midi % 12 === 0) ctx.fillRect(Math.round((midi - LOWEST_NOTE) * unit), 0, 1, keyboardTop);
  }

  // Curve of the levels, filled down to the keys
  if (picture.levels.length > 0 && top > FLOOR_DB) {
    const y = (db: number | null) => {
      const value = typeof db === "number" ? db : FLOOR_DB;
      const share = Math.min(1, Math.max(0, (value - (top - SHOWN_DB)) / SHOWN_DB));
      return keyboardTop - share * (keyboardTop - 4);
    };
    ctx.beginPath();
    ctx.moveTo(0, keyboardTop);
    picture.levels.forEach((db, i) => {
      ctx.lineTo((noteOfPoint(i) - LOWEST_NOTE + 0.5) * unit, y(db));
    });
    ctx.lineTo(width, keyboardTop);
    ctx.closePath();
    ctx.fillStyle = themeColor("wave-dim");
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = themeColor("wave");
    ctx.lineWidth = Math.max(1, width / 1200);
    ctx.stroke();
  }

  // Keyboard: white keys first, black keys over them; louder keys glow amber
  const keyboardHeight = height - keyboardTop;
  const paintKey = (midi: number, black: boolean) => {
    const { left, right } = keySpan(midi);
    const x0 = Math.round(left * unit);
    const x1 = Math.round(right * unit);
    const h = black ? Math.round(keyboardHeight * 0.6) : keyboardHeight;
    ctx.fillStyle = themeColor(black ? "key-black" : "key-white");
    ctx.fillRect(x0, keyboardTop, x1 - x0 - (black ? 0 : 1), h);
    const level = strength(picture.keys[midi - LOWEST_NOTE] ?? FLOOR_DB);
    if (lit.has(midi) || level > 0) {
      ctx.fillStyle = accent;
      ctx.globalAlpha = lit.has(midi) ? 1 : level * 0.45;
      ctx.fillRect(x0, keyboardTop, x1 - x0 - (black ? 0 : 1), h);
      ctx.globalAlpha = 1;
    }
  };
  for (let midi = LOWEST_NOTE; midi <= HIGHEST_NOTE; midi++)
    if (!isBlack(midi)) paintKey(midi, false);
  for (let midi = LOWEST_NOTE; midi <= HIGHEST_NOTE; midi++)
    if (isBlack(midi)) paintKey(midi, true);

  // Octave names on the C keys, and the name over every strong note
  const font = Math.max(9, Math.round(keyboardHeight * 0.22));
  ctx.font = `${font}px "JetBrains Mono Variable", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (let midi = LOWEST_NOTE; midi <= HIGHEST_NOTE; midi++) {
    if (midi % 12 !== 0) continue;
    const { left, right } = keySpan(midi);
    ctx.fillStyle = lit.has(midi) ? themeColor("on-accent") : themeColor("tick");
    ctx.fillText(noteName(midi), ((left + right) / 2) * unit, height - 2);
  }
  ctx.fillStyle = accent;
  ctx.textBaseline = "top";
  for (const midi of picture.notes) {
    const x = (midi - LOWEST_NOTE + 0.5) * unit;
    ctx.fillText(noteName(midi), x, 2);
  }
}

/**
 * Note view: a piano keyboard under the waveform with the level of every note above it,
 * like the spectrum of Transcribe. It listens around the playhead (live while playing) or
 * over the whole loop; the keys follow the pitch control and the channel choice.
 */
export function NoteView() {
  const mode = useNotesStore((s) => s.mode);
  const setMode = useNotesStore((s) => s.setMode);
  const hasLoop = useLoopStore((s) => s.start !== null && s.end !== null);
  const [notes, setNotes] = useState<number[]>([]);
  const picture = useRef<Picture>(EMPTY);
  const dirty = useRef(true);
  const lastKey = useRef("");
  const lastSent = useRef(0);
  const inFlight = useRef(false);
  const { ref: canvasRef, size } = useCanvas(() => {
    dirty.current = true;
  });

  // Another mode starts from an empty picture (a new track remounts the view)
  const changeMode = (next: NotesMode) => {
    picture.current = EMPTY;
    lastKey.current = "";
    dirty.current = true;
    setNotes([]);
    setMode(next);
  };

  useAnimationFrame((now) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const request = currentRequest(mode);
    const playing = usePlayerStore.getState().playing;
    const key = request ? JSON.stringify(request) : "";
    const due = mode === "playhead" && playing ? now - lastSent.current >= LIVE_INTERVAL_MS : true;
    if (request && key !== lastKey.current && due && !inFlight.current) {
      inFlight.current = true;
      lastKey.current = key;
      lastSent.current = now;
      void commands.spectrum(request).then((result) => {
        inFlight.current = false;
        if (result.status !== "ok") return;
        const keys = keyLevels(result.data);
        const strongest = strongestNotes(keys);
        picture.current = { levels: result.data, keys, notes: strongest };
        dirty.current = true;
        setNotes((previous) => (previous.join() === strongest.join() ? previous : strongest));
      });
    }
    if (dirty.current) {
      dirty.current = false;
      draw(canvas, size.current.width, size.current.height, picture.current);
    }
  });

  return (
    <section
      aria-label={n.title}
      className="well flex h-36 shrink-0 flex-col overflow-hidden rounded-control"
    >
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-edge px-2">
        <span className="panel-label mr-1">{n.title}</span>
        <Chip active={mode === "playhead"} onClick={() => changeMode("playhead")}>
          {n.playhead}
        </Chip>
        <Chip active={mode === "loop"} disabled={!hasLoop} onClick={() => changeMode("loop")}>
          {n.loop}
        </Chip>
        <span className="ml-2 min-w-0 flex-1 truncate font-mono text-xs text-lcd-fg tabular">
          {mode === "loop" && !hasLoop
            ? n.needsLoop
            : notes.length > 0
              ? notes.map(noteName).join("  ")
              : n.silent}
        </span>
      </div>
      <canvas ref={canvasRef} className="min-h-0 w-full flex-1" />
    </section>
  );
}
