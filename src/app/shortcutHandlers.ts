import { pickAndOpenFile } from "@/features/library/pickFile";
import { loopSection } from "@/features/markers/sectionActions";
import { toggleMetronomeRun } from "@/features/metronome/metronomeEngine";
import { nudgeBpm, tapMetronome } from "@/features/metronome/TempoControls";
import { setFollow } from "@/features/player/FollowKey";
import { setDownbeatHere, tapBeat, toggleMetronome } from "@/features/practice/actions";
import { togglePlaylist } from "@/features/practice/playlist";
import type { ShortcutHandlers } from "@/lib/useShortcuts";
import { useHistoryStore } from "@/stores/history";
import {
  type LoopRegion,
  resizedRegion,
  restartAt,
  shiftedRegion,
  useLoopStore,
} from "@/stores/loop";
import { neighbourPoint, sortedSections, useMarkersStore } from "@/stores/markers";
import { useMetronomeStore } from "@/stores/metronome";
import { useNotesStore } from "@/stores/notes";
import { currentPosition, trackDuration, usePlayerStore } from "@/stores/player";
import { useSavedLoopsStore } from "@/stores/savedLoops";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import { useViewStore } from "@/stores/view";
import { toggleMini } from "./miniMode";

const KEYBOARD_ZOOM = 1.5;

const player = () => usePlayerStore.getState();
/** The metronome mode is on screen: transport keys drive the metronome, not the track. */
const metronomeMode = () => useMetronomeStore.getState().open;
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

/** Makes `next` the loop, keeps it in sight; `restart` also plays it from its start. */
const changeLoop = (next: LoopRegion | null, restart: boolean) => {
  if (!next) return;
  const loop = useLoopStore.getState();
  loop.setRegion(next.start, next.end, trackDuration());
  const position = currentPosition();
  if (restart || position > next.end) player().seek(restartAt(next, loop.leadIn));
  const view = useViewStore.getState();
  if (next.start < view.start || next.end > view.start + view.span) {
    view.centerOn((next.start + next.end) / 2);
  }
};
const currentLoop = () => useLoopStore.getState().region();
const moveLoop = (direction: -1 | 1) => {
  const region = currentLoop();
  if (region) changeLoop(shiftedRegion(region, direction, trackDuration()), true);
};
const resizeLoop = (factor: number) => {
  const region = currentLoop();
  if (region) changeLoop(resizedRegion(region, factor, trackDuration()), false);
};
const recallSavedLoop = (index: number) => {
  const saved = useSavedLoopsStore.getState().loops[index];
  if (saved) useSavedLoopsStore.getState().recall(saved.id);
};
const recallSection = (index: number) => {
  const { sections } = useMarkersStore.getState();
  const range = sortedSections(sections)[index];
  if (range) loopSection(range);
};

