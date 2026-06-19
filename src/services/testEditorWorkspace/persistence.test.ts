import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "./defaults";
import {
  loadTestEditorWorkspace,
  saveTestEditorWorkspace,
  workspaceDocumentPath,
} from "./persistence";
import type { TestEditorWorkspaceDocument } from "./types";

const { existsMock, readTextFileMock, writeTextFileMock } = vi.hoisted(() => ({
  existsMock: vi.fn(),
  readTextFileMock: vi.fn(),
  writeTextFileMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) => parts.filter(Boolean).join("/")),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: existsMock,
  readTextFile: readTextFileMock,
  writeTextFile: writeTextFileMock,
}));

function customDocument(): TestEditorWorkspaceDocument {
  return {
    ...DEFAULT_TEST_EDITOR_WORKSPACE,
    legacyReadFallback: false,
    assetRoutes: {
      ...DEFAULT_TEST_EDITOR_WORKSPACE.assetRoutes,
      "unit.model": {
        prefix: "custom/chara",
        kind: "fhm2d-pack",
        label: "Models",
      },
    },
  };
}

describe("testEditorWorkspace persistence", () => {
  beforeEach(() => {
    existsMock.mockReset();
    readTextFileMock.mockReset();
    writeTextFileMock.mockReset();
  });

  it("builds the workspace document path", async () => {
    await expect(workspaceDocumentPath("E:/workspace")).resolves.toBe(
      "E:/workspace/test_editor_workspace.json",
    );
  });

  it("uses defaults when test_editor_workspace.json is missing", async () => {
    existsMock.mockResolvedValue(false);

    const loaded = await loadTestEditorWorkspace("E:/workspace");

    expect(loaded.source).toBe("defaults");
    expect(loaded.document.assetRoutes["unit.model"].prefix).toBe("002chara");
    expect(loaded.issues).toEqual([]);
    expect(readTextFileMock).not.toHaveBeenCalled();
  });

  it("loads and validates a persisted workspace document", async () => {
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue(JSON.stringify(customDocument()));

    const loaded = await loadTestEditorWorkspace("E:/workspace");

    expect(loaded.source).toBe("workspace");
    expect(loaded.document.legacyReadFallback).toBe(false);
    expect(loaded.document.assetRoutes["unit.model"].prefix).toBe("custom/chara");
    expect(loaded.document.assetRoutes["unit.effect"].prefix).toBe("006effect");
  });

  it("keeps defaults and reports an issue when the workspace document is corrupt", async () => {
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue("{");

    const loaded = await loadTestEditorWorkspace("E:/workspace");

    expect(loaded.source).toBe("defaults");
    expect(loaded.document.assetRoutes["unit.model"].prefix).toBe("002chara");
    expect(loaded.issues).toContainEqual(
      expect.objectContaining({
        code: "invalid_document",
      }),
    );
    expect(writeTextFileMock).not.toHaveBeenCalled();
  });

  it("saves a formatted workspace document", async () => {
    const document = customDocument();

    await saveTestEditorWorkspace("E:/workspace", document);

    expect(writeTextFileMock).toHaveBeenCalledWith(
      "E:/workspace/test_editor_workspace.json",
      `${JSON.stringify(document, null, 2)}\n`,
    );
  });

  it("rejects invalid documents before saving", async () => {
    const document: TestEditorWorkspaceDocument = {
      ...customDocument(),
      assetRoutes: {
        ...customDocument().assetRoutes,
        "unit.model": {
          prefix: "../outside",
          kind: "fhm2d-pack",
          label: "Models",
        },
      },
    };

    await expect(saveTestEditorWorkspace("E:/workspace", document)).rejects.toThrow(
      "Invalid TestEditor workspace document",
    );
    expect(writeTextFileMock).not.toHaveBeenCalled();
  });
});
