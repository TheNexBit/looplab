import { create } from "zustand";
import { clamp } from "@/lib/time";

/** Narrowest and default visible time span of the detailed waveform, in seconds. */
export const MIN_SPAN = 0.25;
const DEFAULT_SPAN = 30;
/** Share of the remaining distance covered per frame by the zoom animation. */
const EASE = 0.3;
/** After a manual scroll, following waits this long before catching the playhead again. */
const MANUAL_PAUSE_MS = 2_000;

export interface ViewWindow {
  start: number;
  span: number;
}

/** Keeps a view window inside the track. */
export function clampView({ start, span }: ViewWindow, duration: number): ViewWindow {
  const fitted = clamp(span, Math.min(MIN_SPAN, duration), Math.max(duration, MIN_SPAN));
  return { start: clamp(start, 0, Math.max(0, duration - fitted)), span: fitted };
}

/** Zoom by `factor` (> 1 zooms out) keeping `anchor` at the same place on screen. */
export function zoomWindow(
  view: ViewWindow,
  factor: number,
  anchor: number,
  duration: number,
): ViewWindow {
  const fraction = (anchor - view.start) / view.span;
  const span = view.span * factor;
  return clampView({ start: anchor - fraction * span, span }, duration);
}

/** Farthest a hand drag can pull the view past an end of the track, as a share of the span. */
const STRETCH = 0.2;

/**
 * Where a view pulled `past` seconds beyond an end of the track is shown: it still moves
 * with the hand, ever more stiffly, and never further than `STRETCH` of `span` (like the
 * elastic edge of a touch screen list).
 */
export function stretched(past: number, span: number): number {
  const most = span * STRETCH;
  return Math.sign(past) * most * (1 - 1 / (Math.abs(past) / most + 1));
}

/** True when `view` shows the whole track (within a hair). */
export const showsWhole = (view: ViewWindow, duration: number) =>
  duration > 0 && view.start <= 1e-6 && view.span >= duration * 0.999;

interface ViewState extends ViewWindow {
  duration: number;
  /** Where the zoom animation is heading */
  target: ViewWindow;
  /**
   * Until this time (performance.now) following is paused, because the user moved the view
   * by hand. It resumes by itself: following is never switched off behind the user's back
   * (the on/off switch is the `followPlayhead` setting).
   */
  manualUntil: number;
  /** The zoom before "whole track", so pressing it again goes back there */
  beforeWhole: ViewWindow | null;
  /**
   * Whole track on screen, like Reaper's "zoom out project"; pressed again (while still
   * showing the whole track) it glides back to the zoom it came from.
   */
  toggleWhole: () => void;
  /** A new track: the first 30 seconds, or the whole track with `whole` */
  reset: (duration: number, whole?: boolean) => void;
  /** The track length changed (it finished loading): keeps the zoom and position */
  setDuration: (duration: number) => void;
  zoom: (factor: number, anchor: number) => void;
  scrollBy: (seconds: number) => void;
  scrollTo: (start: number) => void;
  /**
   * The view dragged by hand to `start`: past either end of the track it stretches
   * instead of stopping dead, so something always moves under the hand; `settle` lets go.
   */
  pan: (start: number) => void;
  /** End of a hand drag: a stretched view glides back to the end of the track. */
  settle: () => void;
  centerOn: (time: number) => void;
  /** Follow again right away (after a seek or when playback starts). */
  resumeFollow: () => void;
  /**
   * The view is held by the hand (a drag): following waits for as long as it is held, even
   * with the mouse still, and the usual pause starts once it is let go.
   */
  holdFollow: (held: boolean) => void;
  /**
   * Keeps the playhead visible: "center" scrolls smoothly once it passes the middle;
   * "page" turns the page when it reaches the right edge, like Reaper.
   */
  followPlayhead: (position: number, mode?: "center" | "page") => void;
  /** Advances the zoom and scroll animation by one frame. */
  step: () => void;
}

