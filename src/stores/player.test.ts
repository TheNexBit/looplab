import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The engine is not there in tests: every command succeeds and does nothing
vi.mock("@/lib/bindings", () => ({
  commands: new Proxy({}, { get: () => () => Promise.resolve({ status: "ok", data: null }) }),
}));

const { useLoopStore } = await import("./loop");
const { currentPosition, usePlayerStore } = await import("./player");
const { usePracticeStore } = await import("./practice");
const { useSettingsStore } = await import("./settings");

describe("playhead during a count-in between repetitions", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["performance", "Date"] });
    usePlayerStore.setState({
      track: { path: "x", name: "x", duration: 60, sourceSampleRate: 48_000 },
      playing: true,
      speed: 1,
      anchorPosition: 13,
      anchorTime: performance.now(),
      holdUntil: 0,
    });
    useLoopStore.setState({ start: 10, end: 14, enabled: true, leadIn: 0, gap: 0 });
    // 4 beats at 120 BPM: a 2 s count-in before every repetition
    usePracticeStore.getState().setBpm(120);
    useSettingsStore.getState().update({ countIn: 4, trainer: false });
  });
  afterEach(() => vi.useRealTimers());

  const status = (position: number) => ({ position, playing: true, loops: 1, deviceLost: false });

  it("waits at the loop start while the beats are counted", () => {
    vi.advanceTimersByTime(1_500); // 1 s to the loop end, then 0.5 s into the count-in
    expect(currentPosition()).toBe(10);
  });

  it("keeps waiting when the engine reports in the middle of it", () => {
    vi.advanceTimersByTime(1_500);
    usePlayerStore.getState().applyStatus(status(10));
    vi.advanceTimersByTime(400);
    expect(currentPosition()).toBe(10);
    // 1 s to the loop end + 2 s of count-in: from 3 s after the anchor the repetition plays on
    vi.advanceTimersByTime(2_100);
    expect(currentPosition()).toBeCloseTo(11, 5);
  });

  it("keeps waiting when the speed changes in the middle of it (speed trainer)", () => {
    vi.advanceTimersByTime(1_500);
    usePlayerStore.getState().setSpeed(0.5);
    vi.advanceTimersByTime(2_000);
    // 1.5 s of count-in left in track time lasts 3 s at half speed
    expect(currentPosition()).toBe(10);
    vi.advanceTimersByTime(3_000);
    expect(currentPosition()).toBeCloseTo(11, 5);
  });
});
