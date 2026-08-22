import { describe, expect, it } from "vitest";
import type {
  EfxbnControlLookupEntry,
  EfxbnEffectSummary,
  EfxbnSummary,
} from "@/services/effectFolder/effectFolderService";
import {
  EFXBN_CONTROL_NAMES,
  EFXBN_MAX_CHILDREN,
  acceptEfxbnDocumentWrite,
  addEfxbnBlock,
  assertEfxbnCurvesAreExclusive,
  assertEfxbnTreeConsistency,
  canRedoEfxbn,
  canUndoEfxbn,
  createEfxbnDocument,
  deleteEfxbnBlock,
  deleteEfxbnCurveKey,
  efxbnDirtyBlockIndexes,
  efxbnDirtyFieldIds,
  insertEfxbnCurveKey,
  isEfxbnDocumentDirty,
  normalizeEfxbnSummaryForWrite,
  prepareEfxbnDocumentForWrite,
  readEfxbnCurve,
  redoEfxbn,
  reparentEfxbnBlock,
  revertEfxbnDocument,
  setEfxbnBlockModel,
  setEfxbnBlockTextureSlot,
  setEfxbnCurveKey,
  setEfxbnField,
  undoEfxbn,
} from "./efxbnDocument";
import { EFXBN_FIELD_SCHEMA, type EfxbnFieldDescriptor } from "./efxbnFieldSchema";
import { makeEfxbnEffectBlock } from "./efxbnTestFactory";

function field(key: string, component?: number): EfxbnFieldDescriptor {
  const found = EFXBN_FIELD_SCHEMA.find(
    (entry) => entry.key === key && entry.component === component,
  );
  if (!found) throw new Error(`no schema field ${key}.${component}`);
  return found;
}

function key(index: number, time: number, value: number): EfxbnControlLookupEntry {
  return { index, key: time, value, keyF32Bits: 0, valueF32Bits: 0 };
}

/**
 * Two blocks, each owning 18 single-key curves laid out contiguously — the shape 90.7% of shipped
 * control references have.
 */
function makeSummary(blockCount = 2): EfxbnSummary {
  const entries: EfxbnControlLookupEntry[] = [];
  const effects: EfxbnEffectSummary[] = [];
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const controlReferences = EFXBN_CONTROL_NAMES.map((name, slot) => {
      const lookupIndex = entries.length;
      entries.push(key(lookupIndex, 0, blockIndex * 100 + slot));
      return { index: slot, name, rawOffset: 0x58 + slot * 8, runtimeOffset: 0, selector: 1, lookupIndex };
    });
    effects.push(
      makeEfxbnEffectBlock({
        index: blockIndex,
        level: blockIndex === 0 ? 0 : 1,
        controlReferences,
        childIndexSize: blockIndex === 0 && blockCount > 1 ? 1 : 0,
        childIndexArray:
          blockIndex === 0 && blockCount > 1
            ? [1, -1, -1, -1, -1, -1, -1, -1]
            : [-1, -1, -1, -1, -1, -1, -1, -1],
        referencedEffectIndex: blockIndex === 0 && blockCount > 1 ? 1 : -1,
      }),
    );
  }
  return {
    path: "E:/pack/0/0/33.efxbn",
    magic: "EFXB",
    versionOrFlags: 0,
    fileSize: 0,
    effectCount: effects.length,
    curveKeyCount: entries.length,
    modelControlConfigCount: 0,
    blockRegionOffset: 0x18,
    controlLookupRegionOffset: 0,
    modelControlRegionOffset: 0,
    controlLookupEntries: entries,
    effects,
    modelControls: [],
    textureParameters: [
      { index: 0, inputSourceType: 1, colorMapId: 1, colorMapHash: { signed: 1, unsigned: 1, hex: "0x1" },
        addressingMode: 0, reverseU: 0, reverseV: 0, textureWidth: 1, textureHeight: 1, uvPatternType: 0,
        uvU: [0, 0, 0, 0], uvV: [0, 0, 0, 0], uvScrollSpeed: 0, uvScrollLimit: 0 },
      { index: 1, inputSourceType: 1, colorMapId: 2, colorMapHash: { signed: 2, unsigned: 2, hex: "0x2" },
        addressingMode: 0, reverseU: 0, reverseV: 0, textureWidth: 1, textureHeight: 1, uvPatternType: 0,
        uvU: [0, 0, 0, 0], uvV: [0, 0, 0, 0], uvScrollSpeed: 0, uvScrollLimit: 0 },
    ],
    todo: { unknowns: [] },
  } as unknown as EfxbnSummary;
}

