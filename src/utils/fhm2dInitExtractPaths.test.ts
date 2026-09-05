import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFhm2dInitExtractOutput,
  defaultInitPackName,
  resolveInitRouteTarget,
} from "./fhm2dInitExtractPaths";

describe("fhm2dInitExtractPaths", () => {
  it("maps Character Cost to 041cpm/for_outgame under the export root", () => {
    const route = resolveInitRouteTarget("param.for-outgame");
    expect(route.routePrefix).toBe("041cpm");

    const packName = defaultInitPackName("0xFF832E7F", {
      routeId: "param.for-outgame",
      fallbackName: "Character Cost",
    });
    expect(packName).toBe("for_outgame");

    const out = buildFhm2dInitExtractOutput({
      exportRoot: "E:\\XB\\mod",
      routeId: route.routeId,
      routePrefix: route.routePrefix,
      packName,
      hashHex: "0xFF832E7F",
    });

    expect(out.relativeFolderPath).toBe("041cpm/for_outgame");
    expect(out.routeRootPath.replace(/\\/g, "/")).toBe("E:/XB/mod/041cpm");
    expect(out.folderPath.replace(/\\/g, "/")).toBe("E:/XB/mod/041cpm/for_outgame");
    expect(out.structureJsonPath.replace(/\\/g, "/")).toBe(
      "E:/XB/mod/041cpm/for_outgame_structure.json",
    );
    expect(out.repackOutputPath?.replace(/\\/g, "/")).toBe(
      "E:/XB/mod/041cpm/0xFF832E7F.fhm2d",
    );
  });

  it("maps Striker Table to 041cpm/strikertable", () => {
    const route = resolveInitRouteTarget("unit.param");
    expect(route.routePrefix).toBe("041cpm");

    const packName = defaultInitPackName("0xFEEB79F0", {
      routeId: "unit.param",
      fallbackName: "strikertable",
    });
    expect(packName).toBe("strikertable");

    const out = buildFhm2dInitExtractOutput({
      exportRoot: "E:/XB/mod",
      routeId: route.routeId,
      routePrefix: route.routePrefix,
      packName,
      hashHex: "0xFEEB79F0",
    });

    expect(out.relativeFolderPath).toBe("041cpm/strikertable");
    expect(out.folderPath.replace(/\\/g, "/")).toBe("E:/XB/mod/041cpm/strikertable");
    expect(out.repackOutputPath?.replace(/\\/g, "/")).toBe(
      "E:/XB/mod/041cpm/0xFEEB79F0.fhm2d",
    );
  });

  it("maps Navi List to 012list/navi_list", () => {
    const route = resolveInitRouteTarget("list.navi");
    expect(route.routePrefix).toBe("012list");

    const out = buildFhm2dInitExtractOutput({
      exportRoot: "E:/XB/mod",
      routeId: route.routeId,
      routePrefix: route.routePrefix,
      packName: "navi_list",
      hashHex: "0x6FCC0FBA",
    });

    expect(out.relativeFolderPath).toBe("012list/navi_list");
    expect(out.folderPath.replace(/\\/g, "/")).toBe("E:/XB/mod/012list/navi_list");
    expect(out.repackOutputPath?.replace(/\\/g, "/")).toBe(
      "E:/XB/mod/012list/0x6FCC0FBA.fhm2d",
    );
  });

  it("maps Series List to 012list/series_list", () => {
    const route = resolveInitRouteTarget("list.series");
    const packName = defaultInitPackName("0xB7367090", {
      routeId: "list.series",
      fallbackName: "Series List",
    });
    expect(packName).toBe("series_list");

    const out = buildFhm2dInitExtractOutput({
      exportRoot: "E:/XB/mod/",
      routeId: route.routeId,
      routePrefix: route.routePrefix,
      packName,
      hashHex: "0xB7367090",
    });

    expect(out.relativeFolderPath).toBe("012list/series_list");
    expect(out.folderPath.replace(/\\/g, "/")).toBe("E:/XB/mod/012list/series_list");
  });

  it("maps Card Icons to 009gui/ms_ms_s", () => {
    const route = resolveInitRouteTarget("gui.card-icons");
    const packName = defaultInitPackName("0x49235031", {
      routeId: "gui.card-icons",
      fallbackName: "Card Icon List",
    });
    expect(packName).toBe("ms_ms_s");

    const out = buildFhm2dInitExtractOutput({
      exportRoot: "E:/XB/mod",
      routeId: route.routeId,
      routePrefix: route.routePrefix,
      packName,
      hashHex: "0x49235031",
    });

    expect(out.relativeFolderPath).toBe("009gui/ms_ms_s");
    expect(out.folderPath.replace(/\\/g, "/")).toBe("E:/XB/mod/009gui/ms_ms_s");
  });

  it("maps Common Effect to 006effect/000common_001", () => {
    const route = resolveInitRouteTarget("unit.effect");
    expect(route.routePrefix).toBe("006effect");

    const out = buildFhm2dInitExtractOutput({
      exportRoot: "E:/XB/mod",
      routeId: route.routeId,
      routePrefix: route.routePrefix,
      packName: "000common_001",
      hashHex: "0x1587139A",
    });

    expect(out.relativeFolderPath).toBe("006effect/000common_001");
    expect(out.folderPath.replace(/\\/g, "/")).toBe(
      "E:/XB/mod/006effect/000common_001",
    );
    expect(out.structureJsonPath.replace(/\\/g, "/")).toBe(
      "E:/XB/mod/006effect/000common_001_structure.json",
    );
    expect(out.repackOutputPath?.replace(/\\/g, "/")).toBe(
      "E:/XB/mod/006effect/0x1587139A.fhm2d",
    );
  });

  it("maps Raw Path ID to 090sound/raw_path_id", () => {
    const route = resolveInitRouteTarget("unit.sound");
    expect(route.routePrefix).toBe("090sound");

    const out = buildFhm2dInitExtractOutput({
      exportRoot: "E:/XB/mod",
      routeId: route.routeId,
      routePrefix: route.routePrefix,
      packName: "raw_path_id",
      hashHex: "0x264D1CA7",
    });

    expect(out.relativeFolderPath).toBe("090sound/raw_path_id");
    expect(out.folderPath.replace(/\\/g, "/")).toBe("E:/XB/mod/090sound/raw_path_id");
    expect(out.structureJsonPath.replace(/\\/g, "/")).toBe(
      "E:/XB/mod/090sound/raw_path_id_structure.json",
    );
    expect(out.repackOutputPath?.replace(/\\/g, "/")).toBe(
      "E:/XB/mod/090sound/0x264D1CA7.fhm2d",
    );
  });

  it("maps Pilot Voice Table to 090sound/090sound", () => {
    const route = resolveInitRouteTarget("unit.sound");
    const out = buildFhm2dInitExtractOutput({
      exportRoot: "E:/XB/mod",
      routeId: route.routeId,
      routePrefix: route.routePrefix,
      packName: "090sound",
      hashHex: "0x8C428AF2",
    });
    expect(out.relativeFolderPath).toBe("090sound/090sound");
    expect(out.folderPath.replace(/\\/g, "/")).toBe("E:/XB/mod/090sound/090sound");
    expect(out.repackOutputPath?.replace(/\\/g, "/")).toBe(
      "E:/XB/mod/090sound/0x8C428AF2.fhm2d",
    );
  });

  it("lists BGM List in FHM2D Init as 0xC91627E8 under 012list", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/Fhm2dInitModal.tsx"),
      "utf8",
    );
    expect(source).toContain("0xC91627E8");
    expect(source).toContain("fhm2d_list");
    expect(source).toContain("initBgmListPack");
    expect(source).toContain("BGM_LIST_PACK_NAME");
  });

  it("maps BGM List to 012list/bgm_list", () => {
    const route = resolveInitRouteTarget("list.character");
    expect(route.routePrefix).toBe("012list");

    const out = buildFhm2dInitExtractOutput({
      exportRoot: "E:/XB/mod",
      routeId: route.routeId,
      routePrefix: route.routePrefix,
      packName: "bgm_list",
      hashHex: "0xC91627E8",
    });
    expect(out.relativeFolderPath).toBe("012list/bgm_list");
    expect(out.folderPath.replace(/\\/g, "/")).toBe("E:/XB/mod/012list/bgm_list");
    expect(out.repackOutputPath?.replace(/\\/g, "/")).toBe(
      "E:/XB/mod/012list/0xC91627E8.fhm2d",
    );
  });

  it("lists BGM AC27 Update 02 bank in FHM2D Init as 0x0C568109 under 090sound", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/Fhm2dInitModal.tsx"),
      "utf8",
    );
    expect(source).toContain("0x0C568109");
    expect(source).toContain("initBgmBankUpdate02Pack");
    expect(source).toContain("BGM_BANK_UPDATE_02_PACK_NAME");
  });

  it("maps BGM AC27 Update 02 bank to 090sound/bgm_ac27_update_02", () => {
    const route = resolveInitRouteTarget("unit.sound");
    const out = buildFhm2dInitExtractOutput({
      exportRoot: "E:/XB/mod",
      routeId: route.routeId,
      routePrefix: route.routePrefix,
      packName: "bgm_ac27_update_02",
      hashHex: "0x0C568109",
    });
    expect(out.relativeFolderPath).toBe("090sound/bgm_ac27_update_02");
    expect(out.folderPath.replace(/\\/g, "/")).toBe("E:/XB/mod/090sound/bgm_ac27_update_02");
    expect(out.repackOutputPath?.replace(/\\/g, "/")).toBe(
      "E:/XB/mod/090sound/0x0C568109.fhm2d",
    );
  });

  it("lists EXVS Common Camera in FHM2D Init as 0xCB665375", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/Fhm2dInitModal.tsx"),
      "utf8",
    );
    expect(source).toContain("0xCB665375");
    expect(source).toContain("initCameraPack");
    expect(source).toContain("CAMERA_TABLE_PACK_NAME");
    expect(source).toContain("exvs_common_camera");
  });

  it("maps EXVS Common Camera to 002chara/000common_000common_001", () => {
    const route = resolveInitRouteTarget("unit.model");
    expect(route.routePrefix).toBe("002chara");

    const out = buildFhm2dInitExtractOutput({
      exportRoot: "E:/XB/mod",
      routeId: route.routeId,
      routePrefix: route.routePrefix,
      packName: "000common_000common_001",
      hashHex: "0xCB665375",
    });
    expect(out.relativeFolderPath).toBe("002chara/000common_000common_001");
    expect(out.folderPath.replace(/\\/g, "/")).toBe(
      "E:/XB/mod/002chara/000common_000common_001",
    );
    expect(out.repackOutputPath?.replace(/\\/g, "/")).toBe(
      "E:/XB/mod/002chara/0xCB665375.fhm2d",
    );
  });

  it("maps BGM Table to 090sound/bgm_table", () => {
    const route = resolveInitRouteTarget("unit.sound");
    const out = buildFhm2dInitExtractOutput({
      exportRoot: "E:/XB/mod",
      routeId: route.routeId,
      routePrefix: route.routePrefix,
      packName: "bgm_table",
      hashHex: "0x5E92AAEC",
    });
    expect(out.relativeFolderPath).toBe("090sound/bgm_table");
    expect(out.repackOutputPath?.replace(/\\/g, "/")).toBe(
      "E:/XB/mod/090sound/0x5E92AAEC.fhm2d",
    );
  });

  it("rejects empty export root", () => {
    expect(() =>
      buildFhm2dInitExtractOutput({
        exportRoot: "  ",
        routeId: "param.for-outgame",
        routePrefix: "041cpm",
        packName: "for_outgame",
      }),
    ).toThrow(/Export folder is required/);
  });
});
