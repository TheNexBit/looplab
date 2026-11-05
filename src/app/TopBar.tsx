import { ChevronDown, FolderOpen, PanelRight, Search, Settings } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { menuContent, menuItem, menuLabel } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { pickAndOpenFile } from "@/features/library/pickFile";
import { t } from "@/i18n";
import { usePlayerStore } from "@/stores/player";
import { useRecentStore } from "@/stores/recent";
import { useUiStore } from "@/stores/ui";

function RecentMenu() {
  const files = useRecentStore((s) => s.files);
  return (
    <DropdownMenu.Root onOpenChange={(open) => open && void useRecentStore.getState().refresh()}>
      <Tooltip label={t.recent.title}>
        <DropdownMenu.Trigger asChild>
          <Button size="icon" className="-ml-2 w-6" aria-label={t.recent.title}>
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className={`${menuContent} max-w-96`}>
          <DropdownMenu.Label className={menuLabel}>{t.recent.title}</DropdownMenu.Label>
          {files.length === 0 && (
            <DropdownMenu.Item disabled className={menuItem}>
              {t.recent.empty}
            </DropdownMenu.Item>
          )}
          {files.map((file) => (
            <DropdownMenu.Item
              key={file.path}
              disabled={!file.exists}
              title={file.path}
              className={menuItem}
              onSelect={() => void usePlayerStore.getState().open(file.path)}
            >
              <span className="truncate">{file.name}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function TopBar() {
  const sidePanelOpen = useUiStore((s) => s.sidePanelOpen);
  const toggleSidePanel = useUiStore((s) => s.toggleSidePanel);
  const openDialog = useUiStore((s) => s.openDialog);
  const trackName = usePlayerStore((s) => s.track?.name);

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-3">
      <Tooltip label={t.shortcuts.openFile} shortcut="openFile">
        <Button onClick={() => void pickAndOpenFile()}>
          <FolderOpen className="size-4" />
          {t.app.open}
        </Button>
      </Tooltip>
      <RecentMenu />

      <span className={trackName ? "truncate text-sm text-fg" : "truncate text-sm text-fg-subtle"}>
        {trackName ?? t.app.noFile}
      </span>

      <button
        type="button"
        onClick={() => openDialog("palette")}
        className="mx-auto flex h-8 w-80 shrink-0 items-center gap-2 rounded-control border border-border bg-surface px-3 text-sm text-fg-subtle transition-colors hover:border-accent/50 hover:text-fg-muted"
      >
        <Search className="size-4" />
        {t.app.searchActions}
        <span className="ml-auto">
          <Kbd shortcut="commandPalette" />
        </span>
      </button>

      <Tooltip label={t.shortcuts.openSettings} shortcut="openSettings">
        <Button
          size="icon"
          onClick={() => openDialog("settings")}
          aria-label={t.shortcuts.openSettings}
        >
          <Settings className="size-4" />
        </Button>
      </Tooltip>
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
