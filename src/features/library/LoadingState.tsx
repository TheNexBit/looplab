import { t } from "@/i18n";
import { usePlayerStore } from "@/stores/player";

export function LoadingState() {
  const load = usePlayerStore((s) => s.load);
  if (load.kind !== "loading") return null;
  const name = load.path.split(/[\\/]/).pop();
  const percent = Math.round(load.progress * 100);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <p className="max-w-md truncate text-sm text-fg-muted">{name}</p>
      <div className="h-1.5 w-72 overflow-hidden rounded-full bg-surface-hover">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-150"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-fg-subtle tabular">
        {t.library.loading}… {percent}%
      </p>
    </div>
  );
}
