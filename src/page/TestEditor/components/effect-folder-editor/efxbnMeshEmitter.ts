import type { BuiltMeshDraw } from "@/components/ssbh-model-preview/types";

const MESH_EMITTER_PREVIEW_POINT_CAP = 4_096;

export type EfxbnMeshEmitterPoint = {
  position: [number, number, number];
  normal: [number, number, number];
  color: [number, number, number, number];
};

function skinnedPosition(
  draw: BuiltMeshDraw,
  vertexIndex: number,
  boneMatrices: ArrayLike<number>,
): [number, number, number] | null {
  const skin = draw.skin;
  if (!skin || boneMatrices.length < skin.boneCount * 16) return null;
  const positionOffset = vertexIndex * 3;
  const influenceOffset = vertexIndex * 4;
  const x = skin.bindPositions[positionOffset];
  const y = skin.bindPositions[positionOffset + 1];
  const z = skin.bindPositions[positionOffset + 2];
  if (x === undefined || y === undefined || z === undefined) return null;
  let resultX = 0;
  let resultY = 0;
  let resultZ = 0;
  let totalWeight = 0;
  for (let lane = 0; lane < 4; lane += 1) {
    const weight = skin.boneWeights[influenceOffset + lane] ?? 0;
    const boneIndex = skin.boneIndices[influenceOffset + lane] ?? 0;
    if (weight <= 0 || boneIndex >= skin.boneCount) continue;
    const matrixOffset = boneIndex * 16;
    resultX += (boneMatrices[matrixOffset]! * x + boneMatrices[matrixOffset + 4]! * y +
      boneMatrices[matrixOffset + 8]! * z + boneMatrices[matrixOffset + 12]!) * weight;
    resultY += (boneMatrices[matrixOffset + 1]! * x + boneMatrices[matrixOffset + 5]! * y +
      boneMatrices[matrixOffset + 9]! * z + boneMatrices[matrixOffset + 13]!) * weight;
    resultZ += (boneMatrices[matrixOffset + 2]! * x + boneMatrices[matrixOffset + 6]! * y +
      boneMatrices[matrixOffset + 10]! * z + boneMatrices[matrixOffset + 14]!) * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? [resultX / totalWeight, resultY / totalWeight, resultZ / totalWeight] : null;
}

function skinnedNormal(
  draw: BuiltMeshDraw,
  vertexIndex: number,
  normal: readonly [number, number, number],
  boneMatrices: ArrayLike<number>,
): [number, number, number] {
  const skin = draw.skin;
  if (!skin || boneMatrices.length < skin.boneCount * 16) return [...normal];
  const influenceOffset = vertexIndex * 4;
  let x = 0;
  let y = 0;
  let z = 0;
  let totalWeight = 0;
  for (let lane = 0; lane < 4; lane += 1) {
    const weight = skin.boneWeights[influenceOffset + lane] ?? 0;
    const boneIndex = skin.boneIndices[influenceOffset + lane] ?? 0;
    if (weight <= 0 || boneIndex >= skin.boneCount) continue;
    const matrixOffset = boneIndex * 16;
    x += (boneMatrices[matrixOffset]! * normal[0] + boneMatrices[matrixOffset + 4]! * normal[1] +
      boneMatrices[matrixOffset + 8]! * normal[2]) * weight;
    y += (boneMatrices[matrixOffset + 1]! * normal[0] + boneMatrices[matrixOffset + 5]! * normal[1] +
      boneMatrices[matrixOffset + 9]! * normal[2]) * weight;
    z += (boneMatrices[matrixOffset + 2]! * normal[0] + boneMatrices[matrixOffset + 6]! * normal[1] +
      boneMatrices[matrixOffset + 10]! * normal[2]) * weight;
    totalWeight += weight;
  }
  const length = Math.hypot(x, y, z);
  return totalWeight > 0 && length > Number.EPSILON ? [x / length, y / length, z / length] : [...normal];
}

export function extractEfxbnMeshEmitterPoints(
  draws: readonly BuiltMeshDraw[],
  instanceId: string,
  requestedCount: number,
  boneMatrices?: ArrayLike<number> | null,
): EfxbnMeshEmitterPoint[] {
  const points: EfxbnMeshEmitterPoint[] = [];
  const seen = new Set<string>();
  const limit = requestedCount > 0
    ? Math.min(requestedCount, MESH_EMITTER_PREVIEW_POINT_CAP)
    : MESH_EMITTER_PREVIEW_POINT_CAP;
  for (const draw of draws) {
    if (draw.previewInstanceId !== instanceId) continue;
    const positions = draw.geometry.getAttribute("position");
    const normals = draw.geometry.getAttribute("normal");
    const colors = draw.geometry.getAttribute("color");
    if (!positions) continue;
    for (let index = 0; index < positions.count && points.length < limit; index += 1) {
      const position: [number, number, number] = boneMatrices
        ? skinnedPosition(draw, index, boneMatrices) ?? [positions.getX(index), positions.getY(index), positions.getZ(index)]
        : [positions.getX(index), positions.getY(index), positions.getZ(index)];
      const baseNormal: [number, number, number] = normals
        ? [normals.getX(index), normals.getY(index), normals.getZ(index)]
        : [0, 1, 0];
      const normal = boneMatrices ? skinnedNormal(draw, index, baseNormal, boneMatrices) : baseNormal;
      const color: [number, number, number, number] = colors
        ? [
            colors.getX(index),
            colors.getY(index),
            colors.getZ(index),
            colors.itemSize >= 4 ? colors.getW(index) : 1,
          ]
        : [1, 1, 1, 1];
      const key = [...position, ...normal, ...color].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      points.push({ position, normal, color });
    }
    if (points.length >= limit) break;
  }
  return points;
}
