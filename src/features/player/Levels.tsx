import { Knob } from "@/components/ui/Knob";
import { MuteKey } from "@/components/ui/MuteKey";
import { t } from "@/i18n";
import { formatPercent } from "@/lib/format";
import { SETTING_LIMITS, useSettingsStore } from "@/stores/settings";

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
      {...SETTING_LIMITS.trackVolume}
      defaultValue={1}
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
      {...SETTING_LIMITS.clickVolume}
      defaultValue={0.6}
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
