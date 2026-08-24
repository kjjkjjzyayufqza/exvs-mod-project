import { describe, expect, it } from "vitest";
import {
  applyCharacterGuiFieldUpdates,
  formatGuiHashHex,
  guiCloneFieldLabel,
  guiCloneHashSeed,
  isNaviGuiCloneKey,
  isPilotGuiCloneKey,
  overlayClonedGuiPack,
  PILOT_GUI_CLONE_FIELDS,
  previewGuiCloneHash,
  replaceGuiExtractLeaf,
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
    expect(PILOT_GUI_CLONE_FIELDS).toHaveLength(7);
    expect(isPilotGuiCloneKey("lmbCutIn")).toBe(true);
    expect(isNaviGuiCloneKey("naviBt")).toBe(true);
    expect(guiCloneFieldLabel("vsPL")).toBe("VS Pilot Left");
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
