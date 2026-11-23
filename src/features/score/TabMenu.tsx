import { FileMusic, FileText } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useCompact } from "@/components/ui/FitBar";
import { MenuChoice } from "@/components/ui/MenuChoice";
import { menuContent, menuItem, menuLabel, menuSeparator } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { commands, type Lesson_Serialize, type LessonFile } from "@/lib/bindings";
import { cn } from "@/lib/cn";
import { fileNameOf } from "@/lib/format";
import { useLessonsStore } from "@/stores/lessons";
import { usePlayerStore } from "@/stores/player";
import { type ProjectScore, useScoreStore } from "@/stores/score";
import { linkScore, pickScore } from "./pickScore";

const s = t.score;

/** The tabs of a lesson: its Guitar Pro files and PDFs, in the lesson's order. */
const tabsOf = (lesson: Lesson_Serialize | null): LessonFile[] =>
  lesson?.files.filter((file) => file.kind === "score" || file.kind === "pdf") ?? [];

/** The lesson the open track belongs to (read from its own folder), or null. */
async function lessonOfOpenTrack(): Promise<Lesson_Serialize | null> {
  const track = usePlayerStore.getState().track?.path;
  if (!track) return null;
  const result = await commands.lessonOfTrack(track);
  return result.status === "ok" ? result.data : null;
}

/** The score linked or kept for `path` (a lesson's tab), matched by the original file name. */
function scoreFor(path: string): ProjectScore | undefined {
  const { link, shelf } = useScoreStore.getState();
  const name = fileNameOf(path);
  return [link, ...shelf].find((score) => score?.name === name) ?? undefined;
}

/**
 * Shows another tab of the lesson: the one shown stays on the shelf with its sync, a tab used
 * before comes back as it was left. The lesson remembers it, so the Home opens it next time.
 */
async function switchTab(lesson: Lesson_Serialize, path: string) {
  await linkScore(path);
  if (useScoreStore.getState().link?.name !== fileNameOf(path)) return;
  void useLessonsStore.getState().choose(lesson.id, {
    main: lesson.chosen ? lesson.main : null,
    score: path,
    noScore: false,
  });
}

/** The shortcut: the lesson's next tab, round and round. */
export async function nextTab() {
  const lesson = await lessonOfOpenTrack();
  const tabs = tabsOf(lesson);
  if (!lesson || tabs.length === 0) return;
  const shown = useScoreStore.getState().link?.name;
  const index = tabs.findIndex((tab) => fileNameOf(tab.path) === shown);
  const next = tabs[(index + 1) % tabs.length];
  if (next && (tabs.length > 1 || index < 0)) await switchTab(lesson, next.path);
}

/** A lamp: lit when the tab is synced with the recording (as on the Home). */
function SyncLamp({ synced }: { synced: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        synced ? "bg-loop shadow-[0_0_5px_var(--color-loop)]" : "bg-led-off",
      )}
    />
  );
}

/**
 * The tab shown, and every other tab of the lesson one click away (plus those used before with
 * this track). Each keeps its own sync. Alt+T goes to the next one.
 */
export function TabMenu({ link }: { link: ProjectScore }) {
  const compact = useCompact();
  const track = usePlayerStore((state) => state.track?.path);
  const shelf = useScoreStore((state) => state.shelf);
  const [lesson, setLesson] = useState<Lesson_Serialize | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: read again when the track changes
  useEffect(() => {
    let current = true;
    void lessonOfOpenTrack().then((found) => current && setLesson(found));
    return () => {
      current = false;
    };
  }, [track]);

  const tabs = tabsOf(lesson);
  const lessonNames = new Set(tabs.map((tab) => fileNameOf(tab.path)));
  // Tabs picked from elsewhere and used before with this track, not among the lesson's
  const before = shelf.filter((score) => !lessonNames.has(score.name));
  const Icon = link.kind === "pdf" ? FileText : FileMusic;
  const current = tabs.find((tab) => fileNameOf(tab.path) === link.name)?.path ?? link.file;

  return (
    <DropdownMenu.Root
      onOpenChange={(open) => {
        if (open) void lessonOfOpenTrack().then(setLesson);
      }}
    >
      <Tooltip label={`${s.tabs} — ${link.name}`} shortcut="nextTab">
        <DropdownMenu.Trigger asChild>
          <Button
            variant="hardware"
            options
            className={compact ? "max-w-28" : "max-w-56"}
            aria-label={s.tabs}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{link.name}</span>
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className={`${menuContent} max-w-96`}>
          <DropdownMenu.Label className={menuLabel}>
            {lesson ? s.lessonTabs : s.tabs}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={current}
            onValueChange={(value) => {
              if (lesson && tabs.some((tab) => tab.path === value)) {
                void switchTab(lesson, value);
              } else {
                useScoreStore.getState().swapTo(value);
              }
            }}
          >
            {tabs.length === 0 && (
              <MenuChoice value={link.file}>
                <SyncLamp synced={link.sync.length > 0} />
                <span className="truncate">{link.name}</span>
              </MenuChoice>
            )}
            {tabs.map((tab) => {
              const TabIcon = tab.kind === "pdf" ? FileText : FileMusic;
              return (
                <MenuChoice key={tab.path} value={tab.path}>
                  <SyncLamp synced={(scoreFor(tab.path)?.sync.length ?? 0) > 0} />
                  <TabIcon className="size-3.5 shrink-0" />
                  <span className="truncate" title={tab.path}>
                    {fileNameOf(tab.path)}
                  </span>
                </MenuChoice>
              );
            })}
            {before.length > 0 && (
              <DropdownMenu.Label className={menuLabel}>{s.usedBefore}</DropdownMenu.Label>
            )}
            {before.map((score) => (
              <MenuChoice key={score.file} value={score.file}>
                <SyncLamp synced={score.sync.length > 0} />
                <span className="truncate">{score.name}</span>
              </MenuChoice>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className={menuSeparator} />
          <DropdownMenu.Item className={menuItem} onSelect={() => void pickScore()}>
            {s.change}
          </DropdownMenu.Item>
          <p className="px-2.5 pt-1 pb-1.5 text-[11px] text-fg-subtle">{s.tabsHint}</p>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
