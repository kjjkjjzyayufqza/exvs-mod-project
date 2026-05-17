import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createBakedImportedDaeExportObject,
} from "./sceneSavePipeline";

function makeImportedDaeObject(name: string, hasMesh = true) {
  const group = new THREE.Group();
  group.name = name;
  if (hasMesh) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.name = `${name}_geo`;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.name = `${name}_mesh`;
    group.add(mesh);
  }
  return {
    id: `id-${name}`,
    name,
    sourcePath: `/fake/${name}.dae`,
    scene: group,
    transform: {
      posX: 0, posY: 0, posZ: 0,
      rotX: 0, rotY: 0, rotZ: 0,
      scaleX: 1, scaleY: 1, scaleZ: 1,
    },
  };
}

describe("sceneSavePipeline", () => {
  describe("createBakedImportedDaeExportObject", () => {
    it("bakes rigid meshes into a flat group", () => {
      const obj = makeImportedDaeObject("test_box");
      const baked = createBakedImportedDaeExportObject(obj, { includeActorTransform: false });
      expect(baked.name).toBe("test_box");
      const meshes = baked.children.filter((c) => c instanceof THREE.Mesh);
      expect(meshes.length).toBe(1);
    });

    it("throws for objects with no meshes", () => {
      const obj = makeImportedDaeObject("empty", false);
      expect(() =>
        createBakedImportedDaeExportObject(obj, { includeActorTransform: false }),
      ).toThrow("no exportable meshes");
    });

    it("applies actor transform when includeActorTransform is true", () => {
      const obj = makeImportedDaeObject("moved");
      obj.transform = {
        posX: 10, posY: 20, posZ: 30,
        rotX: 0, rotY: 0, rotZ: 0,
        scaleX: 2, scaleY: 2, scaleZ: 2,
      };
      const baked = createBakedImportedDaeExportObject(obj, { includeActorTransform: true });
      const mesh = baked.children[0] as THREE.Mesh;
      const bbox = new THREE.Box3().setFromObject(mesh);
      expect(bbox.min.x).toBeGreaterThan(5);
    });

    it("throws for skinned meshes", () => {
      const group = new THREE.Group();
      group.name = "skinned";
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const skeleton = new THREE.Skeleton([new THREE.Bone()]);
      const skinned = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
      skinned.bind(skeleton);
      group.add(skinned);

      const obj = {
        id: "id-skinned",
        name: "skinned",
        sourcePath: "/fake/skinned.dae",
        scene: group,
        transform: {
          posX: 0, posY: 0, posZ: 0,
          rotX: 0, rotY: 0, rotZ: 0,
          scaleX: 1, scaleY: 1, scaleZ: 1,
        },
      };

      expect(() =>
        createBakedImportedDaeExportObject(obj, { includeActorTransform: false }),
      ).toThrow("skinned meshes");
    });
  });
});
