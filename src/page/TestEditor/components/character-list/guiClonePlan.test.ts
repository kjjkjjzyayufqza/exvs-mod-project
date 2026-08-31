import { describe, expect, it } from "vitest";
import {
  applyCharacterGuiFieldUpdates,
  defaultGuiCloneStructureName,
  formatGuiHashHex,
  guiCloneFieldLabel,
  guiCloneHashSeed,
  isMsGuiCloneKey,
  isNaviGuiCloneKey,
  isPilotGuiCloneKey,
  MS_GUI_CLONE_FIELDS,
  overlayClonedGuiPack,
  PILOT_GUI_CLONE_FIELDS,
  previewGuiCloneFieldName,
  previewGuiCloneHash,
  replaceGuiExtractLeaf,
  uniqueGuiCloneStructureName,
} from "./guiClonePlan";

describe("guiClonePlan", () => {
  it("formats unsigned hashes", () => {
    expect(formatGuiHashHex(0x88bd4dc3)).toBe("0x88BD4DC3");
    expect(formatGuiHashHex(0x88bd4dc3 | 0)).toBe("0x88BD4DC3");
  });

  it("applies field updates without mutating the source entry", () => {
    const source = {
      entryId: 900000004,
      lmbCutIn: 0x88bd4dc3,
      scP: 1,
    };
    const next = applyCharacterGuiFieldUpdates(source, { lmbCutIn: 0xaabbccdd, vsPL: 2 });
    expect(next.lmbCutIn).toBe(0xaabbccdd);
    expect((next as { vsPL?: number }).vsPL).toBe(2);
    expect(source.lmbCutIn).toBe(0x88bd4dc3);
    expect(PILOT_GUI_CLONE_FIELDS).toHaveLength(13);
    expect(MS_GUI_CLONE_FIELDS).toHaveLength(8);
    expect(isPilotGuiCloneKey("lmbCutIn")).toBe(true);
    expect(isMsGuiCloneKey("msMsS")).toBe(true);
    expect(isMsGuiCloneKey("msCardIconIndex")).toBe(false);
    expect(isNaviGuiCloneKey("naviBt")).toBe(true);
    expect(isNaviGuiCloneKey("navi_11112222")).toBe(true);
    expect(guiCloneFieldLabel("vsPL")).toBe("VS Pilot Left");
    expect(guiCloneFieldLabel("msMsS")).toBe("MS MS S");
  });

  it("picks a unique clone leaf from the field prefix and target id", () => {
    expect(defaultGuiCloneStructureName("msMsS", 900000004)).toBe("ms_ms_s_900000004");
    expect(uniqueGuiCloneStructureName("msMsS", 900000004, [])).toBe("ms_ms_s_900000004");
    expect(
      uniqueGuiCloneStructureName("msMsS", 900000004, ["ms_ms_s_900000004", "ms_ms_s_900000004_2"]),
    ).toBe("ms_ms_s_900000004_3");
    expect(uniqueGuiCloneStructureName("msTracker", 16001001, ["ms_tracker_16001001"])).toBe(
      "ms_tracker_16001001_2",
    );
  });

  it("computes the clone HashName from the custom Name", () => {
    const first = previewGuiCloneFieldName(900000004, "msMsS", "ms_ms_s_custom");
    const second = previewGuiCloneFieldName(900000004, "msMsS", "ms_ms_s_other");
    expect(first.structureName).toBe("ms_ms_s_custom");
    expect(first.hashHex).toBe(formatGuiHashHex(first.newHash));
    expect(first.seed).toBe("GUI_CLONE|900000004|ms_ms_s_custom|msMsS");
    expect(first.newHash).toBe(previewGuiCloneHash(900000004, "ms_ms_s_custom", "msMsS"));
    expect(second.newHash).not.toBe(first.newHash);
  });

  it("recomputes HashName and extract leaf from the custom structure name", () => {
    expect(replaceGuiExtractLeaf(
      "image/navi/navi_pl_s/navi_pl_s_016_o01_c02",
      "navi_pl_s_016_o01_c02",
      "navi_pl_s_016_o01_c0212313dad",
    )).toBe("image/navi/navi_pl_s/navi_pl_s_016_o01_c0212313dad");
    const donorHash = previewGuiCloneHash(900000004, "navi_pl_s_016_o01_c02", "naviPlSC02");
    const customHash = previewGuiCloneHash(900000004, "navi_pl_s_016_o01_c0212313dad", "naviPlSC02");
    expect(customHash).not.toBe(donorHash);
    expect(guiCloneHashSeed(900000004, "navi_pl_s_016_o01_c0212313dad", "naviPlSC02")).toBe(
      "GUI_CLONE|900000004|navi_pl_s_016_o01_c0212313dad|naviPlSC02",
    );
    const overlay = overlayClonedGuiPack(
      {
        fieldKey: "naviPlSC02",
        donorName: "navi_pl_s_016_o01_c02",
        donorHash: 0x24c51513,
        newHash: donorHash,
        donorFileName: "0x24C51513.fhm2d",
        newFileName: formatGuiHashHex(donorHash) + ".fhm2d",
        bindTarget: "navi_list",
        sourcePath: "E:\\dpl\\0x24C51513.fhm2d",
        outputPath: "E:\\XB\\mod\\009gui\\image\\navi\\navi_pl_s\\navi_pl_s_016_o01_c02",
        workspaceRelative: "image/navi/navi_pl_s/navi_pl_s_016_o01_c02",
        structureJsonPath: "E:\\XB\\mod\\009gui\\image\\navi\\navi_pl_s\\navi_pl_s_016_o01_c02_structure.json",
        structureName: "navi_pl_s_016_o01_c02",
        innerFileCount: 1,
        obModOutputPath: null,
        byteLen: 100,
      },
      "navi_pl_s_016_o01_c0212313dad",
      900000004,
      "E:\\XB\\mod\\009gui",
    );
    expect(overlay.newHash).toBe(customHash);
    expect(overlay.workspaceRelative).toBe("image/navi/navi_pl_s/navi_pl_s_016_o01_c0212313dad");
    expect(overlay.outputPath).toBe(
      "E:\\XB\\mod\\009gui\\image\\navi\\navi_pl_s\\navi_pl_s_016_o01_c0212313dad",
    );
    expect(overlay.outputPath.endsWith("navi_pl_s_016_o01_c02")).toBe(false);
  });
});
