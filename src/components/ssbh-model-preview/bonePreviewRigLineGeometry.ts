import type { BufferGeometry } from "three";

export function refreshDynamicLineGeometryBounds(geometry: BufferGeometry): void {
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}
