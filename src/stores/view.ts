import { create } from "zustand";
import { clamp } from "@/lib/time";

/** Narrowest and default visible time span of the detailed waveform, in seconds. */
export const MIN_SPAN = 0.25;
const DEFAULT_SPAN = 30;
/** Share of the remaining distance covered per frame by the zoom animation. */
const EASE = 0.3;

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

interface ViewState extends ViewWindow {
  duration: number;
  /** Where the zoom animation is heading */
  target: ViewWindow;
  /** While true the view scrolls with the playhead */
  follow: boolean;
  reset: (duration: number) => void;
  zoom: (factor: number, anchor: number) => void;
  scrollBy: (seconds: number) => void;
  scrollTo: (start: number) => void;
  centerOn: (time: number) => void;
  setFollow: (follow: boolean) => void;
  /** Keeps the playhead visible, scrolling smoothly once it passes the middle. */
  followPlayhead: (position: number) => void;
  /** Advances the zoom animation by one frame. */
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
    follow: true,
    reset: (duration) => {
      const view = clampView({ start: 0, span: DEFAULT_SPAN }, duration);
      set({ duration, ...view, target: view, follow: true });
    },
    zoom: (factor, anchor) =>
      set({ target: zoomWindow(get().target, factor, anchor, get().duration) }),
    scrollBy: (seconds) => {
      const { start, span } = get();
      set({ follow: false });
      jump({ start: start + seconds, span });
    },
    scrollTo: (start) => {
      set({ follow: false });
      jump({ start, span: get().span });
    },
    centerOn: (time) => jump({ start: time - get().span / 2, span: get().span }),
    setFollow: (follow) => set({ follow }),
    followPlayhead: (position) => {
      const { follow, start, span } = get();
      if (!follow) return;
      if (position > start + span / 2 || position < start) {
        jump({ start: position - span / 2, span });
      }
    },
    step: () => {
      const { start, span, target } = get();
      if (start === target.start && span === target.span) return;
      const close = Math.abs(span - target.span) < span * 0.002;
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
