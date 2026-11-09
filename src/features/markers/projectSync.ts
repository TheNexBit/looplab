import { getCurrentWindow } from "@tauri-apps/api/window";
import { commands } from "@/lib/bindings";
import { useEqStore } from "@/stores/eq";
import { useHistoryStore } from "@/stores/history";
import { useLoopStore } from "@/stores/loop";
import { useMarkersStore } from "@/stores/markers";
import { currentPosition, usePlayerStore } from "@/stores/player";
import { usePlaylistStore } from "@/stores/playlist";
import { usePracticeStore } from "@/stores/practice";
import { useRecentStore } from "@/stores/recent";
import { useSavedLoopsStore } from "@/stores/savedLoops";
import { useSettingsStore } from "@/stores/settings";
import { useViewStore } from "@/stores/view";
import { fromFile, type ProjectData, toFile } from "./projectFile";

/** Pause after the last change before writing, so a burst of edits is one save. */
const SAVE_DELAY_MS = 800;

function snapshot(): ProjectData {
  const { markers, sections } = useMarkersStore.getState();
  const { start, end, enabled, leadIn, gap } = useLoopStore.getState();
  const { speed, semitones, cents } = usePlayerStore.getState();
  const { settings: eq, channels } = useEqStore.getState();
  return {
    markers,
    sections,
    loop: { start, end, enabled, leadIn, gap },
    loops: useSavedLoopsStore.getState().loops,
    playlist: usePlaylistStore.getState().steps,
    // Rounded: a position a hair different is not worth a save
    position: Math.round(currentPosition() * 100) / 100,
    ...tempoSnapshot(),
    speed,
    semitones,
    cents,
    eq,
    channels,
  };
}

/** The tempo map, and its first marker (or the draft) in the fields older versions read. */
function tempoSnapshot() {
  const practice = usePracticeStore.getState();
  const first = practice.tempoMap[0];
  return {
    tempoMap: practice.tempoMap,
    bpm: first?.bpm ?? null,
    beatOffset: first?.time ?? practice.beatOffset,
    beatsPerBar: first?.beatsPerBar ?? practice.beatsPerBar,
    beatUnit: first?.beatUnit ?? practice.beatUnit,
  };
}

function apply(data: ProjectData) {
  useMarkersStore.getState().replace(data.markers, data.sections);
  useLoopStore.getState().restore(data.loop);
  useSavedLoopsStore.getState().replace(data.loops);
  usePlaylistStore.getState().replace(data.playlist);
  const practice = usePracticeStore.getState();
  practice.setTempoMap(data.tempoMap);
  if (data.tempoMap.length === 0) {
    // No tempo yet: keep the first beat and the meter picked before it, as a draft
    practice.setBeatOffset(data.beatOffset);
    practice.setTimeSignature(data.beatsPerBar, data.beatUnit);
  }
  const player = usePlayerStore.getState();
  player.setSpeed(data.speed);
  player.setPitch(data.semitones, data.cents);
  useEqStore.getState().setSettings(data.eq);
  useEqStore.getState().setChannels(data.channels);
  resume(data.position);
}

/** Back to where the playhead was when the track was last closed (unless near its end). */
function resume(position: number) {
  const duration = usePlayerStore.getState().track?.duration ?? 0;
  if (!useSettingsStore.getState().resumePosition || position <= 0 || position > duration - 1) {
    return;
  }
  usePlayerStore.getState().seek(position);
  const view = useViewStore.getState();
  if (position < view.start || position > view.start + view.span) view.centerOn(position);
}

let defaults: Promise<ProjectData> | null = null;

/** Settings of a track with no project yet, asked once to Rust (the only copy of the defaults). */
function projectDefaults(): Promise<ProjectData> {
  defaults ??= commands.defaultProject().then((file) => {
    const data = fromFile(file);
    useEqStore.getState().setFlat(data.eq);
    return data;
  });
  return defaults;
}

/**
 * Loads the `.looplab.json` of each track that opens and saves it after every change
 * (and before the window closes). A project that cannot be read is never overwritten.
 * Started once by the app shell; returns the function that stops it.
 */
export function syncProject(): () => void {
  let track: string | null = null;
  /** False when the file exists but is unreadable: saving would destroy it */
  let writable = false;
  let applying = false;
  let lastSaved = "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const save = async () => {
    clearTimeout(timer);
    if (!track || !writable) return;
    // Taken right now: the stores may already hold the next track when the write runs
    const path = track;
    const data = snapshot();
    const key = JSON.stringify(data);
    if (key === lastSaved) return;
    lastSaved = key;
    const result = await commands.saveProject(path, toFile(data));
    if (result.status === "ok") useMarkersStore.getState().setSavedTo(result.data);
    else usePlayerStore.getState().reportError(path, result.error);
  };

  const schedule = () => {
    if (applying || !track) return;
    clearTimeout(timer);
    timer = setTimeout(() => void save(), SAVE_DELAY_MS);
  };

  const open = async (path: string) => {
    // Synchronous part first: `save` captures the previous track's data before anything
    // else runs, and `applying` stops the new track's reset from being saved over the old one
    const previous = save();
    track = path;
    writable = false;
    applying = true;
    await previous;
    useMarkersStore.getState().setSavedTo(null);
    const [result, fallback] = await Promise.all([commands.loadProject(path), projectDefaults()]);
    if (track !== path) return;
    if (result.status === "ok") {
      const duration = usePlayerStore.getState().track?.duration ?? 0;
      apply(result.data ? fromFile(result.data.project, duration) : fallback);
      if (result.data) useMarkersStore.getState().setSavedTo(result.data.location);
      writable = true;
    } else {
      apply(fallback);
      usePlayerStore.getState().reportError(path, result.error);
    }
    lastSaved = JSON.stringify(snapshot());
    applying = false;
    // Undo never reaches back into the previous track
    useHistoryStore.getState().reset();
    void useRecentStore.getState().refresh();
  };

  const stops = [
    usePlayerStore.subscribe((state, previous) => {
      if (state.track && state.track.path !== previous.track?.path) void open(state.track.path);
      else if (
        state.speed !== previous.speed ||
        state.semitones !== previous.semitones ||
        state.cents !== previous.cents ||
        // Where the playhead stops is remembered (not every moment while it plays)
        state.playing !== previous.playing ||
        (!state.playing && state.anchorPosition !== previous.anchorPosition)
      ) {
        schedule();
      }
    }),
    useMarkersStore.subscribe((state, previous) => {
      if (state.markers !== previous.markers || state.sections !== previous.sections) schedule();
    }),
    useLoopStore.subscribe(schedule),
    useSavedLoopsStore.subscribe(schedule),
    usePlaylistStore.subscribe((state, previous) => {
      if (state.steps !== previous.steps) schedule();
    }),
    usePracticeStore.subscribe((state, previous) => {
      if (
        state.tempoMap !== previous.tempoMap ||
        state.beatOffset !== previous.beatOffset ||
        state.beatsPerBar !== previous.beatsPerBar ||
        state.beatUnit !== previous.beatUnit
      ) {
        schedule();
      }
    }),
    useEqStore.subscribe((state, previous) => {
      if (state.settings !== previous.settings || state.channels !== previous.channels) schedule();
    }),
  ];
  void projectDefaults();

  // Write pending edits before the window goes away
  const unlistenClose = getCurrentWindow().onCloseRequested(() => save());

  return () => {
    for (const stop of stops) stop();
    void unlistenClose.then((stop) => stop());
    clearTimeout(timer);
  };
}
