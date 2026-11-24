import { create } from "zustand";
import { holdProjectSaves, onProjectApplied } from "@/features/markers/projectSync";
import type { SetlistSong_Serialize as Song } from "@/lib/bindings";
import { samePath } from "@/lib/format";
import { useLessonsStore } from "@/stores/lessons";
import { useLoopStore } from "@/stores/loop";
import { currentPosition, setPlaysOnFromHere, usePlayerStore } from "@/stores/player";
import { useSetlistsStore } from "@/stores/setlists";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import { afterSong, cueRange, fadeGain, livePlan } from "./setlistMath";

/**
 * - `loading`: the song's file is opening
 * - `ready`: cued at its start, waiting for Play (or for the key, between songs)
 * - `gap`: the pause between songs is running, then the song starts by itself
 * - `playing` / `paused`
 * - `done`: the last song is over
 */
export type LivePhase = "loading" | "ready" | "gap" | "playing" | "paused" | "done";

/** What happens once a song is loaded. */
type Then = "wait" | "play" | "gap";

/** Set mode left because a track outside the setlist was opened: «Back to the setlist». */
export interface LeftSet {
  setlistId: string;
  index: number;
}

interface LiveState {
  /** Set mode is on: the setlist is being played, its Live settings apply */
  active: boolean;
  /** The Stage view covers the window (off: the usual view, with the set bar on top) */
  stage: boolean;
  setlistId: string;
  index: number;
  phase: LivePhase;
  /** Part of the song being played (two in the «changes» rehearsal: head and tail) */
  part: number;
  parts: { start: number; end: number }[];
  /** When the gap between songs ends (`performance.now()` ms) */
  gapEnds: number;
  /** When the first song started, for the set clock (`performance.now()` ms) */
  setStartedAt: number | null;
  /** A song without file: seconds played, and when it last started */
  elapsed: number;
  runningSince: number;
  /** The song's file is missing or could not be opened */
  missing: boolean;
  /** Set mode was just left by opening another track (shown as a notice with a way back) */
  left: LeftSet | null;
  /** Level of the fade out at the cue out (1 = none): it scales the track volume */
  fade: number;
  /** Turns set mode on at song `index` (or moves there if already on); `stage` shows the Stage view. */
  start: (setlistId: string, index?: number, stage?: boolean) => Promise<void>;
  /** Plays song `index` of the set at once (a double-click on it). */
  playSong: (index: number) => void;
  stop: () => void;
  setStage: (stage: boolean) => void;
  dismissLeft: () => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
}

/** Back over this many seconds into a song, «previous» restarts it instead of going back. */
const RESTART_AFTER = 3;
/** How often Live checks where the playhead is (ms). */
const TICK_MS = 40;
/** A song is over this close to its end (seconds): the engine's reports are not exact. */
const END_MARGIN = 0.03;

let timer: ReturnType<typeof setInterval> | undefined;
/** Grows with every song loaded: an older load that finishes late is dropped. */
let loadToken = 0;
/** The file set mode is opening or has open: any other track that opens leaves set mode. */
let expectedPath: string | null = null;
/** The side panel tab before set mode showed the setlist, given back when it ends. */
let tabBefore: ReturnType<typeof useUiStore.getState>["sidePanelTab"] | null = null;

const setlistOf = () => {
  const { setlistId } = useLiveStore.getState();
  return useSetlistsStore.getState().setlists.find((s) => s.id === setlistId);
};
const songs = (): Song[] => setlistOf()?.songs ?? [];
const currentSong = (): Song | undefined => songs()[useLiveStore.getState().index];

const fileMissing = (path: string) =>
  useSetlistsStore.getState().files.some((f) => samePath(f.path, path) && !f.exists);

/** Waits until `path` is open with its project applied (false if it could not be opened). */
function openTrack(path: string): Promise<boolean> {
  const player = usePlayerStore.getState();
  expectedPath = path;
  if (samePath(player.track?.path, path) && player.load.kind !== "loading") {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const offApplied = onProjectApplied((applied) => {
      if (samePath(applied, path)) finish(true);
    });
    const offError = usePlayerStore.subscribe((state) => {
      if (state.load.kind === "error" && samePath(state.load.path, path)) finish(false);
    });
    function finish(ok: boolean) {
      offApplied();
      offError();
      resolve(ok);
    }
    void player.open(path);
  });
}

function pausePlayer() {
  const player = usePlayerStore.getState();
  if (player.playing) player.togglePlay();
}

/**
 * Set mode: the setlist played as a gig, song after song with their Live settings, in the usual
 * view (with the set bar on top) or on the full-window Stage view. Turned on only by the user;
 * opening a track that is not in the set turns it off.
 */
