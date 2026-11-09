/** Floating panel: menus, popovers. */
export const floatingPanel =
  "z-50 rounded-panel border border-edge bg-bg-from text-sm text-fg shadow-[0_8px_24px_rgb(0_0_0/0.6),inset_0_1px_0_var(--color-sheen)]";
/** Shared look of Radix context and dropdown menus. */
export const menuContent = `${floatingPanel} min-w-44 p-1`;
export const menuItem =
  "flex cursor-default items-center gap-2 rounded-control px-2.5 py-1.5 outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-on-accent data-[disabled]:opacity-40";
export const menuLabel = "panel-label px-2.5 py-1";
export const menuSeparator = "my-1 h-px bg-border";
/** A tab key (side panel, settings): raised, sunk and amber when selected. */
export const tabTrigger =
  "hw h-[26px] rounded-control text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase transition-colors hover:text-fg data-[state=active]:border-edge data-[state=active]:bg-well data-[state=active]:bg-none data-[state=active]:text-accent data-[state=active]:shadow-[inset_0_1px_3px_var(--color-shade)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/70 focus-visible:ring-inset";
/** Small − / + key: steppers, and the − / + inside menus (pulses, strings, frets…). */
export const smallKey =
  "hw inline-flex size-6 items-center justify-center rounded-control text-fg-muted transition-[color,filter] hover:text-fg hover:brightness-125 active:translate-y-px disabled:pointer-events-none disabled:opacity-40";
