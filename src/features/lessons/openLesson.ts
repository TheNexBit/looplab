import { linkScore } from "@/features/score/pickScore";
import { t } from "@/i18n";
import { commands, type Lesson_Serialize } from "@/lib/bindings";
import { fileNameOf } from "@/lib/format";
import { useLessonsStore } from "@/stores/lessons";
import { usePlayerStore } from "@/stores/player";
import { useScoreStore } from "@/stores/score";

const samePath = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The tab the user picked on the Home for the track being opened (wins over a linked one). */
let picked: { track: string; score: string | null; clear: boolean } | null = null;

/**
 * Opens a lesson: its main file (or `path`, one of its files), with its tab linked once the
 * project is loaded. A document (PDF study guide) opens in the system's viewer.
 */
export async function openLesson(lesson: Lesson_Serialize, path?: string) {
  const target = path ?? lesson.main;
  if (!target) {
    const document = lesson.files.find((f) => f.kind === "pdf");
    if (document) await commands.openDocument(document.path);
    return;
  }
  // «No tab» picked on a lesson that has tabs: the one linked goes too
  const hasTabs = lesson.files.some((f) => f.kind === "score" || f.kind === "pdf");
  picked = lesson.chosen
    ? { track: target, score: lesson.score, clear: lesson.score === null && hasTabs }
    : null;
  useLessonsStore.getState().setOpen(false);
  const current = usePlayerStore.getState().track?.path;
  if (current && samePath(current, target)) {
    // Already open: its project stays, only the tab picked on the Home is applied
    await autoLinkScore(current);
    return;
  }
  await usePlayerStore.getState().open(target);
}

/**
 * Called when a track's project is loaded: a track without a tab gets the one beside it (same
 * folder, same name), also for files opened from outside the course folders. A tab picked on
 * the Home replaces a different one.
 */
export async function autoLinkScore(track: string) {
  const choice = picked && samePath(picked.track, track) ? picked : null;
  picked = null;
  const linked = useScoreStore.getState().link;
  let score: string | null = null;
  if (choice) {
    if (choice.clear && linked && usePlayerStore.getState().track?.path === track) {
      useScoreStore.getState().unlink();
      return;
    }
    if (!choice.score || (linked && samePath(linked.name, fileNameOf(choice.score)))) return;
    score = choice.score;
  } else {
    if (linked) return;
    const found = await commands.scoreBeside(track);
    if (found.status !== "ok" || !found.data) return;
    score = found.data;
  }
  // Still the same track, still without that tab
  if (usePlayerStore.getState().track?.path !== track) return;
  const now = useScoreStore.getState().link;
  if (now && !choice) return;
  await linkScore(score);
  if (useScoreStore.getState().link)
    useScoreStore.getState().setInfo(t.lessons.tabLinked(fileNameOf(score)));
}

/** The user removed the tab: the one beside the track is not linked again by itself. */
export function forgetScoreBeside() {
  const track = usePlayerStore.getState().track?.path;
  if (track) void commands.forgetScoreBeside(track);
}
