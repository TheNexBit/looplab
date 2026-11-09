import { FileAudio, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { SOUND_SLOTS, useClickSoundsStore } from "@/stores/clickSounds";
import { ClickSoundRow, importSound } from "./ClickSoundRow";

const s = t.metronome.sounds;

/**
 * The sounds of the clicks, as MetroFlow's sound panel: for the accent, the beats, the
 * subdivisions and the cross rhythm a built-in sound or an imported one, a key to hear it
 * and a level. The same sounds click over the tracks. Under them, the imported sounds.
 */
export function SoundsPanel() {
  const imported = useClickSoundsStore((st) => st.sounds);
  const remove = useClickSoundsStore((st) => st.remove);
  const [failed, setFailed] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-muted">{s.intro}</p>
      {SOUND_SLOTS.map((slot) => (
        <ClickSoundRow key={slot.slot} slot={slot} onFailed={() => setFailed(true)} />
      ))}

      <section className="space-y-2 border-t border-edge pt-3">
        <p className="panel-label">{s.imported}</p>
        {imported.length === 0 && <p className="text-xs text-fg-subtle">{s.none}</p>}
        {imported.map(({ id }) => (
          <div key={id} className="flex items-center gap-2 text-xs">
            <FileAudio className="size-3.5 shrink-0 text-fg-subtle" />
            <span className="min-w-0 flex-1 truncate">{id}</span>
            <Tooltip label={s.remove(id)}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void remove(id)}
                aria-label={s.remove(id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </Tooltip>
          </div>
        ))}
        <Tooltip label={s.importHint}>
          <Button
            variant="hardware"
            className="w-full"
            onClick={() => {
              setFailed(false);
              void importSound().then((id) => id === "failed" && setFailed(true));
            }}
          >
            <Plus className="size-3.5" />
            {s.importFile}
          </Button>
        </Tooltip>
        {failed && <p className="text-xs text-accent">{s.importFailed}</p>}
      </section>
    </div>
  );
}
