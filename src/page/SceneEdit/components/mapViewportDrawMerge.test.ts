import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mergeDrawBindingsByMaterial } from "./mapViewportDrawMerge";

type TestDrawBinding = {
  draw: {
    key: string;
    materialLabel: string;
    geometry: THREE.BufferGeometry;
  };
  binding: {
    materialLabel: string;
  };
};

function createIndexedGeometry(indexCount: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
  );
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexCount), 1));
  return geometry;
}

function createLargeVertexGeometry(vertexCount: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array([0, 1, 2]), 1));
  return geometry;
}

function createBinding(
  key: string,
  materialLabel: string,
  indexCount: number,
): TestDrawBinding {
  return {
    draw: {
      key,
      materialLabel,
      geometry: createIndexedGeometry(indexCount),
    },
    binding: {
      materialLabel,
    },
  };
}

function createLargeVertexBinding(
  key: string,
  materialLabel: string,
  vertexCount: number,
): TestDrawBinding {
  return {
    draw: {
      key,
      materialLabel,
      geometry: createLargeVertexGeometry(vertexCount),
    },
    binding: {
      materialLabel,
    },
  };
}

describe("mergeDrawBindingsByMaterial", () => {
  it("merges small groups sharing the same material", () => {
    const group = [
      createBinding("a", "DefaultMaterial", 300),
      createBinding("b", "DefaultMaterial", 300),
    ];

    const merged = mergeDrawBindingsByMaterial(group);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.draw.key).toBe("merged_DefaultMaterial");
  });

  it("keeps giant same-material groups split to avoid oversized merged geometry", () => {
    const group = [
      createBinding("a", "DefaultMaterial", 1_800_000),
      createBinding("b", "DefaultMaterial", 1_800_000),
    ];

    const merged = mergeDrawBindingsByMaterial(group);

    expect(merged).toHaveLength(2);
    expect(merged.map((entry) => entry.draw.key)).toEqual(["a", "b"]);
  });

  it("keeps giant same-material groups split when vertex count is too large even if triangle count is small", () => {
    const group = [
      createLargeVertexBinding("a", "DefaultMaterial", 3_100_000),
      createBinding("b", "DefaultMaterial", 300),
    ];

    const merged = mergeDrawBindingsByMaterial(group);

    expect(merged).toHaveLength(2);
    expect(merged.map((entry) => entry.draw.key)).toEqual(["a", "b"]);
  });
});
