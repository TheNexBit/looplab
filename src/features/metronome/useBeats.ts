import { useRef } from "react";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { currentPulses, shownSetup, useMetronomeStore } from "@/stores/metronome";
import { feltBeatSpans } from "./BeatStrip";

/** What a pulse that just started is: a count-in click, an accent, a beat; muted pulses are skipped. */
export type BeatKind = "countIn" | "accent" | "beat";

/**
 * Calls `onBeat` once on every pulse the metronome plays, from the animation frame (outside
 * React, so nothing re-renders). The kind follows the pattern the player set: the felt beat
 * a pulse opens decides accent, normal or muted, the same beats the accent click sounds on.
 */
export function useBeats(onBeat: (kind: BeatKind) => void) {
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
    if (whole < 0) {
      callback.current("countIn");
      return;
    }
    const setup = shownSetup(useMetronomeStore.getState());
    const inBar = ((whole % setup.beats) + setup.beats) % setup.beats;
    const beat = feltBeatSpans(setup.beats, setup.grouping).findIndex((b) => b.first === inBar);
    const state = beat < 0 ? "normal" : (setup.states[beat] ?? "normal");
    if (state === "muted") return;
    callback.current(state === "accent" ? "accent" : "beat");
  });
}

/** Restarts a CSS animation: remove the class, force a reflow, add it back. */
export function restartAnimation(element: Element | null, className: string) {
  if (!element) return;
  element.classList.remove(className);
  void element.getBoundingClientRect();
  element.classList.add(className);
}
