import { useEffect, useMemo, useRef, useState } from "react";
import { DOUBLE_INLAYS, INLAYS } from "@/features/fretboard/fretGrid";
import { t } from "@/i18n";
import { noteName } from "@/lib/music";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { useFretboardStore } from "@/stores/fretboard";
import { currentPosition } from "@/stores/player";
import { useNeckStore } from "./scoreExtras";
import { chordAt, type NeckChord } from "./scoreNotes";

/** Geometry of the drawing in CSS pixels: the frets stretch to the panel's width, dots stay round. */
const STRING_GAP = 14;
const PAD_Y = 12;
const LABEL_W = 26;
/** Room left of the nut for open strings */
const OPEN_W = 22;
const MIN_FRETS = 12;
const MAX_FRETS = 24;
/** A chord still counts as heard this long after its written end (seconds): no flicker. */
const LINGER = 0.08;

/** Width of fret `n` (the space before fret wire n), narrowing up the neck like a real one. */
const fretWidth = (n: number) => 60 * 0.9439 ** (n - 1);

/** What is lit: the chord heard (if still ringing) and the one coming next. */
interface Lit {
  now: NeckChord | null;
  next: NeckChord | null;
}

function litAt(chords: readonly NeckChord[], seconds: number): Lit {
  const index = chordAt(chords, seconds);
  const current = chords[index];
  const now = current && seconds <= current.end + LINGER ? current : null;
  return { now, next: chords[index + 1] ?? null };
}

/**
 * The neck under the tab, like Soundslice's: the notes being heard light up where they are
 * played (fret number in the dot), the next ones show as faint rings so the hand can get
 * there in time. It follows the playhead on every frame but only redraws when the notes change.
 */
