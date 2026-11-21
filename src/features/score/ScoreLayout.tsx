import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileMusic,
  Link2Off,
  Loader2,
  MoreHorizontal,
  ScrollText,
  ShieldCheck,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { lazy, type ReactNode, Suspense, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { ChoiceKeys } from "@/components/ui/ChoiceKeys";
import { FitBar, useCompact, useFitMode } from "@/components/ui/FitBar";
import { menuContent, menuItem, menuLabel, menuSeparator } from "@/components/ui/menu";
import { ResizeHandle } from "@/components/ui/ResizeHandle";
import { Stepper } from "@/components/ui/Stepper";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import type { AppError } from "@/lib/bindings";
import { cn } from "@/lib/cn";
import { usePlayerStore } from "@/stores/player";
import { type ProjectScore, SCORE_ZOOM, useScoreStore } from "@/stores/score";
import { useSettingsStore } from "@/stores/settings";
import { activeScore } from "./activeScore";
import { NeckKey, SynthKey } from "./ExtrasKeys";
import { pickScore } from "./pickScore";
import { SyncMenu } from "./SyncMenu";
import { stopTapping } from "./syncActions";
import { TabNeck } from "./TabNeck";

/** alphaTab (1.2 MB) loads only when a score is first shown, never at start. */
const ScoreView = lazy(() => import("./ScoreView").then((m) => ({ default: m.ScoreView })));
/** pdf.js too loads only when a PDF is first shown. */
const PdfView = lazy(() => import("./pdf/PdfView").then((m) => ({ default: m.PdfView })));

/** Space always left to the waveforms under the score (CSS pixels). */
const WAVEFORMS_MIN_HEIGHT = 230;
const HANDLE_PX = 4;

/**
 * Docks the score panel above the waveforms (`children`), resizable and collapsible like the
 * video. Shown when the song has a score, or when the user asked to link one.
 */
export function ScoreLayout({ children }: { children: ReactNode }) {
  const link = useScoreStore((s) => s.link);
  const asking = useScoreStore((s) => s.asking);
  const collapsed = useScoreStore((s) => s.collapsed);
  const size = useScoreStore((s) => s.size);
  const layoutRef = useRef<HTMLDivElement>(null);
  if (!link && !asking) return children;
  const open = !link || !collapsed;

  const largest = () =>
    (layoutRef.current?.clientHeight ?? Number.POSITIVE_INFINITY) -
    WAVEFORMS_MIN_HEIGHT -
    HANDLE_PX;
  const shown = () => Math.min(useScoreStore.getState().size, largest());

  return (
    <div ref={layoutRef} className="flex h-full flex-col overflow-hidden">
      <section
        aria-label={t.score.title}
        className="flex shrink-0 flex-col overflow-hidden"
        style={
          open ? { height: `min(${size}px, calc(100% - ${WAVEFORMS_MIN_HEIGHT}px))` } : undefined
        }
      >
        {link ? <ScoreToolbar link={link} /> : <EmptyHeader />}
        {open && (
          <div className="min-h-0 flex-1 px-3 pb-2">
            <div className="relative size-full overflow-hidden rounded-panel border border-border">
              {link ? <ScoreBody link={link} /> : <EmptyBody />}
            </div>
          </div>
        )}
      </section>
      {open && (
        <ResizeHandle
          vertical
          label={t.score.resize}
          size={shown}
          onResize={(next) => useScoreStore.getState().setSize(Math.min(next, largest()))}
        />
      )}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function PanelTitle() {
  const compact = useCompact();
  return (
    <span
      title={compact ? t.score.title : undefined}
      className="flex shrink-0 items-center gap-1.5 font-medium tracking-wide text-fg-subtle uppercase"
    >
      <FileMusic className="size-3.5 text-accent" aria-hidden />
      {compact ? <span className="sr-only">{t.score.title}</span> : t.score.title}
    </span>
  );
}

function EmptyHeader() {
  return (
    <header className="flex h-9 shrink-0 items-center gap-2 px-3 text-xs">
      <PanelTitle />
      <span className="mr-auto" />
      <Tooltip label={t.score.hide}>
        <Button
          size="icon"
          className="size-6"
          aria-label={t.score.hide}
          onClick={() => useScoreStore.getState().toggleShown()}
        >
          <ChevronUp className="size-3.5" />
        </Button>
      </Tooltip>
    </header>
  );
}

/** Tracks of the score to draw: one at a time (as a guitarist reads), or all of them. */
function TrackMenu({ link }: { link: ProjectScore }) {
  const compact = useCompact();
  const tracks = useScoreStore((s) => s.tracks);
  const current = link.tracks[0] ?? 0;
  const name = tracks.find((track) => track.index === current)?.name ?? "—";
  return (
    <DropdownMenu.Root>
      <Tooltip label={t.score.track}>
        <DropdownMenu.Trigger asChild>
          <Button
            variant="hardware"
            options
            className={compact ? "max-w-28" : "max-w-44"}
            disabled={tracks.length === 0}
          >
            <span className="truncate">{name}</span>
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className={`${menuContent} max-w-80`}>
          <DropdownMenu.Label className={menuLabel}>{t.score.track}</DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={String(current)}
            onValueChange={(value) => useScoreStore.getState().setTracks([Number(value)])}
          >
            {tracks.map((track) => (
              <DropdownMenu.RadioItem
                key={track.index}
                value={String(track.index)}
                className={cn(menuItem, "data-[state=checked]:text-accent")}
              >
                <span className="w-5 text-right font-mono text-[11px] text-fg-subtle tabular">
                  {track.index + 1}
                </span>
                <span className="truncate">{track.name}</span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function FollowMenu({ link }: { link: ProjectScore }) {
  const compact = useCompact();
  const names = {
    continuous: t.score.followContinuous,
    paged: t.score.followPaged,
    off: t.score.followOff,
  } as const;
  return (
    <DropdownMenu.Root>
      <Tooltip label={t.score.follow}>
        <DropdownMenu.Trigger asChild>
          <Button variant="hardware" options aria-label={t.score.follow}>
            {compact ? <ScrollText className="size-3.5" /> : t.score.follow}
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                link.follow === "off"
                  ? "bg-led-off"
                  : "bg-accent shadow-[0_0_5px_var(--color-accent)]",
              )}
            />
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className={menuContent}>
          <DropdownMenu.RadioGroup
            value={link.follow}
            onValueChange={(value) =>
              useScoreStore.getState().setFollow(value as ProjectScore["follow"])
            }
          >
            {(Object.keys(names) as (keyof typeof names)[]).map((mode) => (
              <DropdownMenu.RadioItem
                key={mode}
                value={mode}
                className={cn(menuItem, "data-[state=checked]:text-accent")}
              >
                {names[mode]}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * The "…" menu: every view choice (also those the bar hides in a narrow window), and the file.
 */
function FileMenu({ link }: { link: ProjectScore }) {
  const store = useScoreStore.getState();
  // A PDF is a picture: no tracks, staves or layout to choose
  const notation = link.kind === "notation";
  const radio = cn(menuItem, "data-[state=checked]:text-accent");
  return (
    <DropdownMenu.Root>
      <Tooltip label={link.name}>
        <DropdownMenu.Trigger asChild>
          <Button size="icon" className="size-6" aria-label={link.name}>
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={`${menuContent} w-64`}>
          {notation && (
            <DropdownMenu.Label className={menuLabel}>{t.score.staves}</DropdownMenu.Label>
          )}
          {notation && (
            <DropdownMenu.RadioGroup
              value={link.staves}
              onValueChange={(value) => store.setStaves(value as ProjectScore["staves"])}
            >
              <DropdownMenu.RadioItem value="tab" className={radio}>
                {t.score.stavesTab}
              </DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem value="notation" className={radio}>
                {t.score.stavesNotation}
              </DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem value="both" className={radio}>
                {t.score.stavesBoth}
              </DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
          )}
          {notation && (
            <DropdownMenu.Label className={menuLabel}>{t.score.layout}</DropdownMenu.Label>
          )}
          {notation && (
            <DropdownMenu.RadioGroup
              value={link.layout}
              onValueChange={(value) => store.setLayout(value as ProjectScore["layout"])}
            >
              <DropdownMenu.RadioItem value="page" className={radio}>
                {t.score.layoutPage}
              </DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem value="horizontal" className={radio}>
                {t.score.layoutHorizontal}
              </DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
          )}
          <DropdownMenu.Label className={menuLabel}>{t.score.follow}</DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={link.follow}
            onValueChange={(value) => store.setFollow(value as ProjectScore["follow"])}
          >
            <DropdownMenu.RadioItem value="continuous" className={radio}>
              {t.score.followContinuous}
            </DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem value="paged" className={radio}>
              {t.score.followPaged}
            </DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem value="off" className={radio}>
              {t.score.followOff}
            </DropdownMenu.RadioItem>
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Label className={menuLabel}>
            {t.score.zoom} · {Math.round(link.zoom * 100)}%
          </DropdownMenu.Label>
          <DropdownMenu.Item
            className={menuItem}
            disabled={link.zoom >= SCORE_ZOOM.max}
            onSelect={(event) => {
              event.preventDefault();
              store.zoomBy(1);
            }}
          >
            <ZoomIn className="size-3.5" />
            {t.score.zoomIn}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={menuItem}
            disabled={link.zoom <= SCORE_ZOOM.min}
            onSelect={(event) => {
              event.preventDefault();
              store.zoomBy(-1);
            }}
          >
            <ZoomOut className="size-3.5" />
            {t.score.zoomOut}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={menuSeparator} />
          <DropdownMenu.Label className={`${menuLabel} truncate`}>{link.name}</DropdownMenu.Label>
          <DropdownMenu.Item className={menuItem} onSelect={() => void pickScore()}>
            <FileMusic className="size-3.5" />
            {t.score.change}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItem} onSelect={() => store.unlink()}>
            <Link2Off className="size-3.5" />
            {t.score.unlink}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Tap mode: which bar the next T pins, lit like a recording lamp; Esc or the key ends it. */
function TapBanner({ next }: { next: number }) {
  const bar = activeScore.engine?.bars[next];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      stopTapping();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);
  return (
    <div
      role="status"
      className="flex min-w-0 items-center gap-2 rounded-control border border-accent/50 bg-accent/10 px-2 py-0.5"
    >
      <span
        aria-hidden
        className="size-2 shrink-0 animate-pulse rounded-full bg-accent shadow-[0_0_6px_var(--color-accent)]"
      />
      <span className="truncate font-medium text-fg">
        {t.score.tappingNow((bar?.bar ?? 0) + 1)}
      </span>
      <kbd className="rounded-[3px] border border-border bg-well px-1 font-mono text-[10px] text-accent">
        T
      </kbd>
      <Button size="md" className="h-6 px-2" onClick={stopTapping}>
        {t.score.tappingStop}
      </Button>
    </div>
  );
}

/**
 * The score panel without its docking: toolbar and drawing. Beside the video (a lesson) it
 * fills its column and never collapses (the row is resized instead).
 */
export function ScorePanel({ link }: { link: ProjectScore }) {
  return (
    <section aria-label={t.score.title} className="flex size-full flex-col overflow-hidden">
      <ScoreToolbar link={link} lesson />
      <div className="min-h-0 flex-1 px-3 pb-2">
        <div className="relative size-full overflow-hidden rounded-panel border border-border">
          <ScoreBody link={link} />
        </div>
      </div>
    </section>
  );
}

function ScoreToolbar({ link, lesson = false }: { link: ProjectScore; lesson?: boolean }) {
  const store = useScoreStore.getState();
  const notation = link.kind === "notation";
  const collapsed = useScoreStore((s) => s.collapsed) && !lesson;
  const ready = useScoreStore((s) => s.status === "ready");
  const tapping = useScoreStore((s) => s.tapping);
  return (
    <header className="shrink-0 px-3 py-1 text-xs">
      {/* Every key stays on screen: names give way to icons first, then a second row */}
      <FitBar className="min-h-7 gap-x-2">
        <PanelTitle />
        {tapping !== null && <TapBanner next={tapping} />}
        {tapping === null && notation && <TrackMenu link={link} />}
        {tapping === null && !collapsed && <ViewKeys link={link} />}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {notation && tapping === null && (
            <>
              <SynthKey />
              <NeckKey />
              <Separator />
            </>
          )}
          <SyncMenu link={link} disabled={!ready} />
          <FileMenu link={link} />
          {!lesson && (
            <Tooltip label={collapsed ? t.score.expand : t.score.collapse}>
              <Button
                size="icon"
                className="size-6"
                aria-label={collapsed ? t.score.expand : t.score.collapse}
                onClick={store.toggleCollapsed}
              >
                {collapsed ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronUp className="size-3.5" />
                )}
              </Button>
            </Tooltip>
          )}
        </div>
      </FitBar>
    </header>
  );
}

/** A thin line between groups of keys (left out once the bar runs on two rows). */
function Separator() {
  const mode = useFitMode();
  if (mode === "wrap") return null;
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />;
}

/** Staves, layout, follow and zoom: shorter names in a compact bar, never hidden. */
function ViewKeys({ link }: { link: ProjectScore }) {
  const store = useScoreStore.getState();
  const compact = useCompact();
  const notation = link.kind === "notation";
  return (
    <>
      {notation && <Separator />}
      {notation && (
        <ChoiceKeys
          label={t.score.staves}
          value={link.staves}
          choices={[
            ["tab", compact ? t.score.stavesTabShort : t.score.stavesTab],
            ["notation", compact ? t.score.stavesNotationShort : t.score.stavesNotation],
            ["both", compact ? t.score.stavesBothShort : t.score.stavesBoth],
          ]}
          onChange={store.setStaves}
        />
      )}
      {notation && <Separator />}
      {notation && (
        <ChoiceKeys
          label={t.score.layout}
          value={link.layout}
          choices={[
            ["page", compact ? t.score.layoutPageShort : t.score.layoutPage],
            ["horizontal", compact ? t.score.layoutHorizontalShort : t.score.layoutHorizontal],
          ]}
          onChange={store.setLayout}
        />
      )}
      <FollowMenu link={link} />
      <div className="shrink-0">
        <Stepper
          label={t.score.zoom}
          value={link.zoom}
          min={SCORE_ZOOM.min}
          max={SCORE_ZOOM.max}
          step={SCORE_ZOOM.step}
          defaultValue={SCORE_ZOOM.default}
          format={(zoom) => `${Math.round(zoom * 100)}%`}
          onChange={(zoom) => store.zoomBy(Math.round((zoom - link.zoom) / SCORE_ZOOM.step))}
        />
      </div>
    </>
  );
}

/** A message in the middle of the panel: icon, title, explanation, an action. */
function Notice({
  icon,
  title,
  hint,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-stage p-6 text-center">
      <div className="text-fg-subtle">{icon}</div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {hint && <p className="max-w-md text-xs text-fg-muted">{hint}</p>}
      {children}
    </div>
  );
}

function EmptyBody() {
  const hasTrack = usePlayerStore((s) => s.track !== null);
  const linking = useScoreStore((s) => s.linking);
  const error = useScoreStore((s) => s.error);
  if (linking) {
    return <Notice icon={<Loader2 className="size-6 animate-spin" />} title={t.score.linking} />;
  }
  return (
    <Notice
      icon={<FileMusic className="size-8" />}
      title={hasTrack ? t.score.emptyTitle : t.score.emptyNoTrack}
      hint={hasTrack ? t.score.emptyHint : undefined}
    >
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="size-3.5" />
          {problemText(error)}
        </p>
      )}
      {hasTrack && (
        <>
          <Button variant="primary" className="mt-1" onClick={() => void pickScore()}>
            {t.score.choose}
          </Button>
          <p className="mt-2 flex max-w-md items-center gap-1.5 text-[11px] text-fg-subtle">
            <ShieldCheck className="size-3.5 shrink-0 text-loop" aria-hidden />
            {t.score.emptySafe}
          </p>
        </>
      )}
    </Notice>
  );
}

/** What a score problem means for the user, in their words. */
function problemText(error: AppError | null): string {
  if (!error || error.detail === "score") return t.score.failed;
  if (error.detail === "pdf") return t.score.failedPdf;
  return t.errors[error.kind];
}

/** What to try about a score problem, if anything helps. */
function problemHint(error: AppError | null): string | undefined {
  if (!error || error.detail === "score") return t.score.failedHint;
  if (error.detail === "pdf") return t.score.failedPdfHint;
  return undefined;
}

/** How long a notice stays over the score. */
const NOTICE_MS = 6000;

/** A short message over the score shown (which stays): a PDF dropped, a file unreadable… */
function NoticeToast() {
  const notice = useScoreStore((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => useScoreStore.getState().clearNotice(), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice) return null;
  return (
    <div
      role="status"
      className="absolute top-2 left-1/2 z-10 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-panel border border-edge bg-bg-from px-3 py-1.5 text-xs text-fg shadow-[0_6px_18px_rgb(0_0_0/0.5)]"
    >
      <AlertCircle className="size-3.5 shrink-0 text-red-400" />
      <span>{problemText(notice)}</span>
      {problemHint(notice) && <span className="text-fg-subtle">{problemHint(notice)}</span>}
      <button
        type="button"
        aria-label={t.score.dismiss}
        className="ml-1 text-fg-subtle hover:text-fg"
        onClick={() => useScoreStore.getState().clearNotice()}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** A good outcome over the score (the automatic sync's result), shown a few seconds. */
function InfoToast() {
  const info = useScoreStore((s) => s.info);
  useEffect(() => {
    if (!info) return;
    const timer = setTimeout(() => useScoreStore.getState().setInfo(null), NOTICE_MS * 1.5);
    return () => clearTimeout(timer);
  }, [info]);
  if (!info) return null;
  return (
    <div
      role="status"
      className="absolute top-2 left-1/2 z-10 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-panel border border-edge bg-bg-from px-3 py-1.5 text-xs text-fg shadow-[0_6px_18px_rgb(0_0_0/0.5)]"
    >
      <Sparkles className="size-3.5 shrink-0 text-accent" />
      <span>{info}</span>
      <button
        type="button"
        aria-label={t.score.dismiss}
        className="ml-1 text-fg-subtle hover:text-fg"
        onClick={() => useScoreStore.getState().setInfo(null)}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function ScoreBody({ link }: { link: ProjectScore }) {
  const status = useScoreStore((s) => s.status);
  const error = useScoreStore((s) => s.error);
  const detecting = useScoreStore((s) => s.detecting);
  const aligning = useScoreStore((s) => s.aligning);
  const neck = useSettingsStore((s) => s.scoreNeck) && link.kind === "notation";
  if (status === "error") {
    return (
      <Notice
        icon={<AlertCircle className="size-7 text-red-400" />}
        title={problemText(error)}
        hint={problemHint(error)}
      >
        <Button variant="hardware" className="mt-1" onClick={() => void pickScore()}>
          {t.score.change}
        </Button>
      </Notice>
    );
  }
  return (
    <>
      <div className="flex size-full flex-col">
        <div className="relative min-h-0 flex-1">
          <Suspense fallback={null}>
            {link.kind === "pdf" ? <PdfView link={link} /> : <ScoreView link={link} />}
          </Suspense>
        </div>
        {neck && status === "ready" && <TabNeck />}
      </div>
      <NoticeToast />
      <InfoToast />
      {aligning !== null && status === "ready" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
          <span className="flex items-center gap-2 rounded-panel border border-edge bg-bg-from px-3 py-1.5 text-xs text-fg shadow-[0_6px_18px_rgb(0_0_0/0.5)]">
            <Loader2 className="size-3.5 animate-spin text-accent" />
            {t.score.aligning(Math.round(aligning * 100))}
          </span>
        </div>
      )}
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-stage/80">
          <span className="flex items-center gap-2 text-xs text-fg-muted">
            <Loader2 className="size-4 animate-spin" />
            {detecting ? t.score.detecting(detecting.done, detecting.of) : t.score.loading}
          </span>
        </div>
      )}
    </>
  );
}
