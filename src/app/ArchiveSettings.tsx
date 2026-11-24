import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, HardDriveDownload, History, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { t } from "@/i18n";
import { type ArchiveInfo, type BackupInfo, commands } from "@/lib/bindings";
import { formatBytes } from "@/lib/bytes";

const d = t.settings.data;

/** A backup's local date and time in the app's language: "13/11/2026, 09:56", "11/13/2026, 9:56 AM". */
function when(backup: BackupInfo) {
  const [y = 0, m = 1, day = 1] = backup.day.split("-").map(Number);
  const [hours = 0, minutes = 0] = backup.time.split(":").map(Number);
  const date = new Date(y, m - 1, day, hours, minutes);
  if (Number.isNaN(date.getTime())) return `${backup.day} ${backup.time}`;
  return date.toLocaleString(t.common.locale, { dateStyle: "short", timeStyle: "short" });
}

/** Settings → Data: the library file, its backups (made, listed, restored), the second copy and where the exported tracks go. */
export function ArchiveSettings() {
  const [info, setInfo] = useState<ArchiveInfo | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The backup whose restore is waiting for confirmation */
  const [asking, setAsking] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await commands.archiveInfo();
    if (result.status === "ok") setInfo(result.data);
    else setMessage(t.errors[result.error.kind]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const backupNow = async () => {
    setBusy(true);
    const result = await commands.backupNow();
    if (result.status === "ok") {
      const { backup, mirrorError } = result.data;
      setMessage(mirrorError ? d.mirrorFailed(mirrorError) : d.done(when(backup)));
    } else {
      setMessage(t.errors[result.error.kind]);
    }
    await refresh();
    setBusy(false);
  };

  const restore = async (name: string) => {
    setBusy(true);
    setAsking(null);
    const result = await commands.restoreBackup(name);
    if (result.status === "ok") {
      // Every store reads its preferences at start: the restored ones come in with a reload
      window.location.reload();
      return;
    }
    setMessage(t.errors[result.error.kind]);
    await refresh();
    setBusy(false);
  };

  const chooseMirror = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (!dir) return;
    await commands.setBackupMirror(dir);
    await refresh();
  };

  const stopMirror = async () => {
    await commands.setBackupMirror(null);
    await refresh();
  };

  const setStemsFolder = async (dir: string | null) => {
    await commands.setStemsFolder(dir);
    await refresh();
  };

  const chooseStemsFolder = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (dir) await setStemsFolder(dir);
  };

  return (
    <>
      {info?.recovered && (
        <p className="py-3 text-xs text-readout">{d.recovered(info.recovered)}</p>
      )}
      <div className="flex items-center gap-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-fg">{d.archive}</p>
          <p className="text-xs text-fg-subtle">{d.archiveHint}</p>
          {info && (
            <p className="mt-1 truncate font-mono text-xs text-fg-muted" title={info.library}>
              {info.library} · {formatBytes(info.libraryBytes ?? 0)}
            </p>
          )}
        </div>
        <Button variant="hardware" onClick={() => void commands.showArchiveFolder("library")}>
          <FolderOpen className="size-4" />
          {d.showLibrary}
        </Button>
      </div>

      <div className="py-3">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-fg">{d.backups}</p>
            <p className="text-xs text-fg-subtle">{d.backupsHint}</p>
            {info && (
              <p className="mt-1 truncate font-mono text-xs text-fg-muted" title={info.backupDir}>
                {info.backupDir}
              </p>
            )}
          </div>
          <Button variant="hardware" onClick={() => void commands.showArchiveFolder("backups")}>
            <FolderOpen className="size-4" />
            {d.showBackups}
          </Button>
          <Button variant="hardware" onClick={() => void backupNow()} disabled={busy}>
            <HardDriveDownload className="size-4" />
            {d.backupNow}
          </Button>
        </div>
        <ul className="well mt-2 max-h-48 overflow-y-auto rounded-control px-3 py-1 font-mono text-xs text-fg-muted tabular">
          {info?.backups.length === 0 && <li className="py-1">{d.noBackups}</li>}
          {info?.backups.map((backup) => (
            <li key={backup.name} className="flex items-center gap-3 py-1">
              <span className="text-fg">{when(backup)}</span>
              <span className="flex-1">{d.kindsBackup[backup.kind]}</span>
              <span>{formatBytes(backup.bytes ?? 0)}</span>
              {asking === backup.name ? (
                <span className="flex items-center gap-2 font-sans">
                  <span className="text-fg">{d.restoreConfirm(when(backup))}</span>
                  <Button
                    variant="hardware"
                    disabled={busy}
                    onClick={() => void restore(backup.name)}
                  >
                    {d.restoreYes}
                  </Button>
                  <Button variant="hardware" onClick={() => setAsking(null)}>
                    {d.restoreNo}
                  </Button>
                </span>
              ) : (
                <Button variant="hardware" disabled={busy} onClick={() => setAsking(backup.name)}>
                  <History className="size-3.5" />
                  {d.restore}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {message && <p className="mt-2 text-xs text-fg-muted">{message}</p>}
      </div>

      <div className="flex items-center gap-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-fg">{d.mirror}</p>
          <p className="text-xs text-fg-subtle">{d.mirrorHint}</p>
          <p
            className="mt-1 truncate font-mono text-xs text-fg-muted"
            title={info?.mirrorDir ?? ""}
          >
            {info?.mirrorDir ?? d.mirrorOff}
          </p>
        </div>
        {info?.mirrorDir && (
          <>
            <Button variant="hardware" onClick={() => void commands.showArchiveFolder("mirror")}>
              <FolderOpen className="size-4" />
              {d.showBackups}
            </Button>
            <Button variant="hardware" onClick={() => void stopMirror()}>
              <X className="size-4" />
              {d.mirrorStop}
            </Button>
          </>
        )}
        <Button variant="hardware" onClick={() => void chooseMirror()}>
          <FolderOpen className="size-4" />
          {d.mirrorChoose}
        </Button>
      </div>

      <div className="flex items-center gap-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-fg">{d.stems}</p>
          <p className="text-xs text-fg-subtle">{d.stemsHint}</p>
          <p className="mt-1 truncate font-mono text-xs text-fg-muted" title={info?.stemsDir ?? ""}>
            {info?.stemsDir}
            {info && !info.stemsDirChosen && ` (${d.stemsDefault})`}
          </p>
        </div>
        <Button variant="hardware" onClick={() => void commands.showArchiveFolder("stems")}>
          <FolderOpen className="size-4" />
          {d.showBackups}
        </Button>
        {info?.stemsDirChosen && (
          <Button variant="hardware" onClick={() => void setStemsFolder(null)}>
            <RotateCcw className="size-4" />
            {d.stemsReset}
          </Button>
        )}
        <Button variant="hardware" onClick={() => void chooseStemsFolder()}>
          <FolderOpen className="size-4" />
          {d.mirrorChoose}
        </Button>
      </div>
    </>
  );
}