function makeDocument(blockCount = 2) {
  return createEfxbnDocument(makeSummary(blockCount), "E:/pack/0/0/33.efxbn", "E:/pack");
}

describe("createEfxbnDocument", () => {
  it("starts clean, with nothing to undo", () => {
    const document = makeDocument();
    expect(isEfxbnDocumentDirty(document)).toBe(false);
    expect(canUndoEfxbn(document)).toBe(false);
    expect(canRedoEfxbn(document)).toBe(false);
  });

  it("rejects a document with no path or no effect root", () => {
    expect(() => createEfxbnDocument(makeSummary(), "  ", "E:/pack")).toThrow(/file path/);
    expect(() => createEfxbnDocument(makeSummary(), "a.efxbn", " ")).toThrow(/effect root/);
  });

  it("re-derives runtime rather than trusting whatever the payload carried", () => {
    const summary = makeSummary(1);
    // blendState 0 forces depth write on, whatever the authored value says.
    summary.effects[0]!.blendState = 0;
    summary.effects[0]!.zWriteEnable = 0;
    const document = createEfxbnDocument(summary, "a.efxbn", "E:/pack");
    expect(document.summary.effects[0]!.runtime?.zWriteEnable).toBe(1);
  });
});

describe("setEfxbnField", () => {
  it("writes a scalar and records a readable change", () => {
    const next = setEfxbnField(makeDocument(), 0, field("lifeTimeBase"), 42);
    expect(next.summary.effects[0]!.lifeTimeBase).toBe(42);
    expect(next.changeLog.at(-1)).toContain("42");
  });

  it("replaces a vector component without mutating the original document", () => {
    const document = makeDocument();
    const before = document.summary.effects[0]!.sizeBase[1];
    const next = setEfxbnField(document, 0, field("sizeBase", 1), 9);
    expect(next.summary.effects[0]!.sizeBase[1]).toBe(9);
    expect(document.summary.effects[0]!.sizeBase[1]).toBe(before);
  });

  it("leaves every other block untouched, by identity", () => {
    // Identity matters: the preview plan and the R3F draw memoization key off it, so rebuilding
    // every block for a one-field edit would remount the scene on each keystroke.
    const document = makeDocument();
    const next = setEfxbnField(document, 0, field("lifeTimeBase"), 42);
    expect(next.summary.effects[1]).toBe(document.summary.effects[1]);
  });

  it("recomputes runtime so the preview sees the normalized value", () => {
    const document = makeDocument();
    const next = setEfxbnField(document, 0, field("enableSoftParticle"), 1);
    expect(next.summary.effects[0]!.runtime?.zWriteEnable).toBe(0);
  });

  it("refuses a non-finite value instead of writing NaN into the file", () => {
    expect(() => setEfxbnField(makeDocument(), 0, field("lifeTimeBase"), Number.NaN)).toThrow(
      /non-finite/,
    );
  });

  it("refuses a fractional value for an integral field", () => {
    expect(() => setEfxbnField(makeDocument(), 0, field("numEmit"), 1.5)).toThrow(/integral/);
  });

  it("refuses a block index that does not exist", () => {
    expect(() => setEfxbnField(makeDocument(), 9, field("lifeTimeBase"), 1)).toThrow(/does not exist/);
  });
});

