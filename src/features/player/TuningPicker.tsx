import { Check } from "lucide-react";
import { ContextMenu } from "radix-ui";
import { menuItem, menuLabel } from "@/components/ui/menu";
import { t } from "@/i18n";
import { signed } from "@/lib/format";
import { usePlayerStore } from "@/stores/player";
import { TUNINGS } from "./limits";

const tr = t.transport;

/**
 * Tuning presets for guitarists, in the pitch knob's right-click menu: the tuning the track
 * was recorded in, and the pitch that brings it back to standard tuning ("down 1/2 step" in
 * E♭ → +1 st), so a guitar in standard tuning plays along as it is.
 */
export function TuningItems() {
  const semitones = usePlayerStore((s) => s.semitones);
  const cents = usePlayerStore((s) => s.cents);
  const chosen = cents === 0 ? TUNINGS.find(([, shift]) => shift === semitones) : undefined;
  return (
    <>
      <ContextMenu.Label className={menuLabel} title={tr.tuningHint}>
        {tr.tuning}
      </ContextMenu.Label>
      {TUNINGS.map(([id, shift]) => (
        <ContextMenu.Item
          key={id}
          className={menuItem}
          onSelect={() => usePlayerStore.getState().setPitch(shift, 0)}
        >
          <Check className={chosen?.[0] === id ? "size-4" : "size-4 opacity-0"} />
          <span className="flex-1">{tr.tunings[id]}</span>
          <span className="font-mono text-[11px] text-fg-subtle tabular">
            {signed(shift, tr.semitones)}
          </span>
        </ContextMenu.Item>
      ))}
    </>
  );
}
