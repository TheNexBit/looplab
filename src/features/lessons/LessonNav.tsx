import { Check, ChevronLeft, ChevronRight, RotateCcw, X } from "lucide-react";
import { ContextMenu } from "radix-ui";
import { Button } from "@/components/ui/Button";
import { useCompact } from "@/components/ui/FitBar";
import { menuContent, menuItem, menuLabel } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import type { Lesson_Serialize, LessonProgress } from "@/lib/bindings";
import { useLessonsStore } from "@/stores/lessons";
import { stepLesson, toggleDone, useLessonAround } from "./lessonOrder";

const l = t.lessons;

const MARKS: { progress: LessonProgress; label: string; Icon: typeof Check }[] = [
  { progress: "done", label: l.markDone, Icon: Check },
  { progress: "review", label: l.markReview, Icon: RotateCcw },
  { progress: "none", label: l.markClear, Icon: X },
];

/** The marks a lesson can take, for its right-click menus (the one it has is left out). */
export function MarkItems({ lesson }: { lesson: Lesson_Serialize }) {
  return (
    <>
      <ContextMenu.Label className={menuLabel}>{l.mark[lesson.progress]}</ContextMenu.Label>
      {MARKS.filter((mark) => mark.progress !== lesson.progress).map(
        ({ progress, label, Icon }) => (
          <ContextMenu.Item
            key={progress}
            className={menuItem}
            onSelect={() => void useLessonsStore.getState().mark(lesson.id, progress)}
          >
            <Icon className="size-4" />
            {label}
          </ContextMenu.Item>
        ),
      )}
    </>
  );
}

/**
 * The open track's lesson in its course: previous and next lesson, and its «done» key (lamp lit
 * when done, amber when to review; right-click for the other marks). Only for a lesson of the Home.
 */
export function LessonNav() {
  const compact = useCompact();
  const around = useLessonAround();
  if (!around) return null;
  const { lesson, previous, next } = around;
  const done = lesson.progress === "done";
  const review = lesson.progress === "review";
  return (
    <div className="flex">
      <Tooltip
        label={previous ? `${l.previous} — ${previous.name}` : l.firstOfCourse}
        shortcut="previousLesson"
      >
        <Button
          variant="hardware"
          size="icon"
          className="rounded-r-none"
          disabled={!previous}
          aria-label={l.previous}
          onClick={() => void stepLesson(-1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
      </Tooltip>
      <ContextMenu.Root>
        <Tooltip
          label={`${lesson.name} — ${l.mark[lesson.progress]}`}
          shortcut="toggleLessonDone"
          rightClick={l.markReview}
        >
          <ContextMenu.Trigger asChild>
            <Button
              variant="hardware"
              options
              className="rounded-none border-l-0"
              aria-pressed={done}
              onClick={() => toggleDone(lesson)}
            >
              {review ? (
                <RotateCcw className="size-4 text-cue" />
              ) : (
                <Check className={done ? "size-4 text-loop" : "size-4"} />
              )}
              {compact ? <span className="sr-only">{l.doneKey}</span> : l.doneKey}
            </Button>
          </ContextMenu.Trigger>
        </Tooltip>
        <ContextMenu.Portal>
          <ContextMenu.Content className={menuContent}>
            <MarkItems lesson={lesson} />
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      <Tooltip label={next ? `${l.next} — ${next.name}` : l.lastOfCourse} shortcut="nextLesson">
        <Button
          variant="hardware"
          size="icon"
          className="rounded-l-none border-l-0"
          disabled={!next}
          aria-label={l.next}
          onClick={() => void stepLesson(1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </Tooltip>
    </div>
  );
}
