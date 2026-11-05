import { check } from "@tauri-apps/plugin-updater";
import { t } from "@/i18n";

export type UpdateResult =
  | { kind: "latest" }
  | { kind: "installing"; version: string }
  | { kind: "unavailable" };

/**
 * Looks for a newer signed release and installs it. The installer closes the app by itself.
 * Development builds have no updater (see main.rs), which reports as "unavailable".
 */
export async function checkForUpdates(): Promise<UpdateResult> {
  try {
    const update = await check();
    if (!update) return { kind: "latest" };
    await update.downloadAndInstall();
    return { kind: "installing", version: update.version };
  } catch {
    return { kind: "unavailable" };
  }
}

export const updateMessage = (result: UpdateResult) =>
  result.kind === "latest"
    ? t.updates.latest
    : result.kind === "installing"
      ? `${t.updates.installing} ${result.version}`
      : t.updates.unavailable;
