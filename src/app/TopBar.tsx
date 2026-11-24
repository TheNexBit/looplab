import {
  AudioLines,
  ChevronDown,
  Download,
  FileMusic,
  FolderOpen,
  House,
  Layers,
  Metronome,
  PanelRight,
  Piano,
  PictureInPicture2,
  Redo,
  Search,
  Settings,
  Undo,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/Button";
import { FitBar, useCompact } from "@/components/ui/FitBar";
import { Kbd } from "@/components/ui/Kbd";
import { menuContent, menuItem, menuLabel, menuSeparator } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { LessonNav } from "@/features/lessons/LessonNav";
import { pickAndOpenFile } from "@/features/library/pickFile";
import { useLiveStore } from "@/features/setlist/live";
import { SetNav } from "@/features/setlist/SetNav";
import { pickAndOpenStems } from "@/features/stems/fileStems";
import { t } from "@/i18n";
import { useHistoryStore } from "@/stores/history";
import { useLessonsStore } from "@/stores/lessons";
import { useMetronomeStore } from "@/stores/metronome";
import { useNotesStore } from "@/stores/notes";
import { usePlayerStore } from "@/stores/player";
import { useRecentStore } from "@/stores/recent";
import { useScoreStore } from "@/stores/score";
import { useUiStore } from "@/stores/ui";
import { toggleMini } from "./miniMode";

/** Opens the lesson Home over the track (lit while it is shown). */
function HomeKey() {
  const open = useLessonsStore((s) => s.open);
  const hasTrack = usePlayerStore((s) => s.track !== null);
  return (
    <Tooltip label={t.shortcuts.toggleHome} shortcut="toggleHome">
      <Button
        variant="hardware"
        active={open}
        disabled={!hasTrack}
        onClick={() => useLessonsStore.getState().toggle()}
      >
        <House className="size-4" />
        <HomeLabel />
      </Button>
    </Tooltip>
  );
}

function HomeLabel() {
  const compact = useCompact();
  return compact ? <span className="sr-only">{t.lessons.home}</span> : t.lessons.home;
}

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
          <DropdownMenu.Item
            className={menuItem}
            title={t.fileStems.openAsStemsHint}
            onSelect={() => void pickAndOpenStems()}
          >
            <Layers className="size-4" />
            {t.fileStems.openAsStems}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={menuSeparator} />
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
/** Shows or hides the score panel; the lamp is lit while the song has a score linked. */
function ScoreKey() {
  const compact = useCompact();
  const hasTrack = usePlayerStore((s) => s.track !== null);
  const linked = useScoreStore((s) => s.link !== null);
  const shown = useScoreStore((s) => (s.link ? !s.collapsed : s.asking));
  const label = shown ? t.score.hide : t.score.show;
  return (
    <Tooltip label={label}>
      <Button
        variant="hardware"
        disabled={!hasTrack}
        aria-pressed={shown}
        aria-label={label}
        onClick={() => useScoreStore.getState().toggleShown()}
        className={shown ? "text-accent" : undefined}
      >
        <FileMusic className="size-4" />
        {!compact && <span>{t.score.title}</span>}
        <span
          aria-hidden
          className={
            linked
              ? "size-1.5 rounded-full bg-loop shadow-[0_0_5px_var(--color-loop)]"
              : "size-1.5 rounded-full bg-led-off"
          }
        />
      </Button>
    </Tooltip>
  );
}

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
  const setMode = useLiveStore((st) => st.active);
  const sidePanelOpen = useUiStore((s) => s.sidePanelOpen);
  const toggleSidePanel = useUiStore((s) => s.toggleSidePanel);
  const openDialog = useUiStore((s) => s.openDialog);
  const trackName = usePlayerStore((s) => s.track?.name);
  const notesOpen = useNotesStore((s) => s.open);
  const complete = usePlayerStore((s) => s.track?.complete ?? false);
  const metronomeOpen = useMetronomeStore((s) => s.open);
  const homeOpen = useLessonsStore((s) => s.open);

  return (
    <header className="shrink-0 border-b border-edge bg-[linear-gradient(var(--color-topbar-from),var(--color-topbar-to))] px-3 py-1 shadow-[inset_0_-1px_0_var(--color-sheen)]">
      {/* Every key stays: names give way to icons first, then a second row */}
      <FitBar
        className="min-h-9 gap-x-3"
        resetKey={`${homeOpen ? "home" : "track"}-${setMode ? "set" : "single"}`}
      >
        <div className="flex h-6 items-center gap-2 border-r border-border pr-3">
          <AudioLines className="size-4 text-accent" aria-hidden />
          <BrandName />
        </div>
        <Tooltip label={t.shortcuts.openFile} shortcut="openFile">
          <Button
            variant="hardware"
            className="rounded-r-none"
            onClick={() => void pickAndOpenFile()}
          >
            <FolderOpen className="size-4" />
            <OpenLabel />
          </Button>
        </Tooltip>
        <RecentMenu />
        <HomeKey />
        {setMode ? <SetNav /> : <LessonNav />}

        {/* Small display with the open track; the lamp is lit while a track is loaded. Its least
            width makes the bar turn keys into icons (then wrap) before the name is squeezed */}
        <div className="well flex h-7 min-w-40 flex-1 items-center gap-2 rounded-control px-3 lg:max-w-80">
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
        <ScoreKey />
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

        <SearchBox onOpen={() => openDialog("palette")} />

        <Tooltip
          label={metronomeOpen ? t.metronome.close : t.metronome.open}
          shortcut="toggleMetronomeMode"
        >
          <Button
            variant="hardware"
            size="icon"
            active={metronomeOpen}
            onClick={() => useMetronomeStore.getState().setOpen(!metronomeOpen)}
            aria-label={t.metronome.open}
            aria-pressed={metronomeOpen}
          >
            <Metronome className="size-4" />
          </Button>
        </Tooltip>
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
        <Tooltip label={t.mini.enter} shortcut="toggleMini">
          <Button
            variant="hardware"
            size="icon"
            disabled={!trackName}
            onClick={toggleMini}
            aria-label={t.mini.enter}
          >
            <PictureInPicture2 className="size-4" />
          </Button>
        </Tooltip>
        <Tooltip label={t.app.toggleSidePanel}>
          <Button
            variant="hardware"
            size="icon"
            active={sidePanelOpen && !!trackName}
            disabled={!trackName}
            onClick={toggleSidePanel}
            aria-label={t.app.toggleSidePanel}
            aria-pressed={sidePanelOpen}
          >
            <PanelRight className="size-4" />
          </Button>
        </Tooltip>
      </FitBar>
    </header>
  );
}

