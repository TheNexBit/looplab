import { getCurrentWindow } from "@tauri-apps/api/window";
import { autoLinkScore } from "@/features/lessons/openLesson";
import { resetTempoAnalysis } from "@/features/practice/tempoAnalysis";
import { commands, type Project_Serialize } from "@/lib/bindings";
import { useEqStore } from "@/stores/eq";
import { useHistoryStore } from "@/stores/history";
import { useLoopStore } from "@/stores/loop";
import { useMarkersStore } from "@/stores/markers";
import { currentPosition, usePlayerStore } from "@/stores/player";
import { usePlaylistStore } from "@/stores/playlist";
import { usePracticeStore } from "@/stores/practice";
import { useRecentStore } from "@/stores/recent";
import { useSavedLoopsStore } from "@/stores/savedLoops";
import { useScoreStore } from "@/stores/score";
import { useSettingsStore } from "@/stores/settings";
import { useStemsStore } from "@/stores/stems";
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
    stemMix: useStemsStore.getState().channels,
    score: useScoreStore.getState().link,
    otherScores: useScoreStore.getState().shelf,
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

/** What every file of a take shares: markers, loops, playlist and tempo map. */
function applyCommon(data: ProjectData) {
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
}

function apply(data: ProjectData) {
  applyCommon(data);
  const player = usePlayerStore.getState();
  player.setSpeed(data.speed);
  player.setPitch(data.semitones, data.cents);
  useEqStore.getState().setSettings(data.eq);
  useEqStore.getState().setChannels(data.channels);
  useStemsStore.getState().replace(data.stemMix);
  useScoreStore.getState().restore(data.score, data.otherScores);
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

/** Only the parts shared by the files of a take (and the practice speed): pitch, mix and place stay. */
function applyShared(data: ProjectData) {
  applyCommon(data);
  useScoreStore.getState().restore(data.score, data.otherScores);
  usePlayerStore.getState().setSpeed(data.speed);
}

/** Set by `syncProject`: takes in a project another file of the take brought (already saved). */
let adoptShared: ((path: string, file: Project_Serialize) => void) | null = null;

/** The open track's project, as brought by another file of its take (see `features/exercise`). */
export function adoptSharedProject(path: string, file: Project_Serialize) {
  adoptShared?.(path, file);
}

/**
 * Live mode plays the tracks with the setlist's transpose, speed and cues: nothing of that
 * may land in their study projects. While held, nothing is saved; on release the open
 * track's project is read again, so the study settings come back.
 */
let held = false;
/** Set by `syncProject`: reads the open track's project again, or writes what is waiting. */
let reload: (() => Promise<void>) | null = null;
let flush: (() => Promise<void>) | null = null;
const appliedListeners = new Set<(path: string) => void>();

export function holdProjectSaves(on: boolean) {
  if (held === on) return;
  // Study edits still waiting are written first (the check runs before `held` changes)
  if (on) void flush?.();
  held = on;
  if (!on) void reload?.();
}

/** Called with the track's path each time its project has been applied (Live waits for it). */
export function onProjectApplied(listener: (path: string) => void): () => void {
  appliedListeners.add(listener);
  return () => {
    appliedListeners.delete(listener);
  };
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
    if (!track || !writable || held) return;
    // Taken right now: the stores may already hold the next track when the write runs
    const path = track;
    const data = snapshot();
    const key = JSON.stringify(data);
    if (key === lastSaved) return;
    lastSaved = key;
    const result = await commands.saveProject(path, toFile(data));
    if (result.status === "error") usePlayerStore.getState().reportError(path, result.error);
  };

  const schedule = () => {
    if (applying || !track || held) return;
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
    const [result, fallback] = await Promise.all([commands.loadProject(path), projectDefaults()]);
    if (track !== path) return;
    if (result.status === "ok") {
      const duration = usePlayerStore.getState().track?.duration ?? 0;
      apply(result.data ? fromFile(result.data, duration) : fallback);
      writable = true;
    } else {
      apply(fallback);
      usePlayerStore.getState().reportError(path, result.error);
    }
    lastSaved = JSON.stringify(snapshot());
    applying = false;
    for (const listener of appliedListeners) listener(path);
    // No tab yet: the one beside the track (or picked on the lesson Home) is linked
    if (writable) void autoLinkScore(path);
    // Undo never reaches back into the previous track
    useHistoryStore.getState().reset();
    resetTempoAnalysis();
    void useRecentStore.getState().refresh();
  };

  flush = save;
  reload = async () => {
    const path = track;
    if (!path) return;
    applying = true;
    clearTimeout(timer);
    const [result, fallback] = await Promise.all([commands.loadProject(path), projectDefaults()]);
    if (track !== path) return;
    const duration = usePlayerStore.getState().track?.duration ?? 0;
    apply(result.status === "ok" && result.data ? fromFile(result.data, duration) : fallback);
    lastSaved = JSON.stringify(snapshot());
    applying = false;
    useHistoryStore.getState().reset();
  };

  adoptShared = (path, file) => {
    if (track !== path || !writable) return;
    applying = true;
    clearTimeout(timer);
    applyShared(fromFile(file, usePlayerStore.getState().track?.duration ?? 0));
    lastSaved = JSON.stringify(snapshot());
    applying = false;
    useHistoryStore.getState().reset();
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
    useStemsStore.subscribe((state, previous) => {
      if (state.channels !== previous.channels) schedule();
    }),
    useScoreStore.subscribe((state, previous) => {
      if (state.link !== previous.link || state.shelf !== previous.shelf) schedule();
    }),
  ];
  void projectDefaults();

  // Write pending edits before the window goes away
  const unlistenClose = getCurrentWindow().onCloseRequested(() => save());

  return () => {
    adoptShared = null;
    reload = null;
    flush = null;
    for (const stop of stops) stop();
    void unlistenClose.then((stop) => stop());
    clearTimeout(timer);
  };
}
