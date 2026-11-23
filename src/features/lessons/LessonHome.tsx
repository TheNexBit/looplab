import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  FileAudio,
  FileMusic,
  FileText,
  FileVideo,
  FolderOpen,
  FolderPlus,
  FoldVertical,
  GraduationCap,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Undo2,
  UnfoldVertical,
  X,
} from "lucide-react";
import { ContextMenu, Popover } from "radix-ui";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  floatingPanel,
  menuContent,
  menuItem,
  menuLabel,
  menuSeparator,
} from "@/components/ui/menu";
import { withRightClick } from "@/components/ui/Tooltip";
import { isVideoPath } from "@/features/library/formats";
import { t } from "@/i18n";
import {
  commands,
  type Lesson_Serialize,
  type LessonFile,
  type LessonRoot,
  type TabState,
} from "@/lib/bindings";
import { cn } from "@/lib/cn";
import { fileNameOf, formatAgo } from "@/lib/format";
import { useLessonsStore } from "@/stores/lessons";
import { useSettingsStore } from "@/stores/settings";
import { BackingKey, backingOf, LessonFiles, toggleFiles } from "./LessonFiles";
import { MarkItems } from "./LessonNav";
import { progressOf, toggleDone } from "./lessonOrder";
import { openLesson } from "./openLesson";
import { litParts, matches, searchWords } from "./search";

type Lesson = Lesson_Serialize;
const l = t.lessons;

const store = () => useLessonsStore.getState();
const ago = (seconds: number) => formatAgo(new Date(seconds * 1000), new Date(), t.recent.ago);

async function addCourse() {
  const path = await pickFolder({ directory: true, multiple: false, title: l.pickCourse });
  if (typeof path === "string") await store().addRoot(path);
}

