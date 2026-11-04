import { DetailView } from "./DetailView";
import { Overview } from "./Overview";

/** Central area once a track is open: overview on top, detailed view below. */
export function WaveformPanel() {
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <Overview />
      <DetailView />
    </div>
  );
}
