import { getCurrentWindow } from "@tauri-apps/api/window";
import { commands } from "@/lib/bindings";
import { useLoopStore } from "@/stores/loop";
import { useMarkersStore } from "@/stores/markers";
import { usePlayerStore } from "@/stores/player";
import { useRecentStore } from "@/stores/recent";
import { emptyProject, fromFile, type ProjectData, toFile } from "./projectFile";

/** Pause after the last change before writing, so a burst of edits is one save. */
const SAVE_DELAY_MS = 800;

function snapshot(): ProjectData {
  const { markers, sections } = useMarkersStore.getState();
  const { start, end, enabled, leadIn, gap } = useLoopStore.getState();
  const { speed, semitones, cents } = usePlayerStore.getState();
  return { markers, sections, loop: { start, end, enabled, leadIn, gap }, speed, semitones, cents };
}

function apply(data: ProjectData) {
  useMarkersStore.getState().replace(data.markers, data.sections);
  useLoopStore.getState().restore(data.loop);
  const player = usePlayerStore.getState();
  player.setSpeed(data.speed);
  player.setPitch(data.semitones, data.cents);
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
    const result = await commands.loadProject(path);
    if (track !== path) return;
    if (result.status === "ok") {
      apply(result.data ? fromFile(result.data.project) : emptyProject());
      if (result.data) useMarkersStore.getState().setSavedTo(result.data.location);
      writable = true;
    } else {
      apply(emptyProject());
      usePlayerStore.getState().reportError(path, result.error);
    }
    lastSaved = JSON.stringify(snapshot());
    applying = false;
    void useRecentStore.getState().refresh();
  };

  const stops = [
    usePlayerStore.subscribe((state, previous) => {
      if (state.track && state.track.path !== previous.track?.path) void open(state.track.path);
      else if (
        state.speed !== previous.speed ||
        state.semitones !== previous.semitones ||
        state.cents !== previous.cents
      ) {
        schedule();
      }
    }),
    useMarkersStore.subscribe((state, previous) => {
      if (state.markers !== previous.markers || state.sections !== previous.sections) schedule();
    }),
    useLoopStore.subscribe(schedule),
  ];

  // Write pending edits before the window goes away
  const unlistenClose = getCurrentWindow().onCloseRequested(() => save());

  return () => {
    for (const stop of stops) stop();
    void unlistenClose.then((stop) => stop());
    clearTimeout(timer);
  };
}
