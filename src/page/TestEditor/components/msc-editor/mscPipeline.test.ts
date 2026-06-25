import { describe, expect, it } from "vitest";

import {
  computeMscSlotStatuses,
  getMscFileRole,
  groupMscFiles,
  isMscPackScriptCFile,
  type MscFileInfo,
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
