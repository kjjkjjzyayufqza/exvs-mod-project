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
  const ammo = numField(entry, "ammoCount");
  const enabled = numField(entry, "isEnabled");
  const reloadType = numField(entry, "reloadType");
  const landing = numField(entry, "landingBehaviorType");
  const labels = resolveArmsLabels(entry, fileBytes);

  if (enabled === 0) {
    messages.push({
      field: "isEnabled",
      level: "info",
      message: "isEnabled is 0 (entry disabled in schema)",
    });
  }
  if (ammo === 0 && enabled !== 0) {
    messages.push({
      field: "ammoCount",
      level: "warning",
      message: "ammoCount is 0 while entry is enabled",
    });
  }
  if (reloadType < 0 || reloadType > 3) {
    messages.push({
      field: "reloadType",
      level: "warning",
      message: `reloadType ${reloadType} is outside corpus enum 0–3`,
    });
  }
  if (landing === 0) {
    messages.push({
      field: "landingBehaviorType",
      level: "info",
      message: "landingBehaviorType is 0 (corpus usually 1+)",
    });
  }
  if (
    enabled !== 0 &&
    !labels.actionLabel &&
    !labels.resourceLabel
  ) {
    messages.push({
      field: "actionLabel",
      level: "info",
      message: "No action/resource labels on this enabled entry",
    });
  }

  const totalDuration = numField(entry, "totalDurationFrame");
  const phaseSum =
    numField(entry, "startupFrame") +
    numField(entry, "activeFrame") +
    numField(entry, "recoveryFrame") +
    numField(entry, "cooldownFrame");
  if (totalDuration > 0 && phaseSum > 0 && totalDuration !== phaseSum) {
    messages.push({
      field: "totalDurationFrame",
      level: "info",
      message: `totalDurationFrame (${totalDuration}) ≠ phase sum (${phaseSum})`,
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
