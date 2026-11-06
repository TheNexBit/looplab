import {
  AudioLines,
  ChevronDown,
  Download,
  FolderOpen,
  PanelRight,
  Piano,
  Redo,
  Search,
  Settings,
  Undo,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { menuContent, menuItem, menuLabel } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { pickAndOpenFile } from "@/features/library/pickFile";
import { t } from "@/i18n";
import { useHistoryStore } from "@/stores/history";
import { useNotesStore } from "@/stores/notes";
import { usePlayerStore } from "@/stores/player";
import { useRecentStore } from "@/stores/recent";
import { useUiStore } from "@/stores/ui";

function RecentMenu() {
  const files = useRecentStore((s) => s.files);
  return (
    <DropdownMenu.Root onOpenChange={(open) => open && void useRecentStore.getState().refresh()}>
      <Tooltip label={t.recent.title}>
        <DropdownMenu.Trigger asChild>
          <Button
            variant="hardware"
            size="icon"
            className="-ml-[13px] w-6 rounded-l-none"
            aria-label={t.recent.title}
          >
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

/** Undo / redo keys, dimmed when there is nothing to undo or redo. */
function HistoryKeys() {
  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);
  const { undo, redo } = useHistoryStore.getState();
  return (
    <div className="flex">
      <Tooltip label={t.history.undo} shortcut="undo">
        <Button
          variant="hardware"
          size="icon"
          className="rounded-r-none"
          disabled={!canUndo}
          onClick={undo}
          aria-label={t.history.undo}
        >
          <Undo className="size-4" />
        </Button>
      </Tooltip>
      <Tooltip label={t.history.redo} shortcut="redo">
        <Button
          variant="hardware"
          size="icon"
          className="rounded-l-none border-l-0"
          disabled={!canRedo}
          onClick={redo}
          aria-label={t.history.redo}
        >
          <Redo className="size-4" />
        </Button>
      </Tooltip>
    </div>
  );
}

export function TopBar() {
  const sidePanelOpen = useUiStore((s) => s.sidePanelOpen);
  const toggleSidePanel = useUiStore((s) => s.toggleSidePanel);
  const openDialog = useUiStore((s) => s.openDialog);
  const trackName = usePlayerStore((s) => s.track?.name);
  const notesOpen = useNotesStore((s) => s.open);
  const complete = usePlayerStore((s) => s.track?.complete ?? false);

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-edge bg-[linear-gradient(var(--color-topbar-from),var(--color-topbar-to))] px-3 shadow-[inset_0_-1px_0_var(--color-sheen)]">
      <div className="flex h-6 items-center gap-2 border-r border-border pr-3">
        <AudioLines className="size-4 text-accent" aria-hidden />
        <span className="text-[11px] font-bold tracking-[0.18em] text-fg">LOOPLAB</span>
      </div>
      <Tooltip label={t.shortcuts.openFile} shortcut="openFile">
        <Button
          variant="hardware"
          className="rounded-r-none"
          onClick={() => void pickAndOpenFile()}
        >
          <FolderOpen className="size-4" />
          {t.app.open}
        </Button>
      </Tooltip>
      <RecentMenu />

      {/* Small display with the open track; the lamp is lit while a track is loaded */}
      <div className="well flex h-7 min-w-0 flex-1 items-center gap-2 rounded-control px-3 lg:max-w-80">
        <span
          aria-hidden
          className={
            trackName
              ? "size-1.5 shrink-0 rounded-full bg-loop shadow-[0_0_6px_var(--color-loop)]"
              : "size-1.5 shrink-0 rounded-full bg-led-off"
          }
        />
        <span
          className={
            trackName
              ? "truncate font-mono text-xs text-fg"
              : "truncate font-mono text-xs text-fg-subtle"
          }
        >
          {trackName ?? t.app.noFile}
        </span>
      </div>
      <HistoryKeys />
      <Tooltip label={t.export.title} shortcut="exportAudio">
        <Button
          variant="hardware"
          size="icon"
          disabled={!trackName || !complete}
          onClick={() => useUiStore.getState().openExport()}
          aria-label={t.export.title}
        >
          <Download className="size-4" />
        </Button>
      </Tooltip>

      <button
        type="button"
        onClick={() => openDialog("palette")}
        className="mx-auto flex h-7 w-56 shrink-0 lg:w-80 items-center gap-2 rounded-control border border-border bg-field px-2.5 text-xs text-fg-subtle transition-colors hover:border-accent/50 hover:text-fg-muted"
      >
        <Search className="size-3.5" />
        {t.app.searchActions}
        <span className="ml-auto">
          <Kbd shortcut="commandPalette" />
        </span>
      </button>

      <Tooltip label={t.shortcuts.openSettings} shortcut="openSettings">
        <Button
          variant="hardware"
          size="icon"
          onClick={() => openDialog("settings")}
          aria-label={t.shortcuts.openSettings}
        >
          <Settings className="size-4" />
        </Button>
      </Tooltip>
      <Tooltip label={t.notes.show} shortcut="toggleNotes">
        <Button
          variant="hardware"
          size="icon"
          active={notesOpen}
          onClick={useNotesStore.getState().toggle}
          aria-label={t.notes.show}
          aria-pressed={notesOpen}
        >
          <Piano className="size-4" />
        </Button>
      </Tooltip>
      <Tooltip label={t.app.toggleSidePanel}>
        <Button
          variant="hardware"
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
