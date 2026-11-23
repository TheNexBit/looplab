import { ChevronDown, ChevronRight } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { SectionLane } from "@/features/markers/SectionLane";
import { NoteView } from "@/features/notes/NoteView";
import { t } from "@/i18n";
import { useNotesStore } from "@/stores/notes";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { DetailView } from "./DetailView";
import { Overview } from "./Overview";

const toggleOverview = () => {
  const { showOverview, update } = useSettingsStore.getState();
  update({ showOverview: !showOverview });
};

/** Central area once a track is open: overview, section lane, detailed view, note view. */
export function WaveformPanel() {
  const notesOpen = useNotesStore((s) => s.open);
  const trackPath = usePlayerStore((s) => s.track?.path);
  const showOverview = useSettingsStore((s) => s.showOverview);
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden bg-stage p-2.5">
      {/* One header, always in the same place with the same arrow (as the course headings of the
          lesson Home): down = open, right = folded. A click anywhere on it, or Shift+O */}
      <Tooltip
        label={showOverview ? t.waveform.hideOverview : t.waveform.showOverview}
        shortcut="toggleOverview"
      >
        <button
          type="button"
          aria-expanded={showOverview}
          aria-label={showOverview ? t.waveform.hideOverview : t.waveform.showOverview}
          onClick={toggleOverview}
          className="flex h-4 shrink-0 items-center gap-1 self-start rounded-control pr-1.5 text-fg-subtle transition-colors hover:text-fg"
        >
          {showOverview ? (
            <ChevronDown className="size-3.5" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden />
          )}
          <span className="panel-label">{t.waveform.overview}</span>
        </button>
      </Tooltip>
      {showOverview && (
        <div className="shrink-0">
          <Overview />
        </div>
      )}
      <SectionLane />
      <DetailView />
      {notesOpen && <NoteView key={trackPath} />}
    </div>
  );
}
