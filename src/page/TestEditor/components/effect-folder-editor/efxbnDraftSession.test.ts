import { describe, expect, it } from "vitest";
import type {
  EfxbnControlLookupEntry,
  EfxbnControlReferenceSummary,
  EfxbnSummary,
} from "@/services/effectFolder/effectFolderService";
import { makeEfxbnEffectBlock } from "./efxbnTestFactory";
import {
  acceptEfxbnDraftWrite,
  acceptWrittenPatches,
  createEfxbnDraft,
  getControlConstant,
  isEfxbnBlockDirty,
  isEfxbnDraftDirty,
  listControlConstantPatches,
  patchColorConstants,
  patchControlConstant,
  readColorConstants,
  revertEfxbnDraft,
  sameEfxbnPath,
} from "./efxbnDraftSession";

function entry(index: number, value: number): EfxbnControlLookupEntry {
  return {
    index,
    keyF32Bits: 0,
    key: 0,
    valueF32Bits: 0,
    value,
  };
}

function ref(
  name: string,
  selector: number,
  lookupIndex: number,
  index = 0,
): EfxbnControlReferenceSummary {
  return {
    index,
    name,
    rawOffset: 0,
    runtimeOffset: 0,
    selector,
    lookupIndex,
  };
}

function makeSummary(): EfxbnSummary {
  const colorRefs = [
    ref("colorR", 1, 14, 12),
    ref("colorG", 1, 15, 13),
    ref("colorB", 1, 16, 14),
    ref("colorA", 1, 17, 15),
  ];
  const block0 = makeEfxbnEffectBlock({
    index: 0,
    controlReferences: colorRefs,
  });
  const block1 = makeEfxbnEffectBlock({
    index: 1,
    controlReferences: [
      ref("colorR", 1, 32, 12),
      ref("colorG", 1, 33, 13),
      ref("colorB", 1, 34, 14),
      ref("colorA", 1, 35, 15),
    ],
  });
  const entries = Array.from({ length: 36 }, (_, index) => entry(index, 0));
  entries[14] = entry(14, 0.5);
  entries[15] = entry(15, 1.0);
  entries[16] = entry(16, 0.5);
  entries[17] = entry(17, 1.0);
  entries[32] = entry(32, 0.5);
  entries[33] = entry(33, 1.5);
  entries[34] = entry(34, 0.5);
  entries[35] = entry(35, 2.0);

  return {
    path: "E:/mod/0/0/18.efxbn",
    magic: "EFXB",
    versionOrFlags: 2,
    fileSize: 2256,
    actualSize: 2256,
    effectCount: 2,
    curveKeyCount: 36,
    controlLookupRegionOffset: 0x6f8,
    controlLookupRegionSize: 36 * 8,
    controlLookupRegionEnd: 0x818,
    modelControlConfigCount: 1,
    modelControlRegionOffset: 0x818,
    modelControlRegionSize: 0xb8,
    trailingOffset: 0x8d0,
    modelIds: [],
    animationIds: [],
    modelControlTextureIds: [],
    controlLookupEntries: entries,
    effects: [block0, block1],
    modelControls: [],
    textureParameters: [],
    todo: { unknowns: [] },
  };
}

