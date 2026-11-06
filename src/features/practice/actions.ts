import { usePlayerStore } from "@/stores/player";
import { usePracticeStore } from "@/stores/practice";
import { useSettingsStore } from "@/stores/settings";
import { tapTempo } from "./tempo";

/** One tap of "tap tempo": after two or more, the track's tempo is set from them. */
export function tapBeat() {
  const practice = usePracticeStore.getState();
  practice.addTap(performance.now());
  const bpm = tapTempo(usePracticeStore.getState().taps, usePlayerStore.getState().speed);
  if (bpm !== null) practice.setBpm(bpm);
}

export function toggleMetronome() {
  const settings = useSettingsStore.getState();
  settings.update({ metronome: !settings.metronome });
}
