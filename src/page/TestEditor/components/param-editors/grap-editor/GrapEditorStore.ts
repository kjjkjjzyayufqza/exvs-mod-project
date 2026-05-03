import { create } from "zustand";
import type { TypedParamEntry, TypedParamFile } from "../../param-editor/typedParamTypes";
import { readTypedEntryId } from "../../param-editor/paramEntryUtils";
import type { ValidationMessage } from "../shared/types";

export interface GrapEditorState {
  data: TypedParamFile | null;
  filePath: string;
  selectedIndex: number;
  dirty: boolean;
  validationMessages: ValidationMessage[];

  setData: (data: TypedParamFile, filePath: string) => void;
  selectEntry: (index: number) => void;
  updateField: (key: string, value: number) => void;
}

function validateGrapEntry(entry: TypedParamEntry): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const damage = typeof entry.damage === "number" ? entry.damage : 0;
  if (damage > 2000) {
    messages.push({
      field: "damage",
      level: "warning",
      message: "Damage exceeds 2000",
    });
  }
  return messages;
}

export const useGrapEditorStore = create<GrapEditorState>((set, get) => ({
  data: null,
  filePath: "",
  selectedIndex: 0,
  dirty: false,
  validationMessages: [],

  setData: (data, filePath) => {
    const entry = data.entries[0];
    const validationMessages = entry ? validateGrapEntry(entry) : [];
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
    const validationMessages = entry ? validateGrapEntry(entry) : [];
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
    const validationMessages = entry ? validateGrapEntry(entry) : [];
    set({ data: nextData, dirty: true, validationMessages });
  },
}));
