import { convertFileSrc } from "@tauri-apps/api/core";
import { commands } from "@/lib/bindings";

/** The bytes of a library score (read through the asset protocol), `null` if it cannot be read. */
export async function scoreBytes(file: string): Promise<Uint8Array | null> {
  const prepared = await commands.prepareScore(file);
  if (prepared.status === "error") return null;
  try {
    const response = await fetch(convertFileSrc(prepared.data));
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/**
 * True if alphaTab can read the library score `file`: checked before linking it, so a song is
 * never left tied to a file that shows nothing. Loaded on demand (alphaTab is large).
 */
export async function isReadable(file: string): Promise<boolean> {
  const bytes = await scoreBytes(file);
  if (!bytes) return false;
  if (file.toLowerCase().endsWith(".pdf")) return isReadablePdf(bytes);
  try {
    const { importer } = await import("@coderline/alphatab");
    return importer.ScoreLoader.loadScoreFromBytes(bytes).masterBars.length > 0;
  } catch {
    return false;
  }
}

/** True if pdf.js opens the PDF and it has at least one page (pdf.js loaded on demand). */
async function isReadablePdf(bytes: Uint8Array): Promise<boolean> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: bytes });
  try {
    return (await task.promise).numPages > 0;
  } catch {
    return false;
  } finally {
    void task.destroy();
  }
}
