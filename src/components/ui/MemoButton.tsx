import { StickyNote } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { Button } from "./Button";
import { floatingPanel } from "./menu";
import { Tooltip } from "./Tooltip";

interface MemoButtonProps {
  memo: string;
  /** What the memo is about, e.g. "Appunto: Riff" */
  label: string;
  onSave: (memo: string) => void;
}

/**
 * The player's memo on a loop or a section ("watch the bend", "fingers 1-3-4"): the key is
 * lit when there is one and its hint shows it; a click opens it to write. It is kept when
 * the panel closes, as one change (one step of undo).
 */
export function MemoButton({ memo, label, onSave }: MemoButtonProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const close = () => {
    const text = draft?.trim() ?? memo;
    if (text !== memo) onSave(text);
    setDraft(null);
  };
  return (
    <Popover.Root open={draft !== null} onOpenChange={(open) => (open ? setDraft(memo) : close())}>
      <Tooltip label={memo || t.memo.add}>
        <Popover.Trigger asChild>
          <Button
            size="icon"
            aria-label={label}
            className={cn(
              "size-6",
              memo ? "text-accent" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            <StickyNote className="size-3.5" />
          </Button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          side="left"
          align="start"
          sideOffset={6}
          className={`${floatingPanel} w-64 space-y-1.5 p-2`}
        >
          <p className="panel-label px-0.5">{label}</p>
          <textarea
            // biome-ignore lint/a11y/noAutofocus: the panel opens to write in it
            autoFocus
            rows={4}
            value={draft ?? ""}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t.memo.placeholder}
            aria-label={label}
            className="well w-full resize-none rounded-control p-2 text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          <p className="px-0.5 text-[11px] leading-snug text-fg-subtle">{t.memo.hint}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
