import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { NumberField, parseNumber } from "@/components/ui/NumberField";
import { t } from "@/i18n";
import { SETTING_LIMITS, useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";

const seconds = (value: number) => `${value} ${t.transport.seconds}`;
const percent = (value: number) => `${Math.round(value * 100)}%`;
const parsePercent = (text: string) => {
  const value = parseNumber(text);
  return value === null ? null : value / 100;
};

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="flex-1">
        <p className="text-sm text-fg">{label}</p>
        <p className="text-xs text-fg-subtle">{hint}</p>
      </div>
      {children}
    </div>
  );
}

/** Ctrl+,: preferences of this PC. */
export function SettingsDialog() {
  const open = useUiStore((s) => s.dialog === "settings");
  const close = useUiStore((s) => s.closeDialog);
  const settings = useSettingsStore();
  const s = t.settings;

  return (
    <Dialog open={open} onClose={close} title={s.title}>
      <div className="divide-y divide-border px-4 pt-1 pb-4">
        <Row label={s.seekStep} hint={s.seekStepHint}>
          <NumberField
            label={s.seekStep}
            value={settings.seekStep}
            {...SETTING_LIMITS.seekStep}
            onChange={(seekStep) => settings.update({ seekStep })}
            format={seconds}
          />
        </Row>
        <Row label={s.fineSeekStep} hint={s.fineSeekStepHint}>
          <NumberField
            label={s.fineSeekStep}
            value={settings.fineSeekStep}
            {...SETTING_LIMITS.fineSeekStep}
            onChange={(fineSeekStep) =>
              settings.update({ fineSeekStep: Math.round(fineSeekStep * 10) / 10 })
            }
            format={seconds}
          />
        </Row>
        <Row label={s.speedStep} hint={s.speedStepHint}>
          <NumberField
            label={s.speedStep}
            value={settings.speedStep}
            {...SETTING_LIMITS.speedStep}
            onChange={(speedStep) =>
              settings.update({ speedStep: Math.round(speedStep * 100) / 100 })
            }
            format={percent}
            parse={parsePercent}
          />
        </Row>
        <Row label={s.follow} hint={s.followHint}>
          <input
            type="checkbox"
            aria-label={s.follow}
            checked={settings.followPlayhead}
            onChange={(event) => settings.update({ followPlayhead: event.target.checked })}
            className="size-4 accent-accent"
          />
        </Row>
        <Row label={s.returnToStart} hint={s.returnToStartHint}>
          <input
            type="checkbox"
            aria-label={s.returnToStart}
            checked={settings.returnToStart}
            onChange={(event) => settings.update({ returnToStart: event.target.checked })}
            className="size-4 accent-accent"
          />
        </Row>
        <Row label={s.snap} hint={s.snapHint}>
          <input
            type="checkbox"
            aria-label={s.snap}
            checked={settings.snap}
            onChange={(event) => settings.update({ snap: event.target.checked })}
            className="size-4 accent-accent"
          />
        </Row>
        <div className="flex justify-end pt-3">
          <Button onClick={settings.reset}>{s.reset}</Button>
        </div>
      </div>
    </Dialog>
  );
}
