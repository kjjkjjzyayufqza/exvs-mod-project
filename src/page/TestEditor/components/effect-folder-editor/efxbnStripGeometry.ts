import type { EfxbnEffectSummary } from "@/services/effectFolder/effectFolderService";
import { efxbnRuntime, type EfxbnPreviewParticle } from "./efxbnSimulation";

export const EFXBN_STRIP_SPLIT_LIMIT = 32;
export const EFXBN_STRIP_VERTEX_LIMIT = 16_384;

export type EfxbnStripMeshData = {
  centers: number[];
  previousCenters: number[];
  nextCenters: number[];
  sides: number[];
  widths: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
};

export type EfxbnStripUvTransform = {
  scale: readonly [number, number];
  offset: readonly [number, number];
};

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeSplitCount(splitCount: number): number {
  if (!Number.isFinite(splitCount)) return 1;
  return Math.min(EFXBN_STRIP_SPLIT_LIMIT, Math.max(1, Math.floor(splitCount)));
}

function subdivideHistory(
  history: readonly [number, number, number][],
  splitCount: number,
  maxPoints: number,
): [number, number, number][] {
  if (history.length < 2 || maxPoints < 2) return [];
  const splits = normalizeSplitCount(splitCount);
  const desiredPointCount = (history.length - 1) * splits + 1;
  const pointCount = Math.min(desiredPointCount, Math.floor(maxPoints));
  const result: [number, number, number][] = [];
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const pathPosition = pointIndex === pointCount - 1
      ? history.length - 1
      : (pointIndex / (pointCount - 1)) * (history.length - 1);
    const leftIndex = Math.min(history.length - 2, Math.floor(pathPosition));
    const rightIndex = leftIndex + 1;
    const t = pathPosition - leftIndex;
    const left = history[leftIndex];
    const right = history[rightIndex];
    result.push([
      left[0] + (right[0] - left[0]) * t,
      left[1] + (right[1] - left[1]) * t,
      left[2] + (right[2] - left[2]) * t,
    ]);
  }
  return result;
}

export function buildEfxbnStripMeshData(
  particles: readonly EfxbnPreviewParticle[],
  target: EfxbnEffectSummary,
  maxVertices: number,
  uvTransformForParticle?: (particle: EfxbnPreviewParticle) => EfxbnStripUvTransform,
): EfxbnStripMeshData {
  const data: EfxbnStripMeshData = {
    centers: [], previousCenters: [], nextCenters: [], sides: [], widths: [],
    uvs: [], colors: [], indices: [],
  };
  const vertexBudget = Math.min(
    EFXBN_STRIP_VERTEX_LIMIT,
    Number.isFinite(maxVertices) ? Math.max(0, Math.floor(maxVertices)) : EFXBN_STRIP_VERTEX_LIMIT,
  );
  for (const particle of particles) {
    const remainingPointCapacity = Math.floor((vertexBudget - data.sides.length) / 2);
    if (remainingPointCapacity < 2) break;
    const history = subdivideHistory(
      particle.history,
      target.stripSegmentSplitNum,
      remainingPointCapacity,
    );
    if (history.length < 2) continue;
    const uvTransform = uvTransformForParticle?.(particle) ?? {
      scale: [1, 1] as const,
      offset: [0, 0] as const,
    };
    const uvScaleX = finiteOr(uvTransform.scale[0], 1);
    const uvScaleY = finiteOr(uvTransform.scale[1], 1);
    const uvOffsetX = finiteOr(uvTransform.offset[0], 0);
    const uvOffsetY = finiteOr(uvTransform.offset[1], 0);
    const baseVertex = data.sides.length;
    history.forEach((center, index) => {
      const previous = history[Math.max(0, index - 1)];
      const next = history[Math.min(history.length - 1, index + 1)];
      const t = history.length <= 1 ? 1 : index / (history.length - 1);
      const runtime = efxbnRuntime(target);
      const alphaRate = runtime.stripTailAlphaRate +
        (runtime.stripHeadAlphaRate - runtime.stripTailAlphaRate) * t;
      for (const side of [-1, 1]) {
        data.centers.push(...center);
        data.previousCenters.push(...previous);
        data.nextCenters.push(...next);
        data.sides.push(side);
        data.widths.push(Math.abs(particle.size[0]) * 0.5);
        data.uvs.push(
          (side < 0 ? 0 : 1) * uvScaleX + uvOffsetX,
          t * uvScaleY + uvOffsetY,
        );
        data.colors.push(
          particle.color[0], particle.color[1], particle.color[2],
          particle.color[3] * alphaRate,
        );
      }
      if (index < history.length - 1) {
        const vertex = baseVertex + index * 2;
        data.indices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2);
      }
    });
  }
  return data;
}
