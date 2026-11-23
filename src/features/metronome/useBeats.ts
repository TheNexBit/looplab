import { useRef } from "react";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { currentPulses, pulsesPerSecond, shownSetup, useMetronomeStore } from "@/stores/metronome";
import { feltBeatSpans } from "./beatGrid";

/** What a pulse that just started is: a count-in click, an accent, a beat; muted pulses are skipped. */
type BeatKind = "countIn" | "accent" | "beat";

/** Where a beat falls: its pulse in the bar (0 = the first) and how long a pulse lasts. */
interface BeatInfo {
  pulse: number;
  seconds: number;
}

/**
 * Calls `onBeat` once on every pulse the metronome plays, from the animation frame (outside
 * React, so nothing re-renders). The kind follows the pattern the player set: the felt beat
 * a pulse opens decides accent or normal, and the pulses of a muted beat are skipped, as the
 * clicks are.
 */
export function useBeats(onBeat: (kind: BeatKind, info: BeatInfo) => void) {
  const callback = useRef(onBeat);
  callback.current = onBeat;
  const last = useRef<number | null>(null);

  useAnimationFrame(() => {
    const pulses = currentPulses();
    if (pulses === null) {
      last.current = null;
      return;
    }
    const whole = Math.floor(pulses + 1e-9);
    if (whole === last.current) return;
    last.current = whole;
    const setup = shownSetup(useMetronomeStore.getState());
    const pulse = ((whole % setup.beats) + setup.beats) % setup.beats;
    const info = { pulse, seconds: 1 / Math.max(pulsesPerSecond(setup), 0.01) };
    if (whole < 0) {
      callback.current("countIn", info);
      return;
    }
    const spans = feltBeatSpans(setup.beats, setup.grouping);
    const beat = spans.findIndex((b) => pulse >= b.first && pulse < b.first + b.size);
    const state = beat < 0 ? "normal" : (setup.states[beat] ?? "normal");
    if (state === "muted") return;
    const opens = spans[beat]?.first === pulse;
    callback.current(state === "accent" && opens ? "accent" : "beat", info);
  });
}

/** Restarts a CSS animation: remove the class, force a reflow, add it back. */
export function restartAnimation(element: Element | null, className: string) {
  if (!element) return;
  element.classList.remove(className);
  void element.getBoundingClientRect();
  element.classList.add(className);
}