export const useLiveStore = create<LiveState>((set, get) => {
  /** Loads song `index` and cues it; then waits, plays, or runs the gap. */
  const load = async (index: number, then: Then) => {
    const song = songs()[index];
    const token = ++loadToken;
    pausePlayer();
    if (!song) {
      set({ phase: "done" });
      return;
    }
    set({ index, part: 0, parts: [], phase: "loading", elapsed: 0, missing: false });
    // Where to resume next time
    if (setlistOf()?.lastSong !== song.id) {
      useSetlistsStore.getState().edit(get().setlistId, (x) => ({ ...x, lastSong: song.id }));
    }
    if (song.path) {
      const ok = !fileMissing(song.path) && (await openTrack(song.path));
      if (token !== loadToken || !get().active) return;
      if (!ok) {
        set({ phase: "ready", missing: true });
        return;
      }
      cue(song);
    }
    if (then === "play") play();
    else if (then === "gap") {
      set({ phase: "gap", gapEnds: performance.now() + (setlistOf()?.gapSeconds ?? 0) * 1000 });
    } else set({ phase: "ready" });
  };

  /** The Live settings on the open track: speed, transpose, no loop, at the cue in. */
  const cue = (song: Song) => {
    const player = usePlayerStore.getState();
    const duration = player.track?.duration ?? 0;
    // The real length, now that the file is open: the set's total stays right
    if (duration > 0 && Math.abs((song.length ?? 0) - duration) > 0.5) {
      useSetlistsStore.getState().editSong(get().setlistId, song.id, { length: duration });
    }
    player.setSpeed(song.speed ?? 1);
    player.setPitch(song.semitones ?? 0, 0);
    useLoopStore.getState().clear();
    const range = cueRange({ ...song, length: duration }) ?? { start: 0, end: duration };
    const { liveMode, liveChangeSeconds } = useSettingsStore.getState();
    const parts = livePlan(range, liveMode, liveChangeSeconds);
    set({ parts, part: 0, fade: 1 });
    player.seek(parts[0]?.start ?? 0);
  };

  const play = () => {
    const song = currentSong();
    if (!song || get().missing) return;
    set({ setStartedAt: get().setStartedAt ?? performance.now() });
    if (!song.path) {
      set({ phase: "playing", runningSince: performance.now() });
      return;
    }
    const player = usePlayerStore.getState();
    // From where the playhead is (not back to the start point, as a study stop would)
    player.seek(currentPosition());
    if (!player.playing) player.togglePlay();
    set({ phase: "playing" });
  };

  const pause = () => {
    const song = currentSong();
    if (song && !song.path) {
      set({ elapsed: noFileElapsed(), phase: "paused" });
      return;
    }
    pausePlayer();
    set({ phase: "paused" });
  };

  const noFileElapsed = () => {
    const { elapsed, runningSince, phase } = get();
    return phase === "playing" ? elapsed + (performance.now() - runningSince) / 1000 : elapsed;
  };

  /** The song is over: the next one plays, waits or runs the gap (`afterSong`). */
  const songOver = () => {
    pausePlayer();
    set({ fade: 1 });
    const list = songs();
    const current = list[get().index];
    const index = get().index + 1;
    const next = list[index];
    if (!next) {
      set({ phase: "done" });
      return;
    }
    const auto = useSettingsStore.getState().setlistAutoAdvance;
    void load(index, afterSong(current, next, auto, setlistOf()?.gapSeconds ?? 0));
  };

  const tick = () => {
    const state = get();
    if (!state.active) return;
    if (state.phase === "gap") {
      if (performance.now() >= state.gapEnds) play();
      return;
    }
    const song = currentSong();
    if (!song) return;
    const player = usePlayerStore.getState();
    // Started with the dock's Play key or the space bar of the usual view
    if ((state.phase === "ready" || state.phase === "paused") && song.path && player.playing) {
      set({ phase: "playing", setStartedAt: state.setStartedAt ?? performance.now() });
      return;
    }
    if (state.phase !== "playing") return;
    if (!song.path) {
      if (song.length !== null && noFileElapsed() >= song.length) songOver();
      return;
    }
    const part = state.parts[state.part];
    if (!part) return;
    const position = currentPosition();
    if (position >= part.end - END_MARGIN || (!player.playing && position >= part.end - 0.2)) {
      const nextPart = state.parts[state.part + 1];
      if (nextPart) {
        set({ part: state.part + 1 });
        player.seek(nextPart.start);
        return;
      }
      songOver();
      return;
    }
    // The last part ends at the cue out: the song may fade out towards it
    if (!state.parts[state.part + 1]) {
      const fade = fadeGain(position, part.end, song.fadeOut, song.speed ?? 1);
      if (Math.abs(fade - state.fade) > 0.005 || (fade === 1 && state.fade !== 1)) set({ fade });
    }
    // Stopped from elsewhere (a media key, the dock)
    if (!player.playing) set({ phase: "paused" });
  };

  const showSetlistTab = (on: boolean) => {
    const ui = useUiStore.getState();
    if (on) {
      if (ui.sidePanelTab !== "setlist") tabBefore = ui.sidePanelTab;
      ui.setSidePanelTab("setlist");
    } else if (ui.sidePanelTab === "setlist") {
      ui.setSidePanelTab(tabBefore ?? "sections");
      tabBefore = null;
    }
  };

  return {
    active: false,
    stage: false,
    setlistId: "",
    index: 0,
    phase: "loading",
    part: 0,
    parts: [],
    gapEnds: 0,
    setStartedAt: null,
    elapsed: 0,
    runningSince: 0,
    missing: false,
    left: null,
    fade: 1,

    start: async (setlistId, index = 0, stage = false) => {
      if (get().active && get().setlistId === setlistId) {
        set({ stage });
        if (index !== get().index) await load(index, "wait");
        return;
      }
      if (get().active) get().stop();
      await useSetlistsStore.getState().flush();
      holdProjectSaves(true);
      set({ active: true, stage, setlistId, setStartedAt: null, left: null });
      showSetlistTab(true);
      // The set is played in the usual view: the Home over the track makes way
      if (!stage) useLessonsStore.getState().setOpen(false);
      clearInterval(timer);
      timer = setInterval(tick, TICK_MS);
      await load(index, "wait");
    },

    playSong: (index) => void load(index, "play"),

    stop: () => {
      if (!get().active) return;
      loadToken += 1;
      expectedPath = null;
      clearInterval(timer);
      timer = undefined;
      pausePlayer();
      set({ active: false, stage: false, phase: "loading", fade: 1 });
      showSetlistTab(false);
      // The study settings of the open track come back
      holdProjectSaves(false);
    },

    setStage: (stage) => set({ stage }),
    dismissLeft: () => set({ left: null }),

    toggle: () => {
      const { phase } = get();
      if (phase === "playing") pause();
      else if (phase === "ready" || phase === "paused" || phase === "gap") play();
    },

    next: () => {
      const index = get().index + 1;
      if (index < songs().length) void load(index, "wait");
    },

    previous: () => {
      const song = currentSong();
      const { index, parts } = get();
      const start = parts[0]?.start ?? 0;
      // Time into the song: from the playhead only when its own file is the one open (a song
      // whose file is missing never started, so «previous» goes back instead of restarting it)
      const ownTrack =
        !!song?.path &&
        !get().missing &&
        samePath(usePlayerStore.getState().track?.path, song.path);
      const into = ownTrack ? currentPosition() - start : song?.path ? 0 : noFileElapsed();
      if (into > RESTART_AFTER || index === 0) void load(index, "wait");
      else void load(index - 1, "wait");
    },
  };
});

