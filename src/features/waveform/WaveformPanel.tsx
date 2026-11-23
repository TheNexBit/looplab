import { AudioWaveform } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { PanelTitle } from "@/components/ui/PanelTitle";
import { ResizeHandle } from "@/components/ui/ResizeHandle";
import { SectionLane } from "@/features/markers/SectionLane";
import { NoteView } from "@/features/notes/NoteView";
import { t } from "@/i18n";
import { DETAIL_HEIGHT, OVERVIEW_HEIGHT } from "@/lib/appearance";
import { clamp } from "@/lib/time";
import { useAppearanceStore } from "@/stores/appearance";
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

/**
 * The detailed view's edge: dragging it moves the border with the panel above (score, video
 * or the lesson's row), which gives or takes the same room. Its height is also the least the
 * panels above leave to it, so it never gets squeezed.
 */
function resizeDetail(height: number, shown: number) {
  const next = Math.round(clamp(height, DETAIL_HEIGHT.min, DETAIL_HEIGHT.max));
  const neighbour = useWavesStore.getState().neighbour;
  neighbour?.resize(neighbour.shown() - (next - shown));
  appearance().update({ detailHeight: next });
}

/**
 * Central area once a track is open: overview, section lane, detailed view, note view. The
 * overview and the detailed view each have a bottom edge to drag (double-click: back to
 * normal); what they need is measured here, so score and video above never squeeze them.
 */
export function WaveformPanel() {
  const notesOpen = useNotesStore((s) => s.open);
  const trackPath = usePlayerStore((s) => s.track?.path);
  const showOverview = useSettingsStore((s) => s.showOverview);
  const detailHeight = useAppearanceStore((s) => s.detailHeight);
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
      useWavesStore.getState().setReserve(fixed + gaps + padding + appearance().detailHeight);
    };
    const observer = new ResizeObserver(measure);
    for (const child of panel.children) observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, [showOverview, notesOpen, hasNeighbour, detailHeight]);

  return (
    <div
      ref={panelRef}
      className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden bg-stage p-2.5"
    >
      {/* The shared panel title (as video and score): the arrow folds the overview; Shift+O too */}
      <PanelTitle
        label={t.waveform.overview}
        icon={<AudioWaveform className="size-3.5 shrink-0 text-accent" aria-hidden />}
        open={showOverview}
        onToggle={toggleOverview}
        foldLabel={t.waveform.hideOverview}
        openLabel={t.waveform.showOverview}
        shortcut="toggleOverview"
      />
      {showOverview && (
        <div className="flex shrink-0 flex-col gap-0.5">
          <Overview />
          <ResizeHandle
            vertical
            label={t.waveform.resizeOverview}
            size={() => appearance().overviewHeight}
            onResize={(height) =>
              appearance().update({
                overviewHeight: Math.round(clamp(height, OVERVIEW_HEIGHT.min, OVERVIEW_HEIGHT.max)),
              })
            }
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
            size={detailShown}
            onResize={(height) => resizeDetail(height, detailShown())}
            onReset={() => resizeDetail(DETAIL_HEIGHT.default, detailShown())}
          />
        )}
      </div>
      {notesOpen && <NoteView key={trackPath} />}
    </div>
  );
}
