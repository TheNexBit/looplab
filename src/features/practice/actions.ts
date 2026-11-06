import { currentPosition, usePlayerStore } from "@/stores/player";
import { usePracticeStore } from "@/stores/practice";
import { useSettingsStore } from "@/stores/settings";
import { tapTempo } from "./tempo";

/**
 * One tap of "tap tempo", on the beats of the time signature (eighths in 7/8): after two or
 * more, the track's tempo is set from them, in quarter notes per minute as DAWs show it.
 */
export function tapBeat() {
  const practice = usePracticeStore.getState();
  practice.addTap(performance.now());
  const beats = tapTempo(usePracticeStore.getState().taps, usePlayerStore.getState().speed);
  if (beats === null) return;
  practice.setBpm(Math.round(((beats * 4) / practice.beatUnit) * 10) / 10);
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
