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
      damage: 100,
      isEnabled: 1,
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
      damage: 1,
      isEnabled: 1,
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
      damage: 50,
      isEnabled: 1,
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
    store.updateField("damage", 7);
    store.selectEntry(1);
    store.deleteSelectedEntry();

    const state = useArmsEditorStore.getState();
    expect(state.data?.entries).toHaveLength(2);
    expect(state.selectedIndex).toBe(1);
    expect(state.data?.entries[0]?.ammoCount).toBe(1);
    expect(state.data?.entries[1]?.damage).toBe(7);
    expect(state.dirtyEntryIndices.has(0)).toBe(true);
    expect(state.dirtyEntryIndices.has(1)).toBe(true);
    expect(state.dirtyEntryIndices.has(2)).toBe(false);
  });
});
