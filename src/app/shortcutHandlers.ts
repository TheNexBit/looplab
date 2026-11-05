import { pickAndOpenFile } from "@/features/library/pickFile";
import { SEMITONES, SPEED_KEY_STEP } from "@/features/player/limits";
import type { ShortcutHandlers } from "@/lib/useShortcuts";
import { useLoopStore } from "@/stores/loop";
import { currentPosition, usePlayerStore } from "@/stores/player";
import { useViewStore } from "@/stores/view";

const KEYBOARD_ZOOM = 1.5;

const player = () => usePlayerStore.getState();
const duration = () => player().track?.duration ?? 0;
const zoomAroundPlayhead = (factor: number) =>
  useViewStore.getState().zoom(factor, currentPosition());
const shiftPitch = (by: number) => {
  const { semitones, cents, setPitch } = player();
  setPitch(Math.min(SEMITONES.max, Math.max(SEMITONES.min, semitones + by)), cents);
};

/** What every shortcut of `lib/shortcuts.ts` does. Those not listed yet arrive in later phases. */
export const shortcutHandlers: ShortcutHandlers = {
  playPause: () => player().togglePlay(),
  seekBack: () => player().seekBy(-5),
  seekForward: () => player().seekBy(5),
  seekBackFine: () => player().seekBy(-1),
  seekForwardFine: () => player().seekBy(1),
  loopStart: () => useLoopStore.getState().setStart(currentPosition(), duration()),
  loopEnd: () => useLoopStore.getState().setEnd(currentPosition(), duration()),
  loopToggle: () => useLoopStore.getState().toggle(),
  speedUp: () => player().setSpeed(player().speed + SPEED_KEY_STEP),
  speedDown: () => player().setSpeed(player().speed - SPEED_KEY_STEP),
  pitchUp: () => shiftPitch(1),
  pitchDown: () => shiftPitch(-1),
  zoomIn: () => zoomAroundPlayhead(1 / KEYBOARD_ZOOM),
  zoomOut: () => zoomAroundPlayhead(KEYBOARD_ZOOM),
  openFile: () => void pickAndOpenFile(),
};
