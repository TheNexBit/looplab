import { ChevronDown, Play } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/Button";
import { menuContent, menuItem } from "@/components/ui/menu";
import { parsePercent } from "@/components/ui/NumberField";
import { Slider } from "@/components/ui/Slider";
import { Tooltip } from "@/components/ui/Tooltip";
import { tryClick } from "@/features/player/syncEngine";
import { t } from "@/i18n";
import type { ClickSound } from "@/lib/bindings";
import { CLICK_SOUNDS, SETTING_LIMITS, useSettingsStore } from "@/stores/settings";

const p = t.practice;
const percent = (value: number) => `${Math.round(value * 100)}%`;

/** One beat kind: its sound (menu), a key to hear it and its level. */
function SoundRow({ accent }: { accent: boolean }) {
  const sound = useSettingsStore((s) => (accent ? s.accentSound : s.beatSound));
  const level = useSettingsStore((s) => (accent ? s.accentLevel : s.beatLevel));
  const update = useSettingsStore((s) => s.update);
  const label = accent ? p.accent : p.otherBeats;
  const choose = (next: ClickSound) => {
    update(accent ? { accentSound: next } : { beatSound: next });
    // Hearing the choice right away is how sound menus of DAWs feel
    void tryClick(accent);
  };
  const limits = accent ? SETTING_LIMITS.accentLevel : SETTING_LIMITS.beatLevel;

  return (
    <div className="space-y-1">
      <p className="text-xs text-fg-muted">{label}</p>
      <div className="flex items-center gap-1">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              variant="hardware"
              className="flex-1 justify-between"
              aria-label={`${label}: ${p.sounds[sound]}`}
            >
              {p.sounds[sound]}
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content side="top" align="start" sideOffset={4} className={menuContent}>
              <DropdownMenu.RadioGroup
                value={sound}
                onValueChange={(value) => choose(value as ClickSound)}
              >
                {CLICK_SOUNDS.map((option) => (
                  <DropdownMenu.RadioItem key={option} value={option} className={menuItem}>
                    <span className="w-3 text-accent">{option === sound ? "●" : ""}</span>
                    {p.sounds[option]}
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <Tooltip label={p.tryClick}>
          <Button
            variant="hardware"
            size="icon"
            onClick={() => void tryClick(accent)}
            aria-label={`${p.tryClick}: ${label}`}
          >
            <Play className="size-3.5" />
          </Button>
        </Tooltip>
      </div>
      <Slider
        label={p.level}
        value={level}
        defaultValue={1}
        min={limits.min}
        max={limits.max}
        step={limits.step}
        onChange={(value) => update(accent ? { accentLevel: value } : { beatLevel: value })}
        format={percent}
        parse={parsePercent}
        trackClassName="flex-1"
        className="justify-between"
      />
    </div>
  );
}

/** Metronome sounds, like Reaper's: one for the first beat of a bar, one for the others. */
export function ClickSoundPicker() {
  return (
    <div className="space-y-2">
      <Tooltip label={p.soundHint}>
        <p className="panel-label cursor-help">{p.sound}</p>
      </Tooltip>
      <SoundRow accent />
      <SoundRow accent={false} />
    </div>
  );
}
