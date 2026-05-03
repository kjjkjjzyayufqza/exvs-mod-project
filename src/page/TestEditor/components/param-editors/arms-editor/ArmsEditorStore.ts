import { create } from "zustand";
import type { TypedParamEntry, TypedParamFile } from "../../param-editor/typedParamTypes";
import { readTypedEntryId } from "../../param-editor/paramEntryUtils";
import type { ValidationMessage } from "../shared/types";

export interface ArmsEditorState {
  data: TypedParamFile | null;
  filePath: string;
  selectedIndex: number;
  dirty: boolean;
  validationMessages: ValidationMessage[];

  setData: (data: TypedParamFile, filePath: string) => void;
  selectEntry: (index: number) => void;
  updateField: (key: string, value: number) => void;
}

function validateArmsEntry(entry: TypedParamEntry): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const ammo = typeof entry.ammoCount === "number" ? entry.ammoCount : -1;
  if (ammo === 0) {
    messages.push({
      field: "ammoCount",
      level: "warning",
      message: "ammoCount is 0 (weapon disabled?)",
    });
  }
  return messages;
}

export const useArmsEditorStore = create<ArmsEditorState>((set, get) => ({
  data: null,
  filePath: "",
  selectedIndex: 0,
  dirty: false,
  validationMessages: [],

  setData: (data, filePath) => {
    const entry = data.entries[0];
    const validationMessages = entry ? validateArmsEntry(entry) : [];
    set({
      data,
      filePath,
      selectedIndex: 0,
      dirty: false,
      validationMessages,
    });
  },

  selectEntry: (index) => {
    const { data } = get();
    const entry = data?.entries[index];
    const validationMessages = entry ? validateArmsEntry(entry) : [];
    set({ selectedIndex: index, validationMessages });
  },

  updateField: (key, value) => {
    const { data, selectedIndex } = get();
    if (!data) return;
    const nextEntries = data.entries.map((e, i) =>
      i === selectedIndex ? { ...e, [key]: value } : e,
    );
    const nextEntryIds = nextEntries.map((e, i) => readTypedEntryId(e, i));
    const nextData = { ...data, entries: nextEntries, entryIds: nextEntryIds };
    const entry = nextEntries[selectedIndex];
    const validationMessages = entry ? validateArmsEntry(entry) : [];
    set({ data: nextData, dirty: true, validationMessages });
  },
}));
