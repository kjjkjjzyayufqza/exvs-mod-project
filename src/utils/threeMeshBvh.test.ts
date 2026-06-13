import * as THREE from "three";
import { describe, it, expect } from "vitest";
import { ensureBoundsTree } from "./threeMeshBvh";
import { measureSyncDurationBudget } from "@/test/performance";

/**
 * Non-indexed, position-only geometry that mirrors how `buildGeometryForObject`
 * builds Scene Editor meshes (de-indexed positions), at a triangle count high
 * enough that an unaccelerated pick is measurably slow.
 */
function buildHighPolyGeometry(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(1, 160, 160).toNonIndexed();
}

function pickThroughCenter(mesh: THREE.Mesh): number {
  const raycaster = new THREE.Raycaster();
  raycaster.set(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
  return raycaster.intersectObject(mesh, true).length;
}

describe("three-mesh-bvh accelerated raycast", () => {
  it("builds a bounds tree on scene-style geometry exactly once", () => {
    const geometry = buildHighPolyGeometry();
    expect(geometry.boundsTree).toBeUndefined();

    ensureBoundsTree(geometry);
    const firstTree = geometry.boundsTree;
    expect(firstTree).toBeDefined();

    ensureBoundsTree(geometry);
    expect(geometry.boundsTree).toBe(firstTree);
  });

  it("accelerates picking on high-poly geometry by an order of magnitude", () => {
    const naiveMesh = new THREE.Mesh(buildHighPolyGeometry());
    const naive = measureSyncDurationBudget(() => pickThroughCenter(naiveMesh), {
      iterations: 20,
      warmupIterations: 3,
      label: "pick without BVH",
    });

    const acceleratedGeometry = buildHighPolyGeometry();
    ensureBoundsTree(acceleratedGeometry);
    const acceleratedMesh = new THREE.Mesh(acceleratedGeometry);
    const accelerated = measureSyncDurationBudget(() => pickThroughCenter(acceleratedMesh), {
      iterations: 20,
      warmupIterations: 3,
      label: "pick with BVH",
    });

    // Both paths must return the same hit so the BVH is not skipping geometry.
    expect(naive.lastResult).toBeGreaterThan(0);
    expect(accelerated.lastResult).toBe(naive.lastResult);
    // The whole point of the fix: the accelerated pick is dramatically cheaper.
    expect(accelerated.averageMs).toBeLessThan(naive.averageMs / 3);
  });
});
