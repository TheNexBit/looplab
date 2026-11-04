import { AnimatePresence, motion } from "motion/react";
import { t } from "@/i18n";

/** Shown over an open track while a file is dragged onto the window. */
export function DropOverlay({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-panel border-2 border-dashed border-accent bg-bg-to/80 text-lg font-semibold"
        >
          {t.empty.dropNow}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
