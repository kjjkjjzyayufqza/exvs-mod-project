import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildImportedDaeDisplayRoot,
  normalizeImportedDaeHierarchy,
} from "./importedDaeSceneNormalize";

function sceneCenter(scene: THREE.Object3D): THREE.Vector3 {
  const box = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  box.getCenter(center);
  return center;
}

describe("importedDaeSceneNormalize", () => {
  it("normalizeImportedDaeHierarchy moves mesh when parent translates", () => {
    const root = new THREE.Group();
    const baked = new THREE.Group();
    baked.matrixAutoUpdate = false;
    baked.matrix.setPosition(4, 0, 0);
    baked.updateMatrix();

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    baked.add(mesh);
    root.add(baked);

    normalizeImportedDaeHierarchy(root);

    const wrapper = new THREE.Group();
    wrapper.add(root);
    wrapper.position.set(10, 0, 0);
    wrapper.updateMatrixWorld(true);

    const worldBefore = new THREE.Vector3();
    mesh.getWorldPosition(worldBefore);

    wrapper.position.set(20, 0, 0);
    wrapper.updateMatrixWorld(true);

    const worldAfter = new THREE.Vector3();
    mesh.getWorldPosition(worldAfter);

    expect(worldAfter.x - worldBefore.x).toBeCloseTo(10, 4);
  });

  it("buildImportedDaeDisplayRoot moves baked mesh when display root translates", () => {
    const root = new THREE.Group();
    const baked = new THREE.Group();
    baked.matrixAutoUpdate = false;
    baked.matrix.setPosition(4, 0, 0);
    baked.updateMatrix();

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    baked.add(mesh);
    root.add(baked);

    const display = buildImportedDaeDisplayRoot(root);
    expect(display.children.length).toBeGreaterThan(0);

    display.position.set(10, 0, 0);
    display.updateMatrixWorld(true);

    const worldBefore = new THREE.Vector3();
    display.children[0].getWorldPosition(worldBefore);

    display.position.set(-36.308, 0, 0);
    display.updateMatrixWorld(true);

    const worldAfter = new THREE.Vector3();
    display.children[0].getWorldPosition(worldAfter);

    expect(worldAfter.x).toBeCloseTo(-36.308, 3);
    expect(worldAfter.x - worldBefore.x).toBeCloseTo(-46.308, 3);
  });

  it("normalizes baked DAE geometry to ground plane (min Y = 0, XZ centered)", () => {
    const root = new THREE.Group();
    const offset = new THREE.Group();
    offset.matrixAutoUpdate = false;
    offset.matrix.setPosition(36.308, 0, 0);
    offset.updateMatrix();

    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    offset.add(mesh);
    root.add(offset);

    const display = buildImportedDaeDisplayRoot(root);
    const box = new THREE.Box3().setFromObject(display);
    expect(box.min.y).toBeCloseTo(0, 3);
    const initialCenter = sceneCenter(display);
    expect(initialCenter.x).toBeCloseTo(0, 3);
    expect(initialCenter.y).toBeCloseTo(1, 3);

    display.position.set(-36.308, 5, 10);
    display.rotation.y = Math.PI / 4;
    display.scale.set(2, 2, 2);
    display.updateMatrixWorld(true);

    const movedCenter = sceneCenter(display);
    expect(movedCenter.x).toBeCloseTo(-36.308, 3);
    expect(movedCenter.y).toBeCloseTo(7, 3);
    expect(movedCenter.z).toBeCloseTo(10, 3);
  });
});
