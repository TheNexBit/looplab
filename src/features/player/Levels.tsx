import { Knob } from "@/components/ui/Knob";
import { MuteKey } from "@/components/ui/MuteKey";
import { t } from "@/i18n";
import { formatPercent } from "@/lib/format";
import { SETTING_LIMITS, SETTINGS_DEFAULTS, useSettingsStore } from "@/stores/settings";

const v = t.transport;
const settings = () => useSettingsStore.getState();

/**
 * The track's level and mute, on the waveform's title row: the track's own strip, as Reaper
 * keeps a track's volume on its header.
 */
export function TrackLevel({ className }: { className?: string }) {
  const volume = useSettingsStore((s) => s.trackVolume);
  const muted = useSettingsStore((s) => s.trackMuted);
  return (
    <Knob
      label={v.trackVolume}
      caption={v.trackVolumeShort}
      hint={v.trackVolumeHint}
      value={volume}
      current={() => settings().trackVolume}
      min={SETTING_LIMITS.trackVolume.min}
      max={SETTING_LIMITS.trackVolume.max}
      step={0.01}
      notch={SETTING_LIMITS.trackVolume.step}
      defaultValue={SETTINGS_DEFAULTS.trackVolume}
      onChange={(trackVolume) => settings().update({ trackVolume })}
      format={formatPercent}
      off={muted}
      size="sm"
      layout="row"
      className={className}
    >
      <MuteKey
        muted={muted}
        label={v.muteTrack}
        onChange={(trackMuted) => settings().update({ trackMuted })}
      />
    </Knob>
  );
}

/** The click's level and mute, in the tempo module beside the metronome key. */
export function ClickLevel({ className }: { className?: string }) {
  const volume = useSettingsStore((s) => s.clickVolume);
  const muted = useSettingsStore((s) => s.clickMuted);
  return (
    <Knob
      label={v.clickVolume}
      caption={v.clickVolumeShort}
      hint={v.clickVolumeHint}
      value={volume}
      current={() => settings().clickVolume}
      min={SETTING_LIMITS.clickVolume.min}
      max={SETTING_LIMITS.clickVolume.max}
      step={0.01}
      notch={SETTING_LIMITS.clickVolume.step}
      defaultValue={SETTINGS_DEFAULTS.clickVolume}
      onChange={(clickVolume) => settings().update({ clickVolume })}
      format={formatPercent}
      off={muted}
      className={className}
    >
      <MuteKey
        muted={muted}
        label={v.muteClick}
        onChange={(clickMuted) => settings().update({ clickMuted })}
      />
    </Knob>
  );
}
