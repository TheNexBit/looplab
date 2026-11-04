import { useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { EmptyState } from "@/features/library/EmptyState";
import { TransportDock } from "@/features/player/TransportDock";
import { t } from "@/i18n";
import { type AppInfo, commands } from "@/lib/bindings";
import { SidePanel } from "./SidePanel";
import { TopBar } from "./TopBar";

export function App() {
  const [info, setInfo] = useState<AppInfo>();

  useEffect(() => {
    commands.appInfo().then(setInfo);
  }, []);

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <main className="relative min-w-0 flex-1">
            <EmptyState />
            {info && (
              <span className="absolute right-3 bottom-2 text-[11px] text-fg-subtle tabular">
                {info.name} {info.version} · {t.app.engine} {info.engineVersion}
              </span>
            )}
          </main>
          <SidePanel />
        </div>
        <TransportDock />
      </div>
    </TooltipProvider>
  );
}
