import { generateHavokMesh } from "@/utils/havokMeshGenerator";
import { parseHavokXML, type HavokMeshData } from "@/utils/havokXmlParser";
import type {
  GeneratedHktFromDaePayload,
  HktCollisionMeshGeometry,
} from "./sceneSessionService";

export type ParseHavokXmlFn = (xml: string) => HavokMeshData;

export interface HktFromModelPreviewResolution {
  geometry: HktCollisionMeshGeometry;
  /** True when preview shows pre-Havok mesh stats instead of decoded HKT. */
  usesPreHavokMesh: boolean;
}

/**
 * Build the same triangle soup the scene Havok overlay uses (HKT XML decode path),
 * for the New-Model HKT preview canvas.
 */
export function havokMeshDataToCollisionPreviewGeometry(
  data: HavokMeshData,
  stats?: Pick<
    HktCollisionMeshGeometry,
    "renderTriangleCount" | "mergedTriangleCount"
  >,
): HktCollisionMeshGeometry {
  const bufferGeometry = generateHavokMesh(data);
  const positionAttr = bufferGeometry.getAttribute("position");
  const indexAttr = bufferGeometry.getIndex();

  if (!positionAttr || positionAttr.count === 0 || !indexAttr) {
    return {
      positions: new Float32Array(0),
      indices: new Uint32Array(0),
      triangleCount: 0,
      vertexCount: 0,
      renderTriangleCount: stats?.renderTriangleCount ?? 0,
      mergedTriangleCount: stats?.mergedTriangleCount ?? 0,
    };
  }

  const positions = new Float32Array(positionAttr.array as ArrayLike<number>);
  const indices = new Uint32Array(indexAttr.array as ArrayLike<number>);

  return {
    positions,
    indices,
    triangleCount: indices.length / 3,
    vertexCount: positionAttr.count,
    renderTriangleCount: stats?.renderTriangleCount ?? 0,
    mergedTriangleCount: stats?.mergedTriangleCount ?? 0,
  };
}

/**
 * Choose preview geometry for the New-Model HKT dialog: prefer Havok-decoded HKT
 * (same as the scene collision overlay) and fall back to pre-Havok mesh stats.
 */
export function resolveHktFromModelPreviewGeometry(
  meshStats: HktCollisionMeshGeometry,
  hktPayload: Pick<GeneratedHktFromDaePayload, "hktXml">,
  parseXml: ParseHavokXmlFn = parseHavokXML,
): HktFromModelPreviewResolution {
  if (!hktPayload.hktXml.trim()) {
    return { geometry: meshStats, usesPreHavokMesh: true };
  }

  try {
    const decoded = parseXml(hktPayload.hktXml);
    return {
      geometry: havokMeshDataToCollisionPreviewGeometry(decoded, {
        renderTriangleCount: meshStats.renderTriangleCount,
        mergedTriangleCount: meshStats.mergedTriangleCount,
      }),
      usesPreHavokMesh: false,
    };
  } catch {
    return { geometry: meshStats, usesPreHavokMesh: true };
  }
}
