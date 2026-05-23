import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  SCENE_SELECTION_COLOR,
  SCENE_SELECTION_COLOR_HEX,
  SCENE_SELECTION_RENDER_ORDER,
  appendSelectionOutlineShell,
  createSelectionOutlineMaterial,
} from "./sceneSelectionOverlay";

describe("sceneSelectionOverlay", () => {
  it("uses UE-style orange for outline material", () => {
    const material = createSelectionOutlineMaterial();
    expect(material.color.getHex()).toBe(SCENE_SELECTION_COLOR);
    expect(SCENE_SELECTION_COLOR_HEX).toBe("#ffb840");
    expect(material.side).toBe(THREE.BackSide);
    expect(material.depthWrite).toBe(false);
  });

  it("appends a backface outline shell when selected", () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    );
    root.add(mesh);

    appendSelectionOutlineShell(root, root);

    expect(root.children.length).toBe(2);
    const outlineRoot = root.children[1];
    let outlineMesh: THREE.Mesh | null = null;
    outlineRoot.traverse((child) => {
      if (child instanceof THREE.Mesh) outlineMesh = child;
    });
    expect(outlineMesh).not.toBeNull();
    expect(outlineMesh!.renderOrder).toBe(SCENE_SELECTION_RENDER_ORDER);
    expect((outlineMesh!.material as THREE.MeshBasicMaterial).side).toBe(THREE.BackSide);
  });
});
