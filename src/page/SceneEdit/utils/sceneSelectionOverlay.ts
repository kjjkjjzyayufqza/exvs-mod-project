import * as THREE from "three";

/** Unreal Editor viewport selection orange */
export const SCENE_SELECTION_COLOR_HEX = "#ffb840";
export const SCENE_SELECTION_COLOR = 0xffb840;

/** Draw selection below gizmo handles */
export const SCENE_SELECTION_RENDER_ORDER = 8_000;

export const SCENE_SELECTION_OUTLINE_SCALE = 1.028;
export const SCENE_SELECTION_OUTLINE_OPACITY = 0.72;

export function createSelectionOutlineMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: SCENE_SELECTION_COLOR,
    side: THREE.BackSide,
    transparent: true,
    opacity: SCENE_SELECTION_OUTLINE_OPACITY,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
}

/**
 * Appends an inverted-hull outline shell (UE-style edge glow) under displayRoot.
 */
export function appendSelectionOutlineShell(
  displayRoot: THREE.Object3D,
  source: THREE.Object3D,
): void {
  const outline = source.clone(true);
  const outlineMaterial = createSelectionOutlineMaterial();
  outline.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = outlineMaterial;
      child.renderOrder = SCENE_SELECTION_RENDER_ORDER;
      child.scale.multiplyScalar(SCENE_SELECTION_OUTLINE_SCALE);
    }
  });
  displayRoot.add(outline);
}
