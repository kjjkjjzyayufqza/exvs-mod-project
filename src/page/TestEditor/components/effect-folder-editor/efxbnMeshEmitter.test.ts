import { describe, expect, it } from "vitest";
import { BufferAttribute, BufferGeometry } from "three";
import type { BuiltMeshDraw } from "@/components/ssbh-model-preview/types";
import { extractEfxbnMeshEmitterPoints } from "./efxbnMeshEmitter";

describe("EFXBN mesh emitter extraction", () => {
  it("deduplicates expanded triangle vertices and preserves normal and color", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([
      1, 2, 3,
      1, 2, 3,
      4, 5, 6,
    ]), 3));
    geometry.setAttribute("normal", new BufferAttribute(new Float32Array([
      0, 1, 0,
      0, 1, 0,
      1, 0, 0,
    ]), 3));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array([
      0.5, 0.6, 0.7, 0.8,
      0.5, 0.6, 0.7, 0.8,
      1, 1, 1, 1,
    ]), 4));
    const draw = {
      key: "source::mesh_0",
      label: "mesh",
      geometry,
      materialLabel: "material",
      meshObjectName: "mesh",
      meshObjectSubindex: 0,
      skin: null,
      previewInstanceId: "source",
    } satisfies BuiltMeshDraw;

    expect(extractEfxbnMeshEmitterPoints([draw], "source", 1)).toEqual([{
      position: [1, 2, 3],
      normal: [0, 1, 0],
      color: [0.5, expect.closeTo(0.6, 6), expect.closeTo(0.7, 6), expect.closeTo(0.8, 6)],
    }]);
  });

  it("samples the current skinned vertex pose for animated emitters", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([1, 2, 3]), 3));
    geometry.setAttribute("normal", new BufferAttribute(new Float32Array([0, 1, 0]), 3));
    const draw = {
      key: "animated::mesh_0",
      label: "mesh",
      geometry,
      materialLabel: "material",
      meshObjectName: "mesh",
      meshObjectSubindex: 0,
      skin: {
        boneCount: 1,
        bindPositions: new Float32Array([1, 2, 3]),
        boneIndices: new Uint16Array([0, 0, 0, 0]),
        boneWeights: new Float32Array([1, 0, 0, 0]),
        gpuAttributesReady: true,
      },
      previewInstanceId: "animated",
    } satisfies BuiltMeshDraw;
    const translatedBone = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      10, 20, 30, 1,
    ]);

    expect(extractEfxbnMeshEmitterPoints([draw], "animated", 1, translatedBone)).toEqual([{
      position: [11, 22, 33],
      normal: [0, 1, 0],
      color: [1, 1, 1, 1],
    }]);
  });
});
