import { check } from "@tauri-apps/plugin-updater";
import { t } from "@/i18n";

type UpdateResult =
  | { kind: "latest" }
  | { kind: "installing"; version: string }
  | { kind: "download"; version: string }
  | { kind: "unavailable" };

/**
 * Looks for a newer signed release and installs it. The installer closes the app by itself.
 * The portable version only says there is one: the installer would put an installed copy
 * beside it. Development builds have no updater (see main.rs), which reports as "unavailable".
 */
export async function checkForUpdates(portable: boolean): Promise<UpdateResult> {
  try {
    const update = await check();
    if (!update) return { kind: "latest" };
    if (portable) return { kind: "download", version: update.version };
    await update.downloadAndInstall();
    return { kind: "installing", version: update.version };
  } catch {
    return { kind: "unavailable" };
  }
}

export function updateMessage(result: UpdateResult): string {
  switch (result.kind) {
    case "latest":
      return t.updates.latest;
    case "installing":
      return `${t.updates.installing} ${result.version}`;
    case "download":
      return t.updates.portable(result.version);
    case "unavailable":
      return t.updates.unavailable;
  }
}