/** Visible part of the track in the detailed waveform. Read it with getState() in animation loops. */
export const useViewStore = create<ViewState>((set, get) => {
  const jump = (next: ViewWindow) => {
    const fitted = clampView(next, get().duration);
    set({ ...fitted, target: fitted });
  };

  return {
    duration: 0,
    start: 0,
    span: DEFAULT_SPAN,
    target: { start: 0, span: DEFAULT_SPAN },
    manualUntil: 0,
    beforeWhole: null,
    toggleWhole: () => {
      const { target, duration, beforeWhole } = get();
      if (duration <= 0) return;
      if (showsWhole(target, duration) && beforeWhole) {
        set({ target: clampView(beforeWhole, duration), beforeWhole: null });
      } else {
        set({ target: clampView({ start: 0, span: duration }, duration), beforeWhole: target });
      }
    },
    reset: (duration, whole = false) => {
      const view = clampView({ start: 0, span: whole ? duration : DEFAULT_SPAN }, duration);
      set({ duration, ...view, target: view, manualUntil: 0, beforeWhole: null });
    },
    setDuration: (duration) => {
      const before = get();
      // Still showing the whole track (a track opened whole, loading): keep showing all of it
      if (
        before.start === 0 &&
        before.span === before.duration &&
        before.target.span === before.span
      ) {
        const whole = clampView({ start: 0, span: duration }, duration);
        set({ duration, ...whole, target: whole });
        return;
      }
      const view = clampView(before, duration);
      set({ duration, ...view, target: clampView(before.target, duration) });
    },
    zoom: (factor, anchor) =>
      set({ target: zoomWindow(get().target, factor, anchor, get().duration) }),
    // Glides like the zoom instead of jumping a notch at a time; quick wheel turns add up
    scrollBy: (seconds) => {
      const { target, duration } = get();
      set({
        manualUntil: performance.now() + MANUAL_PAUSE_MS,
        target: clampView({ start: target.start + seconds, span: target.span }, duration),
      });
    },
    scrollTo: (start) => {
      set({ manualUntil: performance.now() + MANUAL_PAUSE_MS });
      jump({ start, span: get().span });
    },
    pan: (start) => {
      const { span, duration } = get();
      const inside = clampView({ start, span }, duration).start;
      const shown = { start: inside + stretched(start - inside, span), span };
      set({ ...shown, target: shown, manualUntil: Number.POSITIVE_INFINITY });
    },
    settle: () => {
      const { start, span, duration } = get();
      set({
        target: clampView({ start, span }, duration),
        manualUntil: performance.now() + MANUAL_PAUSE_MS,
      });
    },
    centerOn: (time) => jump({ start: time - get().span / 2, span: get().span }),
    resumeFollow: () => set({ manualUntil: 0 }),
    holdFollow: (held) =>
      set({ manualUntil: held ? Number.POSITIVE_INFINITY : performance.now() + MANUAL_PAUSE_MS }),
    followPlayhead: (position, mode = "center") => {
      const { manualUntil, start, span, target, duration } = get();
      if (performance.now() < manualUntil) return;
      const page = mode === "page";
      if (position >= start && position <= start + (page ? span * 0.98 : span / 2)) return;
      // Shift the view and the zoom target together, so following never cancels a zoom.
      // A new page starts just before the playhead, so the passage it leaves stays in sight.
      const shift = position - (page ? span * 0.02 : span / 2) - start;
      set({
        ...clampView({ start: start + shift, span }, duration),
        target: clampView({ start: target.start + shift, span: target.span }, duration),
      });
    },
    step: () => {
      const { start, span, target } = get();
      if (start === target.start && span === target.span) return;
      // Arrived once both the zoom and the position are within a fraction of a pixel
      const close =
        Math.abs(span - target.span) < span * 0.002 &&
        Math.abs(start - target.start) < span * 0.0005;
      set(
        close
          ? { start: target.start, span: target.span }
          : {
              start: start + (target.start - start) * EASE,
              span: span + (target.span - span) * EASE,
            },
      );
    },
  };
});
