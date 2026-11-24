import { t } from "@/i18n";
import { useSetlistsStore } from "@/stores/setlists";
import { useLiveStore } from "./live";
import { Countdown, SetlistInvite, SetMeter, useSetlists } from "./SetlistHome";
import { AddSongs, LiveKey, SetKey, SetlistDropZone, SongList } from "./SetlistParts";

const s = t.setlist;

/**
 * The set being played, in the side panel while set mode is on (like BandHelper's set list
 * beside the song): the song under way, double-click to play another, add the open track or drop
 * files, reorder, the Stage view. Picking another setlist, date and venue are on the Home.
 */
export function SetlistPanel() {
  const { loaded } = useSetlists();
  // The tab is there only in set mode: it shows the set being played
  const setlistId = useLiveStore((st) => st.setlistId);
  const setlist = useSetlistsStore((st) => st.setlists.find((x) => x.id === setlistId)) ?? null;

  if (!setlist) {
    return <div className="p-3">{loaded && <SetlistInvite compact />}</div>;
  }
  return (
    // The whole tab takes dropped files, not only the rows of the list
    <SetlistDropZone setlistId={setlist.id} className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={setlist.name}>
          {setlist.name || s.untitled}
        </span>
        <SetKey setlist={setlist} compact />
        <LiveKey setlist={setlist} compact />
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SetMeter setlist={setlist} compact />
        </div>
        {setlist.date && <Countdown date={setlist.date} />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SongList setlist={setlist} compact />
      </div>
      <AddSongs setlist={setlist} compact />
      <p className="text-[11px] text-fg-subtle">{s.panelHint}</p>
    </SetlistDropZone>
  );
}
