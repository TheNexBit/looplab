import { create } from "zustand";
import { holdProjectSaves, onProjectApplied } from "@/features/markers/projectSync";
import type { SetlistSong_Serialize as Song } from "@/lib/bindings";
import { samePath } from "@/lib/format";
import { useLoopStore } from "@/stores/loop";
import { currentPosition, usePlayerStore } from "@/stores/player";
import { useSetlistsStore } from "@/stores/setlists";
import { useSettingsStore } from "@/stores/settings";
import { cueRange, isBreak, livePlan } from "./setlistMath";

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

interface LiveState {
  active: boolean;
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
  start: (setlistId: string, index?: number) => Promise<void>;
  stop: () => void;
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

const songs = (): Song[] => {
  const { setlistId } = useLiveStore.getState();
  return useSetlistsStore.getState().setlists.find((s) => s.id === setlistId)?.songs ?? [];
};

const currentSong = (): Song | undefined => songs()[useLiveStore.getState().index];

const fileMissing = (path: string) =>
  useSetlistsStore.getState().files.some((f) => samePath(f.path, path) && !f.exists);

/** Waits until `path` is open with its project applied (false if it could not be opened). */
function openTrack(path: string): Promise<boolean> {
  const player = usePlayerStore.getState();
  if (samePath(player.track?.path, path) && player.load.kind !== "loading") {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const offApplied = onProjectApplied((applied) => {
      if (!samePath(applied, path)) return;
      finish(true);
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

/** The setlist played as a gig: song after song, with its Live settings, on the Stage view. */
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
      const gap = useSetlistsStore
        .getState()
        .setlists.find((s) => s.id === get().setlistId)?.gapSeconds;
      set({ phase: "gap", gapEnds: performance.now() + (gap ?? 0) * 1000 });
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
    set({ parts, part: 0 });
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

  /** The song is over: the next one is cued, then waits for the key or runs the gap. */
  /**
   * The song is over. After a segue the next one starts at once (a medley); a break starts its
   * countdown at once; after a break the next song waits for the key (the band comes back on
   * stage); otherwise the gap runs, or Live waits for the key.
   */
  const songOver = () => {
    pausePlayer();
    const list = songs();
    const current = list[get().index];
    const index = get().index + 1;
    const next = list[index];
    if (!next) {
      set({ phase: "done" });
      return;
    }
    const gap =
      useSetlistsStore.getState().setlists.find((s) => s.id === get().setlistId)?.gapSeconds ?? 0;
    const then: Then =
      current?.segue || isBreak(next)
        ? "play"
        : current && isBreak(current)
          ? "wait"
          : gap > 0
            ? "gap"
            : "wait";
    void load(index, then);
  };

  const tick = () => {
    const state = get();
    if (!state.active) return;
    if (state.phase === "gap") {
      if (performance.now() >= state.gapEnds) play();
      return;
    }
    if (state.phase !== "playing") return;
    const song = currentSong();
    if (!song) return;
    if (!song.path) {
      if (song.length !== null && noFileElapsed() >= song.length) songOver();
      return;
    }
    const player = usePlayerStore.getState();
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
    // Stopped from elsewhere (a media key, the mouse)
    if (!player.playing) set({ phase: "paused" });
  };

  return {
    active: false,
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

    start: async (setlistId, index = 0) => {
      await useSetlistsStore.getState().flush();
      holdProjectSaves(true);
      set({ active: true, setlistId, setStartedAt: null });
      clearInterval(timer);
      timer = setInterval(tick, TICK_MS);
      await load(index, "wait");
    },

    stop: () => {
      loadToken += 1;
      clearInterval(timer);
      timer = undefined;
      pausePlayer();
      set({ active: false, phase: "loading" });
      // The study settings of the open track come back
      holdProjectSaves(false);
    },

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
      const into = song?.path ? currentPosition() - start : noFileElapsed();
      if (into > RESTART_AFTER || index === 0) void load(index, "wait");
      else void load(index - 1, "wait");
    },
  };
});

/** Seconds played of a song without file (for the Stage view's clock). */
export function liveElapsed(state: LiveState = useLiveStore.getState()): number {
  return state.phase === "playing"
    ? state.elapsed + (performance.now() - state.runningSince) / 1000
    : state.elapsed;
}
