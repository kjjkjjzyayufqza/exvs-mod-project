import { describe, expect, it } from "vitest";
import { applyFbxNameDocument, type FbxItems } from "./FBXItemRename";

const items: FbxItems = {
  mesh: [
    { id: "mesh_0", name: "Body" },
    { id: "mesh_1", name: "Head" },
  ],
  bone: [
    { id: "bone_0", name: "Root" },
    { id: "bone_1", name: "Hip" },
  ],
};

describe("applyFbxNameDocument", () => {
  it("updates names while preserving ids and missing trailing values", () => {
    expect(
      applyFbxNameDocument(
        items,
        JSON.stringify({
          mesh: ["BodyRenamed"],
          bone: ["RootRenamed", "HipRenamed"],
        }),
      ),
    ).toEqual({
      mesh: [
        { id: "mesh_0", name: "BodyRenamed" },
        { id: "mesh_1", name: "Head" },
      ],
      bone: [
        { id: "bone_0", name: "RootRenamed" },
        { id: "bone_1", name: "HipRenamed" },
      ],
    });
  });

  it("rejects non-string name arrays", () => {
    expect(() =>
      applyFbxNameDocument(items, JSON.stringify({ mesh: ["Body"], bone: [7] })),
    ).toThrow("bone must contain only strings");
  });
});
