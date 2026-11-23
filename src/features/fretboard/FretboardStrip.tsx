import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { type ReactNode, useRef } from "react";
import { Chip } from "@/components/ui/Chip";
import { menuContent, menuItem, menuLabel, menuSeparator, smallKey } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { localNoteName } from "@/features/practice/reference";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { CHORDS, findChord, noteName, ROOT_CHOICES, resolveShape, SCALES } from "@/lib/music";
import { useWheelSteps } from "@/lib/useWheelSteps";
import { FRET_CHOICES, SPAN_CHOICES, useFretboardStore } from "@/stores/fretboard";
import { FretboardDiagram } from "./FretboardDiagram";
import { MAX_STRINGS, MIN_STRINGS, TUNINGS } from "./tuning";

const n = t.metronome.neck;

const toolKey =
  "hw flex h-7 items-center gap-1.5 rounded-control px-2.5 text-xs text-fg hover:brightness-125 data-[state=open]:text-accent";

/** Italian name of a scale or chord (the theory files keep MetroFlow's English ones). */
function shapeLabel(kind: "scale" | "chord", id: string, fallback: string): string {
  return (kind === "scale" ? n.scaleNames[id] : n.chordNames[id]) ?? fallback;
}

/** A toolbar key that opens a menu: its value on it, like a DAW's selector. */
function MenuKey({
  label,
  hint,
  value,
  children,
  width = "w-56",
}: {
  label: string;
  hint: string;
  value: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  return (
    <DropdownMenu.Root>
      <Tooltip label={hint}>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={toolKey} aria-label={label}>
            <span className="font-medium">{value}</span>
            <ChevronDown className="size-3 text-fg-subtle" />
          </button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={6}
          className={cn(menuContent, width, "max-h-[60vh] overflow-y-auto")}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Checked item of a menu. */
function Choice({
  on,
  onSelect,
  children,
}: {
  on: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Item className={menuItem} onSelect={onSelect}>
      <Check className={on ? "size-4 shrink-0" : "size-4 shrink-0 opacity-0"} />
      {children}
    </DropdownMenu.Item>
  );
}

/** Groups of a catalogue, in order of first appearance. */
function grouped<T extends { group: string }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  return [...groups];
}

function RootMenu() {
  const shape = useFretboardStore((s) => s.shape);
  const accidental = useFretboardStore((s) => s.accidental);
  const setShape = useFretboardStore((s) => s.setShape);
  const ref = useRef<HTMLDivElement>(null);
  // The wheel walks the root by semitones, like transposing in a DAW
  useWheelSteps(ref, (step) => setShape({ root: (shape.root + step + 12) % 12 }));
  return (
    <div ref={ref}>
      <MenuKey label={n.root} hint={n.root} value={noteName(shape.root, accidental)} width="w-64">
        <div className="grid grid-cols-4 gap-1 p-1">
          {ROOT_CHOICES.map(({ pc }) => (
            <DropdownMenu.Item
              key={pc}
              onSelect={() => setShape({ root: pc })}
              className={cn(
                menuItem,
                "flex-col gap-0 px-1 py-1 text-center",
                pc === shape.root && "text-accent",
              )}
            >
              <span className="font-mono text-sm">{noteName(pc, accidental)}</span>
              {t.common.solfege && (
                <span className="text-[10px] opacity-70">{localNoteName(pc)}</span>
              )}
            </DropdownMenu.Item>
          ))}
        </div>
      </MenuKey>
    </div>
  );
}

function ShapeMenu() {
  const shape = useFretboardStore((s) => s.shape);
  const accidental = useFretboardStore((s) => s.accidental);
  const setShape = useFretboardStore((s) => s.setShape);
  const resolved = resolveShape(shape);
  const chord = shape.kind === "chord" ? findChord(shape.id) : null;
  const value = chord
    ? `${noteName(shape.root, accidental)}${chord.symbol} · ${shapeLabel("chord", chord.id, chord.name)}`
    : shapeLabel("scale", shape.id, resolved?.name ?? "");
  return (
    <MenuKey
      label={n.shape}
      hint={`${n.shape}: ${resolved?.labels.join(" · ") ?? ""}`}
      value={value}
      width="w-72"
    >
      <DropdownMenu.Label className={cn(menuLabel, "text-accent")}>{n.scales}</DropdownMenu.Label>
      {grouped(SCALES).map(([group, scales]) => (
        <div key={group}>
          <DropdownMenu.Label className={menuLabel}>{n.groups[group] ?? group}</DropdownMenu.Label>
          {scales.map((scale) => (
            <Choice
              key={scale.id}
              on={shape.kind === "scale" && shape.id === scale.id}
              onSelect={() => setShape({ kind: "scale", id: scale.id })}
            >
              {shapeLabel("scale", scale.id, scale.name)}
            </Choice>
          ))}
        </div>
      ))}
      <DropdownMenu.Separator className={menuSeparator} />
      <DropdownMenu.Label className={cn(menuLabel, "text-accent")}>{n.chords}</DropdownMenu.Label>
      {grouped(CHORDS).map(([group, chords]) => (
        <div key={group}>
          <DropdownMenu.Label className={menuLabel}>{n.groups[group] ?? group}</DropdownMenu.Label>
          {chords.map((item) => (
            <Choice
              key={item.id}
              on={shape.kind === "chord" && shape.id === item.id}
              onSelect={() => setShape({ kind: "chord", id: item.id })}
            >
              <span className="w-14 shrink-0 font-mono">
                {noteName(shape.root, accidental)}
                {item.symbol}
              </span>
              <span className="truncate">{shapeLabel("chord", item.id, item.name)}</span>
            </Choice>
          ))}
        </div>
      ))}
    </MenuKey>
  );
}

function TuningMenu() {
  const tuningId = useFretboardStore((s) => s.tuningId);
  const strings = useFretboardStore((s) => s.strings);
  const selectTuning = useFretboardStore((s) => s.selectTuning);
  const setStringCount = useFretboardStore((s) => s.setStringCount);
  return (
    <MenuKey
      label={n.tuning}
      hint={n.tuning}
      value={n.tuningNames[tuningId] ?? tuningId}
      width="w-64"
    >
      {TUNINGS.map((tuning) => (
        <Choice
          key={tuning.id}
          on={tuning.id === tuningId}
          onSelect={() => selectTuning(tuning.id)}
        >
          {n.tuningNames[tuning.id] ?? tuning.name}
        </Choice>
      ))}
      <DropdownMenu.Separator className={menuSeparator} />
      <div className="flex items-center justify-between px-2.5 py-1">
        <span className="panel-label">{n.strings}</span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            className={smallKey}
            disabled={strings.length <= MIN_STRINGS}
            onClick={() => setStringCount(strings.length - 1)}
            aria-label={`${n.strings} −`}
          >
            <Minus className="size-3" />
          </button>
          <span className="w-6 text-center font-mono text-sm tabular">{strings.length}</span>
          <button
            type="button"
            className={smallKey}
            disabled={strings.length >= MAX_STRINGS}
            onClick={() => setStringCount(strings.length + 1)}
            aria-label={`${n.strings} +`}
          >
            <Plus className="size-3" />
          </button>
        </span>
      </div>
    </MenuKey>
  );
}

function PositionMenu() {
  const windowFrom = useFretboardStore((s) => s.windowFrom);
  const windowSpan = useFretboardStore((s) => s.windowSpan);
  const frets = useFretboardStore((s) => s.frets);
  const setWindow = useFretboardStore((s) => s.setWindow);
  const setFrets = useFretboardStore((s) => s.setFrets);
  const ref = useRef<HTMLDivElement>(null);
  // The wheel slides the position along the neck
  useWheelSteps(ref, (step) => windowSpan > 0 && setWindow(windowFrom + step, windowSpan));
  const value =
    windowSpan === 0 ? n.wholeNeck : n.fretsRange(windowFrom, windowFrom + windowSpan - 1);
  return (
    <div ref={ref}>
      <MenuKey label={n.position} hint={n.positionHint} value={value} width="w-60">
        {SPAN_CHOICES.map((span) => (
          <Choice key={span} on={span === windowSpan} onSelect={() => setWindow(windowFrom, span)}>
            {span === 0 ? n.wholeNeck : n.span(span)}
          </Choice>
        ))}
        <div className="flex items-center justify-between px-2.5 py-1">
          <span className="panel-label">{n.firstFret}</span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              className={smallKey}
              disabled={windowSpan === 0 || windowFrom <= 1}
              onClick={() => setWindow(windowFrom - 1, windowSpan)}
              aria-label={`${n.firstFret} −`}
            >
              <Minus className="size-3" />
            </button>
            <span className="w-6 text-center font-mono text-sm tabular">{windowFrom}</span>
            <button
              type="button"
              className={smallKey}
              disabled={windowSpan === 0 || windowFrom + windowSpan - 1 >= frets}
              onClick={() => setWindow(windowFrom + 1, windowSpan)}
              aria-label={`${n.firstFret} +`}
            >
              <Plus className="size-3" />
            </button>
          </span>
        </div>
        <DropdownMenu.Separator className={menuSeparator} />
        <DropdownMenu.Label className={menuLabel}>{n.fretsShown}</DropdownMenu.Label>
        <div className="flex gap-1 px-2.5 pb-1.5">
          {FRET_CHOICES.map((count) => (
            <Chip
              key={count}
              active={count === frets}
              onClick={() => setFrets(count)}
              className="min-w-9 font-mono"
            >
              {count}
            </Chip>
          ))}
        </div>
      </MenuKey>
    </div>
  );
}

/**
 * The guitar neck under the metronome, lit with a scale or a chord (MetroFlow's fretboard):
 * a toolbar of selectors (root, shape, tuning, position, degrees or notes, ♯ / ♭) and the neck
 * itself. Nothing to type: menus, − / + and the wheel, as in a DAW.
 */
export function FretboardStrip() {
  const enabled = useFretboardStore((s) => s.enabled);
  const shape = useFretboardStore((s) => s.shape);
  const strings = useFretboardStore((s) => s.strings);
  const frets = useFretboardStore((s) => s.frets);
  const display = useFretboardStore((s) => s.display);
  const accidental = useFretboardStore((s) => s.accidental);
  const windowFrom = useFretboardStore((s) => s.windowFrom);
  const windowSpan = useFretboardStore((s) => s.windowSpan);
  const setDisplay = useFretboardStore((s) => s.setDisplay);
  const setAccidental = useFretboardStore((s) => s.setAccidental);
  const resolved = resolveShape(shape);
  if (!enabled || !resolved) return null;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="panel-label mr-1">{n.title}</h3>
        <RootMenu />
        <ShapeMenu />
        <TuningMenu />
        <PositionMenu />
        <span className="ml-auto flex items-center gap-1">
          <Tooltip label={n.displayHint}>
            <span className="flex gap-1">
              <Chip active={display === "degrees"} onClick={() => setDisplay("degrees")}>
                {n.degrees}
              </Chip>
              <Chip active={display === "notes"} onClick={() => setDisplay("notes")}>
                {n.notes}
              </Chip>
            </span>
          </Tooltip>
          <Tooltip label={n.accidentalHint}>
            <span className="ml-1 flex gap-1">
              <Chip
                active={accidental === "sharp"}
                onClick={() => setAccidental("sharp")}
                className="min-w-7"
              >
                {n.sharp}
              </Chip>
              <Chip
                active={accidental === "flat"}
                onClick={() => setAccidental("flat")}
                className="min-w-7"
              >
                {n.flat}
              </Chip>
            </span>
          </Tooltip>
        </span>
      </div>
      <FretboardDiagram
        strings={strings}
        shape={resolved}
        frets={frets}
        display={display}
        accidental={accidental}
        window={{ from: windowFrom, span: windowSpan }}
      />
    </section>
  );
}
