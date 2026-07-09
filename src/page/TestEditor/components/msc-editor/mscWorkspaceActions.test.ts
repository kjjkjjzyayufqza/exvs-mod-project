import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  existsMock,
  readTextFileMock,
  writeTextFileMock,
} = vi.hoisted(() => ({
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
    create: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) => parts.join("/")),
  resourceDir: vi.fn(async () => "E:/app/resources"),
}));

import { resolveMscActionOverlayForFolder } from "./mscWorkspaceActions";

describe("resolveMscActionOverlayForFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsMock.mockResolvedValue(true);
    writeTextFileMock.mockResolvedValue();
  });

  it("writes stable evidence to 2.resolved.md without modifying 2.c", async () => {
    readTextFileMock.mockImplementation(async (path) => {
      if (path.endsWith("/0.c")) {
        return `
sys_1(0x10000, 0x1, 0x2, 0x6d00aeaa);
int func_143()
{
    return 0x6d00aeaa;
}
`;
      }
      return `
func_241(0x6d00aeaa, func_390);
void func_390()
{
    func_69(0x2);
}
`;
    });

    const result = await resolveMscActionOverlayForFolder("E:/msc/unit");

    expect(result.status).toBe("resolved");
    expect(result.overlayPath).toBe("E:/msc/unit/2.resolved.md");
    expect(result.actionCount).toBe(1);
    expect(writeTextFileMock).toHaveBeenCalledTimes(1);
    expect(writeTextFileMock).toHaveBeenCalledWith(
      "E:/msc/unit/2.resolved.md",
      expect.stringContaining("Stable key: `0x6d00aeaa`"),
    );
    expect(writeTextFileMock).not.toHaveBeenCalledWith(
      "E:/msc/unit/2.c",
      expect.any(String),
    );
  });

  it("does not write a sidecar when no stable evidence is available", async () => {
    readTextFileMock.mockImplementation(async (path) =>
      path.endsWith("/0.c") ? "int func_143() { return 0; }" : "void func_1() {}",
    );

    const result = await resolveMscActionOverlayForFolder("E:/msc/empty");

    expect(result.status).toBe("skipped");
    expect(result.overlayPath).toBeNull();
    expect(writeTextFileMock).not.toHaveBeenCalled();
  });
});
