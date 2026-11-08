import { open } from "@tauri-apps/plugin-dialog";
import { ChevronDown, FileAudio, Play, Plus, Trash2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { menuContent, menuItem, menuLabel, menuSeparator } from "@/components/ui/menu";
import { Stepper } from "@/components/ui/Stepper";
import { Tooltip } from "@/components/ui/Tooltip";
import { clickSettings } from "@/features/player/syncEngine";
import { t } from "@/i18n";
import { type ClickSound, commands } from "@/lib/bindings";
import { cn } from "@/lib/cn";
import { SOUND_SLOTS, useClickSoundsStore } from "@/stores/clickSounds";
import { CLICK_SOUNDS, useSettingsStore } from "@/stores/settings";

const s = t.metronome.sounds;
const names = t.practice.sounds;
const AUDIO = ["wav", "mp3", "flac", "ogg", "m4a", "aac", "aiff"];

type Slot = (typeof SOUND_SLOTS)[number];

/** Plays one click of a kind with the sounds as they are now (also while stopped). */
async function hear(slot: Slot["slot"]) {
  await commands.setClick(clickSettings());
  await commands.previewSound(slot);
}

/** Asks for an audio file and imports it; gives its id, or null (cancelled or unusable). */
async function importSound(): Promise<string | null | "failed"> {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: s.audioFiles, extensions: AUDIO }],
  });
  if (!path) return null;
  return (await useClickSoundsStore.getState().importFile(path)) ?? "failed";
}

/** One kind of click: its sound (built-in or imported, from a menu), a key to hear it, its level. */
function SlotRow({ slot, onFailed }: { slot: Slot; onFailed: () => void }) {
  const sound = useSettingsStore((st) => st[slot.sound]) as ClickSound;
  const custom = useSettingsStore((st) => st[slot.custom]) as string;
  const level = useSettingsStore((st) => st[slot.level]) as number;
  const update = useSettingsStore((st) => st.update);
  const imported = useClickSoundsStore((st) => st.sounds);
  const label = s.slots[slot.slot];
  const current = custom || names[sound];

  // Hearing the choice right away, as in the sound menus of DAWs
  const choose = (patch: Record<string, string>) => {
    update(patch);
    void hear(slot.slot);
  };

  return (
    <div className="space-y-1.5">
      <Tooltip label={s.slotHints[slot.slot]}>
        <p className="panel-label w-fit cursor-help">{label}</p>
      </Tooltip>
      <div className="flex items-center gap-1">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              variant="hardware"
              className="min-w-0 flex-1 justify-between"
              aria-label={`${label}: ${current}`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {custom && <FileAudio className="size-3.5 shrink-0 text-accent" />}
                <span className="truncate">{current}</span>
              </span>
              <ChevronDown className="size-3.5 shrink-0" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="bottom"
              align="start"
              sideOffset={4}
              className={cn(menuContent, "max-h-[60vh] w-64 overflow-y-auto")}
            >
              <DropdownMenu.Label className={menuLabel}>{s.builtIn}</DropdownMenu.Label>
              {CLICK_SOUNDS.map((option) => (
                <DropdownMenu.Item
                  key={option}
                  className={menuItem}
                  onSelect={() => choose({ [slot.sound]: option, [slot.custom]: "" })}
                >
                  <span className="w-3 text-accent">{!custom && option === sound ? "●" : ""}</span>
                  {names[option]}
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator className={menuSeparator} />
              <DropdownMenu.Label className={menuLabel}>{s.imported}</DropdownMenu.Label>
              {imported.map(({ id }) => (
                <DropdownMenu.Item
                  key={id}
                  className={menuItem}
                  onSelect={() => choose({ [slot.custom]: id })}
                >
                  <span className="w-3 text-accent">{custom === id ? "●" : ""}</span>
                  <span className="truncate">{id}</span>
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Item
                className={menuItem}
                onSelect={() => {
                  void importSound().then((id) => {
                    if (id === "failed") onFailed();
                    else if (id) choose({ [slot.custom]: id });
                  });
                }}
              >
                <Plus className="size-3.5" />
                {s.importFile}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <Tooltip label={s.try}>
          <Button
            variant="hardware"
            size="icon"
            onClick={() => void hear(slot.slot)}
            aria-label={`${s.try}: ${label}`}
          >
            <Play className="size-3.5" />
          </Button>
        </Tooltip>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-fg-subtle">{s.level}</span>
        <Stepper
          label={`${s.level}: ${label}`}
          value={level}
          min={0}
          max={1}
          step={0.05}
          defaultValue={1}
          onChange={(value) => update({ [slot.level]: value })}
          format={(value) => `${Math.round(value * 100)}%`}
        />
      </div>
    </div>
  );
}

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
        <SlotRow key={slot.slot} slot={slot} onFailed={() => setFailed(true)} />
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
