import { useState } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { ClickSoundRow } from "@/features/metronome/ClickSoundRow";
import { t } from "@/i18n";
import { SOUND_SLOTS } from "@/stores/clickSounds";

const p = t.practice;

/**
 * Metronome sounds, like Reaper's: one for the first beat of a bar, one for the others,
 * built-in or imported (the same rows as the metronome's Sounds tab, where the subdivisions
 * and the cross rhythm are too).
 */
export function ClickSoundPicker() {
  const [failed, setFailed] = useState(false);
  return (
    <div className="space-y-3">
      <Tooltip label={p.soundHint}>
        <p className="panel-label cursor-help">{p.sound}</p>
      </Tooltip>
      {SOUND_SLOTS.filter(({ slot }) => slot === "accent" || slot === "beat").map((slot) => (
        <ClickSoundRow key={slot.slot} slot={slot} onFailed={() => setFailed(true)} />
      ))}
      {failed && <p className="text-xs text-accent">{t.metronome.sounds.importFailed}</p>}
    </div>
  );
}
