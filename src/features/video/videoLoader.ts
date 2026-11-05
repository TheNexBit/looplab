import { Channel, convertFileSrc } from "@tauri-apps/api/core";
import { VIDEO_EXTENSIONS } from "@/features/library/formats";
import { commands } from "@/lib/bindings";
import { usePlayerStore } from "@/stores/player";
import { useVideoStore } from "@/stores/video";

const isVideoFile = (path: string) =>
  (VIDEO_EXTENSIONS as readonly string[]).includes(path.split(".").pop()?.toLowerCase() ?? "");

let current: string | null = null;
/** Set once a proxy was made for the current file: if even that fails, give up */
let proxied = false;

/** Shows the picture of a newly opened video file; audio files hide the panel. */
async function load(path: string) {
  current = path;
  proxied = false;
  const video = useVideoStore.getState();
  if (!isVideoFile(path)) {
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
  if (result.status === "ok") video.setStatus("loading", { src: convertFileSrc(result.data) });
  else video.setStatus("error", { error: result.error });
}

/** Follows the open track. Started once by the app shell; returns the function that stops it. */
export function followTrackVideo(): () => void {
  return usePlayerStore.subscribe((state, previous) => {
    if (state.track && state.track.path !== previous.track?.path) void load(state.track.path);
  });
}
