import { describe, expect, it } from "vitest"
import { resolveChrSysParamCandidates } from "./chrSysParamPath"

describe("resolveChrSysParamCandidates", () => {
  it("uses the param route root when the workspace knows it", () => {
    expect(
      resolveChrSysParamCandidates("E:\\XB\\mod\\040msc\\015gndmuc_008faunig_001", "E:\\XB\\mod\\041cpm"),
    ).toEqual(["E:\\XB\\mod\\041cpm\\015gndmuc_008faunig_001\\chrsysparam.csyspm"])
  })

  it("also offers the folder name without the route suffix", () => {
    expect(
      resolveChrSysParamCandidates("E:\\XB\\mod\\040msc\\fapt_gndmuc_001_msc", "E:\\XB\\mod\\041cpm"),
    ).toEqual([
      "E:\\XB\\mod\\041cpm\\fapt_gndmuc_001_msc\\chrsysparam.csyspm",
      "E:\\XB\\mod\\041cpm\\fapt_gndmuc_001\\chrsysparam.csyspm",
    ])
  })

  it("swaps the sibling route prefix when no root is given", () => {
    expect(resolveChrSysParamCandidates("E:/XB/mod/040msc/015gndmuc_008faunig_001")).toEqual([
      "E:/XB/mod/041cpm/015gndmuc_008faunig_001/chrsysparam.csyspm",
    ])
  })

  it("returns nothing for folders outside the unit MSC route", () => {
    expect(resolveChrSysParamCandidates("E:/XB/mod/scratch/unit")).toEqual([])
    expect(resolveChrSysParamCandidates("")).toEqual([])
  })
})
