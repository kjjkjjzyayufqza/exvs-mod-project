import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { buildFbxExportContent } from "./daeExportImport";

function createSkinnedExportObject(): THREE.Group {
  const root = new THREE.Group();
  root.name = "skinned_export";

  const rootBone = new THREE.Bone();
  rootBone.name = "root";
  const childBone = new THREE.Bone();
  childBone.name = "joint1";
  childBone.position.set(0, 1, 0);
  rootBone.add(childBone);

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2]);

  const skinIndex = new Uint16Array([
    0, 0, 0, 0,
    0, 1, 0, 0,
    1, 0, 0, 0,
  ]);
  const skinWeight = new Float32Array([
    1, 0, 0, 0,
    0.5, 0.5, 0, 0,
    0, 1, 0, 0,
  ]);
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeight, 4));
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([
      0.2, 0.1,
      0.8, 0.3,
      0.4, 0.9,
    ], 2),
  );
  geometry.computeVertexNormals();

  const skeleton = new THREE.Skeleton([rootBone, childBone]);
  const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  skinned.name = "mesh";
  skinned.bind(skeleton);
  root.add(skinned);
  root.updateMatrixWorld(true);
  return root;
}

function decodeFbxStringTable(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

describe("buildFbxExportContent skinning", () => {
  it("writes binary FBX output with skinning nodes", async () => {
    const object = createSkinnedExportObject();
    const bytes = await buildFbxExportContent(object, { upAxis: "y_up" });
    const content = decodeFbxStringTable(bytes);

    expect(content.startsWith("Kaydara FBX Binary")).toBe(true);
    expect(content).toContain("LimbNode");
    expect(content).toContain("Skin");
    expect(content).toContain("Cluster");
    expect(content).toContain("BindPose");
  });

  it("includes bone names in the exported FBX string table", async () => {
    const object = createSkinnedExportObject();
    const bytes = await buildFbxExportContent(object, { upAxis: "y_up" });
    const content = decodeFbxStringTable(bytes);

    expect(content).toContain("root");
    expect(content).toContain("joint1");
    expect(content).toContain("mesh");
  });
});
