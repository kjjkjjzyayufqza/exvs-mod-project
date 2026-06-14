import * as THREE from "three";

export const UE_VIEWPORT_DRAG_THRESHOLD_PX = 4;

export interface ViewportSelectOptions {
  ctrl?: boolean;
  shift?: boolean;
}

export type ViewportSelectHandler = (
  id: string | null,
  opts?: ViewportSelectOptions,
) => void;

export type ViewportMultiSelectHandler = (
  ids: string[],
  opts?: ViewportSelectOptions,
) => void;

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function getViewportSelectModifiers(
  nativeEvent: MouseEvent | PointerEvent,
): ViewportSelectOptions {
  return {
    ctrl: nativeEvent.ctrlKey || nativeEvent.metaKey,
    shift: nativeEvent.shiftKey,
  };
}

export function shouldBlockViewportPick(options: {
  clickPickSelectionEnabled: boolean;
  gizmoDragging?: boolean;
  orbitActive?: boolean;
  marqueeActive?: boolean;
  dragDistancePx: number;
  isLocked?: boolean;
}): boolean {
  if (options.isLocked) return true;
  if (!options.clickPickSelectionEnabled) return true;
  if (options.gizmoDragging) return true;
  if (options.orbitActive) return true;
  if (options.marqueeActive) return true;
  if (options.dragDistancePx > UE_VIEWPORT_DRAG_THRESHOLD_PX) return true;
  return false;
}

export function computeDragDistancePx(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number {
  const dx = endX - startX;
  const dy = endY - startY;
  return Math.hypot(dx, dy);
}

export function normalizeScreenRect(x0: number, y0: number, x1: number, y1: number): ScreenRect {
  return {
    left: Math.min(x0, x1),
    top: Math.min(y0, y1),
    right: Math.max(x0, x1),
    bottom: Math.max(y0, y1),
  };
}

export function isScreenPointInsideRect(
  x: number,
  y: number,
  rect: ScreenRect,
): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function selectNodeIdsInScreenRect(
  entries: ReadonlyArray<{ nodeId: string; object: THREE.Object3D }>,
  camera: THREE.Camera,
  canvasWidth: number,
  canvasHeight: number,
  rect: ScreenRect,
): string[] {
  if (canvasWidth <= 0 || canvasHeight <= 0) return [];

  const selected: string[] = [];
  const center = new THREE.Vector3();

  for (const entry of entries) {
    entry.object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(entry.object);
    if (box.isEmpty()) continue;

    box.getCenter(center);
    center.project(camera);

    if (center.z < -1 || center.z > 1) continue;

    const screenX = (center.x * 0.5 + 0.5) * canvasWidth;
    const screenY = (-center.y * 0.5 + 0.5) * canvasHeight;

    if (isScreenPointInsideRect(screenX, screenY, rect)) {
      selected.push(entry.nodeId);
    }
  }

  return selected;
}

export function performViewportObjectPick(
  nativeEvent: MouseEvent,
  nodeId: string,
  onSelectNode: ViewportSelectHandler,
  options: {
    clickPickSelectionEnabled: boolean;
    clickGesture: { x: number; y: number } | null;
    gizmoDragging?: boolean;
    orbitActive?: boolean;
    marqueeActive?: boolean;
    isLocked?: boolean;
  },
): void {
  const dragDistancePx = options.clickGesture
    ? computeDragDistancePx(
        options.clickGesture.x,
        options.clickGesture.y,
        nativeEvent.clientX,
        nativeEvent.clientY,
      )
    : 0;

  if (
    shouldBlockViewportPick({
      clickPickSelectionEnabled: options.clickPickSelectionEnabled,
      gizmoDragging: options.gizmoDragging,
      orbitActive: options.orbitActive,
      marqueeActive: options.marqueeActive,
      dragDistancePx,
      isLocked: options.isLocked,
    })
  ) {
    return;
  }

  onSelectNode(nodeId, getViewportSelectModifiers(nativeEvent));
}

export function raycastHitsSelectable(
  camera: THREE.Camera,
  pointerNdc: THREE.Vector2,
  objects: THREE.Object3D[],
): boolean {
  if (objects.length === 0) return false;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObjects(objects, true);
  return hits.length > 0;
}
