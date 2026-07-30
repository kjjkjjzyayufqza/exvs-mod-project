import { describe, expect, it } from "vitest";

import {
  computeMscSlotStatuses,
  getMscFileRole,
  getMscPackSlotIndexForCFile,
  getMscRoundtripTempPath,
  groupMscFiles,
  isMscPackScriptCFile,
  summarizeMscRoundtripReport,
  verifyStateFromReport,
  type MscFileInfo,
  type MscRoundtripCompareReport,
} from "@/page/TestEditor/components/msc-editor/mscPipeline";

function file(name: string): MscFileInfo {
  return { name, path: `C:/work/${name}` };
}

describe("getMscFileRole", () => {
  it("classifies source scripts by extension", () => {
    expect(getMscFileRole("0.bscex")).toBe("script");
    expect(getMscFileRole("1.cscex")).toBe("script");
    expect(getMscFileRole("2.DSCEX")).toBe("script");
  });

  it("classifies decompiled C, logs, and other files", () => {
    expect(getMscFileRole("0.c")).toBe("c");
    expect(getMscFileRole("2.resolved.md")).toBe("resolved");
    expect(getMscFileRole("0.txt")).toBe("log");
    expect(getMscFileRole("notes.md")).toBe("other");
  });
});

describe("isMscPackScriptCFile", () => {
  it("matches only the three pack root C files", () => {
    expect(isMscPackScriptCFile("0.c")).toBe(true);
    expect(isMscPackScriptCFile("2.C")).toBe(true);
    expect(isMscPackScriptCFile("3.c")).toBe(false);
    expect(isMscPackScriptCFile("helper.c")).toBe(false);
  });
});

describe("computeMscSlotStatuses", () => {
  it("reports source and decompiled presence per slot", () => {
    const slots = computeMscSlotStatuses(["0.bscex", "0.c", "1.cscex", "2.dscex"]);
    expect(slots).toHaveLength(3);
    expect(slots[0]).toMatchObject({ index: 0, hasSource: true, hasDecompiled: true });
    expect(slots[1]).toMatchObject({ index: 1, hasSource: true, hasDecompiled: false });
    expect(slots[2]).toMatchObject({ index: 2, hasSource: true, hasDecompiled: false });
  });

  it("marks missing sources", () => {
    const slots = computeMscSlotStatuses(["0.bscex"]);
    expect(slots[1].hasSource).toBe(false);
    expect(slots[2].hasSource).toBe(false);
  });
});

describe("getMscPackSlotIndexForCFile", () => {
  it("returns the slot index for pack root C files", () => {
    expect(getMscPackSlotIndexForCFile("0.c")).toBe(0);
    expect(getMscPackSlotIndexForCFile("2.C")).toBe(2);
  });

  it("throws for non pack root files", () => {
    expect(() => getMscPackSlotIndexForCFile("3.c")).toThrow("not a pack root C file");
    expect(() => getMscPackSlotIndexForCFile("helper.c")).toThrow("not a pack root C file");
  });
});

describe("getMscRoundtripTempPath", () => {
  it("builds a sibling temp path with a non-script extension", () => {
    expect(getMscRoundtripTempPath("C:/work/msc/1.c")).toBe("C:/work/msc/1.roundtrip.tmp");
    expect(getMscRoundtripTempPath("C:\\work\\msc\\0.c")).toBe("C:\\work\\msc\\0.roundtrip.tmp");
  });

  it("throws for files that are not pack root C files", () => {
    expect(() => getMscRoundtripTempPath("C:/work/msc/helper.c")).toThrow("not a pack root C file");
    expect(() => getMscRoundtripTempPath("C:/work/msc/0.bscex")).toThrow("not a pack root C file");
  });
});

const matchReport: MscRoundtripCompareReport = {
  isMatch: true,
  originalSize: 4096,
  recompiledSize: 4096,
  firstDivergenceOffset: null,
  contextStartOffset: null,
  originalContextHex: null,
  recompiledContextHex: null,
};

const mismatchReport: MscRoundtripCompareReport = {
  isMatch: false,
  originalSize: 4096,
  recompiledSize: 4000,
  firstDivergenceOffset: 0x40,
  contextStartOffset: 0x30,
  originalContextHex: "aa bb",
  recompiledContextHex: "aa cc",
};

describe("verifyStateFromReport", () => {
  it("maps a matching report to match state with the total size", () => {
    expect(verifyStateFromReport(matchReport)).toEqual({ status: "match", totalSize: 4096 });
  });

  it("maps a mismatch report to mismatch state with offset and sizes", () => {
    expect(verifyStateFromReport(mismatchReport)).toEqual({
      status: "mismatch",
      firstDivergenceOffset: 0x40,
      originalSize: 4096,
      recompiledSize: 4000,
    });
  });

  it("throws when a mismatch report is missing the divergence offset", () => {
    expect(() =>
      verifyStateFromReport({ ...mismatchReport, firstDivergenceOffset: null }),
    ).toThrow("missing the first divergence offset");
  });
});

describe("summarizeMscRoundtripReport", () => {
  it("summarizes a match with the byte count", () => {
    expect(summarizeMscRoundtripReport(matchReport)).toBe("byte-identical (4096 bytes)");
  });

  it("summarizes a mismatch with hex offset and both sizes", () => {
    expect(summarizeMscRoundtripReport(mismatchReport)).toBe(
      "diverges at offset 0x40 (original 4096 bytes, recompiled 4000 bytes)",
    );
  });
});

describe("groupMscFiles", () => {
  it("groups by role in pipeline order and drops empty groups", () => {
    const groups = groupMscFiles([
      file("2.dscex"),
      file("0.c"),
      file("2.resolved.md"),
      file("0.bscex"),
      file("0.txt"),
    ]);
    expect(groups.map((g) => g.role)).toEqual(["script", "c", "resolved", "log"]);
  });

  it("sorts files inside a group by leading index", () => {
    const groups = groupMscFiles([file("2.c"), file("0.c"), file("1.c")]);
    expect(groups[0].files.map((f) => f.name)).toEqual(["0.c", "1.c", "2.c"]);
  });
});
