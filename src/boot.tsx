import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { DetachedVideo } from "@/features/video/DetachedVideo";
import { VIDEO_WINDOW } from "@/features/video/detach";
import { applyAppearance } from "@/lib/appearance";
import { commands } from "@/lib/bindings";
import { applyUiScale, storedAppearance } from "@/stores/appearance";
import "@/styles/theme.css";

// Anything the UI did not handle goes to the error log (Settings → Data → Error log)
window.addEventListener("error", (event) => {
  const where = event.filename ? ` (${event.filename}:${event.lineno})` : "";
  void commands.logUiError(getCurrentWindow().label, `${event.message}${where}`);
});
window.addEventListener("unhandledrejection", (event) => {
  const reason =
    event.reason instanceof Error
      ? (event.reason.stack ?? event.reason.message)
      : String(event.reason);
  void commands.logUiError(getCurrentWindow().label, `unhandled promise: ${reason}`);
});

// A desktop app has no browser menu (Back, Reload, Print, Inspect) on right-click: only
// the app's own menus (they stop the event first) and the usual Cut/Copy/Paste in text fields.
// In development, Shift + right-click still opens it, for Inspect.
document.addEventListener("contextmenu", (event) => {
  if (event.defaultPrevented) return;
  if (import.meta.env.DEV && event.shiftKey) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, [contenteditable='true']")) return;
  event.preventDefault();
});

// The wheel button never starts the browser's auto-scroll (the round arrows icon) anywhere:
// it would take the mouse away from the waveform's own wheel-button drag for a stretch.
// Only cancelling the mousedown stops it, so nothing may cancel the pointerdown before it
// (Chromium then never sends the mousedown at all).
window.addEventListener(
  "mousedown",
  (event) => {
    if (event.button === 1) event.preventDefault();
  },
  { capture: true },
);

// The look of this PC before anything is drawn, so the window never flashes the default one
const appearance = storedAppearance();
applyAppearance(appearance);
if (appearance.uiScale !== 1) applyUiScale(appearance.uiScale);

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// Both windows load the same page; the detached video window only shows the picture
const isVideoWindow = getCurrentWindow().label === VIDEO_WINDOW;

createRoot(root).render(<StrictMode>{isVideoWindow ? <DetachedVideo /> : <App />}</StrictMode>);
