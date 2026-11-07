import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Chip } from "@/components/ui/Chip";
import { menuContent, menuItem, menuLabel, menuSeparator } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { METRONOME_UNITS, shownSetup, useMetronomeStore } from "@/stores/metronome";
import { BEATS_MAX, BEATS_MIN, MIXED_METERS } from "./beatGrid";
import { COMMON_METERS, groupingChoices } from "./meterChoices";

const m = t.metronome;
const same = (a: number[] | null, b: number[] | null | undefined) =>
  (a ?? []).join("+") === (b ?? []).join("+");

const smallKey =
  "hw inline-flex size-6 items-center justify-center rounded-control text-fg-muted hover:text-fg hover:brightness-125 disabled:opacity-40";

/**
 * The bar, on a display key: 7/8 and its grouping (2+2+3). The menu lists the common
 * meters, the grouped ones players know by name, every grouping of the current bar, and
 * − / + for the pulses and the note value: nothing to type.
 */
export function MeterMenu() {
  const beats = useMetronomeStore((s) => shownSetup(s).beats);
  const unit = useMetronomeStore((s) => shownSetup(s).unit);
  const grouping = useMetronomeStore((s) => shownSetup(s).grouping);
  const setMeter = useMetronomeStore((s) => s.setMeter);
  const choices = groupingChoices(beats);

  return (
    <DropdownMenu.Root>
      <Tooltip label={m.meterHint}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={m.meter}
            className="lcd flex h-24 min-w-32 flex-col items-end justify-center gap-0.5 rounded-panel px-4 text-right focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <span className="flex items-center gap-1 text-[10px] font-medium tracking-[0.16em] text-lcd-dim uppercase">
              {m.meter}
              <ChevronDown className="size-3" />
            </span>
            <span className="font-mono text-[34px] leading-none text-lcd-fg tabular lcd-glow">
              {beats}/{unit}
            </span>
            <span className="font-mono text-[11px] text-lcd-dim">
              {grouping ? grouping.join(" + ") : " "}
            </span>
          </button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="end"
          sideOffset={6}
          className={cn(menuContent, "max-h-[70vh] w-64 overflow-y-auto")}
        >
          <DropdownMenu.Label className={menuLabel}>{m.pulsesInBar}</DropdownMenu.Label>
          <div className="flex items-center justify-between gap-2 px-2.5 py-1">
            <span className="flex items-center gap-1">
              <button
                type="button"
                className={smallKey}
                disabled={beats <= BEATS_MIN}
                onClick={() => setMeter(beats - 1, unit, null)}
                aria-label={`${m.pulsesInBar} −`}
              >
                <Minus className="size-3" />
              </button>
              <span className="w-8 text-center font-mono text-sm tabular">{beats}</span>
              <button
                type="button"
                className={smallKey}
                disabled={beats >= BEATS_MAX}
                onClick={() => setMeter(beats + 1, unit, null)}
                aria-label={`${m.pulsesInBar} +`}
              >
                <Plus className="size-3" />
              </button>
            </span>
            <span className="flex gap-1" role="radiogroup" aria-label={m.unit}>
              {METRONOME_UNITS.map((value) => (
                <Chip
                  key={value}
                  role="radio"
                  aria-checked={value === unit}
                  active={value === unit}
                  onClick={() => setMeter(beats, value, grouping)}
                  className="min-w-7 px-1 font-mono"
                >
                  /{value}
                </Chip>
              ))}
            </span>
          </div>

          <DropdownMenu.Separator className={menuSeparator} />
          <DropdownMenu.Label className={menuLabel}>{m.common}</DropdownMenu.Label>
          <div className="grid grid-cols-4 gap-1 px-1.5 pb-1">
            {COMMON_METERS.map(([b, u]) => (
              <DropdownMenu.Item
                key={`${b}/${u}`}
                className={cn(
                  menuItem,
                  "justify-center font-mono",
                  b === beats && u === unit && !grouping && "text-accent",
                )}
                onSelect={() => setMeter(b, u, null)}
              >
                {b}/{u}
              </DropdownMenu.Item>
            ))}
          </div>
          {MIXED_METERS.map((sig) => (
            <DropdownMenu.Item
              key={`${sig.beats}/${sig.unit}:${sig.grouping?.join("+")}`}
              className={menuItem}
              onSelect={() => setMeter(sig.beats, sig.unit as 2 | 4 | 8, sig.grouping ?? null)}
            >
              <Check
                className={
                  sig.beats === beats && sig.unit === unit && same(grouping, sig.grouping)
                    ? "size-4"
                    : "size-4 opacity-0"
                }
              />
              <span className="font-mono">
                {sig.beats}/{sig.unit}
              </span>
              <span className="ml-auto font-mono text-[11px] text-fg-subtle">
                {sig.grouping?.join("+")}
              </span>
            </DropdownMenu.Item>
          ))}

          {choices.length > 0 && (
            <>
              <DropdownMenu.Separator className={menuSeparator} />
              <DropdownMenu.Label className={menuLabel}>
                {m.groups} · {beats}/{unit}
              </DropdownMenu.Label>
              <DropdownMenu.Item className={menuItem} onSelect={() => setMeter(beats, unit, null)}>
                <Check className={grouping ? "size-4 opacity-0" : "size-4"} />
                {m.noGroups}
              </DropdownMenu.Item>
              {choices.map((choice) => (
                <DropdownMenu.Item
                  key={choice.join("+")}
                  className={menuItem}
                  onSelect={() => setMeter(beats, unit, choice)}
                >
                  <Check className={same(grouping, choice) ? "size-4" : "size-4 opacity-0"} />
                  <span className="font-mono">{choice.join(" + ")}</span>
                </DropdownMenu.Item>
              ))}
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
