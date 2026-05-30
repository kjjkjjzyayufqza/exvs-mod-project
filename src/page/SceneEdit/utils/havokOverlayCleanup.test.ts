import { describe, expect, it } from "vitest";
import {
  collectHavokSourceIdsForFolders,
  resolveHavokFolderName,
} from "./havokOverlayCleanup";

describe("resolveHavokFolderName", () => {
  it("strips the mesh-hkt- prefix", () => {
    expect(resolveHavokFolderName("mesh-hkt-sky")).toBe("sky");
  });

  it("takes the leading folder of a disk-relative HKT path", () => {
    expect(resolveHavokFolderName("sky/map_hit.hkt")).toBe("sky");
    expect(resolveHavokFolderName("sky\\map_hit.hkt")).toBe("sky");
  });

  it("returns a bare sessionImportId unchanged", () => {
    const importId = "3f1c2a90-1111-2222-3333-444455556666";
    expect(resolveHavokFolderName(importId)).toBe(importId);
  });
});

describe("collectHavokSourceIdsForFolders", () => {
  it("collects overlay ids that belong to the deleted folders", () => {
    const sourceIds = [
      "sky/map_hit.hkt",
      "mesh-hkt-sky",
      "ground\\map_hit.hkt",
      "wall/map_hit.hkt",
      "imported-uuid-only",
    ];
    const result = collectHavokSourceIdsForFolders(sourceIds, new Set(["sky", "ground"]));
    expect(result).toEqual(["sky/map_hit.hkt", "mesh-hkt-sky", "ground\\map_hit.hkt"]);
  });

  it("never matches bare imported-DAE sessionImportId keys", () => {
    const result = collectHavokSourceIdsForFolders(
      ["imported-uuid-only", "another-uuid"],
      new Set(["sky"]),
    );
    expect(result).toEqual([]);
  });

  it("returns empty when no folder matches", () => {
    const result = collectHavokSourceIdsForFolders(["sky/map_hit.hkt"], new Set(["other"]));
    expect(result).toEqual([]);
  });
});
