import { AUDIO_FORMATS, VIDEO_FORMATS } from "@/lib/bindings";

/** The media files the app opens: Rust's one list (`formats.rs`), through the bindings. */
const AUDIO_EXTENSIONS: readonly string[] = AUDIO_FORMATS;
const VIDEO_EXTENSIONS: readonly string[] = VIDEO_FORMATS;

/** True for the files whose picture is shown too (by their extension). */
export const isVideoPath = (path: string) =>
  VIDEO_EXTENSIONS.includes(path.split(".").pop()?.toLowerCase() ?? "");

export const MEDIA_EXTENSIONS: readonly string[] = [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS];

export function isSupported(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return MEDIA_EXTENSIONS.includes(extension);
}

export const formatsLabel = `${AUDIO_EXTENSIONS.join(", ")} · ${VIDEO_EXTENSIONS.join(", ")}`;
