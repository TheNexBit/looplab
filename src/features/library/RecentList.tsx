import { FileAudio, X } from "lucide-react";
import { useEffect } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { usePlayerStore } from "@/stores/player";
import { useRecentStore } from "@/stores/recent";

/** Recently opened tracks on the empty screen; missing files are dimmed and can be removed. */
export function RecentList() {
  const files = useRecentStore((s) => s.files);
  const { refresh, forget } = useRecentStore.getState();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (files.length === 0) return null;

  return (
    <section className="w-full max-w-xl">
      <h2 className="mb-2 text-xs font-medium tracking-wide text-fg-subtle uppercase">
        {t.recent.title}
      </h2>
      <ul className="space-y-0.5">
        {files.map((file) => (
          <li key={file.path} className="group flex items-center gap-1">
            <button
              type="button"
              disabled={!file.exists}
              title={file.exists ? file.path : `${t.recent.missing}: ${file.path}`}
              onClick={() => void usePlayerStore.getState().open(file.path)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm transition-colors",
                file.exists
                  ? "text-fg-muted hover:bg-surface-hover hover:text-fg"
                  : "text-fg-subtle line-through",
              )}
            >
              <FileAudio className="size-4 shrink-0" />
              <span className="truncate">{file.name}</span>
            </button>
            <button
              type="button"
              onClick={() => void forget(file.path)}
              aria-label={t.recent.forget}
              title={t.recent.forget}
              className="rounded-control p-1 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
