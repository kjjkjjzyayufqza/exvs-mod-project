import { create } from "zustand";
import type { TypedParamEntry, TypedParamFile } from "../../param-editor/typedParamTypes";
import { readTypedEntryId } from "../../param-editor/paramEntryUtils";
import type { ValidationMessage } from "../shared/types";

export interface SpeedEditorState {
  data: TypedParamFile | null;
  filePath: string;
  selectedIndex: number;
  dirty: boolean;
  validationMessages: ValidationMessage[];

  setData: (data: TypedParamFile, filePath: string) => void;
  selectEntry: (index: number) => void;
  updateField: (key: string, value: number | string) => void;
}

function validateSpeedEntry(entry: TypedParamEntry): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const dashSpeed =
    typeof entry.boostDashSpeedTerminal === "number"
      ? entry.boostDashSpeedTerminal
      : 0;
  if (dashSpeed > 50) {
    messages.push({
      field: "boostDashSpeedTerminal",
      level: "warning",
      message: "Very high boost-dash terminal parameter",
    });
  }
  return messages;
}

export const useSpeedEditorStore = create<SpeedEditorState>((set, get) => ({
  data: null,
  filePath: "",
  selectedIndex: 0,
  dirty: false,
  validationMessages: [],

  setData: (data, filePath) => {
    const entry = data.entries[0];
    const validationMessages = entry ? validateSpeedEntry(entry) : [];
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
    const validationMessages = entry ? validateSpeedEntry(entry) : [];
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
    const validationMessages = entry ? validateSpeedEntry(entry) : [];
    set({ data: nextData, dirty: true, validationMessages });
  },
}));
