import { create } from "zustand";
import type { TypedParamEntry, TypedParamFile } from "../../param-editor/typedParamTypes";
import { readTypedEntryId } from "../../param-editor/paramEntryUtils";
import type { ValidationMessage } from "../shared/types";

export interface CharacterEditorState {
  data: TypedParamFile | null;
  filePath: string;
  selectedIndex: number;
  dirty: boolean;
  validationMessages: ValidationMessage[];

  setData: (data: TypedParamFile, filePath: string) => void;
  selectEntry: (index: number) => void;
  updateField: (key: string, value: number) => void;
}

function validateCharacterEntry(entry: TypedParamEntry): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const hp = typeof entry.maxHp === "number" ? entry.maxHp : 0;
  if (hp < 0) {
    messages.push({
      field: "maxHp",
      level: "error",
      message: "maxHp must not be negative",
    });
  }
  return messages;
}

export const useCharacterEditorStore = create<CharacterEditorState>(
  (set, get) => ({
    data: null,
    filePath: "",
    selectedIndex: 0,
    dirty: false,
    validationMessages: [],

    setData: (data, filePath) => {
      const entry = data.entries[0];
      const validationMessages = entry ? validateCharacterEntry(entry) : [];
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
      const validationMessages = entry ? validateCharacterEntry(entry) : [];
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
      const validationMessages = entry ? validateCharacterEntry(entry) : [];
      set({ data: nextData, dirty: true, validationMessages });
    },
  }),
);