export function TabNeck() {
  const chords = useNeckStore((s) => s.chords);
  const tuning = useNeckStore((s) => s.tuning);
  const accidental = useFretboardStore((s) => s.accidental);
  const [lit, setLit] = useState<Lit>({ now: null, next: null });
  const boxRef = useRef<HTMLDivElement>(null);
  const hasStrings = tuning.length > 0;
  const [boxWidth, setBoxWidth] = useState(800);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the box is another element once strings appear
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBoxWidth(Math.max(200, Math.round(entry.contentRect.width)));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [hasStrings]);

  useAnimationFrame(() => {
    const next = litAt(chords, currentPosition());
    if (next.now !== lit.now || next.next !== lit.next) setLit(next);
  });

  // As many frets as the track uses (at least 12), so the neck is never needlessly small
  const frets = useMemo(() => {
    let highest = 0;
    for (const chord of chords)
      for (const note of chord.notes) highest = Math.max(highest, note.fret);
    return Math.min(MAX_FRETS, Math.max(MIN_FRETS, highest + 1));
  }, [chords]);

  const strings = tuning.length;
  if (strings === 0) {
    return (
      <div className="flex h-10 shrink-0 items-center justify-center border-t border-border bg-stage text-[11px] text-fg-subtle">
        {t.score.neckEmpty}
      </div>
    );
  }

  // Fret wire positions (x of wire n from the nut), scaled to fill the panel
  const nutX = LABEL_W + OPEN_W;
  const width = boxWidth;
  const raw: number[] = [0];
  for (let n = 1; n <= frets; n++) raw.push((raw[n - 1] ?? 0) + fretWidth(n));
  const scale = (width - nutX - 6) / (raw[frets] ?? 1);
  const wires = raw.map((x) => x * scale);
  const neckW = wires[frets] ?? 0;
  const height = PAD_Y * 2 + (strings - 1) * STRING_GAP;
  // String 1 (the lowest) at the bottom, as on the tab
  const yOf = (string: number) => PAD_Y + (strings - string) * STRING_GAP;
  const xOf = (fret: number) =>
    fret === 0 ? LABEL_W + OPEN_W / 2 : nutX + ((wires[fret - 1] ?? 0) + (wires[fret] ?? 0)) / 2;
  const mid = PAD_Y + ((strings - 1) * STRING_GAP) / 2;

  return (
    <div ref={boxRef} className="shrink-0 border-t border-border bg-stage px-2 py-1.5">
      <svg width={width} height={height} className="block" role="img" aria-label={t.score.neck}>
        {/* Fingerboard */}
        <rect
          x={nutX}
          y={PAD_Y - 6}
          width={neckW}
          height={height - 2 * PAD_Y + 12}
          rx={3}
          fill="var(--color-well)"
        />
        {INLAYS.filter((f) => f <= frets).map((f) => (
          <circle key={f} cx={xOf(f)} cy={mid} r={3.2} fill="var(--color-border)" />
        ))}
        {DOUBLE_INLAYS.filter((f) => f <= frets).map((f) => (
          <g key={f} fill="var(--color-border)">
            <circle cx={xOf(f)} cy={mid - STRING_GAP} r={3.2} />
            <circle cx={xOf(f)} cy={mid + STRING_GAP} r={3.2} />
          </g>
        ))}
        {/* Nut and frets */}
        <rect
          x={nutX - 3}
          y={PAD_Y - 6}
          width={3}
          height={height - 2 * PAD_Y + 12}
          fill="var(--color-fg-muted)"
        />
        {wires.slice(1).map((x, i) => (
          <line
            // biome-ignore lint/suspicious/noArrayIndexKey: frets never move
            key={i}
            x1={nutX + x}
            x2={nutX + x}
            y1={PAD_Y - 6}
            y2={height - PAD_Y + 6}
            stroke="var(--color-fg-subtle)"
            strokeOpacity={0.55}
            strokeWidth={1}
          />
        ))}
        {/* Fret numbers under the inlays */}
        {[...INLAYS, ...DOUBLE_INLAYS]
          .filter((f) => f <= frets)
          .map((f) => (
            <text
              key={`n${f}`}
              x={xOf(f)}
              y={height - 1}
              textAnchor="middle"
              fontSize={7}
              fill="var(--color-fg-subtle)"
            >
              {f}
            </text>
          ))}
        {/* Strings, thicker as they go down, with their open note */}
        {tuning.map((midi, i) => {
          const string = i + 1;
          const y = yOf(string);
          return (
            <g key={string}>
              <line
                x1={LABEL_W + 4}
                x2={nutX + neckW}
                y1={y}
                y2={y}
                stroke="var(--color-fg-muted)"
                strokeOpacity={0.7}
                strokeWidth={0.7 + (1 - (string - 1) / Math.max(1, strings - 1)) * 1.1}
              />
              <text
                x={LABEL_W - 4}
                y={y + 3}
                textAnchor="end"
                fontSize={9}
                fontFamily="var(--font-mono)"
                fill="var(--color-fg-muted)"
              >
                {noteName(midi % 12, accidental)}
              </text>
            </g>
          );
        })}
        {/* Coming next: faint rings */}
        {lit.next?.notes.map((note) => (
          <circle
            key={`next${note.string}-${note.fret}`}
            cx={xOf(note.fret)}
            cy={yOf(note.string)}
            r={7}
            fill="none"
            stroke="var(--color-accent)"
            strokeOpacity={0.45}
            strokeWidth={1.4}
          />
        ))}
        {/* Heard now: lit dots with the fret */}
        {lit.now?.notes.map((note) =>
          note.dead ? (
            <text
              key={`now${note.string}-${note.fret}`}
              x={xOf(note.fret)}
              y={yOf(note.string) + 4}
              textAnchor="middle"
              fontSize={12}
              fontWeight={700}
              fill="var(--color-accent)"
            >
              ×
            </text>
          ) : (
            <g key={`now${note.string}-${note.fret}`}>
              <circle
                cx={xOf(note.fret)}
                cy={yOf(note.string)}
                r={7.5}
                fill="var(--color-accent)"
                style={{ filter: "drop-shadow(0 0 4px var(--color-accent))" }}
              />
              <text
                x={xOf(note.fret)}
                y={yOf(note.string) + 3}
                textAnchor="middle"
                fontSize={8.5}
                fontWeight={700}
                fill="var(--color-bg-from)"
              >
                {note.fret}
              </text>
            </g>
          ),
        )}
      </svg>
    </div>
  );
}
