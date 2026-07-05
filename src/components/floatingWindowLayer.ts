/**
 * Single shared DOM container that ALL floating Rnd windows portal into.
 *
 * Why one container: a window's z-index only compares against siblings inside the same stacking
 * context. The former per-kind host wrappers each set `z-[var(--z-modal-nested)]`, so each was its
 * own stacking context and windows of different kinds could never be ordered relative to each
 * other by focus. Portaling every window into ONE layer makes the global z from floatingWindowStore
 * authoritative. The layer sits at `--z-modal-nested` (above page `--z-popover`, below
 * `--z-popover-elevated`/`--z-toast`), so in-window dropdowns stay usable while page popovers do not
 * cover floating windows.
 */
let layerElement: HTMLElement | null = null;

export function getFloatingWindowLayer(): HTMLElement {
  if (layerElement && document.body.contains(layerElement)) {
    return layerElement;
  }
  const element = document.createElement("div");
  element.id = "floating-window-layer";
  element.style.position = "fixed";
  element.style.left = "0";
  element.style.right = "0";
  element.style.bottom = "0";
  element.style.top = "var(--layout-topbar-height)";
  element.style.zIndex = "var(--z-modal-nested)";
  element.style.pointerEvents = "none";
  document.body.appendChild(element);
  layerElement = element;
  return element;
}
