import { describe, expect, it } from "vitest";
import type { Fhm2dNameMappingEntry } from "@/utils/fhm2dNameMapping";
import {
  collectCharacterGuiUsages,
  expectedWorkspaceGuiFolder,
  fallbackGuiPackagePath,
  filterGuiPackPickerItems,
  isCharacterGuiHashField,
  isGuiRelatedNameMapping,
  mergeGuiPackPickerItems,
  planGuiPackExtract,
  resolveGuiPackFolder,
  sortGuiPackPickerItems,
  vs2GuiExtractRelative,
} from "./guiPackIndex";

function mapping(partial: Partial<Fhm2dNameMappingEntry> & { hashName: string; name: string }): Fhm2dNameMappingEntry {
  return {
    routeId: "gui.card-icons",
    routePrefix: "009gui",
    source: "test",
    confidence: "manual-override",
    packagePath: null,
    gameRelativePath: null,
    categoryPath: null,
    aliases: [],
    sourcePathCount: 1,
    matchedPathCount: 1,
    character: null,
    ...partial,
  };
}

describe("guiPackIndex", () => {
  it("collapses duplicate vs2 leaves and appends shared parents", () => {
    expect(
      vs2GuiExtractRelative(
        "009gui/flash/pilot/p_016_001/st_p_016_001_c01/st_p_016_001_c01",
        "st_p_016_001_c01",
      ),
    ).toBe("flash/pilot/p_016_001/st_p_016_001_c01");
    expect(vs2GuiExtractRelative("009gui/flash/navi/battle", "navi_bt_016_o01")).toBe(
      "flash/navi/battle/navi_bt_016_o01",
    );
    expect(
      expectedWorkspaceGuiFolder("E:\\XB\\mod", "009gui/flash/navi/battle", "navi_bt_016_o01"),
    ).toBe("E:\\XB\\mod\\009gui\\flash\\navi\\battle\\navi_bt_016_o01");
  });

  it("keeps only pickable 009gui mappings", () => {
    expect(
      isGuiRelatedNameMapping(
        mapping({
          hashName: "0x88BD4DC3",
          name: "st_p_016_001_c01",
          packagePath: "009gui/flash/pilot/p_016_001/st_p_016_001_c01",
        }),
      ),
    ).toBe(true);
    expect(
      isGuiRelatedNameMapping(
        mapping({
          hashName: "0xFF2F74E6",
          name: "ms_vs_l_016_001_001",
          packagePath: "009gui/image/ms/ms_vs_l/ms_vs_l_016_001_001",
        }),
      ),
    ).toBe(true);
    expect(
      isGuiRelatedNameMapping(
        mapping({
          hashName: "0x49235031",
          name: "ms_ms_s",
          packagePath: "009gui/ms_ms_s",
        }),
      ),
    ).toBe(false);
    expect(
      isGuiRelatedNameMapping(
        mapping({
          hashName: "0xFD7A731E",
          name: "ms_vs_s_l_001_001_001",
          packagePath: "009gui/image/ms/ms_vs_s_l/ms_vs_s_l_001_001_001",
        }),
      ),
    ).toBe(false);
    expect(isCharacterGuiHashField("lmbCutIn")).toBe(true);
    expect(isCharacterGuiHashField("msVsL")).toBe(true);
    expect(isCharacterGuiHashField("msMsS")).toBe(true);
    expect(isCharacterGuiHashField("msTracker")).toBe(true);
    expect(isCharacterGuiHashField("seriesId")).toBe(false);
  });

  it("lets workspace extracts win and keeps character-list usage notes", () => {
    const items = mergeGuiPackPickerItems({
      nameMappings: [
        mapping({
          hashName: "0x88BD4DC3",
          name: "st_p_016_001_c01",
          packagePath: "009gui/flash/pilot/p_016_001/st_p_016_001_c01",
        }),
      ],
      workspacePacks: [
        {
          hash: 0x88bd4dc3,
          hashName: "0x88BD4DC3",
          name: "custom_wing_cutin",
          folderPath: "E:\\mod\\009gui\\flash\\pilot\\st_p",
          structureJsonPath: "E:\\mod\\009gui\\flash\\pilot\\st_p_structure.json",
          workspaceRelative: "flash/pilot/st_p",
          previewNutexbPath: "E:\\mod\\009gui\\flash\\pilot\\st_p\\cutin.nutexb",
        },
      ],
      characterUsages: [{ hash: 0x88bd4dc3, label: "Heero lmbCutIn" }],
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("custom_wing_cutin");
    expect(items[0]?.folderPath).toContain("009gui");
    expect(items[0]?.nutexbPath).toContain("cutin.nutexb");
    expect(items[0]?.packagePath).toContain("009gui");
    expect(items[0]?.secondaryText).toContain("Heero lmbCutIn");
    expect(resolveGuiPackFolder(0x88bd4dc3, items)).toBe(items[0]?.folderPath);
  });

  it("keeps per-unit image/ms workspace packs and drops the card atlas", () => {
    const items = mergeGuiPackPickerItems({
      nameMappings: [],
      workspacePacks: [
        {
          hash: 0xff2f74e6,
          hashName: "0xFF2F74E6",
          name: "custom_rebellion_ms_vs_l",
          folderPath: "E:\\mod\\009gui\\image\\ms\\ms_vs_l\\custom_rebellion_ms_vs_l",
          structureJsonPath: "E:\\mod\\009gui\\image\\ms\\ms_vs_l\\custom_rebellion_ms_vs_l_structure.json",
          workspaceRelative: "image/ms/ms_vs_l/custom_rebellion_ms_vs_l",
          previewNutexbPath: "E:\\mod\\009gui\\image\\ms\\ms_vs_l\\custom_rebellion_ms_vs_l\\ms_vs_l.nutexb",
        },
        {
          hash: 0x49235031,
          hashName: "0x49235031",
          name: "ms_ms_s",
          folderPath: "E:\\mod\\009gui\\ms_ms_s",
          structureJsonPath: "E:\\mod\\009gui\\ms_ms_s_structure.json",
          workspaceRelative: "ms_ms_s",
        },
      ],
      characterUsages: [],
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("custom_rebellion_ms_vs_l");
    expect(items[0]?.packagePath).toBe("009gui/image/ms/ms_vs_l/custom_rebellion_ms_vs_l");
  });

  it("keeps msTracker packs through merge and filter", () => {
    const items = mergeGuiPackPickerItems({
      nameMappings: [
        mapping({
          hashName: "0x8239C895",
          name: "ms_tracker_016_001_001",
          packagePath: "009gui/ms_tracker_016_001_001",
        }),
      ],
      workspacePacks: [],
      characterUsages: [],
    });
    expect(items).toHaveLength(1);
    expect(filterGuiPackPickerItems("msTracker", items).map((item) => item.label)).toEqual([
      "ms_tracker_016_001_001",
    ]);
  });

  it("collects non-zero character GUI hashes and sorts matching prefixes first", () => {
    const usages = collectCharacterGuiUsages([
      { entryId: 16001001, characterName: "Heero", lmbCutIn: 0x88bd4dc3, scP: 0 },
    ]);
    expect(usages).toEqual([{ hash: 0x88bd4dc3, label: "Heero lmbCutIn" }]);
    const sorted = sortGuiPackPickerItems("lmbCutIn", [
      { hash: 1, label: "ex_p_016_001_c01", secondaryText: "", folderPath: null, packagePath: null, nutexbPath: null, source: "name-map" },
      { hash: 2, label: "st_p_016_001_c01", secondaryText: "", folderPath: null, packagePath: null, nutexbPath: null, source: "name-map" },
    ]);
    expect(sorted[0]?.label).toBe("st_p_016_001_c01");
  });

  it("plans vanilla vs_p_l extract from the name-map and skips extracted folders", () => {
    expect(fallbackGuiPackagePath("vsPL", "wing_custom_vs_p_l")).toBe(
      "009gui/image/pilot/vs_p_l/wing_custom_vs_p_l",
    );
    expect(fallbackGuiPackagePath("msTracker", "ms_tracker_016_001_001")).toBe(
      "009gui/ms_tracker_016_001_001",
    );
    const planned = planGuiPackExtract(0x9233d6ac, "vsPL", []);
    expect(planned).toEqual({
      hash: 0x9233d6ac,
      packagePath: "009gui/image/pilot/vs_p_l/vs_p_l_016_001_c01",
      structureName: "vs_p_l_016_001_c01",
    });
    expect(
      planGuiPackExtract(0x9233d6ac, "vsPL", [
        {
          hash: 0x9233d6ac,
          label: "vs_p_l_016_001_c01",
          secondaryText: "",
          folderPath: "E:\\mod\\009gui\\image\\pilot\\vs_p_l\\vs_p_l_016_001_c01",
          packagePath: "009gui/image/pilot/vs_p_l/vs_p_l_016_001_c01",
          nutexbPath: "E:\\mod\\a.nutexb",
          source: "workspace",
        },
      ]),
    ).toBeNull();
    expect(planGuiPackExtract(0, "vsPL", [])).toBeNull();
  });

  it("filters picker items by field prefix and keeps custom items in the same bucket", () => {
    const items = [
      {
        hash: 0x9233d6ac,
        label: "vs_p_l_016_001_c01",
        secondaryText: "",
        folderPath: null,
        packagePath: "009gui/image/pilot/vs_p_l/vs_p_l_016_001_c01",
        nutexbPath: null,
        source: "name-map" as const,
      },
      {
        hash: 0x92f3166f,
        label: "ms_igh_r_001_001_001",
        secondaryText: "",
        folderPath: null,
        packagePath: "009gui/image/ms/ms_igh_r/ms_igh_r_001_001_001",
        nutexbPath: null,
        source: "name-map" as const,
      },
      {
        hash: 0xd294ec94,
        label: "custom_rebellion_vs_left",
        secondaryText: "",
        folderPath: "E:\\mod\\009gui\\image\\pilot\\vs_p_l\\custom_rebellion_vs_left",
        packagePath: "009gui/image/pilot/vs_p_l/custom_rebellion_vs_left",
        nutexbPath: "E:\\mod\\009gui\\image\\pilot\\vs_p_l\\custom_rebellion_vs_left\\preview.nutexb",
        source: "workspace" as const,
      },
    ];
    const filtered = filterGuiPackPickerItems("vsPL", items, 0x9233d6ac);
    expect(filtered.map((item) => item.label)).toEqual([
      "vs_p_l_016_001_c01",
      "custom_rebellion_vs_left",
    ]);
    expect(filterGuiPackPickerItems("vsPL", items, 0xd294ec94).map((item) => item.label)).toEqual([
      "vs_p_l_016_001_c01",
      "custom_rebellion_vs_left",
    ]);
  });
});
