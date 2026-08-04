import type { EfxbnEffectSummary } from "@/services/effectFolder/effectFolderService";
import type { EfxbnPreviewParticle } from "./efxbnSimulation";

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

function subdivideHistory(
  history: readonly [number, number, number][],
  splitCount: number,
): [number, number, number][] {
  if (history.length < 2) return [...history];
  const result: [number, number, number][] = [];
  const splits = Math.max(1, splitCount);
  for (let index = 0; index < history.length - 1; index += 1) {
    const left = history[index];
    const right = history[index + 1];
    for (let split = 0; split < splits; split += 1) {
      const t = split / splits;
      result.push([
        left[0] + (right[0] - left[0]) * t,
        left[1] + (right[1] - left[1]) * t,
        left[2] + (right[2] - left[2]) * t,
      ]);
    }
  }
  result.push([...history[history.length - 1]]);
  return result;
}

export function buildEfxbnStripMeshData(
  particles: readonly EfxbnPreviewParticle[],
  target: EfxbnEffectSummary,
  maxVertices: number,
): EfxbnStripMeshData {
  const data: EfxbnStripMeshData = {
    centers: [], previousCenters: [], nextCenters: [], sides: [], widths: [],
    uvs: [], colors: [], indices: [],
  };
  for (const particle of particles) {
    const history = subdivideHistory(particle.history, target.stripSegmentSplitNum);
    if (history.length < 2 || data.sides.length + history.length * 2 > maxVertices) continue;
    const baseVertex = data.sides.length;
    history.forEach((center, index) => {
      const previous = history[Math.max(0, index - 1)];
      const next = history[Math.min(history.length - 1, index + 1)];
      const t = history.length <= 1 ? 1 : index / (history.length - 1);
      const alphaRate = target.stripTailAlphaRate +
        (target.stripHeadAlphaRate - target.stripTailAlphaRate) * t;
      for (const side of [-1, 1]) {
        data.centers.push(...center);
        data.previousCenters.push(...previous);
        data.nextCenters.push(...next);
        data.sides.push(side);
        data.widths.push(Math.abs(particle.size[0]) * 0.5);
        data.uvs.push(side < 0 ? 0 : 1, t);
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
