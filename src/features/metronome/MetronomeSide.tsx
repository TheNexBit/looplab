import { ListOrdered, LogOut } from "lucide-react";
import { Tabs } from "radix-ui";
import { Button } from "@/components/ui/Button";
import { tabTrigger } from "@/components/ui/menu";
import { t } from "@/i18n";
import { playedPart, useMetronomeStore } from "@/stores/metronome";
import { ExercisesPanel } from "./ExercisesPanel";
import { SequencesPanel, SongsPanel, setupSummary } from "./LibraryPanels";
import { SoundsPanel } from "./SoundsPanel";

const m = t.metronome;

/** Beside the bar: the exercises, the saved songs, the sequences and the sounds, one tab each. */
export function MetronomeSide() {
  const tabs = [
    ["exercises", m.tabs.exercises, <ExercisesPanel key="exercises" />],
    ["songs", m.tabs.songs, <SongsPanel key="songs" />],
    ["sequences", m.tabs.sequences, <SequencesPanel key="sequences" />],
    ["sounds", m.tabs.sounds, <SoundsPanel key="sounds" />],
  ] as const;
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-edge bg-bg-from">
      <Tabs.Root defaultValue="exercises" className="flex min-h-0 flex-1 flex-col">
        {/* As in the side panel: a clear gap, and a second row rather than cramped labels */}
        <Tabs.List className="flex flex-wrap gap-1.5 border-b border-edge p-2">
          {tabs.map(([id, label]) => (
            <Tabs.Trigger key={id} value={id} className={`${tabTrigger} min-w-fit flex-1 px-2.5`}>
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {tabs.map(([id, , panel]) => (
          <Tabs.Content key={id} value={id} className="min-h-0 flex-1 overflow-y-auto p-3">
            {panel}
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </aside>
  );
}

/**
 * While a sequence is on, a strip says which one and which part plays, with what to play in
 * it; the own controls rest until "Leave the sequence".
 */
export function SequenceBanner() {
  const sequence = useMetronomeStore((s) => s.sequence);
  const segment = useMetronomeStore((s) => s.segment);
  if (!sequence) return null;
  const part = playedPart({ sequence, segment });
  return (
    <div className="flex items-center gap-3 rounded-panel border border-accent/50 bg-accent-soft px-3 py-2">
      <ListOrdered className="size-4 shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {sequence.name} · {m.library.partOf(segment + 1, sequence.parts.length)}
        </p>
        {part && (
          <p className="truncate font-mono text-xs text-fg-muted">
            {setupSummary(part.setup)} · ×{part.bars}
            {part.note && ` · ${part.note}`}
          </p>
        )}
      </div>
      <Button
        variant="hardware"
        className="shrink-0"
        onClick={() => useMetronomeStore.getState().playSequence(null)}
      >
        <LogOut className="size-3.5" />
        {m.library.leave}
      </Button>
    </div>
  );
}
