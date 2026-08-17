import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  commandCreateMock,
  commandExecuteMock,
  existsMock,
  invokeMock,
  readTextFileMock,
  removeMock,
  writeTextFileMock,
} = vi.hoisted(() => ({
  commandCreateMock: vi.fn(),
  commandExecuteMock: vi.fn(),
  existsMock: vi.fn<(path: string) => Promise<boolean>>(),
  invokeMock: vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(),
  readTextFileMock: vi.fn<(path: string) => Promise<string>>(),
  removeMock: vi.fn<(path: string) => Promise<void>>(),
  writeTextFileMock: vi.fn<(path: string, contents: string) => Promise<void>>(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: existsMock,
  readTextFile: readTextFileMock,
  remove: removeMock,
  writeTextFile: writeTextFileMock,
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: {
    create: commandCreateMock,
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) => parts.join("/")),
  resourceDir: vi.fn(async () => "E:/app/resources"),
}));

import {
  decompileMscScript,
  openFileInExternalEditor,
  resolveMscActionOverlayForFolder,
  verifyMscRoundtrip,
} from "./mscWorkspaceActions";

describe("decompileMscScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commandExecuteMock.mockResolvedValue({ code: 0, stderr: "" });
    commandCreateMock.mockReturnValue({ execute: commandExecuteMock });
  });

  it("does not enable unstable EXVS2 text postprocessing by default", async () => {
    await decompileMscScript({
      inputPath: "E:/msc/unit/2.dscex",
      outputPath: "E:/msc/unit/2.c",
      logPath: "E:/msc/unit/2.txt",
    });

    expect(commandCreateMock).toHaveBeenCalledWith("exec-python", [
      "E:/app/resources/tools/mscdec.py",
      "E:/msc/unit/2.dscex",
      "-o",
      "E:/msc/unit/2.c",
      "-log",
      "E:/msc/unit/2.txt",
    ]);
  });
});

describe("verifyMscRoundtrip", () => {
  const matchReport = {
    isMatch: true,
    originalSize: 128,
    recompiledSize: 128,
    firstDivergenceOffset: null,
    contextStartOffset: null,
    originalContextHex: null,
    recompiledContextHex: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    existsMock.mockResolvedValue(true);
    removeMock.mockResolvedValue();
    invokeMock.mockResolvedValue(matchReport);
    commandExecuteMock.mockResolvedValue({ code: 0, stderr: "" });
    commandCreateMock.mockReturnValue({ execute: commandExecuteMock });
  });

  it("recompiles to a temp path and compares against the untouched original", async () => {
    const result = await verifyMscRoundtrip({ cFilePath: "E:/msc/unit/0.c" });

    expect(commandCreateMock).toHaveBeenCalledWith(
      "exec-python",
      [
        "E:/app/resources/tools/msclang.py",
        "E:/msc/unit/0.c",
        "-o",
        "E:/msc/unit/0.roundtrip.tmp",
        "-i",
      ],
      { encoding: "utf-8" },
    );
    expect(invokeMock).toHaveBeenCalledWith("compare_msc_roundtrip", {
      originalPath: "E:/msc/unit/0.bscex",
      recompiledPath: "E:/msc/unit/0.roundtrip.tmp",
    });
    expect(removeMock).toHaveBeenCalledWith("E:/msc/unit/0.roundtrip.tmp");
    expect(result.report).toEqual(matchReport);
    expect(result.originalPath).toBe("E:/msc/unit/0.bscex");
    expect(result.tempCleanupError).toBeNull();
  });

  it("fails with an explicit error when the original script is missing", async () => {
    existsMock.mockResolvedValue(false);

    await expect(verifyMscRoundtrip({ cFilePath: "E:/msc/unit/2.c" })).rejects.toThrow(
      "original script not found",
    );
    expect(commandCreateMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("reports a cleanup error without failing the verify", async () => {
    removeMock.mockRejectedValue(new Error("file is locked"));

    const result = await verifyMscRoundtrip({ cFilePath: "E:/msc/unit/1.c" });

    expect(result.report).toEqual(matchReport);
    expect(result.tempCleanupError).toContain("file is locked");
  });
});

describe("openFileInExternalEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commandExecuteMock.mockResolvedValue({ code: 0, stderr: "" });
    commandCreateMock.mockReturnValue({ execute: commandExecuteMock });
  });

  it("launches the configured editor command through cmd /C", async () => {
    await openFileInExternalEditor({ filePath: "E:/msc/unit/2.c", editorCommand: "code" });

    expect(commandCreateMock).toHaveBeenCalledWith("exec-cmd", ["/C", "code", "E:/msc/unit/2.c"]);
  });

  it("throws a descriptive error when the editor command fails", async () => {
    commandExecuteMock.mockResolvedValue({ code: 1, stderr: "'cursor' is not recognized" });

    await expect(
      openFileInExternalEditor({ filePath: "E:/msc/unit/2.c", editorCommand: "cursor" }),
    ).rejects.toThrow(/cursor.*not recognized|Failed to open/);
  });

  it("rejects an empty editor command instead of silently degrading", async () => {
    await expect(
      openFileInExternalEditor({ filePath: "E:/msc/unit/2.c", editorCommand: "   " }),
    ).rejects.toThrow("external editor command is empty");
    expect(commandCreateMock).not.toHaveBeenCalled();
  });
});

describe("resolveMscActionOverlayForFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsMock.mockResolvedValue(true);
    writeTextFileMock.mockResolvedValue();
  });

  it("writes resolved callback names directly into 2.c", async () => {
    readTextFileMock.mockImplementation(async (path) => {
      if (path.endsWith("/0.c")) {
        return `
int func_143()
{
    if (global48 & 0x1)
    {
        func_95(0xf48d2d49, 0, 0);
    }
}
`;
      }
      return `
func_241(0xf48d2d49, func_390);
void func_390()
{
    func_69(0x2);
}
`;
    });

    const result = await resolveMscActionOverlayForFolder("E:/msc/unit");

    expect(result.status).toBe("resolved");
    expect(result.updatedPath).toBe("E:/msc/unit/2.c");
    expect(result.actionCount).toBe(1);
    expect(result.renamedCallbackCount).toBe(1);
    expect(writeTextFileMock).toHaveBeenCalledTimes(1);
    expect(writeTextFileMock).toHaveBeenCalledWith(
      "E:/msc/unit/2.c",
      expect.stringContaining("func_241(0xf48d2d49, ACTION_A_SHOT); //  射击"),
    );
  });

  it("does not modify 2.c when no stable evidence is available", async () => {
    readTextFileMock.mockImplementation(async (path) =>
      path.endsWith("/0.c") ? "int func_143() { return 0; }" : "void func_1() {}",
    );

    const result = await resolveMscActionOverlayForFolder("E:/msc/empty");

    expect(result.status).toBe("skipped");
    expect(result.updatedPath).toBeNull();
    expect(writeTextFileMock).not.toHaveBeenCalled();
  });
});
