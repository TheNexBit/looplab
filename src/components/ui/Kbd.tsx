import { type ShortcutId, shortcutKeys } from "@/lib/shortcuts";
import { useKeymapStore } from "@/stores/keymap";

/** Key caps of a registered shortcut. */
export function Kbd({ shortcut }: { shortcut: ShortcutId }) {
  // Re-render when the key is changed in the settings
  useKeymapStore((s) => s.keys[shortcut]);
  return (
    <span className="inline-flex gap-1">
      {shortcutKeys(shortcut).map((key) => (
        <kbd
          key={key}
          className="min-w-5 rounded-control border border-border border-b-2 bg-raised-to px-1.5 py-px text-center font-mono text-[10px] text-fg-muted tabular"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
