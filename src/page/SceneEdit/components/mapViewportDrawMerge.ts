import type { BufferGeometry } from "three";
import { mergeBufferGeometries } from "three-stdlib";
import { measureDrawComplexity } from "../../../components/ssbh-model-preview/ssbhCanvasPerformance";

const MAX_MERGED_GROUP_TRIANGLES = 1_000_000;
const MAX_MERGED_GROUP_VERTICES = 3_000_000;

export type MergeableDrawBinding<TBinding = unknown> = {
  draw: {
    key: string;
    materialLabel: string;
    geometry: BufferGeometry;
  };
  binding: TBinding;
};

function shouldSkipMergedGeometry(bindings: readonly MergeableDrawBinding[]): boolean {
  const complexity = measureDrawComplexity(bindings.map((binding) => ({ geometry: binding.draw.geometry })));
  return (
    complexity.triangleCount >= MAX_MERGED_GROUP_TRIANGLES ||
    complexity.vertexCount >= MAX_MERGED_GROUP_VERTICES
  );
}

export function mergeDrawBindingsByMaterial<TBinding, TEntry extends MergeableDrawBinding<TBinding>>(
  rawBindings: readonly TEntry[],
): TEntry[] {
  const grouped = new Map<string, TEntry[]>();
  for (const entry of rawBindings) {
    const key = entry.draw.materialLabel;
    const list = grouped.get(key);
    if (list) {
      list.push(entry);
    } else {
      grouped.set(key, [entry]);
    }
  }

  const merged: TEntry[] = [];
  for (const group of grouped.values()) {
    if (group.length === 1 || shouldSkipMergedGeometry(group)) {
      merged.push(...group);
      continue;
    }

    const geometries = group.map((entry) => entry.draw.geometry);
    const mergedGeo = mergeBufferGeometries(geometries, false);
    if (mergedGeo) {
      merged.push({
        ...group[0],
        draw: {
          ...group[0].draw,
          geometry: mergedGeo,
          key: `merged_${group[0].draw.materialLabel}`,
        },
      });
    } else {
      merged.push(...group);
    }
  }

  return merged;
}