describe("undo and redo", () => {
  it("walks back and forward through a chain of edits", () => {
    let document = makeDocument();
    const original = document.summary.effects[0]!.lifeTimeBase;
    document = setEfxbnField(document, 0, field("lifeTimeBase"), 10);
    document = setEfxbnField(document, 0, field("lifeTimeBase"), 30);
    expect(document.summary.effects[0]!.lifeTimeBase).toBe(30);

    document = undoEfxbn(document);
    expect(document.summary.effects[0]!.lifeTimeBase).toBe(10);
    document = undoEfxbn(document);
    expect(document.summary.effects[0]!.lifeTimeBase).toBe(original);
    expect(canUndoEfxbn(document)).toBe(false);

    document = redoEfxbn(document);
    expect(document.summary.effects[0]!.lifeTimeBase).toBe(10);
  });

  it("drops the redo stack once a new edit lands", () => {
    let document = setEfxbnField(makeDocument(), 0, field("lifeTimeBase"), 10);
    document = undoEfxbn(document);
    expect(canRedoEfxbn(document)).toBe(true);
    document = setEfxbnField(document, 0, field("lifeTimeBase"), 30);
    expect(canRedoEfxbn(document)).toBe(false);
  });

  it("revert returns to the last saved state and clears the history", () => {
    let document = setEfxbnField(makeDocument(), 0, field("lifeTimeBase"), 10);
    document = revertEfxbnDocument(document);
    expect(isEfxbnDocumentDirty(document)).toBe(false);
    expect(canUndoEfxbn(document)).toBe(false);
  });

  it("accepting a write re-baselines so the document stops reading as dirty", () => {
    const document = setEfxbnField(makeDocument(), 0, field("lifeTimeBase"), 10);
    expect(isEfxbnDocumentDirty(document)).toBe(true);
    const saved = acceptEfxbnDocumentWrite(document, document.summary);
    expect(isEfxbnDocumentDirty(saved)).toBe(false);
  });
});

describe("dirty tracking", () => {
  it("names the exact field that changed", () => {
    const document = setEfxbnField(makeDocument(), 0, field("sizeBase", 2), 4);
    const dirty = efxbnDirtyFieldIds(document, 0, EFXBN_FIELD_SCHEMA);
    expect(dirty.has("sizeBase.2")).toBe(true);
    expect(dirty.has("sizeBase.1")).toBe(false);
  });

  it("marks only the edited block, not every block whose runtime was re-derived", () => {
    const document = setEfxbnField(makeDocument(), 1, field("lifeTimeBase"), 7);
    expect([...efxbnDirtyBlockIndexes(document)]).toEqual([1]);
  });

  it("sees a curve edit even though it lives outside the block record", () => {
    const document = setEfxbnCurveKey(makeDocument(), 1, "colorR", 0, { value: 0.25 });
    expect([...efxbnDirtyBlockIndexes(document)]).toEqual([1]);
  });
});

