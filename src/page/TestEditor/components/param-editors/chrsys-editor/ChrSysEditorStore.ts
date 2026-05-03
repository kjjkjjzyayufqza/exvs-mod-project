import { create } from "zustand";
import type {
  TypedParamEntry,
  TypedParamFile,
} from "../../param-editor/typedParamTypes";
import { readTypedEntryId } from "../../param-editor/paramEntryUtils";
import type { ValidationMessage } from "../shared/types";

export interface ChrSysEditorState {
  rawData: unknown;
  data: TypedParamFile | null;
  filePath: string;
  selectedIndex: number;
  dirty: boolean;
  validationMessages: ValidationMessage[];

  setData: (raw: unknown, filePath: string) => void;
  selectEntry: (index: number) => void;
  updateField: (key: string, value: number) => void;
}

interface ChrSysRawEntry {
  hash: number;
  valueA: number;
  valueB: number;
  valueC: number;
  valueD: number;
}

interface ChrSysRawFile {
  magic?: number;
  headerBytes?: number[];
  entries?: ChrSysRawEntry[];
}

function normalizeRawData(raw: unknown): {
  data: TypedParamFile;
  rawObj: ChrSysRawFile;
} {
  const empty: ChrSysRawFile = { entries: [] };
  if (!raw || typeof raw !== "object") {
    return {
      data: {
        header: {},
        fieldSpecs: [],
        entryIds: [],
        entries: [],
        trailingData: [],
      },
      rawObj: empty,
    };
  }

  const rawObj = raw as ChrSysRawFile;
  const rawEntries: ChrSysRawEntry[] = Array.isArray(rawObj.entries)
    ? rawObj.entries
    : [];

  const entries: TypedParamEntry[] = rawEntries.map((e) => ({
    entryId: e.hash,
    valueA: e.valueA,
    valueB: e.valueB,
    valueC: e.valueC,
    valueD: e.valueD,
  }));

  const entryIds = entries.map((e, i) => readTypedEntryId(e, i));

  return {
    data: {
      header: {},
      fieldSpecs: [],
      entryIds,
      entries,
      trailingData: [],
    },
    rawObj,
  };
}

function entriesToRaw(
  entries: TypedParamEntry[],
): ChrSysRawEntry[] {
  return entries.map((e) => ({
    hash: typeof e.entryId === "number" ? (e.entryId as number) : 0,
    valueA: typeof e.valueA === "number" ? (e.valueA as number) : 0,
    valueB: typeof e.valueB === "number" ? (e.valueB as number) : 0,
    valueC: typeof e.valueC === "number" ? (e.valueC as number) : 0,
    valueD: typeof e.valueD === "number" ? (e.valueD as number) : 0,
  }));
}

function validateChrSysEntries(
  entries: TypedParamEntry[],
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const seenIds = new Map<number, number>();

  entries.forEach((entry, index) => {
    const id = readTypedEntryId(entry, index);
    const prev = seenIds.get(id);
    if (prev !== undefined) {
      messages.push({
        field: "entryId",
        level: "warning",
        message: `Duplicate hash ${(id >>> 0).toString(16).toUpperCase()} at #${prev} and #${index}`,
      });
    } else {
      seenIds.set(id, index);
    }
  });

  return messages;
}

export const useChrSysEditorStore = create<ChrSysEditorState>((set, get) => ({
  rawData: null,
  data: null,
  filePath: "",
  selectedIndex: 0,
  dirty: false,
  validationMessages: [],

  setData: (raw, filePath) => {
    const { data } = normalizeRawData(raw);
    const validationMessages = validateChrSysEntries(data.entries);
    set({
      rawData: raw,
      data,
      filePath,
      selectedIndex: 0,
      dirty: false,
      validationMessages,
    });
  },

  selectEntry: (index) => {
    const { data } = get();
    const validationMessages = data
      ? validateChrSysEntries(data.entries)
      : [];
    set({ selectedIndex: index, validationMessages });
  },

  updateField: (key, value) => {
    const { data, rawData, selectedIndex } = get();
    if (!data) return;

    const nextEntries = data.entries.map((e, i) =>
      i === selectedIndex ? { ...e, [key]: value } : e,
    );
    const nextEntryIds = nextEntries.map((e, i) => readTypedEntryId(e, i));
    const nextData = { ...data, entries: nextEntries, entryIds: nextEntryIds };

    let nextRaw = rawData;
    if (rawData && typeof rawData === "object") {
      const rawObj = rawData as ChrSysRawFile;
      nextRaw = { ...rawObj, entries: entriesToRaw(nextEntries) };
    }

    const validationMessages = validateChrSysEntries(nextEntries);
    set({
      rawData: nextRaw,
      data: nextData,
      dirty: true,
      validationMessages,
    });
  },
}));
