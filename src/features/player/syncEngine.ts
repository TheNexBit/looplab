import { commands } from "@/lib/bindings";
import { useLoopStore } from "@/stores/loop";

/**
 * Sends every loop change to the engine. Started once by the app shell.
 * Runs on each change while dragging too: the command is tiny and the engine
 * applies it at the next audio block.
 */
export function syncLoopWithEngine(): () => void {
  let last = "";
  return useLoopStore.subscribe((loop) => {
    const region = loop.region();
    const settings = {
      enabled: loop.enabled && region !== null,
      start: region?.start ?? 0,
      end: region?.end ?? 0,
      leadIn: loop.leadIn,
      gap: loop.gap,
    };
    const key = JSON.stringify(settings);
    if (key === last) return;
    last = key;
    void commands.setLoop(settings);
  });
}
