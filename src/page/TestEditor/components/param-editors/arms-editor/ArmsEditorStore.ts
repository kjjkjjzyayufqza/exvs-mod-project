import { create } from "zustand";
import type {
  TypedParamEntry,
  TypedParamFile,
} from "../../param-editor/typedParamTypes";
import { readTypedEntryId } from "../../param-editor/paramEntryUtils";
import type { ValidationMessage } from "../shared/types";
import { numField, resolveArmsLabels } from "./armsFieldModel";

export interface ArmsEditorState {
  data: TypedParamFile | null;
  filePath: string;
  /** Full source file bytes for kind-7 label fallback decode when JSON lacks strings. */
  fileBytes: Uint8Array | null;
  selectedIndex: number;
  dirty: boolean;
  dirtyEntryIndices: Set<number>;
  validationMessages: ValidationMessage[];

  setData: (
    data: TypedParamFile,
    filePath: string,
    fileBytes?: Uint8Array | null,
  ) => void;
  selectEntry: (index: number) => void;
  updateField: (key: string, value: number | string) => void;
  /** Replace the currently selected entry (import / hex edit). */
  replaceSelectedEntry: (entry: TypedParamEntry) => void;
  /** Append a new entry and select it (Add / Duplicate). */
  appendEntry: (entry: TypedParamEntry) => void;
  /** Remove the currently selected entry. */
  deleteSelectedEntry: () => void;
  markClean: () => void;
}

/** Ensure editable string label keys exist; do not surface raw offsets in the UI model. */
function ensureLabelStringKeys(
  entry: TypedParamEntry,
  fileBytes?: Uint8Array | null,
): TypedParamEntry {
  const labels = resolveArmsLabels(entry, fileBytes);
  return {
    ...entry,
    actionLabel:
      typeof entry.actionLabel === "string"
        ? entry.actionLabel
        : (labels.actionLabel ?? ""),
    resourceLabel:
      typeof entry.resourceLabel === "string"
        ? entry.resourceLabel
        : (labels.resourceLabel ?? ""),
  };
}

function normalizeFile(
  data: TypedParamFile,
  fileBytes?: Uint8Array | null,
): TypedParamFile {
  return {
    ...data,
    entries: data.entries.map((entry) =>
      ensureLabelStringKeys(entry, fileBytes),
    ),
  };
}

function validateArmsEntry(
  entry: TypedParamEntry,
  fileBytes?: Uint8Array | null,
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const capacity = numField(entry, "ammoCount");
  const initial = numField(entry, "initialAmmoCount");
  const slotIndex = numField(entry, "slotIndex");
  const reloadBehaviorType = numField(entry, "reloadBehaviorType");
  const chargeInputFlags = numField(entry, "chargeInputFlags") >>> 0;
  const chargeStageCount = numField(entry, "chargeStageCount");
  const chargeDuration = numField(
    entry,
    "chargeAccumulateDurationDefaultFrame",
  );
  const chargeDecayDuration = numField(
    entry,
    "chargeDecayDurationDefaultFrame",
  );
  const labels = resolveArmsLabels(entry, fileBytes);

  if (capacity < 0 || initial < 0) {
    messages.push({
      field: capacity < 0 ? "ammoCount" : "initialAmmoCount",
      level: "error",
      message: "Ammo capacity and initial count must be non-negative",
    });
  }
  if (capacity < 1000 && initial > capacity) {
    messages.push({
      field: "initialAmmoCount",
      level: "warning",
      message: `Initial ammo (${initial}) exceeds capacity (${capacity})`,
    });
  }
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 8) {
    messages.push({
      field: "slotIndex",
      level: "warning",
      message: `Slot index ${slotIndex} is outside the native 0–8 binding range`,
    });
  }
  if (
    !Number.isInteger(reloadBehaviorType) ||
    reloadBehaviorType < 0 ||
    reloadBehaviorType > 5
  ) {
    messages.push({
      field: "reloadBehaviorType",
      level: "warning",
      message: `Reload behavior ${reloadBehaviorType} is outside the native 0–5 switch`,
    });
  }
  if ((chargeInputFlags & ~0xf) !== 0) {
    messages.push({
      field: "chargeInputFlags",
      level: "warning",
      message: `Charge input flags 0x${chargeInputFlags.toString(16).toUpperCase()} contain bits outside the native 0x1–0x8 mask`,
    });
  } else if ((chargeInputFlags & 0xc) !== 0) {
    messages.push({
      field: "chargeInputFlags",
      level: "info",
      message:
        "Charge input bits 0x4/0x8 are native-supported, but their gameplay button names remain unresolved",
    });
  }
  if (!Number.isInteger(chargeStageCount) || chargeStageCount < 0) {
    messages.push({
      field: "chargeStageCount",
      level: "error",
      message: "Charge stage count must be a non-negative integer",
    });
  } else if (chargeInputFlags !== 0 && chargeStageCount === 0) {
    messages.push({
      field: "chargeStageCount",
      level: "warning",
      message: "A charge input is configured, but the maximum stage count is zero",
    });
  } else if (chargeInputFlags === 0 && chargeStageCount > 0) {
    messages.push({
      field: "chargeInputFlags",
      level: "warning",
      message: "Charge stages are configured without an active charge input flag",
    });
  }
  if (chargeDuration < 0 || chargeDecayDuration < 0) {
    messages.push({
      field:
        chargeDuration < 0
          ? "chargeAccumulateDurationDefaultFrame"
          : "chargeDecayDurationDefaultFrame",
      level: "error",
      message: "Charge accumulation and decay durations must be non-negative",
    });
  } else if (chargeInputFlags !== 0 && chargeDuration === 0) {
    messages.push({
      field: "chargeAccumulateDurationDefaultFrame",
      level: "warning",
      message: "Default charge duration is zero, so the native default mode cannot advance",
    });
  }
  if (!labels.actionLabel && !labels.resourceLabel) {
    messages.push({
      field: "actionLabel",
      level: "info",
      message: "No decoded action/resource labels on this entry",
    });
  }

  return messages;
}

