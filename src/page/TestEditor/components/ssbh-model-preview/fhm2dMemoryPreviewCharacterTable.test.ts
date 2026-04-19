import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCharacterIdMemoryPreviewOptions } from "./fhm2dMemoryPreviewCharacterTable";

const listCharacterIdMemoryPreviewRowsMock = vi.fn();

vi.mock("./fhm2dMemoryPreviewService", () => ({
  listCharacterIdMemoryPreviewRows: (params: unknown) => listCharacterIdMemoryPreviewRowsMock(params),
}));

describe("loadCharacterIdMemoryPreviewOptions", () => {
  beforeEach(() => {
    listCharacterIdMemoryPreviewRowsMock.mockReset();
  });

  it("delegates Character ID loading to the backend service with workspace path, cache path, and query", async () => {
    listCharacterIdMemoryPreviewRowsMock.mockResolvedValue({
      filePath: "E:\\workspace\\0x036B9E67\\character_id_table.bin",
      availableCount: 1,
      query: "10",
      rows: [
        {
          characterId: 100,
          modelValue: 0x10,
          modelHashHex: "0x00000010",
          sourcePath: "C:\\cache\\0x00000010.fhm2d",
          sourceExists: true,
          disabledReason: null,
        },
      ],
    });

    const result = await loadCharacterIdMemoryPreviewOptions({
      workspaceRoot: "E:\\workspace",
      obDplCachePath: "C:\\cache",
      query: "10",
    });

    expect(listCharacterIdMemoryPreviewRowsMock).toHaveBeenCalledWith({
      workspaceRoot: "E:\\workspace",
      obDplCachePath: "C:\\cache",
      query: "10",
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.characterId).toBe(100);
  });
});
