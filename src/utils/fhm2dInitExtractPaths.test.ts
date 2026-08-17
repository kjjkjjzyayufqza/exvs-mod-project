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
