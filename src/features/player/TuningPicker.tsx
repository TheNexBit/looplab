import { Check, ChevronDown, Music2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Chip } from "@/components/ui/Chip";
import { menuContent, menuItem, menuLabel } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { signed } from "@/lib/format";
import { usePlayerStore } from "@/stores/player";
import { TUNINGS } from "./limits";

const tr = t.transport;

/**
 * Tuning presets for guitarists: the tuning the track was recorded in, and the Pitch that
 * brings it back to standard tuning ("down 1/2 step" in E♭ → +1 st), so a guitar in standard
 * tuning plays along as it is.
 */
export function TuningPicker() {
  const semitones = usePlayerStore((s) => s.semitones);
  const cents = usePlayerStore((s) => s.cents);
  const chosen = cents === 0 ? TUNINGS.find(([, shift]) => shift === semitones) : undefined;
  return (
    <DropdownMenu.Root>
      <Tooltip label={tr.tuningHint}>
        <DropdownMenu.Trigger asChild>
          <Chip
            active={chosen !== undefined && chosen[1] !== 0}
            aria-label={tr.tuning}
            className="hidden h-[22px] items-center gap-0.5 px-1.5 text-[10px] xl:inline-flex"
          >
            {/* The name only in wide windows: elsewhere a note icon, the tooltip names it */}
            <Music2 className="size-3 2xl:hidden" />
            <span className="hidden 2xl:inline">{tr.tuning}</span>
            <ChevronDown className="size-3" />
          </Chip>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="top" align="end" sideOffset={8} className={menuContent}>
          <DropdownMenu.Label className={menuLabel}>{tr.tuning}</DropdownMenu.Label>
          {TUNINGS.map(([id, shift]) => (
            <DropdownMenu.Item
              key={id}
              className={menuItem}
              onSelect={() => usePlayerStore.getState().setPitch(shift, 0)}
            >
              <Check className={chosen?.[0] === id ? "size-4" : "size-4 opacity-0"} />
              <span className="flex-1">{tr.tunings[id]}</span>
              <span className="font-mono text-[11px] text-fg-subtle tabular">
                {signed(shift, tr.semitones)}
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