/** The app's name next to its mark: only the mark in a crowded bar. */
function BrandName() {
  const compact = useCompact();
  if (compact) return null;
  return <span className="text-[11px] font-bold tracking-[0.18em] text-fg">LOOPLAB</span>;
}

/** The Open key's name: only its icon in a crowded bar (the tooltip names it). */
function OpenLabel() {
  const compact = useCompact();
  return compact ? <span className="sr-only">{t.app.open}</span> : t.app.open;
}

/** The actions search: a wide field, or its magnifier and shortcut in a crowded bar. */
function SearchBox({ onOpen }: { onOpen: () => void }) {
  const compact = useCompact();
  return (
    <Tooltip label={t.app.searchActions} shortcut="commandPalette">
      <button
        type="button"
        onClick={onOpen}
        aria-label={t.app.searchActions}
        className="mx-auto flex h-7 shrink-0 items-center gap-2 rounded-control border border-border bg-field px-2.5 text-xs text-fg-subtle transition-colors hover:border-accent/50 hover:text-fg-muted"
        style={{ width: compact ? undefined : "clamp(14rem, 22vw, 20rem)" }}
      >
        <Search className="size-3.5" />
        {!compact && t.app.searchActions}
        <span className="ml-auto">
          <Kbd shortcut="commandPalette" />
        </span>
      </button>
    </Tooltip>
  );
}
