import type { HavokMeshData } from "@/utils/havokXmlParser";

/** Session and disk target for a generated stage border. */
export const BORDER_HIT_TARGET_ID = "info/border_hit.hkt";

export function isBorderHitSource(sourceId: string): boolean {
  return sourceId.replace(/\\/g, "/").toLowerCase().endsWith("border_hit.hkt");
}

export function borderHitFolderKey(sourceId: string): string {
  const parts = sourceId.replace(/\\/g, "/").split("/");
  return parts.length >= 2 ? (parts[0] ?? sourceId) : sourceId;
}

export function findBorderHitMesh(
  meshDataMap: ReadonlyMap<string, HavokMeshData>,
): { sourceId: string; data: HavokMeshData } | null {
  for (const [sourceId, data] of meshDataMap) {
    if (isBorderHitSource(sourceId)) return { sourceId, data };
  }
  return null;
}
