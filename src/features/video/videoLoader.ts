import { Channel, convertFileSrc } from "@tauri-apps/api/core";
import { isVideoPath } from "@/features/library/formats";
import { commands } from "@/lib/bindings";
import { useExerciseStore } from "@/stores/exercise";
import { useVideoStore } from "@/stores/video";

let current: string | null = null;
/** Set once a proxy was made for the current file: if even that fails, give up */
let proxied = false;
/** Cache file the video panel is showing, if it plays a proxy */
let proxyPath: string | null = null;

/** Cache files on screen right now: emptying the cache must leave them alone. */
export const cacheFilesInUse = (): string[] => (proxyPath ? [proxyPath] : []);

/** Shows the picture of a video file (an angle of the take); `null` hides the panel. */
async function load(path: string | null) {
  current = path;
  proxied = false;
  proxyPath = null;
  const video = useVideoStore.getState();
  if (!path || !isVideoPath(path)) {
    video.setStatus("none", { src: null, error: null });
    return;
  }
  video.setStatus("loading", { src: null, error: null, progress: 0 });
  const allowed = await commands.prepareVideo(path);
  if (current !== path) return;
  if (allowed.status === "error") {
    video.setStatus("error", { error: allowed.error });
    return;
  }
  video.setStatus("loading", { src: convertFileSrc(path) });
}

/**
 * Called when the <video> element found no picture: a file with audio only plays as audio,
 * but a picture WebView2 cannot decode (Xvid/DivX in an .mp4) gets a proxy like any other.
 */
export async function noPicture() {
  const path = current;
  if (!path) return;
  const found = await commands.hasPicture(path);
  if (current !== path) return;
  if (found.status === "ok" && found.data && !proxied) await fallBackToProxy();
  else useVideoStore.getState().setStatus("none", { src: null });
}

/**
 * Called by the <video> element when WebView2 cannot play the file (HEVC, MKV…):
 * FFmpeg makes a light H.264 copy, which then replaces the original.
 */
export async function fallBackToProxy() {
  const path = current;
  const video = useVideoStore.getState();
  if (!path || video.status === "proxying") return;
  if (proxied) {
    video.setStatus("error", { error: { kind: "ffmpegFailed", detail: "proxy not playable" } });
    return;
  }
  proxied = true;
  video.setStatus("proxying", { progress: 0 });
  const progress = new Channel<number | null>();
  progress.onmessage = (value) => {
    if (current === path && value !== null)
      useVideoStore.getState().setStatus("proxying", { progress: value });
  };
  const result = await commands.makeVideoProxy(path, progress);
  if (current !== path) return;
  if (result.status === "ok") {
    proxyPath = result.data;
    video.setStatus("loading", { src: convertFileSrc(result.data) });
  } else video.setStatus("error", { error: result.error });
}

/**
 * Follows the angle chosen for the open track (the track itself, another camera of its take,
 * or the lesson's video when an mp3 is open). Started once by the app shell; returns the
 * function that stops it.
 */
export function followTrackVideo(): () => void {
  return useExerciseStore.subscribe((state, previous) => {
    if (state.angle !== previous.angle) void load(state.angle);
  });
}
