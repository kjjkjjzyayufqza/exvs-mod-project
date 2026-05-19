import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import * as THREE from "three";
import { ColladaLoader } from "three-stdlib";
import { buildImportedDaeDisplayRoot } from "./importedDaeSceneNormalize";

const ZABANYA_DAE = "D:/output/exvs2/zabanya/backpack_up.dae";
const ZABANYA_DAE_FILES = [
  "D:/output/exvs2/zabanya/backpack_up.dae",
  "D:/output/exvs2/zabanya/body.dae",
  "D:/output/exvs2/zabanya/backpack_bottom.dae",
];

function loadColladaScene(path: string): THREE.Object3D {
  const text = readFileSync(path, "utf8");
  const loader = new ColladaLoader();
  const collada = loader.parse(text, "");
  return collada.scene;
}

function sceneCenter(scene: THREE.Object3D): THREE.Vector3 {
  const box = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  box.getCenter(center);
  return center;
}

function sceneSize(scene: THREE.Object3D): THREE.Vector3 {
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  return size;
}

describe("zabanya backpack_up.dae integration", () => {
  it("moves display root when position is applied", () => {
    if (!existsSync(ZABANYA_DAE)) {
      return;
    }

    const source = loadColladaScene(ZABANYA_DAE);
    const display = buildImportedDaeDisplayRoot(source);
    const wrapper = new THREE.Group();
    wrapper.add(display);

    const before = sceneCenter(wrapper);
    wrapper.position.set(-36.308, 5, 10);
    wrapper.updateMatrixWorld(true);
    const after = sceneCenter(wrapper);

    expect(after.x - before.x).toBeCloseTo(-36.308, 2);
    expect(after.y - before.y).toBeCloseTo(5, 2);
    expect(after.z - before.z).toBeCloseTo(10, 2);
  });

  it("centers Zabanya imported previews on the editable actor pivot", () => {
    for (const path of ZABANYA_DAE_FILES) {
      if (!existsSync(path)) {
        continue;
      }

      const source = loadColladaScene(path);
      const display = buildImportedDaeDisplayRoot(source);
      const initialCenter = sceneCenter(display);
      const initialSize = sceneSize(display);

      expect(initialCenter.x).toBeCloseTo(0, 2);
      expect(initialCenter.y).toBeCloseTo(0, 2);
      expect(initialCenter.z).toBeCloseTo(0, 2);
      expect(Number.isFinite(initialSize.x)).toBe(true);
      expect(Number.isFinite(initialSize.y)).toBe(true);
      expect(Number.isFinite(initialSize.z)).toBe(true);
      expect(initialSize.length()).toBeGreaterThan(0.01);

      display.position.set(-36.308, 5, 10);
      display.rotation.y = Math.PI / 6;
      display.scale.set(1.5, 1.5, 1.5);
      display.updateMatrixWorld(true);

      const movedCenter = sceneCenter(display);
      expect(movedCenter.x).toBeCloseTo(-36.308, 2);
      expect(movedCenter.y).toBeCloseTo(5, 2);
      expect(movedCenter.z).toBeCloseTo(10, 2);
    }
  });
});
