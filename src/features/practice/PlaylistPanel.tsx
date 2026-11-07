import { ChevronDown, ChevronUp, ListPlus, Play, Square, X } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/Button";
import { menuContent, menuItem } from "@/components/ui/menu";
import { Stepper } from "@/components/ui/Stepper";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { REPEATS, usePlaylistStore } from "@/stores/playlist";
import { useSavedLoopsStore } from "@/stores/savedLoops";
import { togglePlaylist } from "./playlist";

const l = t.playlist;
const times = (value: number) => `×${value}`;

/** Adds a saved loop at the end of the playlist. */
function AddStep() {
  const loops = useSavedLoopsStore((s) => s.loops);
  return (
    <DropdownMenu.Root>
      <Tooltip label={l.addHint}>
        <DropdownMenu.Trigger asChild>
          <Button variant="hardware" className="h-6 px-2" disabled={loops.length === 0}>
            <ListPlus className="size-3.5" />
            {l.add}
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={menuContent}>
          {loops.map((loop) => (
            <DropdownMenu.Item
              key={loop.id}
              className={menuItem}
              onSelect={() => usePlaylistStore.getState().add(loop.id)}
            >
              <span className="truncate">{loop.name}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Practice playlist: saved loops in order, each played a number of times, then the next one,
 * like a setlist of exercises. Play runs it from the top; the step playing is lit.
 */
export function PlaylistPanel() {
  const steps = usePlaylistStore((s) => s.steps);
  const current = usePlaylistStore((s) => s.current);
  const pass = usePlaylistStore((s) => s.pass);
  const loops = useSavedLoopsStore((s) => s.loops);
  const running = current !== null;
  const { remove, setRepeats, move } = usePlaylistStore.getState();

  return (
    <section>
      <div className="flex items-center justify-between gap-1.5 px-2 pb-1.5">
        <Tooltip label={l.hint}>
          <h3 className="panel-label flex-1 cursor-help">{l.title}</h3>
        </Tooltip>
        <AddStep />
        <Tooltip label={running ? l.stop : l.play} shortcut="togglePlaylist">
          <Button
            variant="hardware"
            className="h-6 px-2"
            disabled={steps.length === 0}
            aria-pressed={running}
            onClick={togglePlaylist}
          >
            {running ? (
              <Square className="size-3 fill-current" />
            ) : (
              <Play className="size-3 fill-current" />
            )}
            {running ? l.stopShort : l.playShort}
          </Button>
        </Tooltip>
      </div>
      {steps.length === 0 ? (
        <p className="px-2 text-sm text-fg-subtle">{loops.length === 0 ? l.needsLoops : l.empty}</p>
      ) : (
        <ol>
          {steps.map((step, index) => {
            const loop = loops.find((saved) => saved.id === step.loopId);
            const playing = current === index;
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: a loop can be in the playlist twice
                key={index}
                className={cn(
                  "group flex h-[30px] items-center gap-1.5 rounded-control border px-2",
                  playing
                    ? "border-loop/50 bg-loop-soft"
                    : "border-transparent hover:border-edge hover:bg-well",
                )}
              >
                <span className="w-4 shrink-0 font-mono text-[11px] text-fg-subtle tabular">
                  {index + 1}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    playing ? "text-fg" : "text-fg-muted",
                  )}
                >
                  {loop?.name ?? "—"}
                </span>
                {playing && (
                  <span className="font-mono text-[11px] text-readout tabular">
                    {pass}/{step.repeats}
                  </span>
                )}
                <Stepper
                  label={`${l.repeats} ${index + 1}`}
                  value={step.repeats}
                  {...REPEATS}
                  defaultValue={REPEATS.default}
                  onChange={(repeats) => setRepeats(index, repeats)}
                  format={times}
                />
                <span className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  <Button
                    size="icon"
                    className="size-5"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={l.moveUp}
                  >
                    <ChevronUp className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    className="size-5"
                    disabled={index === steps.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={l.moveDown}
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    className="size-5"
                    onClick={() => remove(index)}
                    aria-label={l.remove}
                  >
                    <X className="size-3.5" />
                  </Button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
