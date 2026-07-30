import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MeshDataJson, MeshObjectJson } from "@/components/ssbh-model-preview/types";
import { getMeshObjectStats, MeshReadonlyTab } from "./MeshReadonlyTab";

function createLegacyInlineObject(): MeshObjectJson {
  return {
    name: "legacyMesh",
    subindex: 0,
    parent_bone_name: "",
    positions: [
      {
        name: "Position0",
        data: {
          Vector3: [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0],
          ],
        },
      },
    ],
    vertex_indices: [0, 1, 2],
    texture_coordinates: [
      { name: "map1", data: { Vector2: [[0, 0], [1, 0], [0, 1]] } },
      { name: "uvSet", data: { Vector2: [[0, 0], [1, 0], [0, 1]] } },
    ],
    bone_influences: [{ bone_name: "root", vertex_weights: [] }],
  };
}

function createBinaryObject(overrides?: Partial<MeshObjectJson>): MeshObjectJson {
  return {
    name: "binaryMesh",
    subindex: 1,
    parent_bone_name: "",
    __bin: {
      positions: new Float32Array(4 * 3),
      normals: new Float32Array(4 * 3),
      uv0: new Float32Array(4 * 2),
      uv1: new Float32Array(4 * 2),
      indices: new Uint32Array([0, 1, 2, 1, 2, 3]),
    },
    ...overrides,
  };
}

describe("getMeshObjectStats", () => {
  it("computes stats from legacy inline arrays", () => {
    expect(getMeshObjectStats(createLegacyInlineObject())).toEqual({
      vertexCount: 3,
      triangleCount: 1,
      uvChannels: 2,
      boneInfluences: 1,
    });
  });

  it("computes stats from binary typed-array views", () => {
    const obj = createBinaryObject({
      bone_influences: [
        { bone_name: "root", vertex_weights: [] },
        { bone_name: "spine", vertex_weights: [] },
      ],
    });

    expect(getMeshObjectStats(obj)).toEqual({
      vertexCount: 4,
      triangleCount: 2,
      uvChannels: 2,
      boneInfluences: 2,
    });
  });

  it("reports null bone influences for a binary object without bone data", () => {
    const obj = createBinaryObject({
      __bin: {
        positions: new Float32Array(4 * 3),
        normals: null,
        uv0: new Float32Array(4 * 2),
        uv1: null,
        indices: new Uint32Array([0, 1, 2, 1, 2, 3]),
      },
    });

    expect(getMeshObjectStats(obj)).toEqual({
      vertexCount: 4,
      triangleCount: 2,
      uvChannels: 1,
      boneInfluences: null,
    });
  });
});

describe("MeshReadonlyTab", () => {
  it("renders binary mesh stats and a dash for missing bone data", () => {
    const mesh: MeshDataJson = {
      major_version: 1,
      minor_version: 10,
      is_vs2: false,
      objects: [
        createBinaryObject({
          __bin: {
            positions: new Float32Array(4 * 3),
            normals: null,
            uv0: null,
            uv1: null,
            indices: new Uint32Array([0, 1, 2, 1, 2, 3]),
          },
        }),
      ],
    };

    render(<MeshReadonlyTab mesh={mesh} />);

    expect(screen.getByText("Total Vertices: 4")).toBeInTheDocument();
    expect(screen.getByText("Total Triangles: 2")).toBeInTheDocument();
    expect(screen.getByText("binaryMesh")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
  });
});
