import { AnimatePresence, motion } from "motion/react";
import { Tabs } from "radix-ui";
import type { ReactNode } from "react";
import { tabTrigger } from "@/components/ui/menu";
import { EqPanel } from "@/features/eq/EqPanel";
import { SectionList } from "@/features/markers/SectionList";
import { PracticePanel } from "@/features/practice/PracticePanel";
import { t } from "@/i18n";
import { type SidePanelTab, useUiStore } from "@/stores/ui";

const WIDTH = 300;

const tabs: { id: SidePanelTab; label: string; content: ReactNode }[] = [
  { id: "sections", label: t.sidePanel.sections, content: <SectionList /> },
  { id: "practice", label: t.sidePanel.practice, content: <PracticePanel /> },
  { id: "eq", label: t.sidePanel.eq, content: <EqPanel /> },
];

export function SidePanel() {
  const open = useUiStore((s) => s.sidePanelOpen);
  const tab = useUiStore((s) => s.sidePanelTab);
  const setTab = useUiStore((s) => s.setSidePanelTab);

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          key="side-panel"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: WIDTH, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          className="shrink-0 overflow-hidden border-l border-edge bg-bg-from shadow-[inset_1px_0_0_rgb(255_255_255/0.03)]"
        >
          <Tabs.Root
            value={tab}
            onValueChange={(value) => setTab(value as SidePanelTab)}
            className="flex h-full flex-col"
            style={{ width: WIDTH }}
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
