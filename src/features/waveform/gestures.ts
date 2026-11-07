import { snapTime } from "@/features/markers/snap";
import { clamp } from "@/lib/time";
import { useLoopStore } from "@/stores/loop";
import { currentPosition, trackDuration, usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { useViewStore } from "@/stores/view";
import { DRAG_PX, EDGE_PX, timeAtX } from "./pointer";

/** Wheel sensitivity: a mouse notch (~100) zooms ~16%, a touchpad pinch is finer. */
const WHEEL_ZOOM = 0.0015;
const PINCH_ZOOM = 0.01;
const LINE_HEIGHT_PX = 16;

/** What a pointer press on the waveform is doing. */
type Gesture =
  | { kind: "press"; x: number; time: number; onBrace: boolean }
  | { kind: "select"; anchor: number }
  | { kind: "edge"; fixed: number; edge: number; x: number; moved: boolean }
  | { kind: "move"; grab: number; length: number }
  /** Wheel button held down: the view follows the hand (start of the view when it was grabbed) */
  | { kind: "pan"; x: number; start: number };

/** Mouse button of the wheel (`PointerEvent.button`). */
const WHEEL_BUTTON = 1;

/**
 * The gestures of a DAW on the detailed waveform `element`, whose top `rulerHeight`
 * CSS pixels are the time ruler:
 * - click anywhere: playhead there (with the magnet, it sticks to loop edges and markers);
 *   click on the loop bar: playhead at the loop start; click on a loop edge: playhead on it
 * - Shift+click: stretch the loop to that point
 * - drag on the waveform or the ruler: a new loop (even over the current one); then the
 *   playhead stays, goes to its start or plays from there ("afterLoop" setting)
 * - drag the loop bar in the ruler: move the loop; drag a loop edge: resize it
 * - wheel: zoom around the pointer; Shift+wheel: scroll (the other way round when the
 *   "wheel" setting says so; "wheelSpeed" makes both faster or slower)
 * - double-click: play from there, when the "doubleClick" setting says so
 * - press the wheel and drag: move the view by hand, as in Reaper (playhead and loop stay)
 * With the magnet on, loop ends stick to nearby points. Returns a function that removes them.
 */
export function attachWaveformGestures(element: HTMLElement, rulerHeight: number): () => void {
  const timeAt = (clientX: number) => timeAtX(element, clientX);
  const xOf = (time: number) => {
    const rect = element.getBoundingClientRect();
    const { start, span } = useViewStore.getState();
    return rect.left + ((time - start) / span) * rect.width;
  };

  /**
   * The loop end that is not under the pointer, when the pointer is on the other one.
   * On a narrow loop the edges' reach shrinks, so its middle stays clickable.
   */
  const edgeUnder = (clientX: number): number | null => {
    const region = useLoopStore.getState().region();
    if (!region) return null;
    const reach = Math.min(EDGE_PX, (xOf(region.end) - xOf(region.start)) / 4);
    if (Math.abs(xOf(region.start) - clientX) <= reach) return region.end;
    if (Math.abs(xOf(region.end) - clientX) <= reach) return region.start;
    return null;
  };
  /** The loop edge under the pointer, given the opposite one returned by `edgeUnder`. */
  const edgeTime = (fixed: number) => {
    const region = useLoopStore.getState().region();
    return region && fixed === region.end ? region.start : (region?.end ?? fixed);
  };
  const insideLoop = (time: number) => {
    const region = useLoopStore.getState().region();
    return region !== null && time > region.start && time < region.end;
  };
  const inRuler = (clientY: number) => clientY - element.getBoundingClientRect().top < rulerHeight;
  /** For gestures that shape the loop: they must not stick to the loop itself */
  const snap = (time: number) => snapTime(time, element, { loop: true });
  /** For placing the playhead: sticks to loop edges, markers and sections (Reaper-style) */
  const snapSeek = (time: number) => snapTime(time, element, { playhead: true });

  /** Shift+click: the nearer loop end jumps to `time` (or a loop from the playhead is made). */
  const stretchLoopTo = (time: number) => {
    const loop = useLoopStore.getState();
    const region = loop.region();
    if (region) {
      const nearStart = Math.abs(time - region.start) < Math.abs(time - region.end);
      loop.setRegion(
        nearStart ? time : region.start,
        nearStart ? region.end : time,
        trackDuration(),
      );
    } else {
      loop.setRegion(loop.start ?? currentPosition(), time, trackDuration());
    }
  };

  /** Moves the whole loop, sticking whichever end is closer to a point. */
  const moveLoop = (start: number, length: number) => {
    const fromStart = snap(start) - start;
    const fromEnd = snap(start + length) - (start + length);
    const shift =
      fromStart !== 0 && (fromEnd === 0 || Math.abs(fromStart) <= Math.abs(fromEnd))
        ? fromStart
        : fromEnd;
    const moved = clamp(start + shift, 0, Math.max(0, trackDuration() - length));
    useLoopStore.getState().setRegion(moved, moved + length, trackDuration());
  };

  const cursorFor = (event: PointerEvent) => {
    if (edgeUnder(event.clientX) !== null) return "ew-resize";
    return inRuler(event.clientY) && insideLoop(timeAt(event.clientX)) ? "grab" : "";
  };

  /** A loop was just dragged: what the "afterLoop" setting says (Reaper's "move edit cursor"). */
  const afterNewLoop = (start: number) => {
    const { afterLoop } = useSettingsStore.getState();
    if (afterLoop === "stay") return;
    const player = usePlayerStore.getState();
    player.seek(start);
    if (afterLoop === "play" && !player.playing) player.togglePlay();
  };

  let gesture: Gesture | null = null;

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    // Pressing the wheel often turns it a notch too: that must not zoom under the hand
    if (gesture?.kind === "pan") return;
    const view = useViewStore.getState();
    const { wheel, wheelSpeed } = useSettingsStore.getState();
    const unit = (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_HEIGHT_PX : 1) * wheelSpeed;
    // Pinch (Ctrl) always zooms; otherwise Shift swaps zoom and scroll
    const scrolls = !event.ctrlKey && event.shiftKey === (wheel === "zoom");
    const dx = (scrolls ? event.deltaY || event.deltaX : event.deltaX) * unit;
    const dy = scrolls ? 0 : event.deltaY * unit;
    if (Math.abs(dx) > Math.abs(dy)) {
      view.scrollBy((dx / element.clientWidth) * view.span);
    } else {
      // Touchpad pinch arrives as wheel + Ctrl
      view.zoom(Math.exp(dy * (event.ctrlKey ? PINCH_ZOOM : WHEEL_ZOOM)), timeAt(event.clientX));
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button === WHEEL_BUTTON) {
      // Not cancelled here: Chromium would then skip the mousedown, the only event whose
      // cancelling stops its auto-scroll (see `main.tsx`), and that took the drag away
      gesture = { kind: "pan", x: event.clientX, start: useViewStore.getState().start };
      // Held still for a while during playback, the view must not run off under the hand
      useViewStore.getState().holdFollow(true);
      element.style.cursor = "grabbing";
      element.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    // Marker flags handle their own presses
    if (event.target instanceof Element && event.target.closest("[data-no-seek]")) return;
    const time = timeAt(event.clientX);
    if (event.shiftKey) {
      stretchLoopTo(snap(time));
      return;
    }
    element.setPointerCapture(event.pointerId);
    const fixed = edgeUnder(event.clientX);
    gesture =
      fixed !== null
        ? { kind: "edge", fixed, edge: edgeTime(fixed), x: event.clientX, moved: false }
        : {
            kind: "press",
            x: event.clientX,
            time,
            onBrace: inRuler(event.clientY) && insideLoop(time),
          };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!gesture) {
      element.style.cursor = cursorFor(event);
      return;
    }
    if (gesture.kind === "pan") {
      // Dragging right shows earlier music, like pulling a sheet of paper
      const { span } = useViewStore.getState();
      const seconds = ((event.clientX - gesture.x) / element.clientWidth) * span;
      const wanted = gesture.start - seconds;
      useViewStore.getState().scrollTo(wanted);
      // Past either end of the track the view stops: grab it again where it stopped, so
      // moving back moves it at once instead of first making up the distance gone past
      const reached = useViewStore.getState().start;
      if (Math.abs(reached - wanted) > 1e-9)
        gesture = { ...gesture, x: event.clientX, start: reached };
      return;
    }
    const time = timeAt(event.clientX);
    if (gesture.kind === "press" && Math.abs(event.clientX - gesture.x) > DRAG_PX) {
      const region = useLoopStore.getState().region();
      if (gesture.onBrace && region) {
        gesture = {
          kind: "move",
          grab: gesture.time - region.start,
          length: region.end - region.start,
        };
        element.style.cursor = "grabbing";
      } else {
        gesture = { kind: "select", anchor: snap(gesture.time) };
      }
    }
    const loop = useLoopStore.getState();
    if (gesture.kind === "select") loop.setRegion(gesture.anchor, snap(time), trackDuration());
    if (
      gesture.kind === "edge" &&
      (gesture.moved || Math.abs(event.clientX - gesture.x) > DRAG_PX)
    ) {
      gesture.moved = true;
      loop.setRegion(gesture.fixed, snap(time), trackDuration());
    }
    if (gesture.kind === "move") moveLoop(time - gesture.grab, gesture.length);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (gesture?.kind === "pan") useViewStore.getState().holdFollow(false);
    const player = usePlayerStore.getState();
    const region = useLoopStore.getState().region();
    // A click on the loop bar goes to the loop start, a click on an edge to that edge
    if (gesture?.kind === "press" && gesture.onBrace && region) player.seek(region.start);
    else if (gesture?.kind === "press") player.seek(snapSeek(gesture.time));
    else if (gesture?.kind === "edge" && !gesture.moved) player.seek(gesture.edge);
    else if (gesture?.kind === "select" && region) afterNewLoop(region.start);
    gesture = null;
    element.style.cursor = cursorFor(event);
  };

  // Double-click: the first click already moved the playhead there, so only play is left
  const onDoubleClick = (event: MouseEvent) => {
    if (useSettingsStore.getState().doubleClick !== "play" || event.shiftKey) return;
    if (event.target instanceof Element && event.target.closest("[data-no-seek]")) return;
    const player = usePlayerStore.getState();
    if (!player.playing) player.togglePlay();
  };

  const onLostCapture = (event: PointerEvent) => {
    if (gesture) onPointerUp(event);
  };

  // The browser's own wheel-button actions (auto-scroll, middle-click paste) never start here
  const blockWheelButton = (event: MouseEvent) => {
    if (event.button === WHEEL_BUTTON) event.preventDefault();
  };

  element.addEventListener("wheel", onWheel, { passive: false });
  element.addEventListener("dblclick", onDoubleClick);
  element.addEventListener("mousedown", blockWheelButton);
  element.addEventListener("auxclick", blockWheelButton);
  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerUp);
  // Capture lost without a pointerup (window switch, a dialog): end the drag all the same
  element.addEventListener("lostpointercapture", onLostCapture);
  return () => {
    element.removeEventListener("lostpointercapture", onLostCapture);
    element.removeEventListener("wheel", onWheel);
    element.removeEventListener("dblclick", onDoubleClick);
    element.removeEventListener("mousedown", blockWheelButton);
    element.removeEventListener("auxclick", blockWheelButton);
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("pointermove", onPointerMove);
    element.removeEventListener("pointerup", onPointerUp);
    element.removeEventListener("pointercancel", onPointerUp);
  };
}
