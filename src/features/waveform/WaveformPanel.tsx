import { SectionLane } from "@/features/markers/SectionLane";
import { DetailView } from "./DetailView";
import { Overview } from "./Overview";

/** Central area once a track is open: overview, section lane, detailed view. */
export function WaveformPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-4">
      <Overview />
      <SectionLane />
      <DetailView />
    </div>
  );
}
