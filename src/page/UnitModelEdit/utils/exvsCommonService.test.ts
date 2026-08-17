import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import {
  addExvsCommonModel,
  EXVS_COMMON_HASH_NAME,
  isExvsCommonStructure,
  parseExvsCommonRuntimeModelId,
} from "./exvsCommonService";

describe("EXVS Common profile", () => {
  beforeEach(() => invokeMock.mockReset());

  it("detects only the fixed HashName profile", () => {
    expect(isExvsCommonStructure({ HashName: "0xcb665375" })).toBe(true);
    expect(isExvsCommonStructure({ HashName: "0xAF73362C" })).toBe(false);
    expect(EXVS_COMMON_HASH_NAME).toBe("0xCB665375");
  });

  it("parses user-entered runtime u32 hex without little-endian reversal", () => {
    expect(parseExvsCommonRuntimeModelId("0x48415431")).toBe(0x48415431);
    expect(() => parseExvsCommonRuntimeModelId("not-hex")).toThrow(/hexadecimal/);
  });

  it("routes model add to the standalone common command with an explicit ID", async () => {
    invokeMock.mockResolvedValueOnce({
      modelRoot: "E:\\out\\002chara\\000common_000common_001",
      structureJsonPath: "E:\\out\\002chara\\000common_000common_001_structure.json",
      modelCount: 2,
      totalFiles: 49,
      removedFiles: [],
    });
    await addExvsCommonModel({
      modelRoot: "E:/out/002chara/000common_000common_001",
      structureJsonPath: "E:/out/002chara/000common_000common_001_structure.json",
      sourceDir: "E:/hat",
      modelId: 0x48415431,
    });
    expect(invokeMock).toHaveBeenCalledWith("add_exvs_common_model", {
      modelRoot: "E:\\out\\002chara\\000common_000common_001",
      structureJsonPath:
        "E:\\out\\002chara\\000common_000common_001_structure.json",
      sourceDir: "E:\\hat",
      modelId: 0x48415431,
    });
  });
});