describe("curve commands", () => {
  it("reads a control's keys out of the shared table", () => {
    const curve = readEfxbnCurve(makeDocument().summary, 1, "colorG");
    expect(curve.keys).toHaveLength(1);
    expect(curve.keys[0]!.value).toBe(100 + EFXBN_CONTROL_NAMES.indexOf("colorG"));
  });

  it("edits a constant in place without moving any other curve", () => {
    const document = makeDocument();
    const before = readEfxbnCurve(document.summary, 1, "colorB");
    const next = setEfxbnCurveKey(document, 0, "colorR", 0, { value: 0.5 });
    expect(readEfxbnCurve(next.summary, 0, "colorR").keys[0]!.value).toBe(0.5);
    expect(readEfxbnCurve(next.summary, 1, "colorB")).toEqual(before);
  });

  it("retimes a key, which the old byte patcher could never do", () => {
    const next = setEfxbnCurveKey(makeDocument(), 0, "scaleBaseX", 0, { key: 12 });
    expect(readEfxbnCurve(next.summary, 0, "scaleBaseX").keys[0]!.key).toBe(12);
  });

  it("inserts a key, grows the table, and shifts every later curve", () => {
    const document = makeDocument();
    const beforeCount = document.summary.controlLookupEntries.length;
    const next = insertEfxbnCurveKey(document, 0, "colorR", 30, 1);

    expect(next.summary.controlLookupEntries).toHaveLength(beforeCount + 1);
    expect(next.summary.curveKeyCount).toBe(beforeCount + 1);
    expect(readEfxbnCurve(next.summary, 0, "colorR").keys).toEqual([
      { key: 0, value: 12 },
      { key: 30, value: 1 },
    ]);
    // The second block's curves still resolve to the same values after the shift.
    expect(readEfxbnCurve(next.summary, 1, "colorG").keys[0]!.value).toBe(
      100 + EFXBN_CONTROL_NAMES.indexOf("colorG"),
    );
  });

  it("keeps inserted keys sorted by time", () => {
    let document = insertEfxbnCurveKey(makeDocument(), 0, "colorR", 30, 1);
    document = insertEfxbnCurveKey(document, 0, "colorR", 15, 0.5);
    expect(readEfxbnCurve(document.summary, 0, "colorR").keys.map((entry) => entry.key)).toEqual([
      0, 15, 30,
    ]);
  });

  it("refuses two keys at the same time", () => {
    expect(() => insertEfxbnCurveKey(makeDocument(), 0, "colorR", 0, 1)).toThrow(/already has a key/);
  });

  it("deletes a key and shrinks the table", () => {
    let document = insertEfxbnCurveKey(makeDocument(), 0, "colorR", 30, 1);
    const grown = document.summary.controlLookupEntries.length;
    document = deleteEfxbnCurveKey(document, 0, "colorR", 1);
    expect(document.summary.controlLookupEntries).toHaveLength(grown - 1);
    expect(readEfxbnCurve(document.summary, 0, "colorR").keys).toHaveLength(1);
  });

  it("refuses to delete the last key, because a control always evaluates", () => {
    expect(() => deleteEfxbnCurveKey(makeDocument(), 0, "colorR", 0)).toThrow(/at least one key/);
  });

  it("refuses an unknown control name", () => {
    expect(() => readEfxbnCurve(makeDocument().summary, 0, "notAControl")).toThrow(/no control named/);
  });

  it("leaves every curve exclusively owned after an insert", () => {
    const next = insertEfxbnCurveKey(makeDocument(), 0, "spawnForm0", 5, 1);
    expect(() => assertEfxbnCurvesAreExclusive(next.summary)).not.toThrow();
  });
});

describe("resource binding", () => {
  it("writes all three views of the model handle together", () => {
    const next = setEfxbnBlockModel(makeDocument(), 0, 0x328d9438 | 0);
    const block = next.summary.effects[0]!;
    expect(block.nudHandle).toBe(0x328d9438 | 0);
    expect(block.modelId).toBe(0x328d9438 | 0);
    expect(block.modelHash.hex).toBe("0x328D9438");
  });

  it("binds and clears a texture slot", () => {
    let document = setEfxbnBlockTextureSlot(
      makeDocument(),
      0,
      { field: "colorTextureParameterIndex", component: 0 },
      1,
    );
    expect(document.summary.effects[0]!.colorTextureParameterIndex[0]).toBe(1);
    document = setEfxbnBlockTextureSlot(
      document,
      0,
      { field: "colorTextureParameterIndex", component: 0 },
      -1,
    );
    expect(document.summary.effects[0]!.colorTextureParameterIndex[0]).toBe(-1);
  });

  it("refuses a parameter index past the end of the table", () => {
    expect(() =>
      setEfxbnBlockTextureSlot(makeDocument(), 0, { field: "uvTextureParameterIndex", component: 0 }, 5),
    ).toThrow(/out of range/);
  });

  it("binding a UV offset slot flips the ColorEx draw-scheme bit through the runtime mirror", () => {
    const next = setEfxbnBlockTextureSlot(
      makeDocument(),
      0,
      { field: "uvTextureParameterIndex", component: 0 },
      0,
    );
    expect((next.summary.effects[0]!.runtime!.drawScheme.flag & 0x80) !== 0).toBe(true);
  });
});

