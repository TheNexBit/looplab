import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileMusic,
  Link2Off,
  Loader2,
  MoreHorizontal,
  ShieldCheck,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { lazy, type ReactNode, Suspense, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { ChoiceKeys } from "@/components/ui/ChoiceKeys";
import { menuContent, menuItem, menuLabel, menuSeparator } from "@/components/ui/menu";
import { ResizeHandle } from "@/components/ui/ResizeHandle";
import { Stepper } from "@/components/ui/Stepper";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { usePlayerStore } from "@/stores/player";
import { type ProjectScore, SCORE_ZOOM, useScoreStore } from "@/stores/score";
import { pickScore } from "./pickScore";

import { SyncMenu } from "./SyncMenu";

/** alphaTab (1.2 MB) loads only when a score is first shown, never at start. */
const ScoreView = lazy(() => import("./ScoreView").then((m) => ({ default: m.ScoreView })));

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
  return (
    <span className="flex shrink-0 items-center gap-1.5 font-medium tracking-wide text-fg-subtle uppercase">
      <FileMusic className="size-3.5 text-accent" aria-hidden />
      {t.score.title}
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
  const tracks = useScoreStore((s) => s.tracks);
  const current = link.tracks[0] ?? 0;
  const name = tracks.find((track) => track.index === current)?.name ?? "—";
  return (
    <DropdownMenu.Root>
      <Tooltip label={t.score.track}>
        <DropdownMenu.Trigger asChild>
          <Button variant="hardware" options className="max-w-44" disabled={tracks.length === 0}>
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
  const names = {
    continuous: t.score.followContinuous,
    paged: t.score.followPaged,
    off: t.score.followOff,
  } as const;
  return (
    <DropdownMenu.Root>
      <Tooltip label={t.score.follow}>
        <DropdownMenu.Trigger asChild>
          <Button variant="hardware" options>
            {t.score.follow}
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

function FileMenu({ link }: { link: ProjectScore }) {
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
        <DropdownMenu.Content align="end" sideOffset={6} className={`${menuContent} max-w-80`}>
          <DropdownMenu.Label className={`${menuLabel} truncate`}>{link.name}</DropdownMenu.Label>
          <DropdownMenu.Item className={menuItem} onSelect={() => void pickScore()}>
            <FileMusic className="size-3.5" />
            {t.score.change}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={menuSeparator} />
          <DropdownMenu.Item
            className={menuItem}
            onSelect={() => useScoreStore.getState().unlink()}
          >
            <Link2Off className="size-3.5" />
            {t.score.unlink}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ScoreToolbar({ link }: { link: ProjectScore }) {
  const store = useScoreStore.getState();
  const collapsed = useScoreStore((s) => s.collapsed);
  const ready = useScoreStore((s) => s.status === "ready");
  return (
    <header className="flex h-9 shrink-0 items-center gap-2 overflow-hidden px-3 text-xs">
      <PanelTitle />
      <TrackMenu link={link} />
      {!collapsed && (
        <>
          <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
          <ChoiceKeys
            label={t.score.staves}
            value={link.staves}
            choices={[
              ["tab", t.score.stavesTab],
              ["notation", t.score.stavesNotation],
              ["both", t.score.stavesBoth],
            ]}
            onChange={store.setStaves}
          />
          <span className="hidden h-4 w-px shrink-0 bg-border lg:block" aria-hidden />
          <div className="hidden lg:block">
            <ChoiceKeys
              label={t.score.layout}
              value={link.layout}
              choices={[
                ["page", t.score.layoutPage],
                ["horizontal", t.score.layoutHorizontal],
              ]}
              onChange={store.setLayout}
            />
          </div>
          <FollowMenu link={link} />
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
        </>
      )}
      <span className="mr-auto" />
      <SyncMenu link={link} disabled={!ready} />
      <FileMenu link={link} />
      <Tooltip label={collapsed ? t.score.expand : t.score.collapse}>
        <Button
          size="icon"
          className="size-6"
          aria-label={collapsed ? t.score.expand : t.score.collapse}
          onClick={store.toggleCollapsed}
        >
          {collapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </Button>
      </Tooltip>
    </header>
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
          {error.detail === "pdf" ? t.score.pdfSoon : t.errors[error.kind]}
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

function ScoreBody({ link }: { link: ProjectScore }) {
  const status = useScoreStore((s) => s.status);
  const error = useScoreStore((s) => s.error);
  if (status === "error") {
    return (
      <Notice
        icon={<AlertCircle className="size-7 text-red-400" />}
        title={
          error?.detail === "pdf" ? t.score.pdfSoon : error ? t.errors[error.kind] : t.score.failed
        }
        hint={error ? undefined : t.score.failedHint}
      >
        <Button variant="hardware" className="mt-1" onClick={() => void pickScore()}>
          {t.score.change}
        </Button>
      </Notice>
    );
  }
  return (
    <>
      <Suspense fallback={null}>
        <ScoreView link={link} />
      </Suspense>
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-stage/80">
          <span className="flex items-center gap-2 text-xs text-fg-muted">
            <Loader2 className="size-4 animate-spin" />
            {t.score.loading}
          </span>
        </div>
      )}
    </>
  );
}
