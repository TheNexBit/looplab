import { Minus, Plus } from "lucide-react";
import { Popover } from "radix-ui";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { floatingPanel } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { usePracticeStore } from "@/stores/practice";
import { BEAT_UNITS, BEATS_PER_BAR, TIME_SIGNATURES } from "./tempo";

const p = t.practice;

/**
 * The time signature as DAWs show it ("7/8"): click for the usual ones and +/− for the
 * rest, or turn the mouse wheel over it to change the beats in a bar. Nothing to type.
 */
export function TimeSignaturePicker({
  side = "bottom",
  variant = "panel",
}: {
  side?: "top" | "bottom";
  /** "display": digits inside an LCD (the dock); "panel": its own small display */
  variant?: "panel" | "display";
}) {
  const beats = usePracticeStore((s) => s.beatsPerBar);
  const unit = usePracticeStore((s) => s.beatUnit);
  const set = (nextBeats: number, nextUnit = unit) =>
    usePracticeStore.getState().setTimeSignature(nextBeats, nextUnit);

  // The wheel changes the beats and must not scroll the panel too: a non-passive listener
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = ref.current;
    if (!button) return;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      const { beatsPerBar, beatUnit } = usePracticeStore.getState();
      usePracticeStore
        .getState()
        .setTimeSignature(beatsPerBar + (event.deltaY < 0 ? 1 : -1), beatUnit);
    };
    button.addEventListener("wheel", onWheel, { passive: false });
    return () => button.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <Popover.Root>
      <Tooltip label={p.meterHint}>
        <Popover.Trigger asChild>
          <button
            type="button"
            ref={ref}
            aria-label={`${p.meter}: ${beats}/${unit}`}
            className={
              variant === "panel"
                ? "well flex h-7 min-w-14 items-center justify-center rounded-control px-2 font-mono text-sm font-medium text-lcd-fg tabular hover:brightness-125"
                : "flex h-6 min-w-10 items-center justify-center rounded-control px-1 font-mono text-[15px] font-medium text-lcd-fg tabular hover:brightness-125"
            }
          >
            {beats}/{unit}
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align="start"
          sideOffset={6}
          className={`${floatingPanel} w-64 space-y-3 p-3`}
        >
          <p className="panel-label">{p.meter}</p>
          <div className="grid grid-cols-4 gap-1">
            {TIME_SIGNATURES.map(([b, u]) => (
              <Chip
                key={`${b}/${u}`}
                active={b === beats && u === unit}
                aria-pressed={b === beats && u === unit}
                onClick={() => set(b, u)}
                className="font-mono"
              >
                {b}/{u}
              </Chip>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-fg-muted">{p.meterBeats}</span>
            <div className="flex items-center gap-1">
              <Button
                variant="hardware"
                size="icon"
                className="size-6"
                disabled={beats <= BEATS_PER_BAR.min}
                onClick={() => set(beats - 1)}
                aria-label={p.fewerBeats}
              >
                <Minus className="size-3.5" />
              </Button>
              <span className="w-7 text-center font-mono text-sm text-lcd-fg tabular">{beats}</span>
              <Button
                variant="hardware"
                size="icon"
                className="size-6"
                disabled={beats >= BEATS_PER_BAR.max}
                onClick={() => set(beats + 1)}
                aria-label={p.moreBeats}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-fg-muted">{p.meterUnit}</span>
            <div className="flex gap-1">
              {BEAT_UNITS.map((u) => (
                <Chip
                  key={u}
                  active={u === unit}
                  aria-pressed={u === unit}
                  onClick={() => set(beats, u)}
                  className="min-w-8 font-mono"
                >
                  {u}
                </Chip>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-fg-subtle">{p.meterTip}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
