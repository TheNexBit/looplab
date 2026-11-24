import { t } from "@/i18n";
import { Countdown, SetlistInvite, SetMeter, useSetlists } from "./SetlistHome";
import { AddSongs, LiveKey, SetlistPicker, SongList } from "./SetlistParts";

const s = t.setlist;

/**
 * The setlist in the side panel, beside the open track (like BandHelper's set list beside the
 * song): pick it, add the open track or drop files on it, reorder, double-click a song to open
 * it, start Live. Date, venue and set length are edited on the Home.
 */
export function SetlistPanel() {
  const { setlist, loaded } = useSetlists();

  if (!setlist) {
    return <div className="p-3">{loaded && <SetlistInvite compact />}</div>;
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex items-center gap-1.5">
        <SetlistPicker current={setlist} compact />
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
    </div>
  );
}
