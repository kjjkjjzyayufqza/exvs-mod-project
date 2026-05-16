import * as THREE from "three";
import {
  AXIS_COLORS,
  HOVER_COLOR,
  ACTIVE_COLOR,
  CENTER_COLOR,
  PLANE_HANDLE_OPACITY,
  INACTIVE_OPACITY,
  type AxisId,
} from "./gizmoConstants";

export interface GizmoMaterialSet {
  normal: THREE.MeshBasicMaterial;
  hover: THREE.MeshBasicMaterial;
  active: THREE.MeshBasicMaterial;
}

function createMaterialTriple(baseColor: THREE.Color, transparent: boolean): GizmoMaterialSet {
  return {
    normal: new THREE.MeshBasicMaterial({
      color: baseColor.clone(),
      depthTest: false,
      depthWrite: false,
      transparent,
      opacity: transparent ? PLANE_HANDLE_OPACITY : 1,
      side: THREE.DoubleSide,
    }),
    hover: new THREE.MeshBasicMaterial({
      color: HOVER_COLOR.clone(),
      depthTest: false,
      depthWrite: false,
      transparent,
      opacity: transparent ? 0.5 : 1,
      side: THREE.DoubleSide,
    }),
    active: new THREE.MeshBasicMaterial({
      color: ACTIVE_COLOR.clone(),
      depthTest: false,
      depthWrite: false,
      transparent,
      opacity: transparent ? 0.6 : 1,
      side: THREE.DoubleSide,
    }),
  };
}

export type GizmoMaterials = ReturnType<typeof createGizmoMaterials>;

export function createGizmoMaterials() {
  const axisX = createMaterialTriple(AXIS_COLORS.X, false);
  const axisY = createMaterialTriple(AXIS_COLORS.Y, false);
  const axisZ = createMaterialTriple(AXIS_COLORS.Z, false);
  const center = createMaterialTriple(CENTER_COLOR, false);

  const planeXY = createMaterialTriple(AXIS_COLORS.Z, true);
  const planeXZ = createMaterialTriple(AXIS_COLORS.Y, true);
  const planeYZ = createMaterialTriple(AXIS_COLORS.X, true);

  return { axisX, axisY, axisZ, center, planeXY, planeXZ, planeYZ };
}

export function getMaterialSetForAxis(
  materials: GizmoMaterials,
  axisId: AxisId,
): GizmoMaterialSet {
  switch (axisId) {
    case "X":
      return materials.axisX;
    case "Y":
      return materials.axisY;
    case "Z":
      return materials.axisZ;
    case "XY":
      return materials.planeXY;
    case "XZ":
      return materials.planeXZ;
    case "YZ":
      return materials.planeYZ;
    case "XYZ":
    case "screen":
      return materials.center;
  }
}

export function applyHoverState(
  materials: GizmoMaterials,
  hoveredAxis: AxisId | null,
  activeAxis: AxisId | null,
): void {
  const allSets: { set: GizmoMaterialSet; axis: AxisId }[] = [
    { set: materials.axisX, axis: "X" },
    { set: materials.axisY, axis: "Y" },
    { set: materials.axisZ, axis: "Z" },
    { set: materials.center, axis: "XYZ" },
    { set: materials.planeXY, axis: "XY" },
    { set: materials.planeXZ, axis: "XZ" },
    { set: materials.planeYZ, axis: "YZ" },
  ];

  for (const { set, axis } of allSets) {
    if (activeAxis !== null) {
      if (axis === activeAxis) {
        set.normal.color.copy(ACTIVE_COLOR);
        set.normal.opacity = set.normal.transparent ? 0.6 : 1;
      } else {
        set.normal.opacity = INACTIVE_OPACITY;
      }
    } else if (hoveredAxis !== null && axis === hoveredAxis) {
      set.normal.color.copy(HOVER_COLOR);
      set.normal.opacity = set.normal.transparent ? 0.5 : 1;
    } else {
      restoreNormalColor(set, axis);
    }
  }
}

function restoreNormalColor(set: GizmoMaterialSet, axis: AxisId): void {
  switch (axis) {
    case "X":
      set.normal.color.copy(AXIS_COLORS.X);
      break;
    case "Y":
      set.normal.color.copy(AXIS_COLORS.Y);
      break;
    case "Z":
      set.normal.color.copy(AXIS_COLORS.Z);
      break;
    case "XY":
      set.normal.color.copy(AXIS_COLORS.Z);
      break;
    case "XZ":
      set.normal.color.copy(AXIS_COLORS.Y);
      break;
    case "YZ":
      set.normal.color.copy(AXIS_COLORS.X);
      break;
    case "XYZ":
    case "screen":
      set.normal.color.copy(CENTER_COLOR);
      break;
  }
  set.normal.opacity = set.normal.transparent ? PLANE_HANDLE_OPACITY : 1;
}

export function resetAllMaterials(materials: GizmoMaterials): void {
  applyHoverState(materials, null, null);
}

export function disposeGizmoMaterials(materials: GizmoMaterials): void {
  const allSets = [
    materials.axisX,
    materials.axisY,
    materials.axisZ,
    materials.center,
    materials.planeXY,
    materials.planeXZ,
    materials.planeYZ,
  ];
  for (const set of allSets) {
    set.normal.dispose();
    set.hover.dispose();
    set.active.dispose();
  }
}
