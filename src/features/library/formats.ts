/** File types offered by the open dialog and accepted by drag & drop. */
const AUDIO_EXTENSIONS = ["mp3", "wav", "flac", "m4a", "aac", "ogg", "aiff"] as const;
/** Only the audio track of videos plays for now; the picture arrives in phase 6. */
export const VIDEO_EXTENSIONS = ["mp4", "mov", "mkv", "webm"] as const;

/** True for the files whose picture is shown too (by their extension). */
export const isVideoPath = (path: string) =>
  (VIDEO_EXTENSIONS as readonly string[]).includes(path.split(".").pop()?.toLowerCase() ?? "");

export const MEDIA_EXTENSIONS: readonly string[] = [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS];

export function isSupported(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return MEDIA_EXTENSIONS.includes(extension);
}

export const formatsLabel = `${AUDIO_EXTENSIONS.join(", ")} · ${VIDEO_EXTENSIONS.join(", ")}`;
