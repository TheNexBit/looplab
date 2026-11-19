/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { alphaTab } from "@coderline/alphatab/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri expects a fixed port and must not see Rust sources as frontend changes.
export default defineConfig({
  // alphaTab's drawing worker. No copy of its assets into public\ (the music font is imported
  // where it is used) and no audio worklet: Looplab never plays alphaTab's synthesiser
  plugins: [react(), tailwindcss(), alphaTab({ assetOutputDir: false, audioWorklets: false })],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/crates/**"] },
  },
  build: { target: "es2023" },
  test: { environment: "node" },
});
