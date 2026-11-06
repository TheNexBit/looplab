import { currentPosition, usePlayerStore } from "@/stores/player";
import { usePracticeStore } from "@/stores/practice";
import { useSettingsStore } from "@/stores/settings";
import { tapTempo } from "./tempo";

/** One tap of "tap tempo": after two or more, the track's tempo is set from them. */
export function tapBeat() {
  const practice = usePracticeStore.getState();
  practice.addTap(performance.now());
  const bpm = tapTempo(usePracticeStore.getState().taps, usePlayerStore.getState().speed);
  if (bpm === null) return;
  practice.setBpm(bpm);
  // The tap was on a beat: the grid and the metronome line up with it
  practice.setBeatOffset(currentPosition());
}

/** The first beat of a bar is where the playhead is: the grid and the clicks line up there. */
export function setDownbeatHere() {
  usePracticeStore.getState().setBeatOffset(currentPosition());
}

export function toggleMetronome() {
  const settings = useSettingsStore.getState();
  settings.update({ metronome: !settings.metronome });
}
