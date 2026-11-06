import { getCurrentWindow } from "@tauri-apps/api/window";
import { commands } from "@/lib/bindings";
import { useDiaryStore } from "@/stores/diary";
import { type Track, usePlayerStore } from "@/stores/player";
import { localDay } from "./diaryStats";

const TICK_MS = 1_000;
/** Practice is written at least this often while playing, so little is lost in a crash. */
const FLUSH_SECONDS = 30;

/**
 * Adds playback time to the diary: the seconds a track actually plays, and the highest
 * speed it played at that day. Started once by the app shell; returns the stop function.
 */
export function startDiary(): () => void {
  let track: Track | null = null;
  let seconds = 0;
  let maxSpeed = 0;
  let last = performance.now();

  const flush = async () => {
    if (!track || seconds < 1) return;
    const practice = {
      day: localDay(new Date()),
      path: track.path,
      name: track.name,
      seconds,
      maxSpeed,
    };
    seconds = 0;
    maxSpeed = 0;
    const result = await commands.recordPractice(practice);
    if (result.status === "ok") await useDiaryStore.getState().refresh();
  };

  const timer = setInterval(() => {
    const now = performance.now();
    const { playing, speed } = usePlayerStore.getState();
    if (playing && track) {
      seconds += (now - last) / 1000;
      maxSpeed = Math.max(maxSpeed, speed);
      if (seconds >= FLUSH_SECONDS) void flush();
    }
    last = now;
  }, TICK_MS);

  const stopPlayer = usePlayerStore.subscribe((state, previous) => {
    // A pause or a new track closes the current stretch of practice
    if (state.track !== previous.track) {
      void flush();
      track = state.track;
    } else if (previous.playing && !state.playing) {
      void flush();
    }
  });
  track = usePlayerStore.getState().track;
  void useDiaryStore.getState().refresh();
  const unlistenClose = getCurrentWindow().onCloseRequested(() => flush());

  return () => {
    clearInterval(timer);
    stopPlayer();
    void unlistenClose.then((stop) => stop());
  };
}
