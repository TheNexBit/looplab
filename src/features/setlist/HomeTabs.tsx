import { GraduationCap, ListMusic } from "lucide-react";
import { tabTrigger } from "@/components/ui/menu";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { useSettingsStore } from "@/stores/settings";

type HomeView = "courses" | "setlists";

const TABS: { id: HomeView; label: string; Icon: typeof ListMusic }[] = [
  { id: "courses", label: t.setlist.tabCourses, Icon: GraduationCap },
  { id: "setlists", label: t.setlist.tabSetlists, Icon: ListMusic },
];

/** What the left of the Home shows, like the browser tabs of a DAW: courses or setlists. */
export function HomeTabs() {
  const view = useSettingsStore((s) => s.homeView);
  return (
    <div role="tablist" aria-label={t.setlist.homeTabs} className="flex shrink-0 gap-1">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={view === id}
          data-state={view === id ? "active" : "inactive"}
          onClick={() => useSettingsStore.getState().update({ homeView: id })}
          className={cn(tabTrigger, "flex items-center gap-1.5 px-3")}
        >
          <Icon className="size-3.5" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
