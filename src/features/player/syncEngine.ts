import { commands } from "@/lib/bindings";
import { eqToRust, useEqStore } from "@/stores/eq";
import { useLoopStore } from "@/stores/loop";
import { usePlayerStore } from "@/stores/player";

/** Sends a value only when it differs from the last one sent (or when forced). */
function sender<T>(send: (value: T) => unknown) {
  let last = "";
  return (value: T, force = false) => {
    const key = JSON.stringify(value);
    if (!force && key === last) return;
    last = key;
    void send(value);
  };
}

/**
 * Keeps the engine in step with the loop, EQ and channel stores. Started once by the
 * app shell. Runs on every change while dragging too: commands are tiny and the engine
 * applies them at the next audio block. Everything is re-sent when a track opens, in
 * case the engine was restarted (e.g. after the audio device changed).
 */
export function syncWithEngine(): () => void {
  const sendLoop = sender(commands.setLoop);
  const sendEq = sender(commands.setEq);
  const sendChannels = sender(commands.setChannelMode);

  const loopSettings = () => {
    const loop = useLoopStore.getState();
    const region = loop.region();
    return {
      enabled: loop.enabled && region !== null,
      start: region?.start ?? 0,
      end: region?.end ?? 0,
      leadIn: loop.leadIn,
      gap: loop.gap,
    };
  };
  const pushAll = (force: boolean) => {
    sendLoop(loopSettings(), force);
    const eq = useEqStore.getState();
    if (eq.settings.bands.length > 0) sendEq(eqToRust(eq.settings), force);
    sendChannels(eq.channels, force);
  };

  const stops = [
    useLoopStore.subscribe(() => sendLoop(loopSettings())),
    useEqStore.subscribe(() => pushAll(false)),
    usePlayerStore.subscribe((state, previous) => {
      if (state.track && state.track !== previous.track) pushAll(true);
    }),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
