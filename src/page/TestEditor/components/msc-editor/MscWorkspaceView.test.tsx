import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MscResolvedScript2ApplyResult } from "../../utils/mscResolvedOverlay";
import MscWorkspaceView from "./MscWorkspaceView";

type MockDirEntry = {
  isFile?: boolean;
  isDirectory?: boolean;
  name: string;
};

const {
  openMock,
  folderContainsMscScriptFilesMock,
  existsMock,
  readDirMock,
  readTextFileMock,
  writeTextFileMock,
  applyMscResolvedOverlayToScript2Mock,
} = vi.hoisted(() => ({
  openMock: vi.fn(),
  folderContainsMscScriptFilesMock: vi.fn(),
  existsMock: vi.fn<(path: string) => Promise<boolean>>(async (_path: string) => false),
  readDirMock: vi.fn<() => Promise<MockDirEntry[]>>(async () => []),
  readTextFileMock: vi.fn(async () => ""),
  writeTextFileMock: vi.fn(async () => undefined),
  applyMscResolvedOverlayToScript2Mock: vi.fn<() => MscResolvedScript2ApplyResult>(() => ({
    status: "skipped",
    evidence: {
      actions: [],
      slotCallbacks: [],
      weaponBindings: [],
      resourceBindings: [],
      orphanActionFunctions: [],
    },
    legacyAliasCount: 0,
    updatedScript2Content: null,
    renamedCallbackCount: 0,
  })),
}));

const resolvedOverlayResult: MscResolvedScript2ApplyResult = {
  status: "resolved",
  evidence: {
    actions: [
      {
        actionHashHex: "0xf48d2d49",
        actionIndexHex: "0x1",
        callbackName: "func_912",
        requestedSlots: [],
      },
    ],
    slotCallbacks: [],
    weaponBindings: [],
    resourceBindings: [],
    orphanActionFunctions: [],
  },
  legacyAliasCount: 0,
  updatedScript2Content: "func_241(0xf48d2d49, ACTION_A_SHOT);\n",
  renamedCallbackCount: 1,
};

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: openMock,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: existsMock,
  readDir: readDirMock,
  readTextFile: readTextFileMock,
  writeTextFile: writeTextFileMock,
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
  getMscResolvedOverlayPath: (path: string) => path.replace(/\.c$/i, ".resolved.md"),
}));

vi.mock("../../utils/mscResolvedOverlay", () => ({
  applyMscResolvedOverlayToScript2: applyMscResolvedOverlayToScript2Mock,
}));

