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
  invokeMock,
  toastErrorMock,
  toastSuccessMock,
  folderContainsMscScriptFilesMock,
  existsMock,
  readDirMock,
  readTextFileMock,
  writeTextFileMock,
  applyMscResolvedOverlayToScript2Mock,
  removeMatchingModVgsht2Mock,
} = vi.hoisted(() => ({
  openMock: vi.fn(),
  invokeMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => undefined),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
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
  removeMatchingModVgsht2Mock: vi.fn(async () => false),
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
  invoke: invokeMock,
}));

vi.mock("@/utils/fhm2dFolderPathResolution", () => ({
  resolveMigratedFhm2dFolderPath: vi.fn(async (path: string) => path),
  applyFhm2dStructureMigrationToPack: vi.fn(),
}));

vi.mock("@/utils/fhm2dStructureMetadata", () => ({
  promptAndMigrateFhm2dStructureIfNeeded: vi.fn(async () => null),
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
    error: toastErrorMock,
    success: toastSuccessMock,
    warning: vi.fn(),
  },
}));

vi.mock("../../utils/mscWorkspaceUtils", async () => {
  const actual = await vi.importActual<typeof import("../../utils/mscWorkspaceUtils")>(
    "../../utils/mscWorkspaceUtils",
  );
  return {
    ...actual,
    folderContainsMscScriptFiles: folderContainsMscScriptFilesMock,
  };
});

vi.mock("../../utils/mscResolvedOverlay", () => ({
  applyMscResolvedOverlayToScript2: applyMscResolvedOverlayToScript2Mock,
}));

