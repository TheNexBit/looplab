import { FolderOpen, PanelRight, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { Tooltip } from "@/components/ui/Tooltip";
import { pickAndOpenFile } from "@/features/library/pickFile";
import { t } from "@/i18n";
import { usePlayerStore } from "@/stores/player";
import { useUiStore } from "@/stores/ui";

export function TopBar() {
  const sidePanelOpen = useUiStore((s) => s.sidePanelOpen);
  const toggleSidePanel = useUiStore((s) => s.toggleSidePanel);
  const trackName = usePlayerStore((s) => s.track?.name);

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-3">
      <Tooltip label={t.shortcuts.openFile} shortcut="openFile">
        <Button onClick={() => void pickAndOpenFile()}>
          <FolderOpen className="size-4" />
          {t.app.open}
        </Button>
      </Tooltip>

      <span className={trackName ? "truncate text-sm text-fg" : "truncate text-sm text-fg-subtle"}>
        {trackName ?? t.app.noFile}
      </span>

      <button
        type="button"
        disabled
        className="mx-auto flex h-8 w-80 shrink-0 items-center gap-2 rounded-control border border-border bg-surface px-3 text-sm text-fg-subtle disabled:opacity-60"
      >
        <Search className="size-4" />
        {t.app.searchActions}
        <span className="ml-auto">
          <Kbd shortcut="commandPalette" />
        </span>
      </button>

      <Tooltip label={t.app.toggleSidePanel}>
        <Button
          size="icon"
          active={sidePanelOpen}
          onClick={toggleSidePanel}
          aria-label={t.app.toggleSidePanel}
          aria-pressed={sidePanelOpen}
        >
          <PanelRight className="size-4" />
        </Button>
      </Tooltip>
    </header>
  );
}
