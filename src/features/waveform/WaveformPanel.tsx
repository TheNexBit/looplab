import { SectionLane } from "@/features/markers/SectionLane";
import { DetailView } from "./DetailView";
import { Overview } from "./Overview";

/** Central area once a track is open: overview, section lane, detailed view. */
export function WaveformPanel() {
  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <Overview />
      <SectionLane />
      <DetailView />
    </div>
  );
}
