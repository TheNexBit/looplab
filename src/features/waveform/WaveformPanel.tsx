import { SectionLane } from "@/features/markers/SectionLane";
import { DetailView } from "./DetailView";
import { Overview } from "./Overview";

/** Central area once a track is open: overview, section lane, detailed view. */
export function WaveformPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden bg-[#111214] p-2.5">
      <Overview />
      <SectionLane />
      <DetailView />
    </div>
  );
}