function lessonIcon(lesson: Lesson) {
  if (!lesson.main) return FileText;
  return isVideoPath(lesson.main) ? FileVideo : FileAudio;
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
  return file.label ? `${file.label} · ${fileNameOf(file.path)}` : fileNameOf(file.path);
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
          <ContextMenu.Separator className={menuSeparator} />
          <MarkItems lesson={lesson} />
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
                  <span className="truncate">{fileNameOf(file.path)}</span>
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

/** The lesson's mark: a click makes it done or to do; the row's right-click has «to review». */
function MarkKey({ lesson }: { lesson: Lesson }) {
  const Icon =
    lesson.progress === "done" ? CircleCheck : lesson.progress === "review" ? RotateCcw : Circle;
  return (
    <button
      type="button"
      title={`${l.mark[lesson.progress]}
${l.markHint}`}
      aria-label={l.mark[lesson.progress]}
      aria-pressed={lesson.progress === "done"}
      onClick={() => toggleDone(lesson)}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-control transition-colors hover:bg-surface-hover",
        lesson.progress === "done" && "text-loop",
        lesson.progress === "review" && "text-cue",
        lesson.progress === "none" && "text-fg-subtle/60 hover:text-fg",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

/** «3/8 done» with a thin bar, and how many are to review: how far a course or module is. */
function Progress({ lessons }: { lessons: Lesson[] }) {
  const { done, review, total } = progressOf(lessons);
  return (
    <span
      className="flex items-center gap-2 text-[11px] font-normal tracking-normal normal-case text-fg-subtle tabular"
      title={l.doneOfHint}
    >
      {review > 0 && <span className="whitespace-nowrap text-cue">{l.reviewCount(review)}</span>}
      <span aria-hidden className="h-1 w-12 overflow-hidden rounded-full bg-led-off">
        <span
          className="block h-full rounded-full bg-loop"
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </span>
      <span className="whitespace-nowrap">{l.doneOf(done, total)}</span>
    </span>
  );
}

/** One lesson: name, what it holds, its tab, practice and last opening; click opens it. */
function LessonRow({
  lesson,
  words = [],
  missing = false,
}: {
  lesson: Lesson;
  /** Words searched, lit in its name */
  words?: string[];
  /** Its course folder is gone (a disconnected drive): shown, not opened */
  missing?: boolean;
}) {
  const Icon = lessonIcon(lesson);
  const videos = lesson.files.filter((f) => f.kind === "video").length;
  const filesOpen = useSettingsStore((s) => s.lessonFilesOpen.includes(lesson.id));
  const Fold = filesOpen ? ChevronDown : ChevronRight;
  const minutes = Math.round((lesson.practice ?? 0) / 60);
  return (
    <li className="border-t border-border first:border-t-0">
      <LessonMenu lesson={lesson}>
        <div className="flex items-center gap-1">
          {lesson.files.length > 1 ? (
            <button
              type="button"
              onClick={() => toggleFiles(lesson.id)}
              aria-expanded={filesOpen}
              title={filesOpen ? l.hideFiles : l.showFiles}
              aria-label={filesOpen ? l.hideFiles : l.showFiles}
              className="grid size-6 shrink-0 place-items-center rounded-control text-fg-subtle hover:bg-surface-hover hover:text-fg"
            >
              <Fold className="size-3.5" />
            </button>
          ) : (
            <span className="size-6 shrink-0" aria-hidden />
          )}
          <MarkKey lesson={lesson} />
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
              "grid min-w-0 flex-1 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-3 rounded-control px-2 py-1.5 text-left text-sm transition-colors",
              missing
                ? "cursor-not-allowed text-fg-subtle line-through"
                : "text-fg-muted hover:bg-surface-hover hover:text-fg",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span
                className={cn(
                  "block truncate",
                  lesson.progress === "done" ? "text-fg-muted" : "text-fg",
                )}
              >
                <Lit text={lesson.name} words={words} />
              </span>
            </span>
            <span className="flex items-center gap-3 text-[11px] text-fg-subtle tabular">
              {!lesson.main && <span>{l.document}</span>}
              {videos > 1 && <span className="whitespace-nowrap">{l.angles(videos)}</span>}
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
          <BackingKey lesson={lesson} disabled={missing} />
        </div>
      </LessonMenu>
      {filesOpen && <LessonFiles lesson={lesson} missing={missing} />}
    </li>
  );
}

/** Keys of what is folded in the Home, remembered: a course is its folder, a module its folder plus name. */
const groupKey = (root: string, group: string) => `${root}\n${group}`;

function setFolds(change: (folds: Set<string>) => void) {
  const folds = new Set(useSettingsStore.getState().lessonFolds);
  change(folds);
  useSettingsStore.getState().update({ lessonFolds: [...folds] });
}

/** Folds or opens every module of a course at once (the course itself stays open). */
function foldModules(root: string, groups: string[], fold: boolean) {
  setFolds((folds) => {
    folds.delete(root);
    for (const group of groups) {
      if (fold) folds.add(groupKey(root, group));
      else folds.delete(groupKey(root, group));
    }
  });
}

/** The module names of every course, by course folder (lessons with no module left out). */
function modulesByCourse(lessons: Lesson[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const lesson of lessons) {
    if (!lesson.group) continue;
    const names = out.get(lesson.root) ?? [];
    if (!names.includes(lesson.group)) names.push(lesson.group);
    out.set(lesson.root, names);
  }
  return out;
}

/**
 * One key that folds from the root: every course and every module of it when anything is open
 * (a course opened later shows its modules folded), and opens them all when all are folded.
 * For one course, or (`courses`: every course with its modules) for the whole Home.
 */
function FoldAllKey({
  courses,
  labelled = false,
}: {
  courses: Map<string, string[]>;
  labelled?: boolean;
}) {
  const folds = useSettingsStore((s) => s.lessonFolds);
  const keys = [...courses].flatMap(([root, names]) => [
    root,
    ...names.map((name) => groupKey(root, name)),
  ]);
  if (keys.length === 0) return null;
  const anyOpen = keys.some((key) => !folds.includes(key));
  const label = anyOpen ? l.foldAll : l.unfoldAll;
  const Icon = anyOpen ? FoldVertical : UnfoldVertical;
  return (
    <Button
      variant={labelled ? "hardware" : "ghost"}
      size={labelled ? undefined : "icon"}
      className={labelled ? undefined : "size-7 shrink-0 text-fg-subtle hover:text-fg"}
      title={label}
      aria-label={label}
      onClick={() =>
        setFolds((all) => {
          for (const key of keys) {
            if (anyOpen) all.add(key);
            else all.delete(key);
          }
        })
      }
    >
      <Icon className="size-4" />
      {labelled && label}
    </Button>
  );
}

/** Right-click on a course: read it again, show it, fold its modules, take it off the Home. */
function CourseMenu({
  root,
  groups,
  children,
}: {
  root: LessonRoot;
  groups: string[];
  children: ReactNode;
}) {
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
          {groups.length > 0 && (
            <>
              <ContextMenu.Separator className={menuSeparator} />
              <ContextMenu.Item
                className={menuItem}
                onSelect={() => foldModules(root.path, groups, true)}
              >
                <FoldVertical className="size-4" />
                {l.foldModules}
              </ContextMenu.Item>
              <ContextMenu.Item
                className={menuItem}
                onSelect={() => foldModules(root.path, groups, false)}
              >
                <UnfoldVertical className="size-4" />
                {l.unfoldModules}
              </ContextMenu.Item>
            </>
          )}
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

/** The key that takes a course off the Home, asking first: its files stay on the disk. */
function RemoveCourse({ root }: { root: LessonRoot }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-fg-subtle hover:text-fg"
          title={`${l.removeCourse} — ${l.removeCourseHint}`}
          aria-label={l.removeCourse}
        >
          <Trash2 className="size-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={4}
          className={`${floatingPanel} w-72 p-3`}
        >
          <p className="text-sm font-medium text-fg">{l.removeAsk(root.name)}</p>
          <p className="mt-1 text-xs text-fg-subtle">{l.removeCourseHint}</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="hardware" onClick={() => setOpen(false)}>
              {l.keep}
            </Button>
            <Button
              variant="hardware"
              onClick={() => {
                setOpen(false);
                void store().removeRoot(root.path);
              }}
            >
              <X className="size-4" />
              {l.removeCourse}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * A course: its modules as headings that fold, their lessons below; the name folds the whole
 * course. What is folded is remembered.
 */
function Course({ root, lessons }: { root: LessonRoot; lessons: Lesson[] }) {
  const folds = useSettingsStore((s) => s.lessonFolds);
  const folded = folds.includes(root.path);
  const groups: { name: string; lessons: Lesson[] }[] = [];
  for (const lesson of lessons) {
    const last = groups[groups.length - 1];
    if (last && last.name === lesson.group) last.lessons.push(lesson);
    else groups.push({ name: lesson.group, lessons: [lesson] });
  }
  const names = groups.map((group) => group.name).filter(Boolean);
  const Chevron = folded ? ChevronRight : ChevronDown;
  const toggle = (key: string) =>
    setFolds((all) => {
      if (!all.delete(key)) all.add(key);
    });
  return (
    <section className="well rounded-panel px-2 py-1.5">
      <div className="flex items-center gap-1">
        <CourseMenu root={root} groups={names}>
          <button
            type="button"
            title={withRightClick(root.path, l.courseRightClick)}
            onClick={() => toggle(root.path)}
            aria-expanded={!folded}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-control px-1 py-1 text-left hover:text-fg"
          >
            <Chevron className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            <GraduationCap className="size-4 shrink-0 text-accent" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
              {root.name}
            </span>
            {!root.exists && <span className="text-[11px] text-cue">{l.missingCourse}</span>}
            <Progress lessons={lessons} />
          </button>
        </CourseMenu>
        <FoldAllKey courses={new Map([[root.path, names]])} />
        <RemoveCourse root={root} />
      </div>
      {!folded &&
        groups.map((group) => {
          const key = groupKey(root.path, group.name);
          const shut = group.name !== "" && folds.includes(key);
          const GroupChevron = shut ? ChevronRight : ChevronDown;
          return (
            <div key={`${group.name}-${group.lessons[0]?.id}`} className="mt-1">
              {group.name && (
                <h3>
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    aria-expanded={!shut}
                    className="panel-label flex w-full items-center gap-1.5 rounded-control px-2 pt-1.5 pb-0.5 text-left text-fg-subtle hover:text-fg"
                  >
                    <GroupChevron className="size-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{group.name}</span>
                    <Progress lessons={group.lessons} />
                  </button>
                </h3>
              )}
              {!shut && (
                <ul>
                  {group.lessons.map((lesson) => (
                    <LessonRow key={lesson.id} lesson={lesson} missing={!root.exists} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
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
/** `text` with the searched words lit, so the eye finds why it matched. */
function Lit({ text, words }: { text: string; words: string[] }) {
  if (words.length === 0) return <>{text}</>;
  const parts = litParts(text, words);
  return (
    <>
      {parts.map((part, i) =>
        part.lit ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed text
          <mark key={i} className="rounded-sm bg-accent/25 text-fg">
            {part.text}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed text
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/**
 * What a search found, laid out as the Home is: each course with its name, its modules as
 * headings, the lessons below, the searched words lit. Above, how many and where.
 */
function SearchResults({
  query,
  words,
  found,
  roots,
  missing,
}: {
  query: string;
  words: string[];
  found: Lesson[];
  roots: LessonRoot[];
  missing: Set<string>;
}) {
  if (found.length === 0) {
    return (
      <div className="flex flex-col items-start gap-1 px-2 py-4">
        <p className="text-sm text-fg">{l.noMatch(query)}</p>
        <p className="text-xs text-fg-subtle">{l.noMatchHint}</p>
      </div>
    );
  }
  const courses = roots
    .map((root) => ({ root, lessons: found.filter((lesson) => lesson.root === root.path) }))
    .filter((course) => course.lessons.length > 0);
  return (
    <>
      <p className="px-1 text-xs text-fg-subtle">{l.found(found.length, courses.length)}</p>
      {courses.map(({ root, lessons }) => {
        const groups: { name: string; lessons: Lesson[] }[] = [];
        for (const lesson of lessons) {
          const last = groups.at(-1);
          if (last && last.name === lesson.group) last.lessons.push(lesson);
          else groups.push({ name: lesson.group, lessons: [lesson] });
        }
        return (
          <section key={root.path} className="well rounded-panel px-2 py-1.5">
            <h3 className="flex items-center gap-2 px-1 py-1">
              <GraduationCap className="size-4 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                <Lit text={root.name} words={words} />
              </span>
              <span className="text-[11px] text-fg-subtle tabular">
                {l.lessonsCount(lessons.length)}
              </span>
            </h3>
            {groups.map((group) => (
              <div key={`${group.name}-${group.lessons[0]?.id}`} className="mt-1">
                {group.name && (
                  <h4 className="panel-label px-2 pt-1.5 pb-0.5 text-fg-subtle">
                    <Lit text={group.name} words={words} />
                  </h4>
                )}
                <ul>
                  {group.lessons.map((lesson) => (
                    <LessonRow
                      key={lesson.id}
                      lesson={lesson}
                      words={words}
                      missing={missing.has(lesson.root)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}

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

  const missing = useMemo(
    () => new Set(library.roots.filter((r) => !r.exists).map((r) => r.path)),
    [library],
  );
  const words = useMemo(() => searchWords(query), [query]);
  const needle = words.length > 0;
  const courseNames = useMemo(() => new Map(library.roots.map((r) => [r.path, r.name])), [library]);
  const found = useMemo(
    () =>
      library.lessons.filter((lesson) =>
        matches(
          `${lesson.name} ${lesson.group} ${courseNames.get(lesson.root) ?? ""} ${backingOf(lesson) ? l.backingWords : ""}`,
          words,
        ),
      ),
    [library, courseNames, words],
  );
  const modules = useMemo(() => modulesByCourse(library.lessons), [library]);

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
        <label
          className="well flex h-7 w-72 items-center gap-1.5 rounded-control px-2 text-fg-subtle focus-within:text-fg"
          title={l.searchHint}
        >
          <Search className="size-3.5 shrink-0" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(event) => store().setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Esc empties the search first (a second one goes back to the track)
              if (event.key === "Escape" && query) {
                event.stopPropagation();
                store().setQuery("");
              }
            }}
            placeholder={l.search}
            aria-label={l.search}
            className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-subtle"
          />
          {query && (
            <button
              type="button"
              onClick={() => store().setQuery("")}
              title={l.clearSearch}
              aria-label={l.clearSearch}
              className="shrink-0 rounded-control text-fg-subtle hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
        {!needle && (
          <FoldAllKey
            courses={
              new Map(library.roots.map((root) => [root.path, modules.get(root.path) ?? []]))
            }
            labelled
          />
        )}
        <Button variant="hardware" onClick={() => void addCourse()} title={l.addCourseHint}>
          <FolderPlus className="size-4" />
          {l.addCourse}
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {needle ? (
          <SearchResults
            query={query.trim()}
            words={words}
            found={found}
            roots={library.roots}
            missing={missing}
          />
        ) : (
          library.roots.map((root) => (
            <Course
              key={root.path}
              root={root}
              lessons={library.lessons.filter((lesson) => lesson.root === root.path)}
            />
          ))
        )}
      </div>
    </div>
  );
}
