import { type ShortcutId, shortcutKeys } from "@/lib/shortcuts";

/** Key caps of a registered shortcut. */
export function Kbd({ shortcut }: { shortcut: ShortcutId }) {
  return (
    <span className="inline-flex gap-1">
      {shortcutKeys(shortcut).map((key) => (
        <kbd
          key={key}
          className="min-w-5 rounded-[5px] border border-border bg-surface px-1.5 py-0.5 text-center font-sans text-[11px] text-fg-muted tabular"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