// The set being played is deleted: set mode ends, the study project comes back
useSetlistsStore.subscribe((state) => {
  const live = useLiveStore.getState();
  if (live.active && state.loaded && !state.setlists.some((x) => x.id === live.setlistId)) {
    live.stop();
  }
});

// A track that is not the set's song opens (recent list, a course, a file): set mode ends, with
// a notice to go back. Studying a single track never finds the setlist in the way.
usePlayerStore.subscribe((state, previous) => {
  const live = useLiveStore.getState();
  const path = state.track?.path;
  if (!live.active || !path || path === previous.track?.path) return;
  if (samePath(path, expectedPath)) return;
  const left = { setlistId: live.setlistId, index: live.index };
  // After the project sync has taken the new track (saves still held): the set's Live settings
  // never land in the study project of the song that was playing
  setTimeout(() => {
    useLiveStore.getState().stop();
    useLiveStore.setState({ left });
  }, 0);
});

setPlaysOnFromHere(() => useLiveStore.getState().active);

/**
 * The Play key and the space bar: in set mode they play or pause the set's song (a song without
 * file or a break has no track of its own); otherwise the open track, as always.
 */
export function playOrPause() {
  const live = useLiveStore.getState();
  if (live.active && live.phase !== "done") live.toggle();
  else usePlayerStore.getState().togglePlay();
}

/** Seconds played of a song without file (for the Stage view's clock). */
export function liveElapsed(state: LiveState = useLiveStore.getState()): number {
  return state.phase === "playing"
    ? state.elapsed + (performance.now() - state.runningSince) / 1000
    : state.elapsed;
}
