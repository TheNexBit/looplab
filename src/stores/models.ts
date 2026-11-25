import { Channel } from "@tauri-apps/api/core";
import { create } from "zustand";
import { type AppError, commands, type Model } from "@/lib/bindings";

/**
 * The models of "Analyse tempo" and "Separate instruments" (`src-tauri/src/models.rs`): not in
 * the installer, downloaded once the first time they are needed.
 */
interface ModelsState {
  /** Ready on this PC; missing while not asked yet */
  installed: Partial<Record<Model, boolean>>;
  /** Size of each download in MB, for the key that offers it */
  megabytes: Partial<Record<Model, number>>;
}

export const useModelsStore = create<ModelsState>(() => ({ installed: {}, megabytes: {} }));

const note = (model: Model, installed: boolean, bytes?: number | null) =>
  useModelsStore.setState((state) => ({
    installed: { ...state.installed, [model]: installed },
    megabytes:
      bytes == null
        ? state.megabytes
        : { ...state.megabytes, [model]: Math.round(bytes / 1_000_000) },
  }));

/** Asks whether `model` is there (for the label of the key that needs it). */
export async function checkModel(model: Model): Promise<boolean> {
  const info = await commands.modelInfo(model);
  note(model, info.installed, info.bytes);
  return info.installed;
}

/**
 * Makes sure `model` is on this PC, downloading it if needed (`progress` gets 0..1). Gives the
 * error that stopped it, or null when the model is ready.
 */
export async function ensureModel(
  model: Model,
  progress: (fraction: number) => void,
): Promise<AppError | null> {
  if (useModelsStore.getState().installed[model] || (await checkModel(model))) return null;
  const channel = new Channel<number | null>();
  channel.onmessage = (value) => {
    if (value !== null) progress(value);
  };
  const result = await commands.downloadModel(model, channel);
  if (result.status === "error") return result.error;
  note(model, true);
  return null;
}

/** Stops a model download in progress; nothing half-downloaded is kept. */
export function cancelModelDownload() {
  void commands.cancelModelDownload();
}
