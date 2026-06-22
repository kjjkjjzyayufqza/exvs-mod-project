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

describe("buildFbxExportContent skinning", () => {
  it("writes skeleton and skin blocks for SkinnedMesh exports", async () => {
    const object = createSkinnedExportObject();
    const content = await buildFbxExportContent(object, { upAxis: "y_up" });

    expect(content).toContain("LimbNode");
    expect(content).toContain('"Deformer::", "Skin"');
    expect(content).toContain('"Cluster"');
    expect(content).toContain("BindPose");
    expect(content).toContain("Indexes:");
    expect(content).toContain("Weights:");
    expect(content).toContain("Transform:");
    expect(content).toContain("TransformLink:");
  });

  it("writes bone and cluster connections for the generated skinning data", async () => {
    const object = createSkinnedExportObject();
    const content = await buildFbxExportContent(object, { upAxis: "y_up" });

    expect(content).toContain('Model::root');
    expect(content).toContain('Model::joint1');
    expect(content).toContain('C: "OO",700000,100000');
    expect(content).toContain('C: "OO",710000,700000');
    expect(content).toContain('C: "OO",710001,700000');
    expect(content).toContain('C: "OO",600000,710000');
    expect(content).toContain('C: "OO",600010,710001');
    expect(content).toContain('C: "OO",600010,600000');
    expect(content).toContain('Pose::BindPose');
  });

  it("flips V coordinates when serializing FBX UV layers", async () => {
    const object = createSkinnedExportObject();
    const content = await buildFbxExportContent(object, { upAxis: "y_up" });

    expect(content).toContain("LayerElementUV: 0");
    expect(content).toContain("a: 0.2,0.9,0.8,0.7,0.4,0.1");
  });
});