describe("MscWorkspaceView", () => {
  beforeEach(() => {
    const elementPrototype = Element.prototype as Element & {
      hasPointerCapture?: (pointerId: number) => boolean;
      setPointerCapture?: (pointerId: number) => void;
      releasePointerCapture?: (pointerId: number) => void;
      scrollIntoView?: () => void;
    };
    elementPrototype.hasPointerCapture ??= () => false;
    elementPrototype.setPointerCapture ??= () => undefined;
    elementPrototype.releasePointerCapture ??= () => undefined;
    elementPrototype.scrollIntoView ??= () => undefined;

    vi.clearAllMocks();
    openMock.mockResolvedValue(null);
    folderContainsMscScriptFilesMock.mockResolvedValue(false);
    existsMock.mockImplementation(async (_path: string) => false);
    readDirMock.mockResolvedValue([]);
    readTextFileMock.mockResolvedValue("");
    writeTextFileMock.mockResolvedValue(undefined);
    applyMscResolvedOverlayToScript2Mock.mockReturnValue({
      status: "skipped",
      evidence: {
        actions: [],
        slotCallbacks: [],
        weaponBindings: [],
        resourceBindings: [],
        orphanActionFunctions: [],
      },
      legacyAliasCount: 0,
      updatedScript2Content: null,
      renamedCallbackCount: 0,
    });
  });

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

  it("shows Resolve Overlay action for 2.c", async () => {
    readDirMock.mockResolvedValueOnce([
      { isFile: true, name: "0.c" },
      { isFile: true, name: "2.c" },
    ]);

    render(
      <MscWorkspaceView
        workspaceRoot="E:/workspace"
        workspaceDefaultPath="E:/workspace/040msc"
        mscFolderPath="E:/workspace/040msc/0x12345678"
        onMscFolderChange={() => {}}
        isActive
      />,
    );

    expect(await screen.findByRole("button", { name: /resolve overlay/i })).toBeInTheDocument();
  });

  it("shows Open action for resolved overlay sidecars", async () => {
    readDirMock.mockResolvedValueOnce([
      { isFile: true, name: "2.resolved.md" },
    ]);

    render(
      <MscWorkspaceView
        workspaceRoot="E:/workspace"
        workspaceDefaultPath="E:/workspace/040msc"
        mscFolderPath="E:/workspace/040msc/0x12345678"
        onMscFolderChange={() => {}}
        isActive
      />,
    );

    expect(await screen.findByRole("button", { name: /^open$/i })).toBeInTheDocument();
  });

  it("writes resolved callback names directly into 2.c on Resolve Overlay", async () => {
    const user = userEvent.setup();
    readDirMock.mockResolvedValueOnce([
      { isFile: true, name: "0.c" },
      { isFile: true, name: "2.c" },
    ]);

    existsMock.mockImplementation(async (path: string) => {
      return [
        "E:/workspace/040msc/0x12345678/0.c",
        "E:/workspace/040msc/0x12345678/2.c",
      ].includes(path);
    });

    readTextFileMock
      .mockResolvedValueOnce("void func_143() { func_95(0xf48d2d49, 0, 0); }")
      .mockResolvedValueOnce("func_241(0xf48d2d49, func_912);\n");
    applyMscResolvedOverlayToScript2Mock.mockReturnValueOnce(resolvedOverlayResult);

    render(
      <MscWorkspaceView
        workspaceRoot="E:/workspace"
        workspaceDefaultPath="E:/workspace/040msc"
        mscFolderPath="E:/workspace/040msc/0x12345678"
        onMscFolderChange={() => {}}
        isActive
      />,
    );

    await user.click(await screen.findByRole("button", { name: /resolve overlay/i }));

    await waitFor(() => {
      expect(writeTextFileMock).toHaveBeenCalledWith(
        "E:/workspace/040msc/0x12345678/2.c",
        "func_241(0xf48d2d49, ACTION_A_SHOT);\n",
      );
      expect(writeTextFileMock).not.toHaveBeenCalledWith(
        "E:/workspace/040msc/0x12345678/2.resolved.md",
        expect.any(String),
      );
    });
  });

  it("keeps the decompiled C view visible after Resolve Overlay", async () => {
    const user = userEvent.setup();
    readDirMock
      .mockResolvedValueOnce([
        { isFile: true, name: "0.c" },
        { isFile: true, name: "2.c" },
      ])
      .mockResolvedValueOnce([
        { isFile: true, name: "0.c" },
        { isFile: true, name: "2.c" },
      ]);

    existsMock.mockImplementation(async (path: string) => {
      return [
        "E:/workspace/040msc/0x12345678/0.c",
        "E:/workspace/040msc/0x12345678/2.c",
      ].includes(path);
    });

    readTextFileMock
      .mockResolvedValueOnce("void func_143() { func_95(0xf48d2d49, 0, 0); }")
      .mockResolvedValueOnce("func_241(0xf48d2d49, func_912);\n");
    applyMscResolvedOverlayToScript2Mock.mockReturnValueOnce(resolvedOverlayResult);

    render(
      <MscWorkspaceView
        workspaceRoot="E:/workspace"
        workspaceDefaultPath="E:/workspace/040msc"
        mscFolderPath="E:/workspace/040msc/0x12345678"
        onMscFolderChange={() => {}}
        isActive
      />,
    );

    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: ".c" }));
    await user.click(await screen.findByRole("button", { name: /resolve overlay/i }));

    await waitFor(() => {
      expect(screen.getByText("Decompiled C")).toBeInTheDocument();
      expect(screen.getByText("2.c")).toBeInTheDocument();
    });
  });
});