describe("efxbnDraftSession", () => {
  it("prefers the inventory file path over summary.path for writes", () => {
    const summary = makeSummary();
    const draft = createEfxbnDraft(summary, "E:\\workspace\\006effect\\0x1\\18.efxbn");
    expect(draft.path).toBe("E:\\workspace\\006effect\\0x1\\18.efxbn");
    expect(sameEfxbnPath(draft.path, "E:/workspace/006effect/0x1/18.efxbn")).toBe(true);
    expect(sameEfxbnPath(draft.path, "E:\\other\\18.efxbn")).toBe(false);
  });

  it("rejects drafts with no path", () => {
    const summary = makeSummary();
    summary.path = "";
    expect(() => createEfxbnDraft(summary)).toThrow(/file path/i);
  });

  it("patches constant color lanes without mutating the source summary", () => {
    const summary = makeSummary();
    const draft = createEfxbnDraft(summary);
    const next = patchControlConstant(draft, 0, "colorG", 0.25);

    expect(getControlConstant(next, 0, "colorG")).toBe(0.25);
    expect(summary.controlLookupEntries[15].value).toBe(1.0);
    expect(draft.controlLookupEntries[15].value).toBe(1.0);
    expect(isEfxbnDraftDirty(next)).toBe(true);
    expect(isEfxbnBlockDirty(next, 0)).toBe(true);
    expect(isEfxbnBlockDirty(next, 1)).toBe(false);
    expect(listControlConstantPatches(next)).toEqual([{ lookupIndex: 15, value: 0.25 }]);
  });

  it("clears dirty when value returns to baseline", () => {
    const draft = createEfxbnDraft(makeSummary());
    const dirty = patchControlConstant(draft, 0, "colorR", 0.9);
    const clean = patchControlConstant(dirty, 0, "colorR", 0.5);
    expect(isEfxbnDraftDirty(clean)).toBe(false);
    expect(listControlConstantPatches(clean)).toEqual([]);
  });

  it("returns the same draft when the constant value is unchanged", () => {
    const draft = createEfxbnDraft(makeSummary());
    const next = patchControlConstant(draft, 0, "colorR", 0.5);
    expect(next).toBe(draft);
  });

  it("reverts all dirty constant lanes", () => {
    let draft = createEfxbnDraft(makeSummary());
    draft = patchColorConstants(draft, 0, { r: 0.1, g: 0.2, b: 0.3, a: 0.4 });
    draft = patchControlConstant(draft, 1, "colorG", 0.0);
    const reverted = revertEfxbnDraft(draft);
    expect(readColorConstants(reverted, 0)).toEqual({ r: 0.5, g: 1.0, b: 0.5, a: 1.0 });
    expect(getControlConstant(reverted, 1, "colorG")).toBe(1.5);
    expect(isEfxbnDraftDirty(reverted)).toBe(false);
  });

  it("accepts a write by rebasing dirty keys", () => {
    let draft = createEfxbnDraft(makeSummary());
    draft = patchControlConstant(draft, 0, "colorA", 2.0);
    draft = acceptEfxbnDraftWrite(draft);
    expect(isEfxbnDraftDirty(draft)).toBe(false);
    expect(getControlConstant(draft, 0, "colorA")).toBe(2.0);
    const back = patchControlConstant(draft, 0, "colorA", 1.0);
    expect(isEfxbnDraftDirty(back)).toBe(true);
  });

  it("acceptWrittenPatches only rebases written indices and keeps concurrent dirty", () => {
    let draft = createEfxbnDraft(makeSummary());
    draft = patchControlConstant(draft, 0, "colorG", 0.2);
    const patches = listControlConstantPatches(draft);
    // Concurrent edit after the write snapshot was taken.
    draft = patchControlConstant(draft, 0, "colorR", 0.9);
    draft = acceptWrittenPatches(draft, patches);
    expect(getControlConstant(draft, 0, "colorG")).toBe(0.2);
    expect(getControlConstant(draft, 0, "colorR")).toBe(0.9);
    expect(isEfxbnBlockDirty(draft, 0)).toBe(true);
    expect(listControlConstantPatches(draft)).toEqual([{ lookupIndex: 14, value: 0.9 }]);
  });

  it("does not treat block 10 dirty as block 1 dirty", () => {
    const summary = makeSummary();
    summary.effects = [
      makeEfxbnEffectBlock({
        index: 1,
        controlReferences: [
          ref("colorR", 1, 14),
          ref("colorG", 1, 15),
          ref("colorB", 1, 16),
          ref("colorA", 1, 17),
        ],
      }),
      makeEfxbnEffectBlock({
        index: 10,
        controlReferences: [
          ref("colorR", 1, 32),
          ref("colorG", 1, 33),
          ref("colorB", 1, 34),
          ref("colorA", 1, 35),
        ],
      }),
    ];
    let draft = createEfxbnDraft(summary);
    draft = patchControlConstant(draft, 10, "colorR", 0.1);
    expect(isEfxbnBlockDirty(draft, 10)).toBe(true);
    expect(isEfxbnBlockDirty(draft, 1)).toBe(false);
  });

  it("rejects curve and unused lanes", () => {
    const summary = makeSummary();
    summary.effects[0] = makeEfxbnEffectBlock({
      index: 0,
      controlReferences: [
        ref("colorR", 3, 14),
        ref("colorG", 0, 15),
        ref("colorB", 1, 16),
        ref("colorA", 1, 17),
      ],
    });
    const draft = createEfxbnDraft(summary);
    expect(() => patchControlConstant(draft, 0, "colorR", 1)).toThrow(/curve/i);
    expect(() => patchControlConstant(draft, 0, "colorG", 1)).toThrow(/unused/i);
  });
});
