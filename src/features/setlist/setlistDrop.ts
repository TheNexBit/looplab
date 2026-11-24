import type { PointerEvent as ReactPointerEvent } from "react";
import { isSupported } from "@/features/library/formats";
import { useSetlistsStore } from "@/stores/setlists";
import { songFromFile } from "./setlistMath";

/** Attribute of a setlist's drop zone; its value is the setlist id. */
export const DROP_ATTRIBUTE = "data-setlist-drop";
/** The pointer must move this far (px) before a press becomes a drag (a click stays a click). */
const DRAG_START = 6;

/** The setlist whose drop zone is at this point of the window (CSS pixels), if any. */
export function setlistAt(x: number, y: number): string | null {
  const element = document.elementFromPoint(x, y)?.closest(`[${DROP_ATTRIBUTE}]`);
  return element?.getAttribute(DROP_ATTRIBUTE) ?? null;
}

/** Adds the playable files among `paths` to a setlist; returns how many were added. */
export function addFilesTo(setlistId: string, files: { path: string; length?: number | null }[]) {
  const songs = files.filter((f) => isSupported(f.path)).map((f) => songFromFile(f.path, f.length));
  if (songs.length > 0) useSetlistsStore.getState().addSongs(setlistId, songs);
  return songs.length;
}

/**
 * Files dragged from the system (Tauri gives physical pixels): dropped on a setlist they are
 * added to it, anywhere else they open as usual. Returns true when a setlist took them.
 */
export function dropFilesOnSetlist(
  paths: string[],
  position: { x: number; y: number } | null,
): boolean {
  const store = useSetlistsStore.getState();
  store.setDropTarget(null);
  if (!position) return false;
  const ratio = window.devicePixelRatio || 1;
  const target = setlistAt(position.x / ratio, position.y / ratio);
  if (!target) return false;
  addFilesTo(
    target,
    paths.map((path) => ({ path })),
  );
  return true;
}

/** While system files are dragged over the window: lights the setlist under the pointer. */
export function hoverFilesOver(position: { x: number; y: number } | null) {
  const ratio = window.devicePixelRatio || 1;
  useSetlistsStore
    .getState()
    .setDropTarget(position ? setlistAt(position.x / ratio, position.y / ratio) : null);
}

/**
 * A track dragged inside the app (a recent file, a lesson) onto a setlist, like dragging a
 * clip from Ableton's browser. Below `DRAG_START` px the press stays a click; a drag never
 * clicks. A small label follows the pointer.
 */
export function dragTrack(
  event: ReactPointerEvent,
  file: { path: string; name: string; length?: number | null },
) {
  if (event.button !== 0) return;
  const startX = event.clientX;
  const startY = event.clientY;
  let ghost: HTMLDivElement | null = null;
  const store = useSetlistsStore.getState();

  const onMove = (e: PointerEvent) => {
    if (!ghost) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_START) return;
      ghost = document.createElement("div");
      ghost.textContent = file.name;
      ghost.className =
        "pointer-events-none fixed z-[60] max-w-64 truncate rounded-control border border-accent bg-bg-from px-2 py-1 text-xs text-fg shadow-lg";
      document.body.appendChild(ghost);
      document.body.style.cursor = "grabbing";
    }
    ghost.style.left = `${e.clientX + 12}px`;
    ghost.style.top = `${e.clientY + 8}px`;
    store.setDropTarget(setlistAt(e.clientX, e.clientY));
  };

  const onUp = (e: PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    if (!ghost) return;
    ghost.remove();
    document.body.style.cursor = "";
    store.setDropTarget(null);
    const target = setlistAt(e.clientX, e.clientY);
    if (target) addFilesTo(target, [{ path: file.path, length: file.length }]);
    // The release after a drag must not also open the track
    const swallow = (click: MouseEvent) => {
      click.stopPropagation();
      click.preventDefault();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}
