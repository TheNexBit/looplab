import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface InlineNameProps {
  value: string;
  /** Accessible name of the field, e.g. "Rename" */
  label: string;
  onRename: (name: string) => void;
  className?: string;
}

/** A name shown as text that can be edited in place: Enter keeps it, Esc cancels, empty is ignored. */
export function InlineName({ value, label, onRename, className }: InlineNameProps) {
  const [draft, setDraft] = useState<string | null>(null);
  // Esc blurs the field too: the blur must not keep the text it was cancelling
  const cancelled = useRef(false);
  const commit = () => {
    const name = draft?.trim();
    // Unchanged: nothing to save, and no empty step in Undo
    if (!cancelled.current && name && name !== value) onRename(name);
    cancelled.current = false;
    setDraft(null);
  };

  return (
    <input
      aria-label={label}
      title={value}
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      className={cn(
        "min-w-0 flex-1 rounded-[4px] bg-transparent px-1 text-sm text-fg outline-none focus:bg-surface",
        className,
      )}
    />
  );
}
