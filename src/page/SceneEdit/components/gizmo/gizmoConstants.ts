import * as THREE from "three";

export type GizmoMode = "translate" | "rotate" | "scale";
export type GizmoSpace = "world" | "local";
export type AxisId =
  | "X"
  | "Y"
  | "Z"
  | "XY"
  | "XZ"
  | "YZ"
  | "XYZ"
  | "screen";

export const AXIS_COLORS = {
  X: new THREE.Color("#E44141"),
  Y: new THREE.Color("#41B841"),
  Z: new THREE.Color("#4189E4"),
} as const;

export const HOVER_COLOR = new THREE.Color("#FFCD00");
export const ACTIVE_COLOR = new THREE.Color("#FFFFFF");
export const CENTER_COLOR = new THREE.Color("#E0E0E0");

export const AXIS_VECTORS: Record<"X" | "Y" | "Z", THREE.Vector3> = {
  X: new THREE.Vector3(1, 0, 0),
  Y: new THREE.Vector3(0, 1, 0),
  Z: new THREE.Vector3(0, 0, 1),
};

export const PLANE_NORMALS: Record<"XY" | "XZ" | "YZ", THREE.Vector3> = {
  XY: new THREE.Vector3(0, 0, 1),
  XZ: new THREE.Vector3(0, 1, 0),
  YZ: new THREE.Vector3(1, 0, 0),
};

export const ARROW_SHAFT_RADIUS = 2;
export const ARROW_SHAFT_LENGTH = 80;
export const ARROW_CONE_RADIUS = 6;
export const ARROW_CONE_LENGTH = 20;

export const PLANE_HANDLE_SIZE = 20;
export const PLANE_HANDLE_OFFSET = 33;
export const PLANE_HANDLE_OPACITY = 0.3;

export const CENTER_SPHERE_RADIUS = 8;

export const RING_RADIUS = 75;
export const RING_TUBE = 3.5;
export const RING_RADIAL_SEGMENTS = 12;
export const RING_SEGMENTS = 64;
export const SCREEN_RING_RADIUS = 90;
export const SCREEN_RING_TUBE = 1.25;

export const SCALE_CUBE_SIZE = 8;
export const SCALE_CENTER_CUBE_SIZE = 10;

export const PICKER_ARROW_RADIUS = 6;
export const PICKER_RING_TUBE = 4;
export const PICKER_PLANE_SIZE = 30;

export const INACTIVE_OPACITY = 0.3;

/** Always render above scene geometry and selection outline */
export const GIZMO_RENDER_ORDER = 50_000;

export const GIZMO_LAYER = 1;
export const PICKER_LAYER = 2;
