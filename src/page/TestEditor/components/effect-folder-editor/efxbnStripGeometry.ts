import type { EfxbnEffectSummary } from "@/services/effectFolder/effectFolderService";
import {
  efxbnRuntime,
  type EfxbnPreviewParticle,
  type EfxbnStripHistoryNode,
} from "./efxbnSimulation";

export const EFXBN_STRIP_SPLIT_LIMIT = 32;
export const EFXBN_STRIP_VERTEX_LIMIT = 16_384;

export type EfxbnStripMeshData = {
  centers: number[];
  previousCenters: number[];
  nextCenters: number[];
  sides: number[];
  widths: number[];
  uvs: number[];
  /** Second UV set for the ColorEx UV-offset map, which animates independently. */
  offsetUvs: number[];
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

function mixNode(
  left: EfxbnStripHistoryNode,
  right: EfxbnStripHistoryNode,
  t: number,
): EfxbnStripHistoryNode {
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    position: [
      mix(left.position[0], right.position[0]),
      mix(left.position[1], right.position[1]),
      mix(left.position[2], right.position[2]),
    ],
    width: mix(left.width, right.width),
    color: [
      mix(left.color[0], right.color[0]),
      mix(left.color[1], right.color[1]),
      mix(left.color[2], right.color[2]),
      mix(left.color[3], right.color[3]),
    ],
  };
}

function subdivideHistory(
  history: readonly EfxbnStripHistoryNode[],
  splitCount: number,
  maxPoints: number,
): EfxbnStripHistoryNode[] {
  if (history.length < 2 || maxPoints < 2) return [];
  const splits = normalizeSplitCount(splitCount);
  const desiredPointCount = (history.length - 1) * splits + 1;
  const pointCount = Math.min(desiredPointCount, Math.floor(maxPoints));
  const result: EfxbnStripHistoryNode[] = [];
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const pathPosition = pointIndex === pointCount - 1
      ? history.length - 1
      : (pointIndex / (pointCount - 1)) * (history.length - 1);
    const leftIndex = Math.min(history.length - 2, Math.floor(pathPosition));
    const t = pathPosition - leftIndex;
    result.push(mixNode(history[leftIndex], history[leftIndex + 1], t));
  }
  return result;
}

export function buildEfxbnStripMeshData(
  particles: readonly EfxbnPreviewParticle[],
  target: EfxbnEffectSummary,
  maxVertices: number,
  uvTransformForParticle?: (particle: EfxbnPreviewParticle) => EfxbnStripUvTransform,
  offsetUvTransformForParticle?: (particle: EfxbnPreviewParticle) => EfxbnStripUvTransform,
): EfxbnStripMeshData {
  const data: EfxbnStripMeshData = {
    centers: [], previousCenters: [], nextCenters: [], sides: [], widths: [],
    uvs: [], offsetUvs: [], colors: [], indices: [],
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
    const offsetUvTransform = offsetUvTransformForParticle?.(particle) ?? uvTransform;
    const uvScaleX = finiteOr(uvTransform.scale[0], 1);
    const uvScaleY = finiteOr(uvTransform.scale[1], 1);
    const uvOffsetX = finiteOr(uvTransform.offset[0], 0);
    const uvOffsetY = finiteOr(uvTransform.offset[1], 0);
    const offsetScaleX = finiteOr(offsetUvTransform.scale[0], 1);
    const offsetScaleY = finiteOr(offsetUvTransform.scale[1], 1);
    const offsetOffsetX = finiteOr(offsetUvTransform.offset[0], 0);
    const offsetOffsetY = finiteOr(offsetUvTransform.offset[1], 0);
    const baseVertex = data.sides.length;
    const runtime = efxbnRuntime(target);
    history.forEach((node, index) => {
      const previous = history[Math.max(0, index - 1)].position;
      const next = history[Math.min(history.length - 1, index + 1)].position;
      const t = history.length <= 1 ? 1 : index / (history.length - 1);
      const alphaRate = runtime.stripTailAlphaRate +
        (runtime.stripHeadAlphaRate - runtime.stripTailAlphaRate) * t;
      for (const side of [-1, 1]) {
        const edge = side < 0 ? 0 : 1;
        data.centers.push(...node.position);
        data.previousCenters.push(...previous);
        data.nextCenters.push(...next);
        data.sides.push(side);
        data.widths.push(node.width);
        // `efxConstructDrawBufferStrip3rd` writes the per-node `uv_*_u` into the vertex's U and
        // the two ribbon edges into V, so U runs along the length and V across the width.
        data.uvs.push(
          t * uvScaleX + uvOffsetX,
          edge * uvScaleY + uvOffsetY,
        );
        data.offsetUvs.push(
          t * offsetScaleX + offsetOffsetX,
          edge * offsetScaleY + offsetOffsetY,
        );
        data.colors.push(
          node.color[0], node.color[1], node.color[2],
          node.color[3] * alphaRate,
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
