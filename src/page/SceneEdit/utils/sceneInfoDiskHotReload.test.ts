import { describe, expect, it } from "vitest";

import type { PlacementRow } from "../types/placement";
import type { StageSkeleton } from "./sceneSessionService";
import {
  buildInfoCsvDiskPatch,
  infoCsvKindFromPath,
  infoCsvReloadPlan,
} from "./sceneInfoDiskHotReload";

function skeleton(overrides?: Partial<StageSkeleton>): StageSkeleton {
  return {
    rootPath: "E:/stage/0/0",
    placementHeader: ["VDK_TYPE"],
    placementEntries: [],
    graphicParams: [{ key: "fog_alpha_boost", value: "0.45" }],
    subModelManifest: [],
    hasBaseModel: false,
    warnings: [],
    ...overrides,
  };
}

function placementRow(rawFields: string[]): PlacementRow {
  return {
    vdkType: rawFields[0] ?? "",
    objectNumber: null,
    posX: 0,
    posY: 0,
    posZ: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    rawFields,
  };
}

describe("info csv disk hot reload", () => {
  it("recognizes the two info csv file names", () => {
    expect(infoCsvKindFromPath("E:/stage/0/0/info/graphic_param.csv")).toBe("graphic");
    expect(infoCsvKindFromPath("E:\\stage\\info\\placement.csv")).toBe("placement");
    expect(infoCsvKindFromPath("E:/stage/info/border_hit.hkt")).toBeNull();
  });

  it("reloads only clean csvs named by the watch event", () => {
    expect(
      infoCsvReloadPlan(["E:/stage/info/graphic_param.csv"], {
        graphicParams: false,
        placementOrder: false,
      }),
    ).toEqual({ reloadGraphic: true, reloadPlacement: false });
    expect(
      infoCsvReloadPlan(["E:/stage/info/graphic_param.csv", "E:/stage/info/placement.csv"], {
        graphicParams: true,
        placementOrder: false,
      }),
    ).toEqual({ reloadGraphic: false, reloadPlacement: true });
    expect(
      infoCsvReloadPlan(["E:/stage/info/border_hit.hkt"], {
        graphicParams: false,
        placementOrder: false,
      }),
    ).toEqual({ reloadGraphic: false, reloadPlacement: false });
  });

  it("treats an empty path list as an unscoped refresh of clean csvs", () => {
    expect(
      infoCsvReloadPlan([], { graphicParams: true, placementOrder: false }),
    ).toEqual({ reloadGraphic: false, reloadPlacement: true });
  });

  it("patches graphic params when the disk rows differ and leaves a matching file alone", () => {
    const changed = buildInfoCsvDiskPatch(
      skeleton(),
      {
        graphicParams: [{ key: "fog_alpha_boost", value: "1" }],
        placementHeader: ["VDK_TYPE"],
        placementEntries: [],
        appliedGraphicParamKeys: new Set(),
      },
      { reloadGraphic: true, reloadPlacement: true },
    );
    expect(changed.changedFiles).toEqual(["graphic_param.csv"]);
    expect(changed.graphicParams).toEqual([{ key: "fog_alpha_boost", value: "0.45" }]);
    expect(changed.placementEntries).toBeUndefined();

    const same = buildInfoCsvDiskPatch(
      skeleton(),
      {
        graphicParams: [{ key: "fog_alpha_boost", value: "0.45" }],
        placementHeader: ["VDK_TYPE"],
        placementEntries: [],
        appliedGraphicParamKeys: new Set(),
      },
      { reloadGraphic: true, reloadPlacement: false },
    );
    expect(same.changedFiles).toEqual([]);
  });

  it("patches placement rows without touching graphic params when only placement is requested", () => {
    const patch = buildInfoCsvDiskPatch(
      skeleton({
        placementHeader: ["VDK_TYPE", "VDK_OBJECTNUMBER"],
        placementEntries: [
          {
            vdkType: "OBJECT",
            objectNumber: 1,
            posX: 0,
            posY: 0,
            posZ: 0,
            rotX: 0,
            rotY: 0,
            rotZ: 0,
            scaleX: 1,
            scaleY: 1,
            scaleZ: 1,
            rawFields: ["OBJECT", "1"],
          },
        ],
      }),
      {
        graphicParams: [{ key: "fog_alpha_boost", value: "1" }],
        placementHeader: ["VDK_TYPE"],
        placementEntries: [placementRow(["MAP"])],
        appliedGraphicParamKeys: new Set(["directional_lighting_intensity"]),
      },
      { reloadGraphic: false, reloadPlacement: true },
    );
    expect(patch.changedFiles).toEqual(["placement.csv"]);
    expect(patch.graphicParams).toBeUndefined();
    expect(patch.placementEntries?.[0]?.rawFields).toEqual(["OBJECT", "1"]);
  });
});