export const useArmsEditorStore = create<ArmsEditorState>((set, get) => ({
  data: null,
  filePath: "",
  fileBytes: null,
  selectedIndex: 0,
  dirty: false,
  dirtyEntryIndices: new Set(),
  validationMessages: [],

  setData: (data, filePath, fileBytes = null) => {
    const normalized = normalizeFile(data, fileBytes);
    const entry = normalized.entries[0];
    const validationMessages = entry
      ? validateArmsEntry(entry, fileBytes)
      : [];
    set({
      data: normalized,
      filePath,
      fileBytes: fileBytes ?? null,
      selectedIndex: 0,
      dirty: false,
      dirtyEntryIndices: new Set(),
      validationMessages,
    });
  },

  selectEntry: (index) => {
    const { data, fileBytes } = get();
    const entry = data?.entries[index];
    const validationMessages = entry
      ? validateArmsEntry(entry, fileBytes)
      : [];
    set({ selectedIndex: index, validationMessages });
  },

  updateField: (key, value) => {
    const { data, selectedIndex, dirtyEntryIndices, fileBytes } = get();
    if (!data) return;
    const nextEntries = data.entries.map((entry, index) =>
      index === selectedIndex
        ? ensureLabelStringKeys({ ...entry, [key]: value }, fileBytes)
        : entry,
    );
    const nextEntryIds = nextEntries.map((entry, index) =>
      readTypedEntryId(entry, index),
    );
    const nextData = { ...data, entries: nextEntries, entryIds: nextEntryIds };
    const entry = nextEntries[selectedIndex];
    const validationMessages = entry
      ? validateArmsEntry(entry, fileBytes)
      : [];
    const nextDirty = new Set(dirtyEntryIndices);
    nextDirty.add(selectedIndex);
    set({
      data: nextData,
      dirty: true,
      dirtyEntryIndices: nextDirty,
      validationMessages,
    });
  },

  replaceSelectedEntry: (entry) => {
    const { data, selectedIndex, dirtyEntryIndices, fileBytes } = get();
    if (!data || !data.entries[selectedIndex]) return;
    const nextEntries = data.entries.map((item, index) =>
      index === selectedIndex
        ? ensureLabelStringKeys({ ...entry }, fileBytes)
        : item,
    );
    const nextEntryIds = nextEntries.map((item, index) =>
      readTypedEntryId(item, index),
    );
    const nextEntry = nextEntries[selectedIndex];
    const validationMessages = nextEntry
      ? validateArmsEntry(nextEntry, fileBytes)
      : [];
    const nextDirty = new Set(dirtyEntryIndices);
    nextDirty.add(selectedIndex);
    set({
      data: { ...data, entries: nextEntries, entryIds: nextEntryIds },
      dirty: true,
      dirtyEntryIndices: nextDirty,
      validationMessages,
    });
  },

  appendEntry: (entry) => {
    const { data, dirtyEntryIndices, fileBytes } = get();
    if (!data) return;
    const normalized = ensureLabelStringKeys({ ...entry }, fileBytes);
    const nextEntries = [...data.entries, normalized];
    const nextEntryIds = nextEntries.map((item, index) =>
      readTypedEntryId(item, index),
    );
    const selectedIndex = nextEntries.length - 1;
    const validationMessages = validateArmsEntry(normalized, fileBytes);
    const nextDirty = new Set(dirtyEntryIndices);
    nextDirty.add(selectedIndex);
    set({
      data: { ...data, entries: nextEntries, entryIds: nextEntryIds },
      selectedIndex,
      dirty: true,
      dirtyEntryIndices: nextDirty,
      validationMessages,
    });
  },

  deleteSelectedEntry: () => {
    const { data, selectedIndex, dirtyEntryIndices, fileBytes } = get();
    if (!data || data.entries.length === 0) return;
    const nextEntries = data.entries.filter((_, index) => index !== selectedIndex);
    const nextEntryIds = nextEntries.map((item, index) =>
      readTypedEntryId(item, index),
    );
    const nextIndex = nextEntries.length
      ? Math.min(selectedIndex, nextEntries.length - 1)
      : 0;
    const nextEntry = nextEntries[nextIndex];
    const validationMessages = nextEntry
      ? validateArmsEntry(nextEntry, fileBytes)
      : [];
    // Re-index dirty set after removal
    const nextDirty = new Set<number>();
    for (const idx of dirtyEntryIndices) {
      if (idx === selectedIndex) continue;
      nextDirty.add(idx > selectedIndex ? idx - 1 : idx);
    }
    set({
      data: { ...data, entries: nextEntries, entryIds: nextEntryIds },
      selectedIndex: nextIndex,
      dirty: true,
      dirtyEntryIndices: nextDirty,
      validationMessages,
    });
  },

  markClean: () => {
    set({ dirty: false, dirtyEntryIndices: new Set() });
  },
}));
