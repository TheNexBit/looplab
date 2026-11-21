import { AudioLines, Guitar } from "lucide-react";
import { Popover } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { useCompact } from "@/components/ui/FitBar";
import { parsePercent } from "@/components/ui/NumberField";
import { OptionsPanel, useOptions } from "@/components/ui/OptionsKey";
import { Slider } from "@/components/ui/Slider";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import { SETTING_LIMITS, useSettingsStore } from "@/stores/settings";

/** A key of the score's bar with its lamp, lit while on (like the Follow key). */
function LampKey({
  on,
  label,
  hint,
  rightClick,
  onToggle,
  onContextMenu,
  icon,
  children,
}: {
  icon: ReactNode;
  on: boolean;
  label: string;
  hint: string;
  rightClick?: string;
  onToggle: () => void;
  onContextMenu?: (event: { preventDefault: () => void }) => void;
  children?: ReactNode;
}) {
  // In a crowded bar the key keeps its icon and lamp; its name stays in the hint
  const compact = useCompact();
  return (
    <Tooltip label={hint} rightClick={rightClick}>
      <Button
        variant="hardware"
        options={rightClick !== undefined}
        aria-pressed={on}
        aria-label={label}
        className={on ? "text-accent" : undefined}
        onClick={onToggle}
        onContextMenu={onContextMenu}
      >
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            on ? "bg-accent shadow-[0_0_5px_var(--color-accent)]" : "bg-led-off",
          )}
        />
        {compact ? icon : label}
        {children}
      </Button>
    </Tooltip>
  );
}

/**
 * Synth key: a click plays the tab's notes over the recording or stops them; the right
 * button opens its volume (a click on the key never changes it).
 */
export function SynthKey() {
  const on = useSettingsStore((s) => s.scoreSynth);
  const level = useSettingsStore((s) => s.scoreSynthLevel);
  const update = useSettingsStore((s) => s.update);
  const { open, setOpen, onContextMenu } = useOptions();
  const limits = SETTING_LIMITS.scoreSynthLevel;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <span>
          <LampKey
            on={on}
            label={t.score.synth}
            hint={t.score.synthHint}
            rightClick={t.score.synthRightClick}
            icon={<AudioLines className="size-3.5" />}
            onToggle={() => update({ scoreSynth: !on })}
            onContextMenu={onContextMenu}
          />
        </span>
      </Popover.Anchor>
      <OptionsPanel align="end" className="w-64 space-y-2 p-3">
        <Slider
          label={t.score.synthLevel}
          value={level}
          defaultValue={0.5}
          min={limits.min}
          max={limits.max}
          step={limits.step}
          // Moving the volume is choosing to hear it: it switches the synth on
          onChange={(scoreSynthLevel) => update({ scoreSynthLevel, scoreSynth: true })}
          format={formatPercent}
          parse={parsePercent}
          trackClassName="flex-1"
          className="justify-between"
        />
        <p className="text-[11px] text-fg-subtle">{t.score.synthTrack}</p>
      </OptionsPanel>
    </Popover.Root>
  );
}

/** Neck key: shows or hides the neck under the tab. */
export function NeckKey() {
  const on = useSettingsStore((s) => s.scoreNeck);
  return (
    <LampKey
      on={on}
      label={t.score.neck}
      hint={t.score.neckHint}
      icon={<Guitar className="size-3.5" />}
      onToggle={() => useSettingsStore.getState().update({ scoreNeck: !on })}
    />
  );
}
