import { describe, expect, it } from "vitest";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import {
  effectListItemKey,
  filterEffectListItems,
  formatEffectFolderHash,
  parseHashInput,
  effectFolderHashMatchesQuery,
  resolveEffectPackFromFolderPath,
  resolveEffectPackFromStructureJson,
  toEffectFolderSelections,
  type EffectListItem,
} from "./effectFolderEditorUtils";

describe("formatEffectFolderHash", () => {
  it("shows hex and signed int32 together", () => {
    expect(formatEffectFolderHash({ signed: -1111592982, unsigned: 3183374314, hex: "0xBDBE6FEA" })).toBe(
      "0xBDBE6FEA (-1111592982)",
    );
  });
});

describe("effectFolderHashMatchesQuery", () => {
  const hash = { signed: -1111592982, unsigned: 3183374314, hex: "0xBDBE6FEA" };

  it("matches hex and decimal queries", () => {
    expect(effectFolderHashMatchesQuery(hash, "bdbe6fea")).toBe(true);
    expect(effectFolderHashMatchesQuery(hash, "-1111592982")).toBe(true);
    expect(effectFolderHashMatchesQuery(hash, "missing")).toBe(false);
  });
});

describe("parseHashInput", () => {
  it("parses hex and decimal hash inputs", () => {
    expect(parseHashInput("0xBDBE6FEA")).toBe(-1111592982);
    expect(parseHashInput("-1111592982")).toBe(-1111592982);
    expect(parseHashInput("")).toBeNull();
    expect(parseHashInput("not-a-hash")).toBeNull();
  });
});

describe("resolveEffectPackFromStructureJson", () => {
  it("resolves configured effect pack from sibling structure json", () => {
    const pack = resolveEffectPackFromStructureJson(
      "E:/workspace",
      "E:/workspace/006effect/0xBDBE6FEA_structure.json",
      DEFAULT_TEST_EDITOR_WORKSPACE,
    );

    expect(pack).not.toBeNull();
    expect(pack?.routeId).toBe("unit.effect");
    expect(pack?.folderPath.replace(/\\/g, "/")).toBe("E:/workspace/006effect/0xBDBE6FEA");
  });
});

describe("resolveEffectPackFromFolderPath", () => {
  it("resolves an effect pack directly from its folder path", () => {
    const pack = resolveEffectPackFromFolderPath(
      "E:/workspace",
      "E:/workspace/006effect/0xBDBE6FEA",
      DEFAULT_TEST_EDITOR_WORKSPACE,
    );

    expect(pack).not.toBeNull();
    expect(pack?.routeId).toBe("unit.effect");
    expect(pack?.folderPath.replace(/\\/g, "/")).toBe("E:/workspace/006effect/0xBDBE6FEA");
    expect(pack?.structureJsonPath.replace(/\\/g, "/")).toBe(
      "E:/workspace/006effect/0xBDBE6FEA_structure.json",
    );
  });
});

describe("effect list helpers", () => {
  const efxbnItem: EffectListItem = {
    category: "efxbn",
    item: {
      fileIndex: 3,
      fileType: ".efxbn",
      actualExt: ".efxbn",
      fileUrl: "info/effect_a.efxbn",
      fileBaseName: "effect_a",
      name: "effect_a",
      path: "E:/workspace/006effect/0xHASH/info/effect_a.efxbn",
      hash: { signed: 123, unsigned: 123, hex: "0x0000007B" },
      unk2: "00000000",
      missing: false,
    },
  };

  it("builds stable keys and selections", () => {
    expect(effectListItemKey(efxbnItem)).toBe("efxbn:3");
    expect(toEffectFolderSelections([efxbnItem])).toEqual([{ kind: "efxbn", fileIndex: 3 }]);
  });

  it("filters by label and path", () => {
    expect(filterEffectListItems([efxbnItem], "effect_a")).toHaveLength(1);
    expect(filterEffectListItems([efxbnItem], "missing-term")).toHaveLength(0);
  });
});
