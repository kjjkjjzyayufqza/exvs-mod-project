import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  commandCreateMock,
  commandExecuteMock,
  existsMock,
  readTextFileMock,
  writeTextFileMock,
} = vi.hoisted(() => ({
  commandCreateMock: vi.fn(),
  commandExecuteMock: vi.fn(),
  existsMock: vi.fn<(path: string) => Promise<boolean>>(),
  readTextFileMock: vi.fn<(path: string) => Promise<string>>(),
  writeTextFileMock: vi.fn<(path: string, contents: string) => Promise<void>>(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: existsMock,
  readTextFile: readTextFileMock,
  writeTextFile: writeTextFileMock,
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: {
    create: commandCreateMock,
  },
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) => parts.join("/")),
  resourceDir: vi.fn(async () => "E:/app/resources"),
}));

import {
  decompileMscScript,
  resolveMscActionOverlayForFolder,
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
