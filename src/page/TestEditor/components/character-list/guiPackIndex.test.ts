import { describe, expect, it } from "vitest";
import type { Fhm2dNameMappingEntry } from "@/utils/fhm2dNameMapping";
import {
  collectCharacterGuiUsages,
  expectedWorkspaceGuiFolder,
  isCharacterGuiHashField,
  isGuiRelatedNameMapping,
  mergeGuiPackPickerItems,
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

  it("keeps only 009gui pilot/navi mappings", () => {
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
          hashName: "0x49235031",
          name: "ms_ms_s",
          packagePath: "009gui/ms_ms_s",
        }),
      ),
    ).toBe(false);
    expect(isCharacterGuiHashField("lmbCutIn")).toBe(true);
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
        },
      ],
      characterUsages: [{ hash: 0x88bd4dc3, label: "Heero lmbCutIn" }],
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("custom_wing_cutin");
    expect(items[0]?.folderPath).toContain("009gui");
    expect(items[0]?.secondaryText).toContain("Heero lmbCutIn");
    expect(resolveGuiPackFolder(0x88bd4dc3, items)).toBe(items[0]?.folderPath);
  });

  it("drops card-icon workspace packs from the GUI picker", () => {
    const items = mergeGuiPackPickerItems({
      nameMappings: [],
      workspacePacks: [
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
    expect(items).toHaveLength(0);
  });

  it("collects non-zero character GUI hashes and sorts matching prefixes first", () => {
    const usages = collectCharacterGuiUsages([
      { entryId: 16001001, characterName: "Heero", lmbCutIn: 0x88bd4dc3, scP: 0 },
    ]);
    expect(usages).toEqual([{ hash: 0x88bd4dc3, label: "Heero lmbCutIn" }]);
    const sorted = sortGuiPackPickerItems("lmbCutIn", [
      { hash: 1, label: "ex_p_016_001_c01", secondaryText: "", folderPath: null, source: "name-map" },
      { hash: 2, label: "st_p_016_001_c01", secondaryText: "", folderPath: null, source: "name-map" },
    ]);
    expect(sorted[0]?.label).toBe("st_p_016_001_c01");
  });
});
