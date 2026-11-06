import { Search } from "lucide-react";
import { type KeyboardEvent, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Kbd } from "@/components/ui/Kbd";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { useUiStore } from "@/stores/ui";
import { buildActions, filterActions } from "./actions";

/** Ctrl+K: type a few letters, ↑ ↓ to choose, Enter to run. */
function PaletteBody() {
  const close = useUiStore((s) => s.closeDialog);
  const actions = useMemo(buildActions, []);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const matches = filterActions(actions, query);

  const run = (index: number) => {
    const action = matches[index];
    if (!action) return;
    close();
    // After the dialog has gone, so focus and shortcuts behave as if pressed directly
    requestAnimationFrame(action.run);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setSelected((i) => (matches.length ? (i + step + matches.length) % matches.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(selected);
    }
  };

  return (
    <div className="p-2">
      <div className="flex items-center gap-2 border-b border-border px-2 pb-2">
        <Search className="size-4 text-fg-subtle" />
        <input
          // biome-ignore lint/a11y/noAutofocus: the palette exists to be typed into
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={t.app.searchActions}
          aria-label={t.app.searchActions}
          className="h-9 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
        />
      </div>
      <ul className="mt-1 max-h-80 overflow-y-auto" aria-label={t.palette.results}>
        {matches.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-fg-subtle">{t.palette.none}</li>
        )}
        {matches.map((action, index) => (
          <li key={action.id}>
            <button
              type="button"
              onClick={() => run(index)}
              onMouseMove={() => setSelected(index)}
              className={cn(
                "flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-sm",
                index === selected
                  ? "bg-surface-hover text-fg shadow-[inset_2px_0_0_var(--color-accent)]"
                  : "text-fg-muted",
              )}
            >
              <span className="flex-1 truncate">{action.label}</span>
              <span className="text-[11px] text-fg-subtle">{action.group}</span>
              {action.shortcut && <Kbd shortcut={action.shortcut} />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CommandPalette() {
  const open = useUiStore((s) => s.dialog === "palette");
  const close = useUiStore((s) => s.closeDialog);
  return (
    <Dialog open={open} onClose={close} title={t.shortcuts.commandPalette} hideTitle>
      {open && <PaletteBody />}
    </Dialog>
  );
}
