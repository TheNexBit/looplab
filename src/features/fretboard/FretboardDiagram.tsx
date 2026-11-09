import { Minus, Plus } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useRef } from "react";
import { menuContent, menuLabel, smallKey } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { type Accidental, midiName, noteName, type ResolvedShape } from "@/lib/music";
import { useWheelSteps } from "@/lib/useWheelSteps";
import { type FretDisplay, useFretboardStore } from "@/stores/fretboard";
import { byString, DOUBLE_INLAYS, INLAYS, marksFor } from "./fretGrid";

const n = t.metronome.neck;

/** Faint enough to read as context, strong enough to still be a shape. */
const OUT_OF_WINDOW = 0.22;
/** Narrowest a fret is drawn, in rem: a neck too wide for the window scrolls instead. */
const MIN_FRET = 1.5;

/** The name of an open string: wheel or − / + in its menu retune it by a semitone. */
function StringKey({
  index,
  midi,
  accidental,
}: {
  index: number;
  midi: number;
  accidental: Accidental;
}) {
  const retune = useFretboardStore((s) => s.retuneString);
  const ref = useRef<HTMLButtonElement>(null);
  useWheelSteps(ref, (step) => retune(index, step));
  const name = midiName(midi, accidental);
  return (
    <DropdownMenu.Root>
      <Tooltip label={n.stringHint(name)}>
        <DropdownMenu.Trigger asChild>
          <button
            ref={ref}
            type="button"
            className="h-6 w-full rounded-control pr-1.5 text-right font-mono text-[11px] text-fg-muted tabular hover:bg-surface-hover hover:text-fg"
          >
            {noteName(midi, accidental)}
          </button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="left" sideOffset={6} className={cn(menuContent, "min-w-0")}>
          <DropdownMenu.Label className={menuLabel}>{n.tuning}</DropdownMenu.Label>
          <div className="flex items-center gap-2 px-2.5 py-1">
            <button
              type="button"
              className={smallKey}
              onClick={() => retune(index, -1)}
              aria-label={n.lower}
            >
              <Minus className="size-3" />
            </button>
            <span className="w-10 text-center font-mono text-sm tabular">{name}</span>
            <button
              type="button"
              className={smallKey}
              onClick={() => retune(index, 1)}
              aria-label={n.higher}
            >
              <Plus className="size-3" />
            </button>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

interface FretboardDiagramProps {
  strings: number[];
  shape: ResolvedShape;
  frets: number;
  display: FretDisplay;
  accidental: Accidental;
  window: { from: number; span: number };
}

/**
 * The neck as a grid, from MetroFlow: strings are rows (highest on top, as in every chord
 * chart), frets are columns of equal width, the nut a thick rule. Every place the shape's
 * notes fall gets a dot naming its degree (R, ♭3, 5) or its note; the root is lit amber.
 * Outside the position being studied the dots stay drawn, only faint.
 */
export function FretboardDiagram({
  strings,
  shape,
  frets,
  display,
  accidental,
  window,
}: FretboardDiagramProps) {
  const rows = byString(marksFor(strings, shape.degrees, frets, window), strings.length);
  const columns = `2.25rem repeat(${frets + 1}, minmax(${MIN_FRET}rem, 1fr))`;
  const top = strings.length - 1;

  return (
    <div className="well min-w-0 overflow-x-auto rounded-panel px-2 py-2">
      <div className="min-w-fit">
        {strings.map((_, row) => {
          const string = top - row;
          const midi = strings[string] ?? 40;
          const marks = rows[string] ?? [];
          return (
            <div
              key={string}
              className="grid items-center"
              style={{ gridTemplateColumns: columns }}
            >
              <StringKey index={string} midi={midi} accidental={accidental} />
              {Array.from({ length: frets + 1 }, (_, fret) => {
                const mark = marks[fret] ?? null;
                return (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: one cell per fret, in order
                    key={fret}
                    className={cn(
                      "relative grid h-6 place-items-center border-r",
                      fret === 0 ? "border-r-[3px] border-fg-muted/70" : "border-border",
                    )}
                  >
                    {/* The string, passing behind the dots like a string under a finger */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-1/2 bg-fg-subtle/50"
                      style={{ height: `${1 + (string < 3 ? (3 - string) * 0.4 : 0)}px` }}
                    />
                    {mark && (
                      <span
                        title={`${noteName(mark.pc, accidental)} · ${mark.degree}`}
                        className={cn(
                          "relative grid size-[1.2rem] place-items-center rounded-full font-mono text-[0.58rem] font-medium tabular",
                          mark.isRoot
                            ? "bg-accent text-on-accent shadow-[0_0_6px_var(--color-accent)]"
                            : "border border-edge bg-surface text-fg",
                        )}
                        style={{ opacity: mark.inWindow ? 1 : OUT_OF_WINDOW }}
                      >
                        {display === "degrees" ? mark.degree : noteName(mark.pc, accidental)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {/* Fret numbers, with the inlays a player finds the hand by */}
        <div className="mt-1 grid" style={{ gridTemplateColumns: columns }}>
          <span />
          {Array.from({ length: frets + 1 }, (_, fret) => {
            const inlaid = INLAYS.includes(fret);
            const doubled = DOUBLE_INLAYS.includes(fret);
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: one number per fret, in order
                key={fret}
                className={cn(
                  "text-center font-mono text-[0.6rem] tabular",
                  inlaid || doubled ? "text-fg-muted" : "text-fg-subtle/60",
                )}
              >
                {fret === 0 ? "" : fret}
                {doubled ? " ••" : inlaid ? " •" : ""}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
