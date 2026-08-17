import { describe, expect, test } from "vitest";
import { partitionEffectFolderWarnings } from "./effectFolderWarnings";

describe("partitionEffectFolderWarnings", () => {
  test("separates shared-pack resolution notes from real problems", () => {
    const partitioned = partitionEffectFolderWarnings([
      "Resolved 12 model and 34 texture reference(s) from the shared pack 000common_001.",
      "EFXBN references modelId 0x328D9438 that exists in neither this pack nor 000common_001.",
      "EFXBN references textureId 0xAD0769F6 that exists in neither this pack nor 000common_001.",
      "Duplicate texture hash 0x00000001.",
    ]);

    expect(partitioned.resolved).toEqual([
      "Resolved 12 model and 34 texture reference(s) from the shared pack 000common_001.",
    ]);
    expect(partitioned.unresolved).toEqual([
      "EFXBN references modelId 0x328D9438 that exists in neither this pack nor 000common_001.",
      "EFXBN references textureId 0xAD0769F6 that exists in neither this pack nor 000common_001.",
    ]);
    expect(partitioned.other).toEqual(["Duplicate texture hash 0x00000001."]);
  });

  test("treats an absent shared pack as a problem, not a resolution note", () => {
    const partitioned = partitionEffectFolderWarnings([
      "Shared effect pack 000common_001 is not next to E:\\tmp\\pack; references that live there cannot be resolved.",
    ]);

    expect(partitioned.resolved).toEqual([]);
    expect(partitioned.unresolved).toEqual([
      "Shared effect pack 000common_001 is not next to E:\\tmp\\pack; references that live there cannot be resolved.",
    ]);
  });

  test("also recognizes the model-only note the repack validator emits", () => {
    const partitioned = partitionEffectFolderWarnings([
      "Resolved 7 model reference(s) from the shared pack 000common_001.",
    ]);

    expect(partitioned.resolved).toHaveLength(1);
    expect(partitioned.other).toEqual([]);
  });

  test("returns empty buckets for an empty warning list", () => {
    expect(partitionEffectFolderWarnings([])).toEqual({
      resolved: [],
      unresolved: [],
      other: [],
    });
  });
});
