import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileAudio,
  FileMusic,
  FileText,
  FileVideo,
  FolderOpen,
  FolderPlus,
  GraduationCap,
  Play,
  RefreshCw,
  Search,
  Undo2,
  X,
} from "lucide-react";
import { ContextMenu } from "radix-ui";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { menuContent, menuItem, menuLabel, menuSeparator } from "@/components/ui/menu";
import { withRightClick } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import {
  commands,
  type Lesson_Serialize,
  type LessonFile,
  type LessonRoot,
  type TabState,
} from "@/lib/bindings";
import { cn } from "@/lib/cn";
import { formatAgo } from "@/lib/format";
import { useLessonsStore } from "@/stores/lessons";
import { openLesson } from "./openLesson";

type Lesson = Lesson_Serialize;
const l = t.lessons;
/** Lessons shown under «Recently opened» */
const RECENT_COUNT = 4;

const store = () => useLessonsStore.getState();
const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;
const ago = (seconds: number) => formatAgo(new Date(seconds * 1000), new Date(), t.recent.ago);

async function addCourse() {
  const path = await pickFolder({ directory: true, multiple: false, title: l.pickCourse });
  if (typeof path === "string") await store().addRoot(path);
}

function lessonIcon(lesson: Lesson) {
  if (!lesson.main) return FileText;
  return lesson.main.toLowerCase().match(/\.(mp4|mov|mkv|webm)$/) ? FileVideo : FileAudio;
}

/** Lamp and word: how far the lesson's tab is. */
function TabLamp({ state }: { state: TabState }) {
  if (state === "none") return null;
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-fg-subtle" title={l.tabHint[state]}>
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          state === "synced" && "bg-loop shadow-[0_0_6px_var(--color-loop)]",
          state === "linked" && "bg-accent shadow-[0_0_6px_var(--color-accent)]",
          state === "found" && "border border-fg-subtle",
        )}
      />
      <span className="whitespace-nowrap">{l.tab[state]}</span>
    </span>
  );
}

/** What the user picks keeps the other half of the choice as it is. */
function choose(
  lesson: Lesson,
  change: { main?: string | null; score?: string | null; noScore?: boolean },
) {
  void store().choose(lesson.id, {
    main: lesson.chosen ? lesson.main : null,
    score: lesson.chosen ? lesson.score : null,
    noScore: lesson.chosen && lesson.score === null,
    ...change,
  });
}

function fileTitle(file: LessonFile) {
  return file.label ? `${file.label} · ${fileName(file.path)}` : fileName(file.path);
}

