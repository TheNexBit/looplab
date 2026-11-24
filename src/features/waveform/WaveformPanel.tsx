import { AudioWaveform } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { PanelTitle } from "@/components/ui/PanelTitle";
import { ResizeHandle } from "@/components/ui/ResizeHandle";
import { SectionLane } from "@/features/markers/SectionLane";
import { NoteView } from "@/features/notes/NoteView";
import { TrackLevel } from "@/features/player/Levels";
import { StemsBar } from "@/features/stems/StemLanes";
import { t } from "@/i18n";
import { DETAIL_HEIGHT, OVERVIEW_HEIGHT } from "@/lib/appearance";
import { clamp } from "@/lib/time";
import { useAppearanceStore } from "@/stores/appearance";
import { useFileStemsStore } from "@/stores/fileStems";
import { useNotesStore } from "@/stores/notes";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { useWavesStore } from "@/stores/waves";
import { DetailView } from "./DetailView";
import { Overview } from "./Overview";

const toggleOverview = () => {
  const { showOverview, update } = useSettingsStore.getState();
  update({ showOverview: !showOverview });
};

const appearance = () => useAppearanceStore.getState();

/** Saves the heights once a drag ends (while dragging they are only shown). */
const saveHeights = () => {
  const { overviewHeight, detailHeight, update } = appearance();
  update({ overviewHeight, detailHeight });
};

/**
 * The detailed view's height while its edge is dragged: what the drag asked for, read at once
 * (the screen follows a frame later, and reading it would make the edge lag behind the hand).
 */
let draggedDetail: number | null = null;

/**
 * Moves the detailed view's edge from `from` to `height`: the panel above (score, video or the
 * lesson's row) gives or takes the same room. The height is also the least the panels above
 * leave to it, so it never gets squeezed. Returns the height reached.
 */
function moveDetailEdge(height: number, from: number): number {
  const next = Math.round(clamp(height, DETAIL_HEIGHT.min, DETAIL_HEIGHT.max));
  const neighbour = useWavesStore.getState().neighbour;
  neighbour?.resize(neighbour.shown() - (next - from));
  appearance().dragHeight({ detailHeight: next });
  return next;
}

/**
 * Central area once a track is open: overview, section lane, detailed view, note view. The
 * overview and the detailed view each have a bottom edge to drag (double-click: back to
 * normal); what they need is measured here, so score and video above never squeeze them.
 */
/** Ruler of the detailed view, and the least height of a stem lane (its waveform and head). */
const RULER_CSS = 20;
const LANE_CSS = 58;

export function WaveformPanel() {
  const notesOpen = useNotesStore((s) => s.open);
  const trackPath = usePlayerStore((s) => s.track?.path);
  const showOverview = useSettingsStore((s) => s.showOverview);
  const chosenHeight = useAppearanceStore((s) => s.detailHeight);
  // Stems from files: every lane gets room for its waveform and its head
  const lanes = useFileStemsStore((s) => s.lanes.length);
  const detailHeight =
    lanes > 1 ? Math.max(chosenHeight, RULER_CSS + lanes * LANE_CSS) : chosenHeight;
  const overviewHeight = useAppearanceStore((s) => s.overviewHeight);
  const hasNeighbour = useWavesStore((s) => s.neighbour !== null);
  const panelRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const detailShown = () => detailRef.current?.offsetHeight ?? detailHeight;

  // The room the waveforms need: everything but the detailed view as it is on screen, plus its
  // least height. Measured again whenever a part changes size (notes opened, overview dragged…)
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again when a part comes or goes, or the least height changes
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const measure = () => {
      const style = getComputedStyle(panel);
      const parts = [...panel.children].filter((child) => child !== detailRef.current);
      const gaps = Number.parseFloat(style.rowGap) * parts.length;
      const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      const fixed = parts.reduce((sum, child) => sum + (child as HTMLElement).offsetHeight, 0);
      useWavesStore.getState().setReserve(fixed + gaps + padding + detailHeight);
    };
    const observer = new ResizeObserver(measure);
    for (const child of panel.children) observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, [showOverview, notesOpen, hasNeighbour, detailHeight, overviewHeight]);

  return (
    <div
      ref={panelRef}
      className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden bg-stage p-2.5"
    >
      {/* The shared panel title (as video and score): the arrow folds the overview; Shift+O too */}
      <div className="flex shrink-0 items-center gap-3">
        <PanelTitle
          label={t.waveform.overview}
          icon={<AudioWaveform className="size-3.5 shrink-0 text-accent" aria-hidden />}
          open={showOverview}
          onToggle={toggleOverview}
          foldLabel={t.waveform.hideOverview}
          openLabel={t.waveform.showOverview}
          shortcut="toggleOverview"
        />
        <StemsBar />
        {/* The track's own level and mute, on its header as in Reaper */}
        <TrackLevel className="ml-auto" />
      </div>
      {showOverview && (
        <div className="flex shrink-0 flex-col gap-0.5">
          <Overview />
          <ResizeHandle
            vertical
            label={t.waveform.resizeOverview}
            size={() => appearance().overviewHeight}
            onResize={(height) => appearance().dragHeight({ overviewHeight: height })}
            onEnd={saveHeights}
            onReset={() => appearance().update({ overviewHeight: OVERVIEW_HEIGHT.default })}
          />
        </div>
      )}
      <SectionLane />
      <div
        ref={detailRef}
        className="flex flex-1 flex-col gap-0.5"
        style={{ minHeight: detailHeight }}
      >
        <DetailView />
        {/* With nothing above to give room (no score, video at the side) the view fills the
            panel: its edge would have nothing to move */}
        {hasNeighbour && (
          <ResizeHandle
            vertical
            label={t.waveform.resizeDetail}
            size={() => draggedDetail ?? detailShown()}
            onStart={() => {
              draggedDetail = detailShown();
            }}
            onResize={(height) => {
              draggedDetail = moveDetailEdge(height, draggedDetail ?? detailShown());
            }}
            onEnd={() => {
              draggedDetail = null;
              saveHeights();
            }}
            onReset={() => {
              moveDetailEdge(DETAIL_HEIGHT.default, detailShown());
              saveHeights();
            }}
          />
        )}
      </div>
      {notesOpen && <NoteView key={trackPath} />}
    </div>
  );
}
