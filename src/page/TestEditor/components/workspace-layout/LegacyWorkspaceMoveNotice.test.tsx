import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import { LegacyWorkspaceMoveNotice } from "./LegacyWorkspaceMoveNotice";

const {
  resolveWorkspaceContentMock,
  moveLegacyWorkspaceContentMock,
  toastSuccessMock,
  toastErrorMock,
} =
  vi.hoisted(() => ({
    resolveWorkspaceContentMock: vi.fn(),
    moveLegacyWorkspaceContentMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }));

vi.mock("@/services/testEditorWorkspace/contentCatalog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/testEditorWorkspace/contentCatalog")>();
  return {
    ...actual,
    resolveWorkspaceContent: resolveWorkspaceContentMock,
  };
});

vi.mock("@/services/testEditorWorkspace/legacyMigration", () => ({
  moveLegacyWorkspaceContentToConfigured: moveLegacyWorkspaceContentMock,
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

describe("LegacyWorkspaceMoveNotice", () => {
  beforeEach(() => {
    resolveWorkspaceContentMock.mockReset();
    moveLegacyWorkspaceContentMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("moves the selected legacy content and reloads its consumer", async () => {
    const content = {
      descriptor: {
        id: "character-cost",
        routeId: "param.for-outgame",
        hashHex: "0xFF832E7F",
        relativeFilePath: null,
        label: "Character Cost",
      },
      configured: {
        routeId: "param.for-outgame",
        prefix: "041cpm",
        routeRootPath: "E:/workspace/041cpm",
        hashHex: "0xFF832E7F",
        folderPath: "E:/workspace/041cpm/for_outgame",
        structureJsonPath: "E:/workspace/041cpm/for_outgame_structure.json",
        packKey: "041cpm/for_outgame",
        filePath: null,
      },
      existing: {
        routeId: "param.for-outgame",
        prefix: "",
        routeRootPath: "E:/workspace",
        hashHex: "0xFF832E7F",
        folderPath: "E:/workspace/0xFF832E7F",
        structureJsonPath: "E:/workspace/0xFF832E7F_structure.json",
        packKey: "0xFF832E7F",
        filePath: null,
      },
      sourceLayout: "legacy",
      writable: false,
      duplicateLayout: false,
    };
    const onMoved = vi.fn();
    resolveWorkspaceContentMock.mockResolvedValue(content);
    moveLegacyWorkspaceContentMock.mockResolvedValue({
      sourceFolderPath: "E:/workspace/0xFF832E7F",
      sourceStructureJsonPath: "E:/workspace/0xFF832E7F_structure.json",
      configuredFolderPath: "E:/workspace/041cpm/for_outgame",
      configuredStructureJsonPath: "E:/workspace/041cpm/for_outgame_structure.json",
    });

    render(
      <LegacyWorkspaceMoveNotice
        workspaceRoot="E:/workspace"
        workspaceDocument={DEFAULT_TEST_EDITOR_WORKSPACE}
        contentId="character-cost"
        sourceLayout="legacy"
        configuredPath="E:/workspace/041cpm/for_outgame"
        onMoved={onMoved}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Move to New" }));

    expect(resolveWorkspaceContentMock).toHaveBeenCalledWith(
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "character-cost",
    );
    expect(moveLegacyWorkspaceContentMock).toHaveBeenCalledWith(content);
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
  });

  it("does not render for configured content", () => {
    const { container } = render(
      <LegacyWorkspaceMoveNotice
        workspaceRoot="E:/workspace"
        workspaceDocument={DEFAULT_TEST_EDITOR_WORKSPACE}
        contentId="character-list"
        sourceLayout="configured"
        configuredPath="E:/workspace/012list/0xDFD38C70"
        onMoved={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows structured Tauri failures instead of replacing them with Unknown error", async () => {
    resolveWorkspaceContentMock.mockResolvedValue({
      descriptor: {
        id: "character-list",
        routeId: "list.character",
        hashHex: "0xDFD38C70",
        relativeFilePath: "character_list.bin",
        label: "Character List",
      },
    });
    moveLegacyWorkspaceContentMock.mockRejectedValue({
      message: "Access denied",
      path: "E:/workspace/0xDFD38C70",
    });

    render(
      <LegacyWorkspaceMoveNotice
        workspaceRoot="E:/workspace"
        workspaceDocument={DEFAULT_TEST_EDITOR_WORKSPACE}
        contentId="character-list"
        sourceLayout="legacy"
        configuredPath="E:/workspace/012list/0xDFD38C70"
        onMoved={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Move to New" }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Failed to move legacy content: {"message":"Access denied","path":"E:/workspace/0xDFD38C70"}',
      ),
    );
  });
});
