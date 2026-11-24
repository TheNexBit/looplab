import { open as pickFiles } from "@tauri-apps/plugin-dialog";
import { isSupported, MEDIA_EXTENSIONS } from "@/features/library/formats";
import { onProjectApplied } from "@/features/markers/projectSync";
import { t } from "@/i18n";
import { commands } from "@/lib/bindings";
import { fileNameOf, samePath } from "@/lib/format";
import { savedLanes, useFileStemsStore } from "@/stores/fileStems";
import { useLessonsStore } from "@/stores/lessons";
import { usePlayerStore } from "@/stores/player";

/** Words that name a backing track: such a file is never the main lane of the stems. */
const BACKING_WORDS = /\b(backing|base|bt|minus|karaoke|instrumental|playback|jam)\b/i;

/**
 * The lane the stems are played on: the first file that is not a backing track (the solo,
 * the song), else the first one. The others follow in name order.
 */
export function orderStems(paths: readonly string[]): string[] {
  const sorted = [...paths].sort((a, b) =>
    fileNameOf(a).localeCompare(fileNameOf(b), undefined, { numeric: true }),
  );
  const main = sorted.find((path) => !BACKING_WORDS.test(fileNameOf(path))) ?? sorted[0];
  return main ? [main, ...sorted.filter((path) => path !== main)] : [];
}

/** Opens `path` (unless it is open) and waits until its project has been applied. */
function openAndWait(path: string, openIt: () => Promise<void>): Promise<boolean> {
  const player = usePlayerStore.getState();
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
    void openIt();
  });
}

/**
 * Opens files as stems, like Song Master's «Open as stems»: the main one as the track, the
 * others on their own lanes, lined up from their sound. `openMain` opens the main file in its
 * own way (a lesson, with its tab); by default it is opened as a track.
 */
export async function openAsStems(
  paths: readonly string[],
  openMain?: (main: string) => Promise<void>,
) {
  const [main, ...others] = orderStems(paths.filter(isSupported));
  if (!main) return;
  useLessonsStore.getState().setOpen(false);
  const opened = await openAndWait(main, () =>
    openMain ? openMain(main) : usePlayerStore.getState().open(main),
  );
  if (!opened || others.length === 0) return;
  const stems = useFileStemsStore.getState();
  // Lanes already open for this track keep their shift and mix
  await stems.open(main, [main, ...others], savedLanes(stems.lanes));
}

/** «Open as stems…»: several files picked in the dialog. */
export async function pickAndOpenStems() {
  const picked = await pickFiles({
    multiple: true,
    directory: false,
    title: t.fileStems.pickTitle,
    filters: [{ name: t.library.mediaFiles, extensions: [...MEDIA_EXTENSIONS] }],
  });
  const paths = picked === null ? [] : Array.isArray(picked) ? picked : [picked];
  if (paths.length > 0) await openAsStems(paths);
}

/** «Add a stem…» to the open track. */
export async function pickAndAddStems() {
  const picked = await pickFiles({
    multiple: true,
    directory: false,
    title: t.fileStems.addTitle,
    filters: [{ name: t.library.mediaFiles, extensions: [...MEDIA_EXTENSIONS] }],
  });
  const paths = picked === null ? [] : Array.isArray(picked) ? picked : [picked];
  const track = usePlayerStore.getState().track?.path;
  if (paths.length === 0 || !track) return;
  const stems = useFileStemsStore.getState();
  if (stems.lanes.length > 0) await stems.add(paths);
  else await stems.open(track, [track, ...paths]);
}

/**
 * Dropped files: two or more playable files, or a folder holding them, open as stems.
 * Returns false when there is nothing to open that way (one file: opened as usual).
 */
export async function dropAsStems(paths: readonly string[]): Promise<boolean> {
  const files = paths.filter(isSupported);
  if (files.length >= 2) {
    await openAsStems(files);
    return true;
  }
  if (files.length === 0 && paths.length === 1 && paths[0]) {
    const listed = await commands.mediaInFolder(paths[0]);
    if (listed.status === "ok" && listed.data.length > 0) {
      if (listed.data.length === 1) await usePlayerStore.getState().open(listed.data[0] ?? "");
      else await openAsStems(listed.data);
      return true;
    }
  }
  return false;
}
