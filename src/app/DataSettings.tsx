import { FileText, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cacheFilesInUse } from "@/features/video/videoLoader";
import { t } from "@/i18n";
import { type AppInfo, type CacheUsage, commands } from "@/lib/bindings";
import { formatBytes } from "@/lib/bytes";
import { ArchiveSettings } from "./ArchiveSettings";

const d = t.settings.data;

/** Settings → Data: library and backups, space taken by the cache, and the error log. */
export function DataSettings() {
  const [usage, setUsage] = useState<CacheUsage[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<AppInfo>();

  const refresh = useCallback(async () => {
    const result = await commands.cacheUsage();
    setUsage(result.status === "ok" ? result.data : []);
  }, []);

  useEffect(() => {
    void refresh();
    void commands.appInfo().then(setInfo);
  }, [refresh]);

  const clear = async () => {
    setBusy(true);
    const result = await commands.clearCache(cacheFilesInUse());
    setMessage(
      result.status === "ok" ? `${d.freed} ${formatBytes(result.data ?? 0)}` : t.errors.internal,
    );
    await refresh();
    setBusy(false);
  };

  const total = usage?.reduce((sum, kind) => sum + (kind.bytes ?? 0), 0) ?? 0;

  return (
    <div className="divide-y divide-border px-4 pt-1 pb-4">
      <ArchiveSettings />
      <div className="py-3">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-sm text-fg">{d.cache}</p>
            <p className="text-xs text-fg-subtle">
              {d.cacheHint(formatBytes(info?.decodedLimit ?? 0))}
            </p>
            {info?.portable && <p className="text-xs text-readout">{d.portable}</p>}
          </div>
          <Button variant="hardware" onClick={() => void clear()} disabled={busy || total === 0}>
            <Trash2 className="size-4" />
            {d.clear}
          </Button>
        </div>
        <dl className="well mt-2 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 rounded-control px-3 py-2 font-mono text-xs text-fg-muted tabular">
          {usage?.map((kind) => (
            <div key={kind.kind} className="contents">
              <dt>{d.kinds[kind.kind]}</dt>
              <dd className="text-right">
                {kind.files} {d.files}
              </dd>
              <dd className="text-right text-fg">{formatBytes(kind.bytes ?? 0)}</dd>
            </div>
          ))}
        </dl>
        {message && <p className="mt-2 text-xs text-fg-muted">{message}</p>}
      </div>
      <div className="flex items-center gap-4 py-3">
        <div className="flex-1">
          <p className="text-sm text-fg">{d.log}</p>
          <p className="text-xs text-fg-subtle">{d.logHint}</p>
        </div>
        <Button variant="hardware" onClick={() => void commands.showLog()}>
          <FileText className="size-4" />
          {d.showLog}
        </Button>
      </div>
    </div>
  );
}
