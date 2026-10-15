import { describe, expect, it } from "vitest";
import type { HavokMeshData } from "@/utils/havokXmlParser";
import { borderHitFolderKey, findBorderHitMesh, isBorderHitSource } from "./borderHitView";

const mesh = { vertices: [], quads: [], aabb: null, bodies: [] } as HavokMeshData;

describe("borderHitView", () => {
  it("recognizes the info border file and not a model collision file", () => {
    expect(isBorderHitSource("info/border_hit.hkt")).toBe(true);
    expect(isBorderHitSource("info\\border_hit.hkt")).toBe(true);
    expect(isBorderHitSource("base/map_hit.hkt")).toBe(false);
  });

  it("uses the same folder key the collision list toggles", () => {
    expect(borderHitFolderKey("info/border_hit.hkt")).toBe("info");
    const found = findBorderHitMesh(new Map([
      ["base/map_hit.hkt", mesh],
      ["info/border_hit.hkt", mesh],
    ]));
    expect(found?.sourceId).toBe("info/border_hit.hkt");
  });
});