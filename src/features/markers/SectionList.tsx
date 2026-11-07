import { Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InlineName } from "@/components/ui/InlineName";
import { MemoButton } from "@/components/ui/MemoButton";
import { PlaylistPanel } from "@/features/practice/PlaylistPanel";
import { t } from "@/i18n";
import { formatTime } from "@/lib/time";
import {
  beatNumbers,
  type SectionRange,
  sectionColor,
  sectionRanges,
  useMarkersStore,
} from "@/stores/markers";
import { usePlayerStore } from "@/stores/player";
import { SavedLoopList } from "./SavedLoopList";
import { SectionMenu } from "./SectionMenu";
import { loopSection } from "./sectionActions";

function SectionRow({ range }: { range: SectionRange }) {
  const { renameSection, removeSection, setSectionMemo } = useMarkersStore.getState();

  return (
    <SectionMenu range={range}>
      <li className="group flex h-[30px] items-center gap-2 rounded-control border border-transparent px-2 hover:border-edge hover:bg-well">
        <span
          aria-hidden
          className="h-4 w-1 shrink-0 rounded-[1px]"
          style={{ background: sectionColor(range.color) }}
        />
        <InlineName
          value={range.name}
          label={t.markers.rename}
          onRename={(name) => renameSection(range.id, name)}
        />
        <span className="font-mono text-[11px] text-fg-subtle tabular">
          {formatTime(range.start)}
        </span>
        <MemoButton
          memo={range.memo}
          label={`${t.memo.title}: ${range.name}`}
          onSave={(memo) => setSectionMemo(range.id, memo)}
        />
        <Button
          size="icon"
          className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => loopSection(range)}
          aria-label={t.markers.loopSection}
        >
          <Repeat className="size-3.5" />
        </Button>
        <Button
          size="icon"
          className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => removeSection(range.id)}
          aria-label={t.markers.remove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </li>
    </SectionMenu>
  );
}

/** Side panel tab: saved loops, sections (renamable, loopable) and markers of the open track. */
export function SectionList() {
  const sections = useMarkersStore((s) => s.sections);
  const markers = useMarkersStore((s) => s.markers);
  const savedTo = useMarkersStore((s) => s.savedTo);
  const duration = usePlayerStore((s) => s.track?.duration ?? 0);
  const numbers = beatNumbers(markers);
  const sortedMarkers = [...markers].sort((a, b) => a.time - b.time);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-2">
      <SavedLoopList />
      <PlaylistPanel />
      <section>
        <h3 className="panel-label px-2 pb-1.5">{t.markers.sections}</h3>
        {sections.length === 0 ? (
          <p className="px-2 text-sm text-fg-subtle">{t.markers.noSections}</p>
        ) : (
          <ul>
            {sectionRanges(sections, duration).map((range) => (
              <SectionRow key={range.id} range={range} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="panel-label px-2 pb-1.5">{t.markers.markers}</h3>
        {markers.length === 0 ? (
          <p className="px-2 text-sm text-fg-subtle">{t.markers.noMarkers}</p>
        ) : (
          <ul>
            {sortedMarkers.map((marker) => (
              <li
                key={marker.id}
                className="group flex items-center gap-2 rounded-control border border-transparent px-2 py-0.5 hover:border-edge hover:bg-well"
              >
                <button
                  type="button"
                  onClick={() => usePlayerStore.getState().seek(marker.time)}
                  className="flex flex-1 items-center gap-2 text-left text-sm text-fg-muted"
                >
                  <span className="w-16 truncate">
                    {marker.kind === "beat"
                      ? `${t.markers.bar} ${numbers.get(marker.id)}`
                      : marker.label || t.markers.marker}
                  </span>
                  <span className="font-mono text-[11px] text-fg-subtle tabular">
                    {formatTime(marker.time)}
                  </span>
                </button>
                <Button
                  size="icon"
                  className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => useMarkersStore.getState().removeMarker(marker.id)}
                  aria-label={t.markers.remove}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {savedTo === "appData" && (
        <p className="mt-auto px-2 text-xs text-fg-subtle">{t.markers.savedInAppData}</p>
      )}
    </div>
  );
}
