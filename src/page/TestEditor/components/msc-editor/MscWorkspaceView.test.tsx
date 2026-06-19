import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import MscWorkspaceView from "./MscWorkspaceView";

const { openMock, folderContainsMscScriptFilesMock } = vi.hoisted(() => ({
  openMock: vi.fn(),
  folderContainsMscScriptFilesMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: openMock,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(async () => false),
  readDir: vi.fn(async () => []),
  readTextFile: vi.fn(async () => ""),
  writeTextFile: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/path", () => ({
  dirname: vi.fn(async (path: string) => path.replace(/[\\/][^\\/]+$/, "")),
  join: vi.fn(async (...parts: string[]) => parts.join("/")),
  resourceDir: vi.fn(async () => "E:/app/resources"),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: {
    create: vi.fn(() => ({
      execute: vi.fn(async () => ({ code: 0, stdout: "", stderr: "" })),
    })),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("../../utils/mscWorkspaceUtils", () => ({
  folderContainsMscScriptFiles: folderContainsMscScriptFilesMock,
  getMscConvertLogPath: (path: string) => `${path}.log`,
  getMscConvertOutputPath: (path: string) => `${path}.c`,
  getMscRepackOutputPath: (path: string) => `${path}.mscsb`,
}));

describe("MscWorkspaceView", () => {
  it("opens the folder picker from the workspace MSC route root", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("E:/workspace/040msc/0x12345678");
    folderContainsMscScriptFilesMock.mockResolvedValue(true);

    render(
      <MscWorkspaceView
        workspaceRoot="E:/workspace"
        workspaceDefaultPath="E:/workspace/040msc"
        mscFolderPath={null}
        onMscFolderChange={() => {}}
        isActive
      />,
    );

    await user.click(screen.getByRole("button", { name: /pick folder/i }));

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith(
        expect.objectContaining({
          directory: true,
          multiple: false,
          defaultPath: "E:/workspace/040msc",
        }),
      );
    });
  });
});
