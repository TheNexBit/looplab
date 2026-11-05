import { emitTo } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { events } from "@/lib/bindings";
import { currentPosition, usePlayerStore } from "@/stores/player";
import { useVideoStore, type VideoStatus } from "@/stores/video";

/** Must match `window::VIDEO` in src-tauri/src/window.rs. */
export const VIDEO_WINDOW = "video";
/** Main window → detached window: what to show and where the audio is. */
export const VIDEO_SYNC_EVENT = "video-sync";
/** How often the clock is re-sent while detached; the window interpolates in between. */
const SYNC_INTERVAL_MS = 200;

export interface VideoSyncPayload {
  src: string | null;
  status: VideoStatus;
  progress: number;
  position: number;
  playing: boolean;
  speed: number;
}

function payload(): VideoSyncPayload {
  const { src, status, progress } = useVideoStore.getState();
  const { playing, speed } = usePlayerStore.getState();
  return { src, status, progress, position: currentPosition(), playing, speed };
}

/** Shows the pre-created video window (instant: it already exists, hidden). */
export async function detachVideo() {
  useVideoStore.getState().setDetached(true);
  const window = await WebviewWindow.getByLabel(VIDEO_WINDOW);
  await emitTo(VIDEO_WINDOW, VIDEO_SYNC_EVENT, payload());
  await window?.show();
  await window?.setFocus();
}

export async function dockVideo() {
  useVideoStore.getState().setDetached(false);
  await (await WebviewWindow.getByLabel(VIDEO_WINDOW))?.hide();
}

/**
 * While the video is detached, keeps its window in step with the main one.
 * Started once by the main window; returns the function that stops it.
 */
export function feedDetachedVideo(): () => void {
  const send = () => {
    if (useVideoStore.getState().detached) void emitTo(VIDEO_WINDOW, VIDEO_SYNC_EVENT, payload());
  };
  const timer = setInterval(send, SYNC_INTERVAL_MS);
  const stops = [
    usePlayerStore.subscribe((s, p) => {
      if (s.playing !== p.playing || s.speed !== p.speed || s.anchorPosition !== p.anchorPosition)
        send();
    }),
    useVideoStore.subscribe(send),
  ];
  // Closing the detached window only hides it: dock the video again
  const unlisten = events.videoWindowHidden.listen(() =>
    useVideoStore.getState().setDetached(false),
  );
  return () => {
    clearInterval(timer);
    for (const stop of stops) stop();
    void unlisten.then((stop) => stop());
  };
}
