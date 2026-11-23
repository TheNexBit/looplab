import { open } from "@tauri-apps/plugin-dialog";
import { t } from "@/i18n";
import { usePlayerStore } from "@/stores/player";
import { useScoreStore } from "@/stores/score";

/** Score files Looplab shows: Guitar Pro 3-8, MusicXML, Capella (drawn) and PDF (pictures). */
const SCORE_EXTENSIONS = [
  "gp",
  "gp3",
  "gp4",
  "gp5",
  "gpx",
  "musicxml",
  "mxl",
  "xml",
  "capx",
  "pdf",
];

const extension = (path: string) => path.split(".").pop()?.toLowerCase() ?? "";

export const isScoreFile = (path: string) => SCORE_EXTENSIONS.includes(extension(path));

/** Links a score file to the open song (copied once into the library). */
export async function linkScore(path: string) {
  const store = useScoreStore.getState();
  if (!usePlayerStore.getState().track) return;
  await store.linkFile(path);
}

/** The "choose a score" dialog. */
export async function pickScore() {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: t.score.files, extensions: SCORE_EXTENSIONS }],
  });
  if (path) await linkScore(path);
}
