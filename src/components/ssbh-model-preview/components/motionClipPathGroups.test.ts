import { describe, expect, it } from "vitest";
import {
  buildMotionClipCatalog,
  compareMotionFolderIds,
  filterMotionClipCatalog,
  formatMotionClipTrigger,
  inferFolderActionHint,
  parseMotionClipFileName,
} from "./motionClipPathGroups";

const PACK = "E:/XB/mod/003motion/017gyakch_006newhws_001";

function p(...parts: string[]): string {
  return [PACK, ...parts].join("/");
}

/** Real Gyan New Hardware layout: loose common clips in 0/0 + action folders 0..n. */
const GYAK_PATHS = [
  p("0", "0", "001hito_000common_000common_001_20headgrab_stk_air_bk.nuanmb"),
  p("0", "0", "001hito_000common_000common_001_45mdmg_weak_air_fr.nuanmb"),
  p("0", "0", "001hito_017gyakch_006newhws_001_kamae_sht_air_fr.nuanmb"),
  p("0", "0", "0", "001hito_017gyakch_006newhws_001_kakf31a_sht_air_fr.nuanmb"),
  p("0", "0", "0", "736newhwssld_017gyakch_006newhws_001_hmshield00_kakf31a_sht_air_fr.nuanmb"),
  p("0", "0", "0", "741newhwsbp_017gyakch_006newhws_001_backpack00_kakf31a_sht_air_fr.nuanmb"),
  p("0", "0", "1", "001hito_017gyakch_006newhws_001_winbgn03_sht_air_fr.nuanmb"),
  p("0", "0", "10", "001hito_017gyakch_006newhws_001_exatk11a_sht_air_fr.nuanmb"),
  p("0", "0", "10", "400stick_017gyakch_006newhws_001_bsaberr00_exatk11a_sht_air_fr.nuanmb"),
  p("0", "0", "10", "736newhwssld_017gyakch_006newhws_001_hmshield00_exatk11a_sht_air_fr.nuanmb"),
  p("0", "0", "10", "741newhwsbp_017gyakch_006newhws_001_backpack00_exatk11a_sht_air_fr.nuanmb"),
  p("0", "0", "29", "001hito_017gyakch_006newhws_001_aimingmain_sht_gnd_fr.nuanmb"),
  p("0", "0", "29", "001hito_017gyakch_006newhws_001_aimingmain_sht_gnd_lf.nuanmb"),
];

describe("parseMotionClipFileName", () => {
  it("strips the extract prefix and keeps the action token for a body clip", () => {
    const parsed = parseMotionClipFileName("001hito_017gyakch_006newhws_001_exatk11a_sht_air_fr.nuanmb");
    expect(parsed.actor).toBe("001hito");
    expect(parsed.source).toBe("017gyakch_006newhws");
    expect(parsed.actionHint).toBe("exatk11a");
    expect(parsed.suffix).toBe("sht air fr");
  });

  it("keeps the attachment part in the remainder for shield clips", () => {
    const parsed = parseMotionClipFileName(
      "736newhwssld_017gyakch_006newhws_001_hmshield00_kakf31a_sht_air_fr.nuanmb",
    );
    expect(parsed.actor).toBe("736newhwssld");
    expect(parsed.actionHint).toBe("hmshield00_kakf31a");
    expect(parsed.suffix).toBe("sht air fr");
  });

  it("parses common-library damage clips", () => {
    const parsed = parseMotionClipFileName("001hito_000common_000common_001_45mdmg_weak_air_bk.nuanmb");
    expect(parsed.source).toBe("000common_000common");
    expect(parsed.actionHint).toBe("45mdmg_weak");
    expect(parsed.suffix).toBe("air bk");
  });
});

describe("buildMotionClipCatalog", () => {
  it("groups the Gyan pack by action folder, not as a flat list", () => {
    const catalog = buildMotionClipCatalog(GYAK_PATHS);
    expect(catalog.groups.map((group) => group.label)).toEqual(["0/0", "0/0/0", "0/0/1", "0/0/10", "0/0/29"]);
    expect(catalog.groups.map((group) => group.clips.length)).toEqual([3, 3, 1, 4, 2]);
  });

  it("treats each numbered folder as one action bundle shared by body and attachments", () => {
    const catalog = buildMotionClipCatalog(GYAK_PATHS);
    const folder10 = catalog.groups.find((group) => group.label === "0/0/10");
    expect(folder10?.actionHint).toBe("exatk11a");
    expect(folder10?.clips.map((clip) => clip.actor)).toEqual([
      "001hito",
      "400stick",
      "736newhwssld",
      "741newhwsbp",
    ]);
  });

  it("does not invent an action name for the mixed bank-root library", () => {
    const catalog = buildMotionClipCatalog(GYAK_PATHS);
    const root = catalog.groups.find((group) => group.label === "0/0");
    expect(root?.actionHint).toBeNull();
  });

  it("accepts Windows separators and keeps numeric folder order", () => {
    const catalog = buildMotionClipCatalog([
      `${PACK}\\0\\0\\2\\a.nuanmb`,
      `${PACK}\\0\\0\\10\\b.nuanmb`,
      `${PACK}\\0\\0\\1\\c.nuanmb`,
    ]);
    expect(catalog.groups.map((group) => group.label)).toEqual(["0/0/1", "0/0/2", "0/0/10"]);
  });

  it("keeps a single opened file as one group", () => {
    const catalog = buildMotionClipCatalog([p("0", "0", "10", "solo.nuanmb")]);
    expect(catalog.groups).toHaveLength(1);
    expect(catalog.groups[0]?.clips).toHaveLength(1);
  });
});

describe("inferFolderActionHint", () => {
  it("picks the shared action token across body and attachment remainders", () => {
    const catalog = buildMotionClipCatalog(GYAK_PATHS);
    const folder0 = catalog.groups.find((group) => group.label === "0/0/0");
    expect(inferFolderActionHint(folder0?.clips ?? [])).toBe("kakf31a");
  });
});

describe("filterMotionClipCatalog", () => {
  it("finds an action folder by name even when the query is not a file stem", () => {
    const catalog = buildMotionClipCatalog(GYAK_PATHS);
    const filtered = filterMotionClipCatalog(catalog, "exatk");
    expect(filtered.map((group) => group.label)).toEqual(["0/0/10"]);
    expect(filtered[0]?.clips).toHaveLength(4);
  });

  it("narrows a mixed folder to matching clips", () => {
    const catalog = buildMotionClipCatalog(GYAK_PATHS);
    const filtered = filterMotionClipCatalog(catalog, "headgrab");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.label).toBe("0/0");
    expect(filtered[0]?.clips).toHaveLength(1);
    expect(filtered[0]?.clips[0]?.actionHint).toBe("20headgrab");
  });
});

describe("formatMotionClipTrigger", () => {
  it("keeps the full file name and only adds the folder path as context", () => {
    const catalog = buildMotionClipCatalog(GYAK_PATHS);
    const path = p("0", "0", "10", "001hito_017gyakch_006newhws_001_exatk11a_sht_air_fr.nuanmb");
    expect(formatMotionClipTrigger({ groups: catalog.groups, path })).toEqual({
      title: "001hito_017gyakch_006newhws_001_exatk11a_sht_air_fr.nuanmb",
      subtitle: "0/0/10",
    });
  });
});

describe("compareMotionFolderIds", () => {
  it("sorts numbered folders naturally", () => {
    const ids = ["0/10", "0/2", "0/1"];
    expect([...ids].sort(compareMotionFolderIds)).toEqual(["0/1", "0/2", "0/10"]);
  });
});
