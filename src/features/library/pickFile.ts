import { open } from "@tauri-apps/plugin-dialog";
import { t } from "@/i18n";
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
