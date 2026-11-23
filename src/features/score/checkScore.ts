import { convertFileSrc } from "@tauri-apps/api/core";
import { commands } from "@/lib/bindings";

type Prepared = Awaited<ReturnType<typeof commands.prepareScore>>;

/** The bytes of a file opened up to the asset protocol, `null` if it cannot be read. */
async function bytesOf(prepared: Prepared): Promise<Uint8Array | null> {
  if (prepared.status === "error") return null;
  try {
    const response = await fetch(convertFileSrc(prepared.data));
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** The bytes of a library score, `null` if it cannot be read. */
const scoreBytes = async (file: string) => bytesOf(await commands.prepareScore(file));

/** Bars of the Guitar Pro files counted so far, by path (a lesson's tab rarely changes). */
const barCounts = new Map<string, number | null>();

/**
 * How many bars a Guitar Pro file holds where the user keeps it (a lesson's tab beside its
 * PDF), `null` if it cannot be read. Counted once per file.
 */
export async function guitarProBars(path: string): Promise<number | null> {
  const known = barCounts.get(path);
  if (known !== undefined) return known;
  const bytes = await bytesOf(await commands.prepareGuitarPro(path));
  let count: number | null = null;
  if (bytes) {
    try {
      const { importer } = await import("@coderline/alphatab");
      count = importer.ScoreLoader.loadScoreFromBytes(bytes).masterBars.length;
    } catch {
      count = null;
    }
  }
  barCounts.set(path, count);
  return count;
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
