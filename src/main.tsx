import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { DetachedVideo } from "@/features/video/DetachedVideo";
import { VIDEO_WINDOW } from "@/features/video/detach";
import "@/styles/theme.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// Both windows load the same page; the detached video window only shows the picture
const isVideoWindow = getCurrentWindow().label === VIDEO_WINDOW;

createRoot(root).render(<StrictMode>{isVideoWindow ? <DetachedVideo /> : <App />}</StrictMode>);
