import { describe, expect, it } from "vitest";
import type { Lesson_Serialize, LessonProgress } from "@/lib/bindings";
import { lessonAround, progressOf } from "./lessonOrder";

function lesson(
  root: string,
  name: string,
  { main = true, progress = "none" }: { main?: boolean; progress?: LessonProgress } = {},
): Lesson_Serialize {
  const path = `${root}/${name}.${main ? "mp4" : "pdf"}`;
  return {
    id: `${root}|${name}`,
    root,
    group: "",
    name,
    folder: root,
    files: [{ path, kind: main ? "video" : "pdf", label: "", backing: false }],
    main: main ? path : null,
    score: null,
    chosen: false,
    tab: "none",
    openedAt: null,
    lastFile: null,
    progress,
    practice: 0,
  };
}

const lessons = [
  lesson("D:/A", "Guide", { main: false }),
  lesson("D:/A", "One", { progress: "done" }),
  lesson("D:/A", "Notes", { main: false }),
  lesson("D:/A", "Two", { progress: "review" }),
  lesson("D:/B", "Other course"),
];

describe("lessonAround", () => {
  it("finds the lesson of a file, whatever the case of its path", () => {
    expect(lessonAround(lessons, "d:/a/two.MP4")?.lesson.name).toBe("Two");
    expect(lessonAround(lessons, "D:/elsewhere/song.mp3")).toBeNull();
    expect(lessonAround(lessons, undefined)).toBeNull();
  });

  it("steps over documents and stays inside the course", () => {
    const one = lessonAround(lessons, "D:/A/One.mp4");
    expect(one?.previous).toBeNull();
    expect(one?.next?.name).toBe("Two");
    const two = lessonAround(lessons, "D:/A/Two.mp4");
    expect(two?.previous?.name).toBe("One");
    expect(two?.next).toBeNull();
  });
});

describe("progressOf", () => {
  it("counts done and to review", () => {
    expect(progressOf(lessons)).toEqual({ done: 1, review: 1, total: 5 });
    expect(progressOf([])).toEqual({ done: 0, review: 0, total: 0 });
  });
});
