import { describe, expect, it, vi } from "vitest";
import type { HavokMeshData } from "@/utils/havokXmlParser";
import {
  havokMeshDataToCollisionPreviewGeometry,
  resolveHktFromModelPreviewGeometry,
} from "./hktPreviewGeometry";
import type { GeneratedHktFromDaePayload, HktCollisionMeshGeometry } from "./sceneSessionService";

const unitQuadMesh: HavokMeshData = {
  vertices: [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
  ],
  quads: [[0, 1, 2, 3]],
  aabb: { min: [0, 0, 0], max: [1, 1, 0] },
  bodies: [],
};

function meshStatsWithMarker(marker: number): HktCollisionMeshGeometry {
  return {
    positions: new Float32Array([marker, marker, marker]),
    indices: new Uint32Array([0, 0, 0]),
    triangleCount: 1,
    vertexCount: 1,
    renderTriangleCount: 100,
    mergedTriangleCount: 80,
  };
}

describe("havokMeshDataToCollisionPreviewGeometry", () => {
  it("converts quads to triangle indices like the scene overlay", () => {
    const geo = havokMeshDataToCollisionPreviewGeometry(unitQuadMesh, {
      renderTriangleCount: 10,
      mergedTriangleCount: 8,
    });

    expect(geo.vertexCount).toBe(4);
    expect(geo.triangleCount).toBe(2);
    expect(geo.indices.length).toBe(6);
    expect(geo.renderTriangleCount).toBe(10);
    expect(geo.mergedTriangleCount).toBe(8);
    expect(geo.positions.length).toBe(12);
  });
});

describe("resolveHktFromModelPreviewGeometry", () => {
  it("uses Havok-decoded geometry when hktXml is present so preview matches the scene overlay", () => {
    const meshStats = meshStatsWithMarker(99);
    const parseXml = vi.fn(() => unitQuadMesh);

    const { geometry, usesPreHavokMesh } = resolveHktFromModelPreviewGeometry(
      meshStats,
      { hktXml: "<hkpackfile/>" } satisfies Pick<GeneratedHktFromDaePayload, "hktXml">,
      parseXml,
    );

    expect(parseXml).toHaveBeenCalledWith("<hkpackfile/>");
    expect(usesPreHavokMesh).toBe(false);
    expect(geometry.positions[0]).toBe(0);
    expect(geometry.vertexCount).toBe(4);
    expect(geometry.renderTriangleCount).toBe(100);
    expect(geometry.mergedTriangleCount).toBe(80);
  });

  it("falls back to pre-Havok mesh stats when hktXml is empty", () => {
    const meshStats = meshStatsWithMarker(42);
    const parseXml = vi.fn(() => unitQuadMesh);

    const result = resolveHktFromModelPreviewGeometry(meshStats, { hktXml: "  " }, parseXml);

    expect(parseXml).not.toHaveBeenCalled();
    expect(result.usesPreHavokMesh).toBe(true);
    expect(result.geometry).toBe(meshStats);
    expect(result.geometry.positions[0]).toBe(42);
  });

  it("falls back to pre-Havok mesh stats when Havok XML parsing fails", () => {
    const meshStats = meshStatsWithMarker(7);
    const parseXml = vi.fn(() => {
      throw new Error("XML parsing failed");
    });

    const result = resolveHktFromModelPreviewGeometry(
      meshStats,
      { hktXml: "<broken/>" },
      parseXml,
    );

    expect(result.usesPreHavokMesh).toBe(true);
    expect(result.geometry).toBe(meshStats);
  });
});
