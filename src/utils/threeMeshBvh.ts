import * as THREE from "three";
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from "three-mesh-bvh";

/**
 * Install BVH-accelerated raycasting globally.
 *
 * Scene Editor picks (R3F's pointer event system, the marquee/empty-space
 * controller, and the transform gizmo) all route through
 * `Raycaster.intersectObjects`, which without an acceleration structure is
 * O(triangles) per ray. At 100k+ triangles / 100+ objects that synchronously
 * stalls the main thread for hundreds of ms to seconds on every pointer event,
 * which is what makes the viewport unable to scroll or click.
 *
 * Patching the THREE prototypes makes every Mesh / InstancedMesh raycast use
 * the geometry's BVH when one is present, turning each pick into O(log n).
 * `acceleratedRaycast` transparently falls back to the stock raycast for any
 * geometry without a `boundsTree`, so the patch is safe to apply process-wide.
 */
// three-mesh-bvh's exported `computeBoundsTree` is typed against its own BVH
// class while the prototype augmentation references three's re-exported one;
// the runtime function is correct, so narrow the cast to the prototype type.
THREE.BufferGeometry.prototype.computeBoundsTree =
  computeBoundsTree as unknown as typeof THREE.BufferGeometry.prototype.computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;
// InstancedMesh defines its own raycast on its prototype, so it must be patched
// separately or instanced placements would keep using the unaccelerated path.
THREE.InstancedMesh.prototype.raycast = acceleratedRaycast;

/** Build the BVH for a geometry once; subsequent calls are no-ops. */
export function ensureBoundsTree(geometry: THREE.BufferGeometry): void {
  if (geometry.boundsTree) return;
  if (!geometry.getAttribute("position")) return;
  geometry.computeBoundsTree();
}
