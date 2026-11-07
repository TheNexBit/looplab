import { commands } from "@/lib/bindings";
import { useUiStore } from "@/stores/ui";

/**
 * Mini mode on or off: the window becomes a slim bar that stays on top of other programs
 * (Rust resizes it and puts it back afterwards), and the UI shows only the mini bar.
 */
export async function setMini(on: boolean) {
  if (on) useUiStore.getState().closeDialog();
  const result = await commands.setMiniMode(on);
  if (result.status === "ok") useUiStore.setState({ mini: on });
}

export const toggleMini = () => void setMini(!useUiStore.getState().mini);
