import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { DetachedVideo } from "@/features/video/DetachedVideo";
import { VIDEO_WINDOW } from "@/features/video/detach";
import { commands } from "@/lib/bindings";
import { applyTheme } from "@/lib/theme";
import { storedTheme } from "@/stores/theme";
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

// The theme of this PC before anything is drawn, so the window never flashes the default one
applyTheme(storedTheme());

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// Both windows load the same page; the detached video window only shows the picture
const isVideoWindow = getCurrentWindow().label === VIDEO_WINDOW;

createRoot(root).render(<StrictMode>{isVideoWindow ? <DetachedVideo /> : <App />}</StrictMode>);
