import { describe, expect, it, vi, beforeEach } from "vitest";
import { exists, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { Fhm2d_type_format } from "@/models/fhm2d";
import { renameExtractPayloads } from "./renameExtractPayloads";
import {
  FHM2D_INIT_CONTENT_BY_ITEM_ID,
  GENERIC_FHM2D_INIT_ITEM_IDS,
  payloadNamesForContent,
  workspaceContentExtractSpec,
} from "./workspaceContentExtract";

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  rename: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) => parts.filter(Boolean).join("/")),
}));

const existsMock = vi.mocked(exists);
const readTextFileMock = vi.mocked(readTextFile);
const writeTextFileMock = vi.mocked(writeTextFile);
const renameMock = vi.mocked(rename);

describe("workspaceContentExtractSpec", () => {
  it("extracts the arcade mission packs as plain folders", () => {
    // These packs hold several payloads, or payloads whose extracted names the
    // backend identifies by content, so no single output name is imposed.
    for (const id of ["triad-battle-list", "scene-id-table", "outmission", "pilot-name-list"] as const) {
      expect(workspaceContentExtractSpec(id)).toEqual({
        contentId: id,
        format: Fhm2d_type_format.fhm2d_list,
        listOutputFileName: undefined,
      });
    }
  });

  it("wires every mission init item to its catalog content", () => {
    expect(FHM2D_INIT_CONTENT_BY_ITEM_ID.triad_battle_list).toBe("triad-battle-list");
    expect(FHM2D_INIT_CONTENT_BY_ITEM_ID.scene_id_table).toBe("scene-id-table");
    expect(FHM2D_INIT_CONTENT_BY_ITEM_ID.outmission).toBe("outmission");
    expect(FHM2D_INIT_CONTENT_BY_ITEM_ID.pilot_name_list).toBe("pilot-name-list");
    for (const id of ["triad_battle_list", "scene_id_table", "outmission", "pilot_name_list"]) {
      expect(GENERIC_FHM2D_INIT_ITEM_IDS.has(id)).toBe(true);
    }
  });

  it("leaves mission packs out of the single-payload rename table", () => {
    expect(payloadNamesForContent("triad-battle-list")).toBeNull();
    expect(payloadNamesForContent("outmission")).toBeNull();
  });

  it("maps list packs to fhm2d_list and catalog file names", () => {
    expect(workspaceContentExtractSpec("character-id-table")).toEqual({
      contentId: "character-id-table",
      format: Fhm2d_type_format.fhm2d_list,
      listOutputFileName: "character_id_table.bin",
    });
    expect(workspaceContentExtractSpec("character-list")).toEqual({
      contentId: "character-list",
      format: Fhm2d_type_format.fhm2d_list,
      listOutputFileName: "character_list.bin",
    });
    expect(workspaceContentExtractSpec("series-list")).toEqual({
      contentId: "series-list",
      format: Fhm2d_type_format.fhm2d_list,
      listOutputFileName: "series_list.bin",
    });
    expect(workspaceContentExtractSpec("navi-list")).toEqual({
      contentId: "navi-list",
      format: Fhm2d_type_format.fhm2d_list,
      listOutputFileName: "navi_list.bin",
    });
    expect(workspaceContentExtractSpec("stage-list")).toEqual({
      contentId: "stage-list",
      format: Fhm2d_type_format.fhm2d_stage_list,
      listOutputFileName: "stage_list.bin",
    });
  });

  it("maps generic Init items onto extract specs with catalog names", () => {
    for (const itemId of GENERIC_FHM2D_INIT_ITEM_IDS) {
      const contentId = FHM2D_INIT_CONTENT_BY_ITEM_ID[itemId];
      expect(contentId, itemId).toBeTruthy();
      expect(workspaceContentExtractSpec(contentId), itemId).not.toBeNull();
    }
  });

  it("maps Init modal item ids onto catalog content ids", () => {
    expect(FHM2D_INIT_CONTENT_BY_ITEM_ID.character_id_table).toBe("character-id-table");
    expect(FHM2D_INIT_CONTENT_BY_ITEM_ID.navi_list).toBe("navi-list");
    expect(FHM2D_INIT_CONTENT_BY_ITEM_ID.character_cost).toBe("character-cost");
  });

  it("uses a fixed index table for character cost", () => {
    expect(payloadNamesForContent("character-cost")).toEqual([
      "foroutgamecharacterparam_playable.bin",
      "foroutgamecharacterparam_boss.bin",
      "foroutgamecharacterparam_zako.bin",
    ]);
  });

  it("uses catalog file names for list and striker packs", () => {
    expect(payloadNamesForContent("navi-list")).toEqual(["navi_list.bin"]);
    expect(payloadNamesForContent("striker-table")).toEqual(["strikertable.vgsht1"]);
  });
});

describe("renameExtractPayloads", () => {
  beforeEach(() => {
    existsMock.mockReset();
    readTextFileMock.mockReset();
    writeTextFileMock.mockReset();
    renameMock.mockReset();
    renameMock.mockResolvedValue(undefined);
    writeTextFileMock.mockResolvedValue(undefined);
  });

  it("renames 0.bin to character_id_table.bin and patches structure json", async () => {
    existsMock.mockImplementation(async (path) => {
      const normalized = String(path).replace(/\\/g, "/");
      return (
        normalized === "E:/workspace/012list/characteridtable" ||
        normalized === "E:/workspace/012list/characteridtable/0.bin" ||
        normalized === "E:/workspace/012list/characteridtable_structure.json"
      );
    });
    readTextFileMock.mockResolvedValue(
      JSON.stringify({
        Name: "characteridtable",
        HashName: "0x036B9E67",
        SubFileData: [
          {
            index: 0,
            fileIndex: 0,
            fileType: ".bin",
            fileUrl: ".\\characteridtable\\0.bin",
            fileBaseName: "0",
          },
        ],
        SubFileStructure: [{ type: "Item", fileIndex: 0, Name: "0" }],
      }),
    );

    const result = await renameExtractPayloads({
      folderPath: "E:/workspace/012list/characteridtable",
      names: ["character_id_table.bin"],
    });

    expect(result.renamed).toEqual(["character_id_table.bin"]);
    expect(renameMock).toHaveBeenCalledWith(
      "E:/workspace/012list/characteridtable/0.bin",
      "E:/workspace/012list/characteridtable/character_id_table.bin",
    );
    const written = JSON.parse(String(writeTextFileMock.mock.calls[0]?.[1]));
    expect(written.SubFileData[0].fileUrl).toBe(".\\characteridtable\\character_id_table.bin");
    expect(written.SubFileData[0].fileBaseName).toBe("character_id_table");
    expect(written.SubFileData[0].fileType).toBe(".bin");
    expect(written.SubFileStructure[0].Name).toBe("character_id_table");
  });

  it("skips when the target name already exists", async () => {
    existsMock.mockImplementation(async (path) => {
      const normalized = String(path).replace(/\\/g, "/");
      return (
        normalized === "E:/workspace/012list/characteridtable" ||
        normalized.endsWith("/character_id_table.bin")
      );
    });

    const result = await renameExtractPayloads({
      folderPath: "E:/workspace/012list/characteridtable",
      names: ["character_id_table.bin"],
    });

    expect(result.skipped).toEqual(["character_id_table.bin"]);
    expect(renameMock).not.toHaveBeenCalled();
  });
});