describe("topology commands", () => {
  it("appends a block under a parent and gives it its own key ranges", () => {
    const document = makeDocument();
    const before = document.summary.controlLookupEntries.length;
    const next = addEfxbnBlock(document, 0, 0, 1);

    expect(next.summary.effects).toHaveLength(3);
    expect(next.summary.effectCount).toBe(3);
    expect(next.summary.effects[0]!.childIndexSize).toBe(2);
    expect(next.summary.controlLookupEntries).toHaveLength(before + EFXBN_CONTROL_NAMES.length);
    expect(() => assertEfxbnCurvesAreExclusive(next.summary)).not.toThrow();
    expect(next.summary.effects[2]!.level).toBe(1);
  });

  it("refuses a ninth child, because the array is eight wide", () => {
    let document = makeDocument(1);
    for (let added = 0; added < EFXBN_MAX_CHILDREN; added += 1) {
      document = addEfxbnBlock(document, 0, 0, 1);
    }
    expect(() => addEfxbnBlock(document, 0, 0, 1)).toThrow(/already has 8 children/);
  });

  it("deletes a block and renumbers every index that pointed past it", () => {
    let document = makeDocument(1);
    document = addEfxbnBlock(document, 0, 0, 1); // index 1
    document = addEfxbnBlock(document, 0, 0, 3); // index 2
    document = deleteEfxbnBlock(document, 1);

    expect(document.summary.effects).toHaveLength(2);
    expect(document.summary.effects.map((block) => block.index)).toEqual([0, 1]);
    // The block that used to be 2 is now 1, and the parent points at it.
    expect(document.summary.effects[0]!.childIndexArray[0]).toBe(1);
    expect(document.summary.effects[1]!.effectType).toBe(3);
    expect(() => assertEfxbnCurvesAreExclusive(document.summary)).not.toThrow();
    expect(() => normalizeEfxbnSummaryForWrite(document.summary)).not.toThrow();
  });

  it("deleting drops the block's keys and keeps every other curve resolving", () => {
    let document = makeDocument(1);
    document = addEfxbnBlock(document, 0, 0, 1);
    document = setEfxbnCurveKey(document, 0, "colorA", 0, { value: 0.75 });
    const before = document.summary.controlLookupEntries.length;
    document = deleteEfxbnBlock(document, 1);
    expect(document.summary.controlLookupEntries).toHaveLength(
      before - EFXBN_CONTROL_NAMES.length,
    );
    expect(readEfxbnCurve(document.summary, 0, "colorA").keys[0]!.value).toBe(0.75);
  });

  it("refuses to delete the only block", () => {
    expect(() => deleteEfxbnBlock(makeDocument(1), 0)).toThrow(/at least one block/);
  });

  it("reparents to the root and back, keeping levels correct", () => {
    let document = makeDocument();
    expect(document.summary.effects[1]!.level).toBe(1);
    document = reparentEfxbnBlock(document, 1, null);
    expect(document.summary.effects[0]!.childIndexSize).toBe(0);
    expect(document.summary.effects[1]!.level).toBe(0);
    document = reparentEfxbnBlock(document, 1, 0);
    expect(document.summary.effects[1]!.level).toBe(1);
  });

  it("refuses a reparent that would make a cycle", () => {
    const document = makeDocument();
    expect(() => reparentEfxbnBlock(document, 0, 1)).toThrow(/cycle/);
    expect(() => reparentEfxbnBlock(document, 0, 0)).toThrow(/its own parent/);
  });
});

