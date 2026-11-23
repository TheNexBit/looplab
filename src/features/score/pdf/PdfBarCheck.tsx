import { AlertTriangle, ScanSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { guitarProBars } from "@/features/score/checkScore";
import { t } from "@/i18n";
import { commands, type LessonFile } from "@/lib/bindings";
import { fileNameOf } from "@/lib/format";
import { usePlayerStore } from "@/stores/player";
import { type ProjectScore, useScoreStore } from "@/stores/score";
import { useSettingsStore } from "@/stores/settings";

const s = t.score;

const stem = (path: string) =>
  fileNameOf(path)
    .replace(/\.[^.]+$/, "")
    .toLowerCase();

/**
 * «Find the bars again»: looks for them anew in the pages, and forgets an «It's fine» given to
 * this PDF (the bars start over, so a difference found later is told again).
 */
export function findBarsAgain() {
  const link = useScoreStore.getState().link;
  if (link?.kind !== "pdf") return;
  const { pdfBarsAccepted, update } = useSettingsStore.getState();
  const mine = `${link.file}:`;
  if (pdfBarsAccepted.some((key) => key.startsWith(mine))) {
    update({ pdfBarsAccepted: pdfBarsAccepted.filter((key) => !key.startsWith(mine)) });
  }
  useScoreStore.getState().findPdfBarsAgain();
}

/** The PDF's Guitar Pro twin in its lesson: the one with its name, else the only one. */
function twinOf(pdfName: string, files: LessonFile[]): LessonFile | null {
  const tabs = files.filter((file) => file.kind === "score");
  return (
    tabs.find((file) => stem(file.path) === stem(pdfName)) ??
    (tabs.length === 1 ? tabs[0] : null) ??
    null
  );
}

/**
 * Over a PDF: a warning when its bars are not as many as its Guitar Pro twin's (the finder may
 * have missed or doubled some, and the score would drift from the music). «Find the bars
 * again» looks for them anew; «It's fine» stops warning for this PDF with these bars.
 */
export function PdfBarCheck({ link }: { link: ProjectScore }) {
  const track = usePlayerStore((state) => state.track?.path);
  const accepted = useSettingsStore((state) => state.pdfBarsAccepted);
  const [twin, setTwin] = useState<{ name: string; bars: number } | null>(null);

  useEffect(() => {
    setTwin(null);
    if (!track) return;
    let current = true;
    void (async () => {
      const lesson = await commands.lessonOfTrack(track);
      const file =
        lesson.status === "ok" && lesson.data ? twinOf(link.name, lesson.data.files) : null;
      const bars = file ? await guitarProBars(file.path) : null;
      if (current && file && bars) setTwin({ name: fileNameOf(file.path), bars });
    })();
    return () => {
      current = false;
    };
  }, [track, link.name]);

  const found = link.pdfBars.length;
  const key = `${link.file}:${found}`;
  if (!twin || found === 0 || found === twin.bars || accepted.includes(key)) return null;
  return (
    <div
      role="alert"
      className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-panel border border-edge bg-bg-from px-3 py-1.5 text-xs text-fg shadow-[0_6px_18px_rgb(0_0_0/0.5)]"
    >
      <AlertTriangle className="size-3.5 shrink-0 text-cue" />
      <span className="min-w-0 flex-1">{s.barsDiffer(found, twin.bars, twin.name)}</span>
      <Button variant="hardware" title={s.findBarsAgainHint} onClick={findBarsAgain}>
        <ScanSearch className="size-3.5" />
        {s.findBarsAgain}
      </Button>
      <Button
        variant="hardware"
        title={s.barsAcceptHint}
        onClick={() => useSettingsStore.getState().update({ pdfBarsAccepted: [...accepted, key] })}
      >
        {s.barsAccept}
      </Button>
    </div>
  );
}
