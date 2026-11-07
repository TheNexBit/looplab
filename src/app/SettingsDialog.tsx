import { Tabs } from "radix-ui";
import { Button } from "@/components/ui/Button";
import { ChoiceKeys } from "@/components/ui/ChoiceKeys";
import { Dialog } from "@/components/ui/Dialog";
import { tabTrigger } from "@/components/ui/menu";
import { OnOffKey } from "@/components/ui/OnOffKey";
import { Stepper } from "@/components/ui/Stepper";
import { t } from "@/i18n";
import { formatPercent } from "@/lib/format";
import {
  SETTING_CHOICES,
  SETTING_LIMITS,
  type Settings,
  useSettingsStore,
} from "@/stores/settings";

import { useUiStore } from "@/stores/ui";
import { AppearanceSettings } from "./AppearanceSettings";
import { DataSettings } from "./DataSettings";
import { KeysSettings } from "./KeysSettings";
import { SettingGroup, SettingRow } from "./SettingLayout";

const s = t.settings;
const seconds = (value: number) => `${value} ${t.transport.seconds}`;
const times = (value: number) => `×${value}`;
const pixels = (value: number) => `${value} px`;

type BooleanSetting = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];
type NumberSetting = keyof typeof SETTING_LIMITS;
type ChoiceSetting = keyof typeof SETTING_CHOICES;

/** A setting with its name and explanation from `i18n` (`<key>` and `<key>Hint`). */
const text = (key: keyof Settings) => {
  const strings = s as unknown as Record<string, string>;
  return { label: strings[key] ?? key, hint: strings[`${key}Hint`] ?? "" };
};

function Toggle({ setting }: { setting: BooleanSetting }) {
  const value = useSettingsStore((state) => state[setting]);
  const { label, hint } = text(setting);
  return (
    <SettingRow label={label} hint={hint}>
      <OnOffKey
        label={label}
        on={value}
        onChange={(on) => useSettingsStore.getState().update({ [setting]: on })}
      />
    </SettingRow>
  );
}

function Amount({
  setting,
  format,
  defaultValue,
}: {
  setting: NumberSetting;
  format: (value: number) => string;
  defaultValue: number;
}) {
  const value = useSettingsStore((state) => state[setting]);
  const { label, hint } = text(setting);
  return (
    <SettingRow label={label} hint={hint}>
      <Stepper
        label={label}
        value={value}
        {...SETTING_LIMITS[setting]}
        defaultValue={defaultValue}
        onChange={(next) => useSettingsStore.getState().update({ [setting]: next })}
        format={format}
      />
    </SettingRow>
  );
}

function Choice<K extends ChoiceSetting>({ setting }: { setting: K }) {
  const value = useSettingsStore((state) => state[setting]) as string;
  const { label, hint } = text(setting);
  const names = s.choices[setting] as Record<string, string>;
  return (
    <SettingRow label={label} hint={hint}>
      <ChoiceKeys
        label={label}
        value={value}
        choices={SETTING_CHOICES[setting].map(
          (choice) => [choice, names[choice] ?? choice] as const,
        )}
        onChange={(choice) => useSettingsStore.getState().update({ [setting]: choice })}
      />
    </SettingRow>
  );
}

const pane = "max-h-[calc(100vh-14rem)] overflow-y-auto";

/** What the "Default values" key of each tab puts back. */
const GENERAL: readonly (keyof Settings)[] = [
  "startup",
  "openView",
  "resumePosition",
  "followPlayhead",
  "followMode",
  "returnToStart",
  "snap",
  "wheel",
  "wheelSpeed",
  "doubleClick",
  "afterLoop",
  "seekStep",
  "fineSeekStep",
  "speedStep",
];
const WAVEFORM: readonly (keyof Settings)[] = [
  "waveStyle",
  "waveZoom",
  "playheadWidth",
  "showGrid",
  "rulerLines",
  "centerLine",
];

/** Ctrl+,: preferences of this PC. */
export function SettingsDialog() {
  const open = useUiStore((state) => state.dialog === "settings");
  const close = useUiStore((state) => state.closeDialog);
  const resetSome = useSettingsStore((state) => state.resetSome);

  return (
    <Dialog open={open} onClose={close} title={s.title} className="w-[min(46rem,calc(100vw-2rem))]">
      <Tabs.Root defaultValue="general">
        <Tabs.List className="flex gap-0.5 border-b border-edge px-4 pt-3 pb-2">
          {(
            [
              ["general", s.general],
              ["waveform", s.waveform],
              ["appearance", s.appearance.title],
              ["keys", s.keys],
              ["data", s.data.title],
            ] as const
          ).map(([value, label]) => (
            <Tabs.Trigger key={value} value={value} className={`${tabTrigger} px-3`}>
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="appearance" className={pane}>
          <AppearanceSettings />
        </Tabs.Content>
        <Tabs.Content value="data" className={pane}>
          <DataSettings />
        </Tabs.Content>
        <Tabs.Content value="keys" className={pane}>
          <KeysSettings />
        </Tabs.Content>
        <Tabs.Content value="general" className={`${pane} px-4 pb-4`}>
          <SettingGroup rows title={s.behaviour}>
            <Choice setting="startup" />
            <Choice setting="openView" />
            <Toggle setting="resumePosition" />
            <Toggle setting="followPlayhead" />
            <Choice setting="followMode" />
            <Toggle setting="returnToStart" />
            <Toggle setting="snap" />
          </SettingGroup>
          <SettingGroup rows title={s.mouse}>
            <Choice setting="wheel" />
            <Amount setting="wheelSpeed" format={times} defaultValue={1} />
            <Choice setting="doubleClick" />
            <Choice setting="afterLoop" />
          </SettingGroup>
          <SettingGroup rows title={s.steps}>
            <Amount setting="seekStep" format={seconds} defaultValue={5} />
            <Amount setting="fineSeekStep" format={seconds} defaultValue={1} />
            <Amount setting="speedStep" format={formatPercent} defaultValue={0.05} />
          </SettingGroup>
          <div className="flex justify-end pt-3">
            <Button onClick={() => resetSome(GENERAL)}>{s.reset}</Button>
          </div>
        </Tabs.Content>
        <Tabs.Content value="waveform" className={`${pane} px-4 pb-4`}>
          <SettingGroup rows title={s.waveform}>
            <Choice setting="waveStyle" />
            <Amount setting="waveZoom" format={times} defaultValue={1} />
            <Amount setting="playheadWidth" format={pixels} defaultValue={1} />
            <Toggle setting="showGrid" />
            <Toggle setting="rulerLines" />
            <Toggle setting="centerLine" />
          </SettingGroup>
          <div className="flex justify-end pt-3">
            <Button onClick={() => resetSome(WAVEFORM)}>{s.reset}</Button>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </Dialog>
  );
}
