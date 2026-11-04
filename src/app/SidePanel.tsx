import { AnimatePresence, motion } from "motion/react";
import { Tabs } from "radix-ui";
import { t } from "@/i18n";
import { type SidePanelTab, useUiStore } from "@/stores/ui";

const WIDTH = 300;

const tabs: { id: SidePanelTab; label: string; empty: string }[] = [
  { id: "sections", label: t.sidePanel.sections, empty: t.sidePanel.sectionsEmpty },
  { id: "eq", label: t.sidePanel.eq, empty: t.sidePanel.eqEmpty },
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
          className="shrink-0 overflow-hidden border-l border-border"
        >
          <Tabs.Root
            value={tab}
            onValueChange={(value) => setTab(value as SidePanelTab)}
            className="flex h-full flex-col"
            style={{ width: WIDTH }}
          >
            <Tabs.List className="flex gap-1 border-b border-border p-2">
              {tabs.map(({ id, label }) => (
                <Tabs.Trigger
                  key={id}
                  value={id}
                  className="h-7 rounded-control px-3 text-sm text-fg-muted transition-colors hover:text-fg data-[state=active]:bg-surface-hover data-[state=active]:text-fg"
                >
                  {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            {tabs.map(({ id, empty }) => (
              <Tabs.Content key={id} value={id} className="flex-1 p-4 text-sm text-fg-subtle">
                {empty}
              </Tabs.Content>
            ))}
          </Tabs.Root>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
