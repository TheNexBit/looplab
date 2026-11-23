import { useEffect, useMemo } from "react";
import type { Lesson_Serialize } from "@/lib/bindings";
import { samePath } from "@/lib/format";
import { useLessonsStore } from "@/stores/lessons";
import { usePlayerStore } from "@/stores/player";
import { openLesson } from "./openLesson";

type Lesson = Lesson_Serialize;

/** A lesson with something to play (a lesson of documents only opens outside Looplab). */
const playable = (lesson: Lesson) => lesson.main !== null;

/** The lesson, among the Home's courses, that holds `path` (any of its files). */
export function lessonHolding(lessons: Lesson[], path: string | null | undefined) {
  if (!path) return null;
  return lessons.find((lesson) => lesson.files.some((file) => samePath(file.path, path))) ?? null;
}

export interface LessonAround {
  lesson: Lesson;
  /** The playable lessons before and after it in the same course, in the Home's order */
  previous: Lesson | null;
  next: Lesson | null;
}

/** The lesson that holds `path`, with its neighbours in its course; null outside the courses. */
export function lessonAround(
  lessons: Lesson[],
  path: string | null | undefined,
): LessonAround | null {
  const lesson = lessonHolding(lessons, path);
  if (!lesson) return null;
  const course = lessons.filter((other) => other.root === lesson.root);
  const at = course.indexOf(lesson);
  const previous = course.slice(0, at).reverse().find(playable) ?? null;
  const next = course.slice(at + 1).find(playable) ?? null;
  return { lesson, previous, next };
}

/** How far a set of lessons is: done, to review, all. */
export function progressOf(lessons: Lesson[]) {
  let done = 0;
  let review = 0;
  for (const lesson of lessons) {
    if (lesson.progress === "done") done++;
    else if (lesson.progress === "review") review++;
  }
  return { done, review, total: lessons.length };
}

/** The open track's lesson and its neighbours (the kept listing is read once if needed). */
export function useLessonAround(): LessonAround | null {
  const track = usePlayerStore((s) => s.track?.path);
  const lessons = useLessonsStore((s) => s.library.lessons);
  useEffect(() => {
    if (track) void useLessonsStore.getState().ensure();
  }, [track]);
  return useMemo(() => lessonAround(lessons, track), [lessons, track]);
}

async function around(): Promise<LessonAround | null> {
  await useLessonsStore.getState().ensure();
  return lessonAround(
    useLessonsStore.getState().library.lessons,
    usePlayerStore.getState().track?.path,
  );
}

/** Opens the lesson before (-1) or after (1) the open one, in its course. */
export async function stepLesson(step: -1 | 1) {
  const found = await around();
  const target = step < 0 ? found?.previous : found?.next;
  if (target) await openLesson(target);
}

/** Done ↔ not done (a lesson to review becomes done). */
export function toggleDone(lesson: Lesson) {
  void useLessonsStore.getState().mark(lesson.id, lesson.progress === "done" ? "none" : "done");
}

/** The shortcut: the open track's lesson done or not. */
export async function toggleOpenLessonDone() {
  const found = await around();
  if (found) toggleDone(found.lesson);
}
