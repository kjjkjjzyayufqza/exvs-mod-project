import { describe, expect, it } from "vitest";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "./defaults";
import { normalizeWorkspacePrefix, parseWorkspaceDocument } from "./validation";

describe("parseWorkspaceDocument", () => {
  it("merges persisted route overrides over defaults", () => {
    const result = parseWorkspaceDocument({
      version: 1,
      legacyReadFallback: false,
      assetRoutes: {
        "unit.model": { prefix: "custom/chara", kind: "fhm2d-pack", label: "Models" },
      },
    });

    expect(result.document.assetRoutes["unit.model"].prefix).toBe("custom/chara");
    expect(result.document.assetRoutes["unit.effect"].prefix).toBe("006effect");
    expect(result.document.legacyReadFallback).toBe(false);
    expect(result.source).toBe("workspace");
    expect(result.issues).toEqual([]);
  });

  it("preserves valid unknown route IDs", () => {
    const result = parseWorkspaceDocument({
      version: 1,
      legacyReadFallback: true,
      assetRoutes: {
        "custom.route": {
          prefix: "800etcetera/custom",
          kind: "directory",
          label: "Custom Route",
        },
      },
    });

    expect(result.document.assetRoutes["custom.route"]).toEqual({
      prefix: "800etcetera/custom",
      kind: "directory",
      label: "Custom Route",
    });
    expect(result.issues).toEqual([]);
  });

  it("normalizes nested prefixes to JSON-stable forward slashes", () => {
    const result = parseWorkspaceDocument({
      version: 1,
      legacyReadFallback: true,
      assetRoutes: {
        "unit.model": { prefix: "custom\\nested\\chara", kind: "fhm2d-pack", label: "Models" },
      },
    });

    expect(result.document.assetRoutes["unit.model"].prefix).toBe("custom/nested/chara");
    expect(normalizeWorkspacePrefix("custom\\nested\\chara")).toBe("custom/nested/chara");
  });

  it.each(["", ".", "../outside", "C:/absolute", "C:\\absolute", "//server/share", "/rooted"])(
    "rejects unsafe prefix %s",
    (prefix) => {
      const result = parseWorkspaceDocument({
        version: 1,
        legacyReadFallback: true,
        assetRoutes: {
          "unit.model": { prefix, kind: "fhm2d-pack", label: "Models" },
        },
      });

      expect(result.document.assetRoutes["unit.model"].prefix).toBe(
        DEFAULT_TEST_EDITOR_WORKSPACE.assetRoutes["unit.model"].prefix,
      );
      expect(result.issues.some((issue) => issue.routeId === "unit.model")).toBe(true);
    },
  );

  it("rejects incompatible duplicate prefixes", () => {
    const result = parseWorkspaceDocument({
      version: 1,
      legacyReadFallback: true,
      assetRoutes: {
        "custom.directory": {
          prefix: "002chara",
          kind: "directory",
          label: "Custom Directory",
        },
      },
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "duplicate_prefix",
        routeId: "custom.directory",
      }),
    );
  });

  it("falls back to defaults for unsupported versions", () => {
    const result = parseWorkspaceDocument({
      version: 2,
      legacyReadFallback: false,
      assetRoutes: {
        "unit.model": { prefix: "custom/chara", kind: "fhm2d-pack", label: "Models" },
      },
    });

    expect(result.document).toEqual(DEFAULT_TEST_EDITOR_WORKSPACE);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "unsupported_version",
      }),
    );
  });
});
