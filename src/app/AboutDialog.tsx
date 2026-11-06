import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { t } from "@/i18n";
import { type AppInfo, commands } from "@/lib/bindings";
import { useUiStore } from "@/stores/ui";
// Single source of the credits: the same file ships with the installer
import licenses from "../../docs/THIRD_PARTY_LICENSES.md?raw";
import { checkForUpdates, updateMessage } from "./updates";

/** Version, update check and third-party licenses. */
export function AboutDialog() {
  const open = useUiStore((s) => s.dialog === "about");
  const close = useUiStore((s) => s.closeDialog);
  const [info, setInfo] = useState<AppInfo>();
  const [update, setUpdate] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (open) void commands.appInfo().then(setInfo);
    else setUpdate(null);
  }, [open]);

  const check = async () => {
    setChecking(true);
    setUpdate(updateMessage(await checkForUpdates()));
    setChecking(false);
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t.about.title}
      className="w-[min(44rem,calc(100vw-2rem))]"
    >
      <div className="space-y-3 px-4 pt-3 pb-4">
        <div className="flex items-center gap-3">
          {info && (
            <p className="flex-1 text-sm text-fg-muted tabular">
              {info.name} {info.version} · {t.app.engine} {info.engineVersion}
            </p>
          )}
          <Button onClick={() => void check()} disabled={checking}>
            <RefreshCw className={checking ? "size-4 animate-spin" : "size-4"} />
            {t.updates.check}
          </Button>
        </div>
        {update && <p className="text-sm text-fg-muted">{update}</p>}
        <pre className="max-h-[60vh] overflow-auto well rounded-control p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-fg-muted select-text">
          {licenses}
        </pre>
      </div>
    </Dialog>
  );
}
