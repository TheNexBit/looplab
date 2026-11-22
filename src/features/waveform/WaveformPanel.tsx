import { ChevronDown, ChevronUp } from "lucide-react";
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
      {showOverview ? (
        // The hide key sits beside the strip, not in it: the strip's own presses seek
        <div className="group/overview relative shrink-0">
          <Overview />
          <Tooltip label={t.waveform.hideOverview} shortcut="toggleOverview">
            <button
              type="button"
              aria-label={t.waveform.hideOverview}
              onClick={toggleOverview}
              className="hw absolute top-1 right-1 flex size-5 items-center justify-center rounded-control text-fg-muted opacity-0 transition-opacity group-hover/overview:opacity-100 hover:text-fg focus-visible:opacity-100"
            >
              <ChevronUp className="size-3.5" />
            </button>
          </Tooltip>
        </div>
      ) : (
        // Hidden: a thin strip stays, so the overview is one click away
        <Tooltip label={t.waveform.showOverview} shortcut="toggleOverview">
          <button
            type="button"
            aria-label={t.waveform.showOverview}
            onClick={toggleOverview}
            className="well flex h-3 shrink-0 items-center justify-center rounded-control text-fg-subtle transition-colors hover:text-fg"
          >
            <ChevronDown className="size-3" />
          </button>
        </Tooltip>
      )}
      <SectionLane />
      <DetailView />
      {notesOpen && <NoteView key={trackPath} />}
    </div>
  );
}
