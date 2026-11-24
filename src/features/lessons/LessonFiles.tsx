import { FileAudio, FileMusic, FileText, FileVideo, Layers, Music, Play } from "lucide-react";
import { openAsStems } from "@/features/stems/fileStems";
import { t } from "@/i18n";
import type { Lesson_Serialize, LessonFile } from "@/lib/bindings";
import { cn } from "@/lib/cn";
import { fileNameOf, samePath } from "@/lib/format";
import { useLessonsStore } from "@/stores/lessons";
import { useSettingsStore } from "@/stores/settings";
import { openLesson } from "./openLesson";

type Lesson = Lesson_Serialize;
const l = t.lessons;

/** The lesson's backing track (a take without the player), if it has one. */
export const backingOf = (lesson: Lesson) => lesson.files.find((file) => file.backing) ?? null;

/** A file's part in the lesson, said plainly: «Principale», «Solo base», «Tab PDF»… */
function roleOf(lesson: Lesson, file: LessonFile): string {
  if (file.kind === "video") {
    return samePath(file.path, lesson.main) || !file.label ? l.roleMain : file.label;
  }
  if (file.kind === "audio") return file.backing ? l.roleBacking : l.roleFull;
  return file.kind === "pdf" ? l.rolePdf : l.roleTab;
}

const ICONS = { video: FileVideo, audio: FileAudio, score: FileMusic, pdf: FileText } as const;

/** The lesson's files shown under it (by lesson id), remembered. */
export function toggleFiles(id: string) {
  const { lessonFilesOpen, update } = useSettingsStore.getState();
  update({
    lessonFilesOpen: lessonFilesOpen.includes(id)
      ? lessonFilesOpen.filter((open) => open !== id)
      : [...lessonFilesOpen, id],
  });
}

/** «Solo base» on a lesson's row: its backing track, opened on its own. */
export function BackingKey({ lesson, disabled }: { lesson: Lesson; disabled: boolean }) {
  const backing = backingOf(lesson);
  if (!backing || !lesson.main) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      title={`${l.backingKeyHint}\n${fileNameOf(backing.path)}`}
      onClick={() => void openLesson(lesson, backing.path)}
      className="hw inline-flex h-6 shrink-0 items-center gap-1 rounded-control px-2 text-[11px] text-fg-muted transition-[filter] hover:text-fg hover:brightness-125 disabled:opacity-40"
    >
      <Music className="size-3.5" />
      {l.roleBacking}
    </button>
  );
}

/** Opens the lesson with its backing track as stems: one lane under the other, X to switch. */
export function StemsKey({ lesson, disabled }: { lesson: Lesson; disabled: boolean }) {
  const backing = backingOf(lesson);
  const main = lesson.main;
  // A lesson whose only file is its backing has nothing to stack
  if (!backing || !main || samePath(main, backing.path)) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      title={t.fileStems.lessonKeyHint}
      onClick={() => void openAsStems([main, backing.path], (path) => openLesson(lesson, path))}
      className="hw inline-flex h-6 shrink-0 items-center gap-1 rounded-control px-2 text-[11px] text-fg-muted transition-[filter] hover:text-fg hover:brightness-125 disabled:opacity-40"
    >
      <Layers className="size-3.5" />
      {t.fileStems.lessonKey}
    </button>
  );
}

/**
 * Every file of a lesson by its part (videos, audio, tabs), each opened on its own: a file
 * opened here is a track of its own (its loops, speed…) and what the lesson opens stays as
 * it is. A tab is linked to the lesson.
 */
export function LessonFiles({ lesson, missing }: { lesson: Lesson; missing: boolean }) {
  const groups: [string, LessonFile[]][] = [
    [l.groupVideo, lesson.files.filter((f) => f.kind === "video")],
    [l.groupAudio, lesson.files.filter((f) => f.kind === "audio")],
    [l.groupTab, lesson.files.filter((f) => f.kind === "score" || f.kind === "pdf")],
  ];
  return (
    <div className="mb-1.5 ml-14 grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-control bg-surface/40 px-2 py-1.5">
      {groups.map(([group, files]) =>
        files.map((file, i) => {
          const Icon = ICONS[file.kind];
          const media = file.kind === "video" || file.kind === "audio";
          const usual = media
            ? samePath(file.path, lesson.main)
            : samePath(file.path, lesson.score);
          const open = () => {
            if (media) {
              void openLesson(lesson, file.path);
              return;
            }
            // A tab: the lesson opens with it from now on
            void useLessonsStore
              .getState()
              .choose(lesson.id, {
                main: lesson.chosen ? lesson.main : null,
                score: file.path,
                noScore: false,
              })
              .then(() => openLesson({ ...lesson, chosen: true, score: file.path }));
          };
          return (
            <div key={file.path} className="contents">
              <span className="panel-label text-fg-subtle">{i === 0 ? group : ""}</span>
              <span className="flex min-w-0 items-center gap-2 text-xs" title={file.path}>
                <Icon className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
                <span className={cn("shrink-0", file.backing ? "text-accent" : "text-fg")}>
                  {roleOf(lesson, file)}
                </span>
                <span className="truncate text-fg-subtle">{fileNameOf(file.path)}</span>
                {usual && (
                  <span className="shrink-0 text-[10px] text-fg-subtle italic">
                    {media ? l.opensUsually : l.linkedUsually}
                  </span>
                )}
              </span>
              <button
                type="button"
                disabled={missing || (!media && !lesson.main)}
                title={media ? l.openAloneHint : l.useTabHint}
                onClick={open}
                className="hw inline-flex h-6 items-center gap-1 justify-self-end rounded-control px-2 text-[11px] text-fg-muted transition-[filter] hover:text-fg hover:brightness-125 disabled:opacity-40"
              >
                <Play className="size-3" />
                {media ? l.openFile : l.useTab}
              </button>
            </div>
          );
        }),
      )}
    </div>
  );
}
