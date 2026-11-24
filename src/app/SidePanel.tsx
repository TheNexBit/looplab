import { AnimatePresence, motion } from "motion/react";
import { Tabs } from "radix-ui";
import { type ReactNode, useState } from "react";
import { tabTrigger } from "@/components/ui/menu";
import { ResizeHandle } from "@/components/ui/ResizeHandle";
import { EqPanel } from "@/features/eq/EqPanel";
import { SectionList } from "@/features/markers/SectionList";
import { PracticePanel } from "@/features/practice/PracticePanel";
import { useLiveStore } from "@/features/setlist/live";
import { SetlistPanel } from "@/features/setlist/SetlistPanel";
import { StemsPanel } from "@/features/stems/StemsPanel";
import { t } from "@/i18n";
import { SIDE_PANEL_WIDTH, type SidePanelTab, useUiStore } from "@/stores/ui";

const tabs: { id: SidePanelTab; label: string; content: ReactNode }[] = [
  { id: "sections", label: t.sidePanel.sections, content: <SectionList /> },
  { id: "practice", label: t.sidePanel.practice, content: <PracticePanel /> },
  { id: "eq", label: t.sidePanel.eq, content: <EqPanel /> },
  { id: "stems", label: t.sidePanel.stems, content: <StemsPanel /> },
  { id: "setlist", label: t.sidePanel.setlist, content: <SetlistPanel /> },
];

export function SidePanel() {
  const open = useUiStore((s) => s.sidePanelOpen);
  const setMode = useLiveStore((s) => s.active);
  const chosen = useUiStore((s) => s.sidePanelTab);
  // The setlist belongs to set mode: studying a single track never finds it in the way
  const tab = chosen === "setlist" && !setMode ? "sections" : chosen;
  const shown = tabs.filter(({ id }) => id !== "setlist" || setMode);
  const setTab = useUiStore((s) => s.setSidePanelTab);
  const width = useUiStore((s) => s.sidePanelWidth);
  // While dragging the width follows the pointer at once, without the opening animation
  const [resizing, setResizing] = useState(false);

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          key="side-panel"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={resizing ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0, 0, 1] }}
          className="relative flex shrink-0 overflow-hidden border-l border-edge bg-bg-from shadow-[inset_1px_0_0_var(--color-sheen)]"
        >
          {/* Drag the left edge to widen or narrow the panel; double-click for the usual width */}
          <ResizeHandle
            grows="before"
            label={t.sidePanel.resize}
            size={() => useUiStore.getState().sidePanelWidth}
            onResize={(next) => useUiStore.getState().setSidePanelWidth(next)}
            onStart={() => setResizing(true)}
            onEnd={() => setResizing(false)}
            onReset={() => useUiStore.getState().setSidePanelWidth(SIDE_PANEL_WIDTH.default)}
            look="edge"
          />
          <Tabs.Root
            value={tab}
            onValueChange={(value) => setTab(value as SidePanelTab)}
            className="flex h-full flex-col"
            style={{ width }}
          >
            {/* Keys keep a clear gap and wrap onto a second row when the panel is narrow */}
            <Tabs.List className="flex flex-wrap gap-1.5 border-b border-edge p-2">
              {shown.map(({ id, label }) => (
                <Tabs.Trigger
                  key={id}
                  value={id}
                  className={`${tabTrigger} min-w-fit flex-1 px-2.5`}
                >
                  {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            {shown.map(({ id, content }) => (
              <Tabs.Content key={id} value={id} className="min-h-0 flex-1">
                {content}
              </Tabs.Content>
            ))}
          </Tabs.Root>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
