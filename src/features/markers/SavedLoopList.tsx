import { BookmarkPlus, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InlineName } from "@/components/ui/InlineName";
import { MemoButton } from "@/components/ui/MemoButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { formatTime } from "@/lib/time";
import { useLoopStore } from "@/stores/loop";
import { type SavedLoopData, useSavedLoopsStore } from "@/stores/savedLoops";

function SavedLoopRow({ loop, current }: { loop: SavedLoopData; current: boolean }) {
  const { rename, remove, recall, setMemo } = useSavedLoopsStore.getState();
  return (
    <li className="group flex items-center gap-2 rounded-control border border-transparent px-2 py-1 hover:border-edge hover:bg-well">
      <span
        aria-hidden
        className={
          current
            ? "h-8 w-1 shrink-0 rounded-[1px] bg-loop shadow-[0_0_6px_var(--color-loop)]"
            : "h-8 w-1 shrink-0 rounded-[1px] bg-loop/40"
        }
      />
      {/* Name over its times, so the name has the whole width of the row (as in Sections) */}
      <div className="flex min-w-0 flex-1 flex-col">
        <InlineName
          value={loop.name}
          label={t.savedLoops.rename}
          onRename={(name) => rename(loop.id, name)}
        />
        <span className="px-1 font-mono text-[11px] whitespace-nowrap text-fg-subtle tabular">
          {formatTime(loop.start)}–{formatTime(loop.end)}
        </span>
      </div>
      <MemoButton
        memo={loop.memo}
        label={`${t.memo.title}: ${loop.name}`}
        onSave={(memo) => setMemo(loop.id, memo)}
      />
      <Button
        size="icon"
        className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => recall(loop.id)}
        aria-label={t.savedLoops.recall}
      >
        <Repeat className="size-3.5" />
      </Button>
      <Button
        size="icon"
        className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => remove(loop.id)}
        aria-label={t.savedLoops.remove}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  );
}

/** Loops kept by name: save the current one, bring one back, rename or delete it. */
export function SavedLoopList() {
  const loops = useSavedLoopsStore((s) => s.loops);
  const start = useLoopStore((s) => s.start);
  const end = useLoopStore((s) => s.end);
  const hasLoop = useLoopStore((s) => s.region() !== null);

  return (
    <section>
      <div className="flex items-center justify-between px-2 pb-1.5">
        <h3 className="panel-label">{t.savedLoops.title}</h3>
        <Tooltip label={t.savedLoops.saveCurrent} shortcut="saveLoop">
          <Button
            variant="hardware"
            className="h-6 px-2"
            disabled={!hasLoop}
            onClick={() => useSavedLoopsStore.getState().saveCurrent()}
          >
            <BookmarkPlus className="size-3.5" />
            {t.savedLoops.save}
          </Button>
        </Tooltip>
      </div>
      {loops.length === 0 ? (
        <p className="px-2 text-sm text-fg-subtle">{t.savedLoops.empty}</p>
      ) : (
        <ul>
          {loops.map((loop) => (
            <SavedLoopRow
              key={loop.id}
              loop={loop}
              current={loop.start === start && loop.end === end}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