/** What every shortcut of `lib/shortcuts.ts` does. The command palette reuses them. */
export const shortcutHandlers: Required<ShortcutHandlers> = {
  playPause: () => (metronomeMode() ? toggleMetronomeRun() : player().togglePlay()),
  seekBack: () => player().seekBy(-settings().seekStep),
  seekForward: () => player().seekBy(settings().seekStep),
  seekBackFine: () => player().seekBy(-settings().fineSeekStep),
  seekForwardFine: () => player().seekBy(settings().fineSeekStep),
  goToStart: () => player().seek(0),
  goToEnd: () => player().seek(trackDuration()),
  loopStart: () => useLoopStore.getState().setStart(currentPosition(), trackDuration()),
  loopEnd: () => useLoopStore.getState().setEnd(currentPosition(), trackDuration()),
  loopToggle: () => useLoopStore.getState().toggle(),
  // Esc first closes an open dialog (Radix handles that); only then does it clear the loop
  // A section being marked with S is dropped first, then the loop goes
  clearLoop: () => {
    if (useUiStore.getState().dialog !== null) return;
    if (useMarkersStore.getState().pendingSection !== null) {
      useMarkersStore.getState().cancelSection();
    } else {
      useLoopStore.getState().clear();
    }
  },
  toggleSnap: () => settings().update({ snap: !settings().snap }),
  toggleFollow: () => setFollow(!settings().followPlayhead),
  toggleContinuousScroll: () =>
    settings().update({ followMode: settings().followMode === "center" ? "page" : "center" }),
  addMarker: () => hasTrack() && useMarkersStore.getState().addMarker("free", currentPosition()),
  addBeat: () => hasTrack() && useMarkersStore.getState().addMarker("beat", currentPosition()),
  addSection: () =>
    hasTrack() && useMarkersStore.getState().markSection(currentPosition(), trackDuration()),
  sectionFromLoop: () => {
    const region = currentLoop();
    if (region) useMarkersStore.getState().addSection(region.start, region.end, trackDuration());
  },
  previousMarker: () => jumpToNeighbour(-1),
  nextMarker: () => jumpToNeighbour(1),
  speedUp: () =>
    metronomeMode() ? nudgeBpm(1) : player().setSpeed(player().speed + settings().speedStep),
  speedDown: () =>
    metronomeMode() ? nudgeBpm(-1) : player().setSpeed(player().speed - settings().speedStep),
  pitchUp: () => shiftPitch(1),
  pitchDown: () => shiftPitch(-1),
  zoomIn: () => zoomAroundPlayhead(1 / KEYBOARD_ZOOM),
  zoomOut: () => zoomAroundPlayhead(KEYBOARD_ZOOM),
  zoomToTrack: () => useViewStore.getState().toggleWhole(),
  zoomToLoop: () => {
    const region = currentLoop();
    if (region) useViewStore.getState().zoomTo(region.start, region.end);
  },
  loopShiftBack: () => moveLoop(-1),
  loopShiftForward: () => moveLoop(1),
  loopDouble: () => resizeLoop(2),
  loopHalve: () => resizeLoop(0.5),
  togglePlaylist,
  toggleMini,
  toggleMetronomeMode: () => {
    const metronome = useMetronomeStore.getState();
    metronome.setOpen(!metronome.open);
  },
  commandPalette: () => useUiStore.getState().openDialog("palette"),
  openSettings: () => useUiStore.getState().openDialog("settings"),
  openFile: () => void pickAndOpenFile(),
  undo: () => useHistoryStore.getState().undo(),
  redo: () => useHistoryStore.getState().redo(),
  saveLoop: () => useSavedLoopsStore.getState().saveCurrent(),
  tapTempo: () => (metronomeMode() ? tapMetronome() : hasTrack() && tapBeat()),
  toggleMetronome,
  toggleCountIn: () => useSettingsStore.getState().update({ countIn: !settings().countIn }),
  setDownbeat: () => hasTrack() && setDownbeatHere(),
  toggleNotes: () => useNotesStore.getState().toggle(),
  exportAudio: () => player().track?.complete && useUiStore.getState().openExport(),
  recallLoop1: () => recallSavedLoop(0),
  recallLoop2: () => recallSavedLoop(1),
  recallLoop3: () => recallSavedLoop(2),
  recallLoop4: () => recallSavedLoop(3),
  recallLoop5: () => recallSavedLoop(4),
  recallLoop6: () => recallSavedLoop(5),
  recallLoop7: () => recallSavedLoop(6),
  recallLoop8: () => recallSavedLoop(7),
  recallLoop9: () => recallSavedLoop(8),
  recallSection1: () => recallSection(0),
  recallSection2: () => recallSection(1),
  recallSection3: () => recallSection(2),
  recallSection4: () => recallSection(3),
  recallSection5: () => recallSection(4),
  recallSection6: () => recallSection(5),
  recallSection7: () => recallSection(6),
  recallSection8: () => recallSection(7),
  recallSection9: () => recallSection(8),
};