/** Right-click on a lesson: open one of its files, pick what opens and which tab goes with it. */
function LessonMenu({ lesson, children }: { lesson: Lesson; children: ReactNode }) {
  const media = lesson.files.filter((f) => f.kind === "video" || f.kind === "audio");
  const scores = lesson.files.filter((f) => f.kind === "score" || f.kind === "pdf");
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={cn(menuContent, "max-w-96")}>
          <ContextMenu.Item className={menuItem} onSelect={() => void openLesson(lesson)}>
            <Play className="size-4" />
            {lesson.main ? l.open : l.openDocument}
          </ContextMenu.Item>
          {media.length > 0 && (
            <>
              <ContextMenu.Separator className={menuSeparator} />
              <ContextMenu.Label className={menuLabel}>{l.mainFile}</ContextMenu.Label>
              {media.map((file) => (
                <ContextMenu.Item
                  key={file.path}
                  className={menuItem}
                  title={l.openWith}
                  onSelect={() => {
                    choose(lesson, { main: file.path });
                    void openLesson({ ...lesson, main: file.path }, file.path);
                  }}
                >
                  {file.path === lesson.main ? (
                    <Check className="size-4 text-accent" />
                  ) : file.kind === "video" ? (
                    <FileVideo className="size-4" />
                  ) : (
                    <FileAudio className="size-4" />
                  )}
                  <span className="truncate">{fileTitle(file)}</span>
                </ContextMenu.Item>
              ))}
            </>
          )}
          {lesson.main && scores.length > 0 && (
            <>
              <ContextMenu.Separator className={menuSeparator} />
              <ContextMenu.Label className={menuLabel}>{l.tabFile}</ContextMenu.Label>
              {scores.map((file) => (
                <ContextMenu.Item
                  key={file.path}
                  className={menuItem}
                  onSelect={() => choose(lesson, { score: file.path, noScore: false })}
                >
                  {file.path === lesson.score ? (
                    <Check className="size-4 text-accent" />
                  ) : file.kind === "pdf" ? (
                    <FileText className="size-4" />
                  ) : (
                    <FileMusic className="size-4" />
                  )}
                  <span className="truncate">{fileName(file.path)}</span>
                </ContextMenu.Item>
              ))}
              <ContextMenu.Item
                className={menuItem}
                onSelect={() => choose(lesson, { score: null, noScore: true })}
              >
                {lesson.score === null ? (
                  <Check className="size-4 text-accent" />
                ) : (
                  <X className="size-4" />
                )}
                {l.noTab}
              </ContextMenu.Item>
            </>
          )}
          {lesson.chosen && (
            <ContextMenu.Item
              className={menuItem}
              onSelect={() => void store().choose(lesson.id, {})}
            >
              <Undo2 className="size-4" />
              {l.reset}
            </ContextMenu.Item>
          )}
          <ContextMenu.Separator className={menuSeparator} />
          <ContextMenu.Item
            className={menuItem}
            onSelect={() =>
              void commands.revealFile(lesson.main ?? lesson.files[0]?.path ?? lesson.folder)
            }
          >
            <FolderOpen className="size-4" />
            {l.reveal}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** One lesson: name, what it holds, its tab, practice and last opening; click opens it. */
function LessonRow({
  lesson,
  showGroup = false,
  missing = false,
}: {
  lesson: Lesson;
  showGroup?: boolean;
  /** Its course folder is gone (a disconnected drive): shown, not opened */
  missing?: boolean;
}) {
  const Icon = lessonIcon(lesson);
  const videos = lesson.files.filter((f) => f.kind === "video").length;
  const backing = lesson.files.some((f) => f.backing);
  const minutes = Math.round((lesson.practice ?? 0) / 60);
  return (
    <li className="border-t border-border first:border-t-0">
      <LessonMenu lesson={lesson}>
        <button
          type="button"
          disabled={missing}
          title={
            missing
              ? `${l.missingCourse}: ${lesson.folder}`
              : withRightClick(lesson.folder, l.rightClick)
          }
          onClick={() => void openLesson(lesson)}
          className={cn(
            "grid w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-3 rounded-control px-2 py-1.5 text-left text-sm transition-colors",
            missing
              ? "cursor-not-allowed text-fg-subtle line-through"
              : "text-fg-muted hover:bg-surface-hover hover:text-fg",
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-fg">{lesson.name}</span>
            {showGroup && lesson.group && (
              <span className="block truncate text-[11px] text-fg-subtle">{lesson.group}</span>
            )}
          </span>
          <span className="flex items-center gap-3 text-[11px] text-fg-subtle tabular">
            {!lesson.main && <span>{l.document}</span>}
            {videos > 1 && <span className="whitespace-nowrap">{l.angles(videos)}</span>}
            {backing && <span>{l.backing}</span>}
            <TabLamp state={lesson.tab} />
            {minutes > 0 && (
              <span className="whitespace-nowrap text-readout" title={l.practiceHint}>
                {l.practice(minutes)}
              </span>
            )}
            <span className="w-16 text-right whitespace-nowrap">
              {lesson.openedAt ? ago(lesson.openedAt) : ""}
            </span>
          </span>
        </button>
      </LessonMenu>
    </li>
  );
}

/** Right-click on a course: read it again, show it, take it off the Home. */
function CourseMenu({ root, children }: { root: LessonRoot; children: ReactNode }) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContent}>
          <ContextMenu.Item className={menuItem} onSelect={() => void store().scan()}>
            <RefreshCw className="size-4" />
            {l.rescan}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItem}
            disabled={!root.exists}
            onSelect={() => void commands.revealFile(root.path)}
          >
            <FolderOpen className="size-4" />
            {l.reveal}
          </ContextMenu.Item>
          <ContextMenu.Separator className={menuSeparator} />
          <ContextMenu.Item
            className={menuItem}
            title={l.removeCourseHint}
            onSelect={() => void store().removeRoot(root.path)}
          >
            <X className="size-4" />
            {l.removeCourse}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** A course: its modules as headings, their lessons below; the name folds it. */
function Course({ root, lessons }: { root: LessonRoot; lessons: Lesson[] }) {
  const [folded, setFolded] = useState(false);
  const groups: { name: string; lessons: Lesson[] }[] = [];
  for (const lesson of lessons) {
    const last = groups[groups.length - 1];
    if (last && last.name === lesson.group) last.lessons.push(lesson);
    else groups.push({ name: lesson.group, lessons: [lesson] });
  }
  const Chevron = folded ? ChevronRight : ChevronDown;
  return (
    <section className="well rounded-panel px-2 py-1.5">
      <CourseMenu root={root}>
        <button
          type="button"
          title={withRightClick(root.path, l.courseRightClick)}
          onClick={() => setFolded(!folded)}
          className="flex w-full items-center gap-2 rounded-control px-1 py-1 text-left hover:text-fg"
        >
          <Chevron className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          <GraduationCap className="size-4 shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{root.name}</span>
          {!root.exists && <span className="text-[11px] text-cue">{l.missingCourse}</span>}
          <span className="text-[11px] text-fg-subtle tabular">{l.lessonsCount(root.lessons)}</span>
        </button>
      </CourseMenu>
      {!folded &&
        groups.map((group) => (
          <div key={`${group.name}-${group.lessons[0]?.id}`} className="mt-1">
            {group.name && (
              <h3 className="panel-label px-2 pt-1.5 pb-0.5 text-fg-subtle">{group.name}</h3>
            )}
            <ul>
              {group.lessons.map((lesson) => (
                <LessonRow key={lesson.id} lesson={lesson} missing={!root.exists} />
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}

/** No course yet: what the Home is for, and the key to start. */
function Invite() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-panel border-2 border-dashed border-border px-6 py-8">
      <GraduationCap className="size-7 text-accent" aria-hidden />
      <h2 className="text-base font-semibold">{l.emptyTitle}</h2>
      <p className="text-sm text-fg-subtle">{l.emptyText}</p>
      <Button variant="primary" onClick={() => void addCourse()} title={l.addCourseHint}>
        <FolderPlus className="size-4" />
        {l.addCourse}
      </Button>
    </div>
  );
}

/**
 * The lesson Home: the course folders as course → module → lesson, «Recently opened» on top,
 * a search; opening a lesson brings its angles, backing and tab. Read again in the background
 * when shown and when the window comes back to the front.
 */
export function LessonHome() {
  const library = useLessonsStore((s) => s.library);
  const scanning = useLessonsStore((s) => s.scanning);
  const query = useLessonsStore((s) => s.query);

  useEffect(() => {
    void store().refresh();
    const onFocus = () => void store().scan();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const recent = useMemo(
    () =>
      library.lessons
        .filter((lesson) => lesson.openedAt)
        .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))
        .slice(0, RECENT_COUNT),
    [library],
  );
  const missing = useMemo(
    () => new Set(library.roots.filter((r) => !r.exists).map((r) => r.path)),
    [library],
  );
  const needle = query.trim().toLowerCase();
  const found = useMemo(() => {
    if (!needle) return [];
    const courses = new Map(library.roots.map((r) => [r.path, r.name]));
    return library.lessons.filter((lesson) =>
      `${lesson.name} ${lesson.group} ${courses.get(lesson.root) ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [library, needle]);

  if (library.roots.length === 0) return <Invite />;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-3">
        <h2 className="panel-label flex-1 text-fg-subtle">{l.title}</h2>
        {scanning && (
          <span className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
            <RefreshCw className="size-3 animate-spin" aria-hidden />
            {l.scanning}
          </span>
        )}
        <label className="well flex h-7 w-56 items-center gap-1.5 rounded-control px-2 text-fg-subtle focus-within:text-fg">
          <Search className="size-3.5 shrink-0" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => store().setQuery(event.target.value)}
            placeholder={l.search}
            aria-label={l.search}
            className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-subtle"
          />
        </label>
        <Button variant="hardware" onClick={() => void addCourse()} title={l.addCourseHint}>
          <FolderPlus className="size-4" />
          {l.addCourse}
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {needle ? (
          found.length === 0 ? (
            <p className="px-2 text-sm text-fg-subtle">{l.noMatch}</p>
          ) : (
            <ul className="well rounded-panel px-2 py-1.5">
              {found.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  showGroup
                  missing={missing.has(lesson.root)}
                />
              ))}
            </ul>
          )
        ) : (
          <>
            {recent.length > 0 && (
              <section>
                <h3 className="panel-label mb-1 text-fg-subtle">{l.lastOpened}</h3>
                <ul className="well rounded-panel px-2 py-1.5">
                  {recent.map((lesson) => (
                    <LessonRow
                      key={lesson.id}
                      lesson={lesson}
                      showGroup
                      missing={missing.has(lesson.root)}
                    />
                  ))}
                </ul>
              </section>
            )}
            {library.roots.map((root) => (
              <Course
                key={root.path}
                root={root}
                lessons={library.lessons.filter((lesson) => lesson.root === root.path)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