vi.mock("../../utils/modVgsht2", () => ({
  removeMatchingModVgsht2: removeMatchingModVgsht2Mock,
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
    window.localStorage.removeItem("exvs2.mscAutoRepackFhm2d");
    openMock.mockResolvedValue(null);
    folderContainsMscScriptFilesMock.mockResolvedValue(false);
    existsMock.mockImplementation(async (_path: string) => false);
    readDirMock.mockResolvedValue([]);
    readTextFileMock.mockResolvedValue("");
    writeTextFileMock.mockResolvedValue(undefined);
    removeMatchingModVgsht2Mock.mockResolvedValue(false);
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
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "verify_msc_roundtrip_from_c") {
        return {
          isMatch: true,
          originalSize: 128,
          recompiledSize: 128,
          firstDivergenceOffset: null,
          contextStartOffset: null,
          originalContextHex: null,
          recompiledContextHex: null,
        };
      }
      if (cmd === "repack_fhm2d") {
        return {
          outputPath: "E:\\OB_MOD\\0x12345678.fhm2d",
          totalFiles: 1,
          outputSize: 4096,
        };
      }
      return undefined;
    });
  });

  it("opens the folder picker from the workspace MSC route root when nothing is remembered", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("E:/workspace/040msc/0x12345678");
    folderContainsMscScriptFilesMock.mockResolvedValue(true);
    window.localStorage.removeItem("tauri.dialog.lastPath.mscWorkspace.folder");

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

  it("opens the folder picker at the current MSC folder, not its parent", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("E:/workspace/040msc/0x12345678");
    folderContainsMscScriptFilesMock.mockResolvedValue(true);
    window.localStorage.removeItem("tauri.dialog.lastPath.mscWorkspace.folder");

    render(
      <MscWorkspaceView
        workspaceRoot="E:/workspace"
        workspaceDefaultPath="E:/workspace/040msc"
        mscFolderPath="E:/workspace/040msc/0xABCDEF01"
        onMscFolderChange={() => {}}
        isActive
      />,
    );

    await user.click(screen.getByRole("button", { name: /pick folder/i }));

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: "E:/workspace/040msc/0xABCDEF01",
        }),
      );
    });
  });

  it("remembers the picked folder itself for the next open", async () => {
    const user = userEvent.setup();
    const onMscFolderChange = vi.fn();
    openMock.mockResolvedValue("E:/workspace/040msc/0x12345678");
    folderContainsMscScriptFilesMock.mockResolvedValue(true);
    window.localStorage.removeItem("tauri.dialog.lastPath.mscWorkspace.folder");

    render(
      <MscWorkspaceView
        workspaceRoot="E:/workspace"
        workspaceDefaultPath="E:/workspace/040msc"
        mscFolderPath={null}
        onMscFolderChange={onMscFolderChange}
        isActive
      />,
    );

    await user.click(screen.getByRole("button", { name: /pick folder/i }));

    await waitFor(() => {
      expect(onMscFolderChange).toHaveBeenCalledWith("E:/workspace/040msc/0x12345678");
    });
    expect(window.localStorage.getItem("tauri.dialog.lastPath.mscWorkspace.folder")).toBe(
      "E:/workspace/040msc/0x12345678",
    );
  });

  it("opens arbitrary bin folders in Traditional MSC without replacing the Unit MSC folder", async () => {
    const user = userEvent.setup();
    const onMscFolderChange = vi.fn();
    const traditionalPath = "E:/XB/unpack/com/file/0x67AF23FA";
    openMock.mockResolvedValue(traditionalPath);
    folderContainsMscScriptFilesMock.mockResolvedValue(true);
    window.localStorage.removeItem("tauri.dialog.lastPath.mscWorkspace.traditional.folder");

    render(
      <MscWorkspaceView
        workspaceRoot="E:/XB/unpack/com/file"
        workspaceDefaultPath="E:/XB/unpack/com/file/040msc"
        mscFolderPath="E:/XB/unpack/com/file/040msc/0x12345678"
        onMscFolderChange={onMscFolderChange}
        isActive
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Traditional MSC" }));
    await user.click(screen.getByRole("button", { name: /pick folder/i }));

    await waitFor(() => {
      expect(folderContainsMscScriptFilesMock).toHaveBeenCalledWith(
        traditionalPath,
        "traditional",
      );
      expect(screen.getByText(traditionalPath)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /repack \.fhm2d/i })).toBeInTheDocument();
    });
    expect(onMscFolderChange).not.toHaveBeenCalled();
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

  it("automatically repacks the FHM2D after compiling C when enabled", async () => {
    const user = userEvent.setup();
    readDirMock.mockResolvedValue([{ isFile: true, name: "0.c" }]);

    render(
      <MscWorkspaceView
        workspaceRoot="E:/workspace"
        workspaceDefaultPath="E:/workspace/040msc"
        mscFolderPath="E:/workspace/040msc/0x12345678"
        onMscFolderChange={() => {}}
        isActive
        modFolderPath="E:/OB_MOD"
      />,
    );

    await user.click(await screen.findByRole("switch", { name: /auto-repack \.fhm2d/i }));
    await user.click(screen.getByRole("button", { name: /^repack$/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("compile_msc", {
        inputPath: "E:/workspace/040msc/0x12345678/0.c",
        outputPath: "E:/workspace/040msc/0x12345678/0.bscex",
      });
      expect(invokeMock).toHaveBeenCalledWith("repack_fhm2d", {
        structureJsonPath: "E:\\workspace\\040msc\\0x12345678_structure.json",
        outputPath: "E:\\OB_MOD\\0x12345678.fhm2d",
        atomicWrite: true,
      });
      expect(removeMatchingModVgsht2Mock).toHaveBeenCalledWith(
        "E:/OB_MOD",
        "E:\\OB_MOD\\0x12345678.fhm2d",
      );
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Repacked to mod: E:\\OB_MOD\\0x12345678.fhm2d",
      );
    });
  });

  it("removes matching .vgsht2 after MSC FHM2D folder repack", async () => {
    const user = userEvent.setup();
    readDirMock.mockResolvedValue([{ isFile: true, name: "0.c" }]);
    invokeMock.mockResolvedValueOnce({
      outputPath: "E:\\OB_MOD\\0x12345678.fhm2d",
      totalFiles: 1,
      outputSize: 4096,
    });
    removeMatchingModVgsht2Mock.mockResolvedValueOnce(true);

    render(
      <MscWorkspaceView
        workspaceRoot="E:/workspace"
        workspaceDefaultPath="E:/workspace/040msc"
        mscFolderPath="E:/workspace/040msc/0x12345678"
        onMscFolderChange={() => {}}
        isActive
        modFolderPath="E:/OB_MOD"
      />,
    );

    await user.click(await screen.findByRole("button", { name: /repack \.fhm2d/i }));

    await waitFor(() => {
      expect(removeMatchingModVgsht2Mock).toHaveBeenCalledWith(
        "E:/OB_MOD",
        "E:\\OB_MOD\\0x12345678.fhm2d",
      );
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Repacked to mod: E:\\OB_MOD\\0x12345678.fhm2d",
        { description: "Removed matching .vgsht2 (same stem as .fhm2d)" },
      );
    });
  });

  it("blocks FHM2D repack when the OB Mod path is not configured", async () => {
    const user = userEvent.setup();
    readDirMock.mockResolvedValue([{ isFile: true, name: "0.c" }]);

    render(
      <MscWorkspaceView
        workspaceRoot="E:/workspace"
        mscFolderPath="E:/workspace/040msc/0x12345678"
        onMscFolderChange={() => {}}
        isActive
      />,
    );

    await user.click(await screen.findByRole("button", { name: /repack \.fhm2d/i }));

    expect(toastErrorMock).toHaveBeenCalledWith(
      "Configure OB Mod path in Config before repacking",
    );
    expect(invokeMock).not.toHaveBeenCalled();
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

  it("converts a Unit MSC script through decompile_msc and writes the sibling txt log", async () => {
    const user = userEvent.setup();
    readDirMock.mockResolvedValue([{ isFile: true, name: "2.dscex" }]);

    render(
      <MscWorkspaceView
        workspaceRoot="E:/workspace"
        workspaceDefaultPath="E:/workspace/040msc"
        mscFolderPath="E:/workspace/040msc/0x12345678"
        onMscFolderChange={() => {}}
        isActive
      />,
    );

    await user.click(await screen.findByRole("button", { name: /^convert$/i }));
    await user.click(await screen.findByRole("button", { name: /^continue$/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("decompile_msc", {
        inputPath: "E:/workspace/040msc/0x12345678/2.dscex",
        outputPath: "E:/workspace/040msc/0x12345678/2.c",
        logPath: "E:/workspace/040msc/0x12345678/2.txt",
      });
    });
    expect(JSON.stringify(invokeMock.mock.calls)).not.toContain("mscdec.py");
  });

  it("repacks Unit MSC 0.c/1.c/2.c through compile_msc onto the pack scripts", async () => {
    const user = userEvent.setup();
    readDirMock.mockResolvedValue([
      { isFile: true, name: "0.c" },
      { isFile: true, name: "1.c" },
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

    await user.click(await screen.findByRole("button", { name: /^repack all$/i }));
    await user.click(await screen.findByRole("button", { name: /^continue$/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("compile_msc", {
        inputPath: "E:/workspace/040msc/0x12345678/0.c",
        outputPath: "E:/workspace/040msc/0x12345678/0.bscex",
      });
      expect(invokeMock).toHaveBeenCalledWith("compile_msc", {
        inputPath: "E:/workspace/040msc/0x12345678/1.c",
        outputPath: "E:/workspace/040msc/0x12345678/1.cscex",
      });
      expect(invokeMock).toHaveBeenCalledWith("compile_msc", {
        inputPath: "E:/workspace/040msc/0x12345678/2.c",
        outputPath: "E:/workspace/040msc/0x12345678/2.dscex",
      });
    });
    expect(JSON.stringify(invokeMock.mock.calls)).not.toContain("msclang.py");
  });

  it("decompiles all Unit MSC scripts through decompile_msc", async () => {
    const user = userEvent.setup();
    readDirMock.mockResolvedValue([
      { isFile: true, name: "0.bscex" },
      { isFile: true, name: "1.cscex" },
      { isFile: true, name: "2.dscex" },
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

    await user.click(await screen.findByRole("button", { name: /^decompile all$/i }));
    await user.click(await screen.findByRole("button", { name: /^continue$/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("decompile_msc", {
        inputPath: "E:/workspace/040msc/0x12345678/0.bscex",
        outputPath: "E:/workspace/040msc/0x12345678/0.c",
        logPath: "E:/workspace/040msc/0x12345678/0.txt",
      });
      expect(invokeMock).toHaveBeenCalledWith("decompile_msc", {
        inputPath: "E:/workspace/040msc/0x12345678/1.cscex",
        outputPath: "E:/workspace/040msc/0x12345678/1.c",
        logPath: "E:/workspace/040msc/0x12345678/1.txt",
      });
      expect(invokeMock).toHaveBeenCalledWith("decompile_msc", {
        inputPath: "E:/workspace/040msc/0x12345678/2.dscex",
        outputPath: "E:/workspace/040msc/0x12345678/2.c",
        logPath: "E:/workspace/040msc/0x12345678/2.txt",
      });
    });
  });

  it("verifies a Unit MSC C file in-process against the original pack script", async () => {
    const user = userEvent.setup();
    readDirMock.mockResolvedValue([{ isFile: true, name: "1.c" }]);
    existsMock.mockImplementation(async (path: string) => path.endsWith("1.cscex"));

    render(
      <MscWorkspaceView
        workspaceRoot="E:/workspace"
        workspaceDefaultPath="E:/workspace/040msc"
        mscFolderPath="E:/workspace/040msc/0x12345678"
        onMscFolderChange={() => {}}
        isActive
      />,
    );

    await user.click(await screen.findByRole("button", { name: /^verify$/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("verify_msc_roundtrip_from_c", {
        cPath: "E:/workspace/040msc/0x12345678/1.c",
        originalPath: "E:/workspace/040msc/0x12345678/1.cscex",
      });
    });
    expect(invokeMock).not.toHaveBeenCalledWith("compile_msc", expect.anything());
  });
});
