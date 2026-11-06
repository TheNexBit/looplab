import { pickAndOpenFile } from "@/features/library/pickFile";
import { setDownbeatHere, tapBeat, toggleMetronome } from "@/features/practice/actions";
import type { ShortcutHandlers } from "@/lib/useShortcuts";
import { useHistoryStore } from "@/stores/history";
import { useLoopStore } from "@/stores/loop";
import { neighbourPoint, useMarkersStore } from "@/stores/markers";
import { useNotesStore } from "@/stores/notes";
import { currentPosition, trackDuration, usePlayerStore } from "@/stores/player";
import { useSavedLoopsStore } from "@/stores/savedLoops";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import { useViewStore } from "@/stores/view";

const KEYBOARD_ZOOM = 1.5;

const player = () => usePlayerStore.getState();
const settings = () => useSettingsStore.getState();
const zoomAroundPlayhead = (factor: number) =>
  useViewStore.getState().zoom(factor, currentPosition());
const hasTrack = () => player().track !== null;
const jumpToNeighbour = (direction: -1 | 1) => {
  const { markers, sections } = useMarkersStore.getState();
  const point = neighbourPoint(currentPosition(), direction, markers, sections);
  if (point !== null) player().seek(point);
};
const shiftPitch = (by: number) => {
  const { semitones, cents, setPitch } = player();
  setPitch(semitones + by, cents);
};

/** What every shortcut of `lib/shortcuts.ts` does. The command palette reuses them. */
export const shortcutHandlers: Required<ShortcutHandlers> = {
  playPause: () => player().togglePlay(),
  seekBack: () => player().seekBy(-settings().seekStep),
  seekForward: () => player().seekBy(settings().seekStep),
  seekBackFine: () => player().seekBy(-settings().fineSeekStep),
  seekForwardFine: () => player().seekBy(settings().fineSeekStep),
  loopStart: () => useLoopStore.getState().setStart(currentPosition(), trackDuration()),
  loopEnd: () => useLoopStore.getState().setEnd(currentPosition(), trackDuration()),
  loopToggle: () => useLoopStore.getState().toggle(),
  // Esc first closes an open dialog (Radix handles that); only then does it clear the loop
  clearLoop: () => useUiStore.getState().dialog === null && useLoopStore.getState().clear(),
  toggleSnap: () => settings().update({ snap: !settings().snap }),
  toggleFollow: () => {
    settings().update({ followPlayhead: !settings().followPlayhead });
    useViewStore.getState().resumeFollow();
  },
  addMarker: () => hasTrack() && useMarkersStore.getState().addMarker("free", currentPosition()),
  addBeat: () => hasTrack() && useMarkersStore.getState().addMarker("beat", currentPosition()),
  addSection: () => hasTrack() && useMarkersStore.getState().addSection(currentPosition()),
  previousMarker: () => jumpToNeighbour(-1),
  nextMarker: () => jumpToNeighbour(1),
  speedUp: () => player().setSpeed(player().speed + settings().speedStep),
  speedDown: () => player().setSpeed(player().speed - settings().speedStep),
  pitchUp: () => shiftPitch(1),
  pitchDown: () => shiftPitch(-1),
  zoomIn: () => zoomAroundPlayhead(1 / KEYBOARD_ZOOM),
  zoomOut: () => zoomAroundPlayhead(KEYBOARD_ZOOM),
  commandPalette: () => useUiStore.getState().openDialog("palette"),
  openSettings: () => useUiStore.getState().openDialog("settings"),
  openFile: () => void pickAndOpenFile(),
  undo: () => useHistoryStore.getState().undo(),
  redo: () => useHistoryStore.getState().redo(),
  saveLoop: () => useSavedLoopsStore.getState().saveCurrent(),
  tapTempo: () => hasTrack() && tapBeat(),
  toggleMetronome,
  setDownbeat: () => hasTrack() && setDownbeatHere(),
  toggleNotes: () => useNotesStore.getState().toggle(),
  exportAudio: () => hasTrack() && useUiStore.getState().openExport(),
};
