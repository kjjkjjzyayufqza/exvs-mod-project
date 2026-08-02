import { beforeEach, describe, expect, it } from "vitest";
import { useArmsEditorStore } from "./ArmsEditorStore";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";

function sampleFile(entries = 2): TypedParamFile {
  return {
    header: { entrySize: 16, commandsCount: 2 },
    fieldSpecs: [],
    entryIds: Array.from({ length: entries }, (_, i) => 0x100 + i),
    entries: Array.from({ length: entries }, (_, i) => ({
      entryId: 0x100 + i,
      ammoCount: 10 + i,
      initialAmmoCount: 10 + i,
      slotIndex: i,
      reloadBehaviorType: 2,
      actionLabel: `ACT_${i}`,
      resourceLabel: `RES_${i}`,
    })),
    trailingData: [],
  };
}

describe("ArmsEditorStore entry tooling", () => {
  beforeEach(() => {
    useArmsEditorStore.setState({
      data: null,
      filePath: "",
      fileBytes: null,
      selectedIndex: 0,
      dirty: false,
      dirtyEntryIndices: new Set(),
      validationMessages: [],
    });
  });

  it("replaces the selected entry for import/hex apply", () => {
    const store = useArmsEditorStore.getState();
    store.setData(sampleFile(), "arms.bin");
    store.selectEntry(1);
    store.replaceSelectedEntry({
      entryId: 0x101,
      ammoCount: 99,
      initialAmmoCount: 1,
      slotIndex: 1,
      reloadBehaviorType: 2,
      actionLabel: "IMPORTED",
      resourceLabel: "RES",
    });

    const state = useArmsEditorStore.getState();
    expect(state.data?.entries[1]?.ammoCount).toBe(99);
    expect(state.data?.entries[1]?.actionLabel).toBe("IMPORTED");
    expect(state.dirty).toBe(true);
    expect(state.dirtyEntryIndices.has(1)).toBe(true);
  });

  it("appends a duplicated entry and selects it", () => {
    const store = useArmsEditorStore.getState();
    store.setData(sampleFile(), "arms.bin");
    store.appendEntry({
      entryId: 0x999,
      ammoCount: 3,
      initialAmmoCount: 0,
      slotIndex: 2,
      reloadBehaviorType: 2,
      actionLabel: "COPY",
      resourceLabel: "",
    });

    const state = useArmsEditorStore.getState();
    expect(state.data?.entries).toHaveLength(3);
    expect(state.selectedIndex).toBe(2);
    expect(state.data?.entries[2]?.actionLabel).toBe("COPY");
    expect(state.data?.entryIds[2]).toBe(0x999);
    expect(state.dirty).toBe(true);
  });

  it("deletes the selected entry and reindexes dirty markers", () => {
    const store = useArmsEditorStore.getState();
    store.setData(sampleFile(3), "arms.bin");
    store.updateField("ammoCount", 1);
    store.selectEntry(2);
    store.updateField("initialAmmoCount", 7);
    store.selectEntry(1);
    store.deleteSelectedEntry();

    const state = useArmsEditorStore.getState();
    expect(state.data?.entries).toHaveLength(2);
    expect(state.selectedIndex).toBe(1);
    expect(state.data?.entries[0]?.ammoCount).toBe(1);
    expect(state.data?.entries[1]?.initialAmmoCount).toBe(7);
    expect(state.dirtyEntryIndices.has(0)).toBe(true);
    expect(state.dirtyEntryIndices.has(1)).toBe(true);
    expect(state.dirtyEntryIndices.has(2)).toBe(false);
  });

  it("validates native ammo, slot, and reload behavior bounds", () => {
    const store = useArmsEditorStore.getState();
    store.setData(sampleFile(1), "arms.bin");
    store.replaceSelectedEntry({
      entryId: 0x100,
      ammoCount: 4,
      initialAmmoCount: 5,
      slotIndex: 9,
      reloadBehaviorType: 6,
      actionLabel: "ACT",
      resourceLabel: "RES",
    });

    const messages = useArmsEditorStore.getState().validationMessages;
    expect(messages.map((message) => message.field)).toEqual([
      "initialAmmoCount",
      "slotIndex",
      "reloadBehaviorType",
    ]);
  });

  it("validates charge input flags, stages, and default timing", () => {
    const store = useArmsEditorStore.getState();
    store.setData(sampleFile(1), "arms.bin");
    store.replaceSelectedEntry({
      entryId: 0x100,
      ammoCount: 1,
      initialAmmoCount: 1,
      slotIndex: 0,
      reloadBehaviorType: 4,
      chargeInputFlags: 0x11,
      chargeStageCount: 0,
      chargeAccumulateDurationDefaultFrame: 0,
      chargeDecayDurationDefaultFrame: 60,
      actionLabel: "CHARGE",
      resourceLabel: "RES",
    });

    const fields = useArmsEditorStore
      .getState()
      .validationMessages.map((message) => message.field);
    expect(fields).toContain("chargeInputFlags");
    expect(fields).toContain("chargeStageCount");
    expect(fields).toContain("chargeAccumulateDurationDefaultFrame");
  });
});
