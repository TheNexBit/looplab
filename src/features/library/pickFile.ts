import { open } from "@tauri-apps/plugin-dialog";
import { t } from "@/i18n";
import { commands } from "@/lib/bindings";
import { usePlayerStore } from "@/stores/player";
import { isSupported, MEDIA_EXTENSIONS } from "./formats";

/** Shows the "Open" dialog and loads the chosen file. */
export async function pickAndOpenFile() {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: t.library.mediaFiles, extensions: [...MEDIA_EXTENSIONS] }],
  });
  if (path) await usePlayerStore.getState().open(path);
}

/** Opens the first supported file among those dropped on the window. */
export function openDroppedFiles(paths: string[]) {
  const { open, reportError } = usePlayerStore.getState();
  const path = paths.find(isSupported);
  if (path) void open(path);
  else if (paths[0]) reportError(paths[0], { kind: "unsupportedFormat", detail: "" });
}

/** Asked once per start: development's double effects must not open the track twice. */
let reopened = false;

/** At start-up, with "Startup: last track": opens the most recent track that still exists. */
export async function openLastTrack() {
  if (reopened) return;
  reopened = true;
  const result = await commands.recentFiles();
  const last = result.status === "ok" ? result.data.find((file) => file.exists) : undefined;
  const player = usePlayerStore.getState();
  // Something opened meanwhile (a drop, the Open dialog): leave it
  if (last && !player.track && player.load.kind === "idle") await player.open(last.path);
}
