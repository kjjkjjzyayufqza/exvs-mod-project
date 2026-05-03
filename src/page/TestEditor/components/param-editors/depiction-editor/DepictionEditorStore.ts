import { create } from "zustand";
import type {
  TypedParamEntry,
  TypedParamFile,
} from "../../param-editor/typedParamTypes";
import { readTypedEntryId } from "../../param-editor/paramEntryUtils";
import type { ValidationMessage } from "../shared/types";

export interface DepictionEditorState {
  data: TypedParamFile | null;
  filePath: string;
  selectedIndex: number;
  dirty: boolean;
  validationMessages: ValidationMessage[];

  setData: (data: TypedParamFile, filePath: string) => void;
  selectEntry: (index: number) => void;
  updateField: (key: string, value: number) => void;
}

function validateDepictionEntry(entry: TypedParamEntry): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const scale = typeof entry.scale === "number" ? entry.scale : 1;
  if (scale <= 0) {
    messages.push({
      field: "scale",
      level: "error",
      message: "Scale must be greater than 0",
    });
  }
  return messages;
}

export const useDepictionEditorStore = create<DepictionEditorState>(
  (set, get) => ({
    data: null,
    filePath: "",
    selectedIndex: 0,
    dirty: false,
    validationMessages: [],

    setData: (data, filePath) => {
      const entry = data.entries[0];
      const validationMessages = entry ? validateDepictionEntry(entry) : [];
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
      const validationMessages = entry ? validateDepictionEntry(entry) : [];
      set({ selectedIndex: index, validationMessages });
    },

    updateField: (key, value) => {
      const { data, selectedIndex } = get();
      if (!data) return;
      const nextEntries = data.entries.map((e, i) =>
        i === selectedIndex ? { ...e, [key]: value } : e,
      );
      const nextEntryIds = nextEntries.map((e, i) => readTypedEntryId(e, i));
      const nextData = {
        ...data,
        entries: nextEntries,
        entryIds: nextEntryIds,
      };
      const entry = nextEntries[selectedIndex];
      const validationMessages = entry ? validateDepictionEntry(entry) : [];
      set({ data: nextData, dirty: true, validationMessages });
    },
  }),
);
