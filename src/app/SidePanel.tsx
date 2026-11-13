import { AnimatePresence, motion } from "motion/react";
import { Tabs } from "radix-ui";
import { type ReactNode, useState } from "react";
import { tabTrigger } from "@/components/ui/menu";
import { ResizeHandle } from "@/components/ui/ResizeHandle";
import { EqPanel } from "@/features/eq/EqPanel";
import { SectionList } from "@/features/markers/SectionList";
import { PracticePanel } from "@/features/practice/PracticePanel";
import { StemsPanel } from "@/features/stems/StemsPanel";
import { t } from "@/i18n";
import { SIDE_PANEL_WIDTH, type SidePanelTab, useUiStore } from "@/stores/ui";

const tabs: { id: SidePanelTab; label: string; content: ReactNode }[] = [
  { id: "sections", label: t.sidePanel.sections, content: <SectionList /> },
  { id: "practice", label: t.sidePanel.practice, content: <PracticePanel /> },
  { id: "eq", label: t.sidePanel.eq, content: <EqPanel /> },
  { id: "stems", label: t.sidePanel.stems, content: <StemsPanel /> },
];

export function SidePanel() {
  const open = useUiStore((s) => s.sidePanelOpen);
  const tab = useUiStore((s) => s.sidePanelTab);
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
            <Tabs.List className="flex gap-0.5 border-b border-edge p-2">
              {tabs.map(({ id, label }) => (
                <Tabs.Trigger key={id} value={id} className={`${tabTrigger} flex-1`}>
                  {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            {tabs.map(({ id, content }) => (
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
