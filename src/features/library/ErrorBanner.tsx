import { AlertCircle, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { t } from "@/i18n";
import { usePlayerStore } from "@/stores/player";

/** Problem with the last action, with a retry when there is a file to reopen. */
export function ErrorBanner() {
  const load = usePlayerStore((s) => s.load);
  const open = usePlayerStore((s) => s.open);
  const dismiss = usePlayerStore((s) => s.dismissError);
  const error = load.kind === "error" ? load : null;

  return (
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          role="alert"
          className="absolute top-3 left-1/2 z-40 flex max-w-lg -translate-x-1/2 items-center gap-3 rounded-panel border border-border bg-bg-from py-2 pr-2 pl-4 text-sm shadow-lg"
        >
          <AlertCircle className="size-4 shrink-0 text-accent" />
          <span className="text-fg">{t.errors[error.error.kind]}</span>
          {error.path && error.error.kind !== "unsupportedFormat" && (
            <Button onClick={() => void open(error.path)}>{t.library.retry}</Button>
          )}
          <Button size="icon" onClick={dismiss} aria-label={t.library.dismiss}>
            <X className="size-4" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
