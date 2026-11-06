import { SectionLane } from "@/features/markers/SectionLane";
import { NoteView } from "@/features/notes/NoteView";
import { useNotesStore } from "@/stores/notes";
import { usePlayerStore } from "@/stores/player";
import { DetailView } from "./DetailView";
import { Overview } from "./Overview";

/** Central area once a track is open: overview, section lane, detailed view, note view. */
export function WaveformPanel() {
  const notesOpen = useNotesStore((s) => s.open);
  const trackPath = usePlayerStore((s) => s.track?.path);
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden bg-[#111214] p-2.5">
      <Overview />
      <SectionLane />
      <DetailView />
      {notesOpen && <NoteView key={trackPath} />}
    </div>
  );
}
