import { Dialog } from "@/components/ui/Dialog";
import { formatDuration, lastDays, tracksPractised } from "@/features/practice/diaryStats";
import { t } from "@/i18n";
import { formatPercent } from "@/lib/format";
import { useDiaryStore } from "@/stores/diary";
import { usePlayerStore } from "@/stores/player";
import { useUiStore } from "@/stores/ui";

const d = t.diary;

/** "2026-11-06" → "6/11/2026". */
const formatDay = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return `${date}/${month}/${year}`;
};

/** Every practised track: total time, days, highest speed, last time. */
export function DiaryDialog() {
  const open = useUiStore((s) => s.dialog === "diary");
  const close = useUiStore((s) => s.closeDialog);
  const entries = useDiaryStore((s) => s.entries);
  const rows = tracksPractised(entries);
  const week = new Set(lastDays(new Date(), 7));
  const weekSeconds = entries.filter((e) => week.has(e.day)).reduce((sum, e) => sum + e.seconds, 0);

  return (
    <Dialog open={open} onClose={close} title={d.title} className="w-[min(44rem,calc(100vw-2rem))]">
      <div className="space-y-3 px-4 pt-3 pb-4">
        <p className="font-mono text-xs text-readout">
          {d.lastWeek}: {formatDuration(weekSeconds)}
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-fg-subtle">{d.empty}</p>
        ) : (
          <div className="well max-h-[55vh] overflow-auto rounded-panel">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-well">
                <tr className="panel-label">
                  <th className="px-3 py-2 font-semibold">{d.track}</th>
                  <th className="px-3 py-2 text-right font-semibold">{d.total}</th>
                  <th className="px-3 py-2 text-right font-semibold">{d.days}</th>
                  <th className="px-3 py-2 text-right font-semibold">{d.maxSpeed}</th>
                  <th className="px-3 py-2 text-right font-semibold">{d.last}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.path} className="border-t border-edge hover:bg-surface-hover">
                    <td className="max-w-56 truncate px-3 py-1.5" title={row.path}>
                      <button
                        type="button"
                        className="truncate text-left text-fg hover:text-accent"
                        onClick={() => {
                          close();
                          void usePlayerStore.getState().open(row.path);
                        }}
                      >
                        {row.name}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-fg-muted tabular">
                      {formatDuration(row.total)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-fg-muted tabular">
                      {row.days}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-fg-muted tabular">
                      {formatPercent(row.maxSpeed)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-fg-muted tabular">
                      {formatDay(row.lastDay)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
}
