import { describe, expect, it } from "vitest";

import {
  findFhm2dNameMapping,
  inferFhm2dRoutePrefixFromPath,
  suggestFhm2dStructureName,
} from "./fhm2dNameMapping";

describe("fhm2dNameMapping", () => {
  it("maps the EXVS2 effect hash from meta evidence", () => {
    const entry = findFhm2dNameMapping("0xF6954689", { routeId: "unit.effect" });

    expect(entry?.name).toBe("chara_001gundam_001gundam_002chrgel_001");
    expect(entry?.confidence).toBe("exact-meta-path");
    expect(entry?.packagePath).toBe("006effect/chara/001gundam/001gundam_002chrgel_001");
    expect(entry?.character?.characterId).toBe(1002001);
    expect(entry?.character?.characterName).toBe("シャア専用ゲルググ");
  });

  it("infers route prefix from workspace paths", () => {
    expect(inferFhm2dRoutePrefixFromPath("E:/workspace/006effect/0xF6954689_structure.json")).toBe(
      "006effect",
    );
  });

  it("uses mapped names before fallback names", () => {
    expect(
      suggestFhm2dStructureName("E:/cache/0xF6954689.fhm2d", {
        routePrefix: "006effect",
        fallbackName: "Effect_F6954689",
      }),
    ).toBe("chara_001gundam_001gundam_002chrgel_001");
  });

  it("returns a sanitized fallback when no mapping exists", () => {
    expect(
      suggestFhm2dStructureName("0xDEADBEEF", {
        routeId: "unit.effect",
        fallbackName: "Unknown effect!",
      }),
    ).toBe("Unknown_effect");
  });

  it("keeps OB ai-string inferred mappings available", () => {
    const entry = findFhm2dNameMapping("0x46DE9B9C", { routeId: "unit.model" });

    expect(entry?.name).toBe("001gundam_005gyan00_001_46de9b9c");
    expect(entry?.confidence).toBe("inferred-ob-ai-string");
    expect(entry?.character?.characterId).toBe(1005001);
  });

  it("uses deep GUI image folders from EXVS2 metadata", () => {
    const entry = findFhm2dNameMapping("0xA0253AA0", { routeId: "gui.series-icons" });

    expect(entry?.name).toBe("ser_ms");
    expect(entry?.confidence).toBe("exact-meta-path");
    expect(entry?.packagePath).toBe("009gui/image/ser/ser_ms");
    expect(entry?.sourcePathCount).toBe(49);
  });

  it("uses source file stems for generic EXVS2 sound metadata folders", () => {
    const entry = findFhm2dNameMapping("0x01CB0F8E", { routePrefix: "090sound" });

    expect(entry?.name).toBe("vo_0010_p41_0_01");
    expect(entry?.confidence).toBe("exact-meta-path");
    expect(entry?.packagePath).toBe("090sound/voicetable");
  });

  it("uses concrete GUI flash bundle folders from metadata source paths", () => {
    const entry = findFhm2dNameMapping("0x00C36166", { routePrefix: "009gui" });

    expect(entry?.name).toBe("navi_bt_021_o01");
    expect(entry?.confidence).toBe("exact-meta-path");
    expect(entry?.packagePath).toBe("009gui/flash/navi/battle");
  });

  it("maps newer OB unit hashes from the unit hash table", () => {
    const mscEntry = findFhm2dNameMapping("0x19CE466D", { routeId: "unit.msc" });
    const paramEntry = findFhm2dNameMapping("0x48357C75", { routeId: "unit.param" });

    expect(mscEntry?.name).toBe("066suisei_001aerial_001");
    expect(mscEntry?.confidence).toBe("ob-unit-list");
    expect(mscEntry?.character?.characterId).toBe(66001001);
    expect(paramEntry?.name).toBe("066suisei_001aerial_001");
    expect(paramEntry?.confidence).toBe("ob-unit-list");
  });

  it("uses newer character_list fields for Over.on unit hashes", () => {
    const entry = findFhm2dNameMapping("0xB6BBF2D9", { routeId: "unit.model" });

    expect(entry?.name).toBe("058vlprgs_001overon_001");
    expect(entry?.confidence).toBe("ob-unit-list");
    expect(entry?.character?.characterId).toBe(58001001);
    expect(entry?.character?.characterName).toBe("オーヴェロン");
  });

  it("uses internal unit stems when OB unit IDs lack direct character rows", () => {
    const entry = findFhm2dNameMapping("0xAF626F7A", { routeId: "unit.model" });

    expect(entry?.name).toBe("768freedm_001imojus_001_af626f7a");
    expect(entry?.aliases).toContain("unit_568701001");
    expect(entry?.character?.characterId).toBe(768001005);
    expect(entry?.character?.characterName).toBe("不朽正義高達");
  });

  it("maps OB param workspaces from chrsysparam unit IDs", () => {
    const entry = findFhm2dNameMapping("0x35B195CC", { routeId: "unit.param" });

    expect(entry?.name).toBe("001gundam_005gyan00_001_35b195cc");
    expect(entry?.confidence).toBe("ob-param-unit-id");
    expect(entry?.character?.characterId).toBe(1005001);
  });

  it("keeps research-backed manual overrides available", () => {
    const entry = findFhm2dNameMapping("0xFEEA714A", { routeId: "unit.msc" });

    expect(entry?.name).toBe("gundam_005gyan00_modified");
    expect(entry?.confidence).toBe("manual-research-note");
    expect(entry?.character?.characterId).toBe(1005001);
  });

  it("maps OB-only ν Gundam HWS motion 0x006044D2 from the shipped dictionary", () => {
    const entry = findFhm2dNameMapping("0x006044D2", { routeId: "unit.motion" });

    expect(entry?.name).toBe("017gyakch_006newhws_001");
    expect(entry?.routeId).toBe("unit.motion");
    expect(entry?.routePrefix).toBe("003motion");
    expect(entry?.character?.characterId).toBe(17006001);
    expect(entry?.name).not.toBe("000common_000common_001");
  });

  it("maps other 7-hex ob_unit hashes that the 8-hex normalizer used to drop", () => {
    const param = findFhm2dNameMapping("0x0031807C", { routeId: "unit.param" });
    const rgnjla = findFhm2dNameMapping("0x00DB34FD", { routeId: "unit.model" });
    const domClone = findFhm2dNameMapping("0x00BC54B9", { routeId: "unit.model" });
    const acguy = findFhm2dNameMapping("0x00ACD4C4", { routeId: "unit.model" });
    const gnaocm = findFhm2dNameMapping("0x003CDD4D", { routeId: "unit.param" });
    const unknownParam = findFhm2dNameMapping("0x00FF1FC0", { routeId: "unit.param" });
    const phantom = findFhm2dNameMapping("0x00D6A795", { routeId: "unit.motion" });

    expect(param?.name).toBe("756gndmnt_002jststb_001");
    expect(param?.character?.characterId).toBe(756002001);
    expect(param?.name).not.toBe("ob_0031807c");
    expect(rgnjla?.name).toBe("749orphn2_005rgnjla_001");
    expect(rgnjla?.character?.characterId).toBe(749005001);
    expect(domClone?.name).toBe("001gundam_017dom000_001_00bc54b9");
    expect(domClone?.character?.characterId).toBe(501705001);
    expect(acguy?.name).toBe("701gundam_007acguy0_001");
    expect(acguy?.character?.characterId).toBe(701007001);
    expect(gnaocm?.name).toBe("733gndage_017gnaocm_001");
    expect(gnaocm?.character?.characterId).toBe(733017001);
    expect(unknownParam?.name).toBe("unit_505707001");
    expect(unknownParam?.character?.characterId).toBe(505707001);
    expect(phantom?.name).toBe("023crosgn_005phantm_001");
    expect(phantom?.character?.characterId).toBe(23005001);
  });

  it("maps real OB dplcache hashes from internal FHM2D names", () => {
    const entry = findFhm2dNameMapping("0x002AB482", { routePrefix: "009gui" });

    expect(entry?.name).toBe("vs_p_r_059_003_c04");
    expect(entry?.confidence).toBe("ob-dplcache-internal");
    expect(entry?.packagePath).toBe("009gui/vs_p_r_059_003_c04");
  });

  it("names large OB dplcache model packages from decoded unit stems", () => {
    const entry = findFhm2dNameMapping("0x00DB34FD", { routePrefix: "002chara" });

    expect(entry?.name).toBe("749orphn2_005rgnjla_001");
    expect(entry?.packagePath).toBe("002chara/749orphn2_005rgnjla_001");
    expect(entry?.character?.characterId).toBe(749005001);
  });

  it("keeps low-confidence fallback entries for real OB hashes without internal names", () => {
    const entry = findFhm2dNameMapping("0x002C2FDA");

    expect(entry?.name).toBe("ob_002c2fda");
    expect(entry?.confidence).toBe("ob-dplcache-fallback");
  });
});
