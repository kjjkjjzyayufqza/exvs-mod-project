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
  repackMscScript,
  resolveMscActionOverlayForFolder,
  verifyMscRoundtrip,
} from "./mscWorkspaceActions";

describe("decompileMscScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commandExecuteMock.mockResolvedValue({ code: 0, stderr: "" });
    commandCreateMock.mockReturnValue({ execute: commandExecuteMock });
  });

  it("decompiles through the Rust Tauri command instead of Python mscdec.py", async () => {
    invokeMock.mockResolvedValue(undefined);
    await decompileMscScript({
      inputPath: "E:/msc/unit/2.dscex",
      outputPath: "E:/msc/unit/2.c",
      logPath: "E:/msc/unit/2.txt",
    });

    expect(invokeMock).toHaveBeenCalledWith("decompile_msc", {
      inputPath: "E:/msc/unit/2.dscex",
      outputPath: "E:/msc/unit/2.c",
      logPath: "E:/msc/unit/2.txt",
    });
    expect(commandCreateMock).not.toHaveBeenCalled();
    expect(JSON.stringify(invokeMock.mock.calls)).not.toContain("mscdec.py");
    expect(JSON.stringify(invokeMock.mock.calls)).not.toContain("msclang.py");
  });

  it("does not pass a Python tools directory into decompile", async () => {
    invokeMock.mockResolvedValue(undefined);
    await decompileMscScript({
      inputPath: "E:/msc/unit/0.bscex",
      outputPath: "E:/msc/unit/0.c",
      logPath: "E:/msc/unit/0.txt",
    });
    const payload = invokeMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("pythonPath");
    expect(payload).not.toHaveProperty("toolsDir");
    expect(payload).not.toHaveProperty("mscFolderPath");
    expect(commandCreateMock).not.toHaveBeenCalled();
  });

  it("always sends a sibling .txt log path with decompile_msc", async () => {
    invokeMock.mockResolvedValue(undefined);
    await decompileMscScript({
      inputPath: "E:/msc/unit/1.cscex",
      outputPath: "E:/msc/unit/1.c",
      logPath: "E:/msc/unit/1.txt",
    });
    expect(invokeMock).toHaveBeenCalledWith("decompile_msc", {
      inputPath: "E:/msc/unit/1.cscex",
      outputPath: "E:/msc/unit/1.c",
      logPath: "E:/msc/unit/1.txt",
    });
  });
});

describe("repackMscScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeMock.mockResolvedValue(undefined);
    commandExecuteMock.mockResolvedValue({ code: 0, stderr: "" });
    commandCreateMock.mockReturnValue({ execute: commandExecuteMock });
  });

  it.each([
    ["0.c", "0.bscex"],
    ["1.c", "1.cscex"],
    ["2.c", "2.dscex"],
  ] as const)("repacks Unit MSC %s through compile_msc to %s", async (cName, outName) => {
    await repackMscScript({
      inputPath: `E:/msc/unit/${cName}`,
      outputPath: `E:/msc/unit/${outName}`,
    });
    expect(invokeMock).toHaveBeenCalledWith("compile_msc", {
      inputPath: `E:/msc/unit/${cName}`,
      outputPath: `E:/msc/unit/${outName}`,
    });
    expect(commandCreateMock).not.toHaveBeenCalled();
    expect(JSON.stringify(invokeMock.mock.calls)).not.toContain("msclang.py");
    expect(JSON.stringify(invokeMock.mock.calls)).not.toContain("mscdec.py");
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

  it("verifies in-process through the Rust backend instead of writing a temp pack", async () => {
    const result = await verifyMscRoundtrip({ cFilePath: "E:/msc/unit/0.c" });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("verify_msc_roundtrip_from_c", {
      cPath: "E:/msc/unit/0.c",
      originalPath: "E:/msc/unit/0.bscex",
    });
    expect(invokeMock).not.toHaveBeenCalledWith("compile_msc", expect.anything());
    expect(invokeMock).not.toHaveBeenCalledWith("compare_msc_roundtrip", expect.anything());
    expect(removeMock).not.toHaveBeenCalled();
    expect(commandCreateMock).not.toHaveBeenCalled();
    expect(result.report).toEqual(matchReport);
    expect(result.originalPath).toBe("E:/msc/unit/0.bscex");
  });

  it("fails with an explicit error when the original script is missing", async () => {
    existsMock.mockResolvedValue(false);

    await expect(verifyMscRoundtrip({ cFilePath: "E:/msc/unit/2.c" })).rejects.toThrow(
      "original script not found",
    );
    expect(commandCreateMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("does not spawn Python tools for in-process verify", async () => {
    await verifyMscRoundtrip({ cFilePath: "E:/msc/unit/1.c" });
    expect(commandCreateMock).not.toHaveBeenCalled();
    expect(JSON.stringify(invokeMock.mock.calls)).not.toContain("msclang.py");
    expect(JSON.stringify(invokeMock.mock.calls)).not.toContain("mscdec.py");
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
