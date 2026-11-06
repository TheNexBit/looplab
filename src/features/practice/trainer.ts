import { useLoopStore } from "@/stores/loop";
import { usePlayerStore } from "@/stores/player";
import { usePracticeStore } from "@/stores/practice";
import { type Settings, useSettingsStore } from "@/stores/settings";
import { type TrainerPlan, trainerSpeed } from "./tempo";

export const trainerPlan = (settings: Settings): TrainerPlan => ({
  from: settings.trainerFrom,
  to: settings.trainerTo,
  step: settings.trainerStep,
  every: settings.trainerEvery,
});

/**
 * Counts loop repetitions (from the engine's wrap counter) and, with the speed trainer on,
 * sets the speed for each one. The count starts over when the loop, the track or the
 * trainer changes. Started once by the app shell; returns the function that stops it.
 */
export function startTrainer(): () => void {
  const applySpeed = () => {
    const settings = useSettingsStore.getState();
    if (!settings.trainer) return;
    const speed = trainerSpeed(trainerPlan(settings), usePracticeStore.getState().repetitions);
    usePlayerStore.getState().setSpeed(speed);
  };
  const restart = () => {
    usePracticeStore.getState().resetRepetitions();
    applySpeed();
  };

  const stops = [
    usePlayerStore.subscribe((state, previous) => {
      if (state.track?.path !== previous.track?.path) {
        usePracticeStore.getState().resetRepetitions();
        return;
      }
      const loop = useLoopStore.getState();
      if (state.loops > previous.loops && state.playing && loop.enabled && loop.region()) {
        usePracticeStore.getState().countRepetition();
        applySpeed();
      }
    }),
    useLoopStore.subscribe((state, previous) => {
      if (state.start !== previous.start || state.end !== previous.end) restart();
    }),
    useSettingsStore.subscribe((state, previous) => {
      const plan = trainerPlan(state);
      const before = trainerPlan(previous);
      const changed =
        state.trainer !== previous.trainer ||
        plan.from !== before.from ||
        plan.to !== before.to ||
        plan.step !== before.step ||
        plan.every !== before.every;
      if (changed) restart();
    }),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
