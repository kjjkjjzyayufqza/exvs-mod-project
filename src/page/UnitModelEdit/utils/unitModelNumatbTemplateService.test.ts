import { describe, expect, it } from "vitest";

import type { UnitModelTreeNode } from "./unitModelStructureTree";
import {
  buildNumatbTemplateDefinition,
  collectModelNumatbRelativeUrls,
  resolveModelNumatbProfilePaths,
} from "./unitModelNumatbTemplateService";

function modelGroup(children: UnitModelTreeNode[]): UnitModelTreeNode {
  return {
    id: "model:body",
    kind: "folder",
    label: "body",
    role: "model-group",
    children,
  };
}

describe("collectModelNumatbRelativeUrls", () => {
  it("collects direct and nested .numatb fileUrls", () => {
    const model = modelGroup([
      {
        id: "i0",
        kind: "item",
        label: "body",
        fileType: ".numdlb",
        fileUrl: "pkg/body/body.numdlb",
      },
      {
        id: "i1",
        kind: "item",
        label: "body__maya__",
        fileType: ".numatb",
        fileUrl: "pkg/body/body__maya__.numatb",
      },
      {
        id: "folder",
        kind: "folder",
        label: "nested",
        children: [
          {
            id: "i2",
            kind: "item",
            label: "body__nust__",
            fileType: ".numatb",
            fileUrl: "pkg/body/body__nust__.numatb",
          },
        ],
      },
    ]);

    expect(collectModelNumatbRelativeUrls(model)).toEqual([
      "pkg/body/body__maya__.numatb",
      "pkg/body/body__nust__.numatb",
    ]);
  });

  it("ignores items without fileUrl and non-numatb types", () => {
    const model = modelGroup([
      { id: "i0", kind: "item", label: "body", fileType: ".numatb" },
      {
        id: "i1",
        kind: "item",
        label: "body.numshb",
        fileType: ".numshb",
        fileUrl: "pkg/body/body.numshb",
      },
    ]);
    expect(collectModelNumatbRelativeUrls(model)).toEqual([]);
  });
});

describe("resolveModelNumatbProfilePaths", () => {
  it("maps __maya__ and __nust__ to absolute windows paths", () => {
    const model = modelGroup([
      {
        id: "i1",
        kind: "item",
        label: "body__maya__",
        fileType: ".numatb",
        fileUrl: "pkg/body/body__maya__.numatb",
      },
      {
        id: "i2",
        kind: "item",
        label: "body__nust__",
        fileType: ".numatb",
        fileUrl: "pkg/body/body__nust__.numatb",
      },
    ]);

    const paths = resolveModelNumatbProfilePaths(
      "E:\\out\\pkg_structure.json",
      model,
    );
    expect(paths.maya).toBe("E:\\out\\pkg\\body\\body__maya__.numatb");
    expect(paths.nust).toBe("E:\\out\\pkg\\body\\body__nust__.numatb");
  });

  it("prefers base __nust__ over variant _mNNN__nust__", () => {
    const model = modelGroup([
      {
        id: "i1",
        kind: "item",
        label: "body_m001__nust__",
        fileType: ".numatb",
        fileUrl: "pkg/body/body_m001__nust__.numatb",
      },
      {
        id: "i2",
        kind: "item",
        label: "body__nust__",
        fileType: ".numatb",
        fileUrl: "pkg/body/body__nust__.numatb",
      },
      {
        id: "i3",
        kind: "item",
        label: "body__maya__",
        fileType: ".numatb",
        fileUrl: "pkg/body/body__maya__.numatb",
      },
    ]);

    const paths = resolveModelNumatbProfilePaths(
      "E:\\out\\pkg_structure.json",
      model,
    );
    expect(paths.nust).toBe("E:\\out\\pkg\\body\\body__nust__.numatb");
    expect(paths.maya).toBe("E:\\out\\pkg\\body\\body__maya__.numatb");
  });
});

describe("buildNumatbTemplateDefinition", () => {
  it("normalizes profiles and reuses an existing id when provided", () => {
    const template = buildNumatbTemplateDefinition({
      name: "  body  ",
      description: " from model ",
      sourceFileName: "body__nust__.numatb",
      mayaFile: { major_version: 1, minor_version: 6, entries: [] },
      nustFile: { major_version: 1, minor_version: 6, entries: [] },
      existingId: "keep-me",
    });

    expect(template.id).toBe("keep-me");
    expect(template.name).toBe("body");
    expect(template.description).toBe("from model");
    expect(template.sourceFileName).toBe("body__nust__.numatb");
    expect(template.mayaFile.entries).toEqual([]);
    expect(template.nustFile.entries).toEqual([]);
  });

  it("rejects a blank name", () => {
    expect(() =>
      buildNumatbTemplateDefinition({
        name: "   ",
        description: "",
        sourceFileName: null,
        mayaFile: { major_version: 1, minor_version: 6, entries: [] },
        nustFile: { major_version: 1, minor_version: 6, entries: [] },
      }),
    ).toThrow(/Template name is required/);
  });
});