describe("normalizeEfxbnSummaryForWrite", () => {
  it("recompacts the key table into block order and renumbers every lookup", () => {
    const document = insertEfxbnCurveKey(makeDocument(), 1, "colorR", 20, 1);
    const normalized = normalizeEfxbnSummaryForWrite(document.summary);
    expect(normalized.curveKeyCount).toBe(normalized.controlLookupEntries.length);

    let expected = 0;
    for (const block of normalized.effects) {
      for (const reference of block.controlReferences) {
        expect(reference.lookupIndex).toBe(expected);
        expected += reference.selector;
      }
    }
    expect(expected).toBe(normalized.controlLookupEntries.length);
  });

  it("preserves the values a curve resolves to", () => {
    const document = insertEfxbnCurveKey(makeDocument(), 0, "colorR", 20, 0.5);
    const before = readEfxbnCurve(document.summary, 1, "directionAccel");
    const normalized = normalizeEfxbnSummaryForWrite(document.summary);
    expect(readEfxbnCurve(normalized, 1, "directionAccel").keys).toEqual(before.keys);
  });

  it("drops keys an edit orphaned rather than writing them back", () => {
    const document = makeDocument();
    const orphaned: EfxbnSummary = {
      ...document.summary,
      controlLookupEntries: [
        ...document.summary.controlLookupEntries,
        key(document.summary.controlLookupEntries.length, 99, 99),
      ],
    };
    const normalized = normalizeEfxbnSummaryForWrite(orphaned);
    expect(normalized.controlLookupEntries).toHaveLength(
      document.summary.controlLookupEntries.length,
    );
  });

  it("throws rather than repairing a curve that reads past the table", () => {
    const document = makeDocument();
    const broken: EfxbnSummary = {
      ...document.summary,
      effects: document.summary.effects.map((block, index) =>
        index === 0
          ? {
              ...block,
              controlReferences: block.controlReferences.map((entry, slot) =>
                slot === 0 ? { ...entry, selector: 999 } : entry,
              ),
            }
          : block,
      ),
    };
    expect(() => normalizeEfxbnSummaryForWrite(broken)).toThrow(/past curveKeyCount/);
  });
});

describe("assertEfxbnTreeConsistency", () => {
  it("accepts the tree the document maintains", () => {
    expect(() => assertEfxbnTreeConsistency(makeDocument().summary.effects)).not.toThrow();
  });

  it("catches a child slot left populated past childIndexSize", () => {
    const blocks = makeDocument().summary.effects.map((block, index) =>
      index === 0 ? { ...block, childIndexSize: 0 } : block,
    );
    expect(() => assertEfxbnTreeConsistency(blocks)).toThrow(/past childIndexSize/);
  });

  it("catches a child index pointing at a block that does not exist", () => {
    const blocks = makeDocument().summary.effects.map((block, index) =>
      index === 0
        ? { ...block, childIndexArray: [42, -1, -1, -1, -1, -1, -1, -1] as EfxbnEffectSummary["childIndexArray"] }
        : block,
    );
    expect(() => assertEfxbnTreeConsistency(blocks)).toThrow(/points at 42/);
  });

  it("catches a stale level", () => {
    const blocks = makeDocument().summary.effects.map((block, index) =>
      index === 1 ? { ...block, level: 5 } : block,
    );
    expect(() => assertEfxbnTreeConsistency(blocks)).toThrow(/carries level 5/);
  });
});

describe("assertEfxbnCurvesAreExclusive", () => {
  it("catches two references sharing one key range", () => {
    const document = makeDocument();
    const aliased: EfxbnSummary = {
      ...document.summary,
      effects: document.summary.effects.map((block, index) =>
        index === 1
          ? {
              ...block,
              controlReferences: block.controlReferences.map((entry, slot) =>
                slot === 0 ? { ...entry, lookupIndex: 0 } : entry,
              ),
            }
          : block,
      ),
    };
    expect(() => assertEfxbnCurvesAreExclusive(aliased)).toThrow(/claimed by both/);
  });
});

describe("prepareEfxbnDocumentForWrite", () => {
  it("produces a summary whose counts match its arrays", () => {
    let document = makeDocument();
    document = insertEfxbnCurveKey(document, 0, "colorR", 10, 1);
    document = addEfxbnBlock(document, 0, 0, 3);
    const summary = prepareEfxbnDocumentForWrite(document);
    expect(summary.effectCount).toBe(summary.effects.length);
    expect(summary.curveKeyCount).toBe(summary.controlLookupEntries.length);
  });

  it("is a no-op in content for an unedited document", () => {
    const document = makeDocument();
    const summary = prepareEfxbnDocumentForWrite(document);
    expect(summary.controlLookupEntries.map((entry) => entry.value)).toEqual(
      document.summary.controlLookupEntries.map((entry) => entry.value),
    );
  });
});
