import { formatHash } from "@/models/commandTable";
import type { TypedFieldValue, TypedParamEntry, TypedParamFile } from "./typedParamTypes";

export interface TypedParamEntryRow {
  entry: TypedParamEntry;
  index: number;
  entryId: number;
}

export type TypedParamEntryOrigin = "loaded" | "copied" | "blank";

export interface TypedParamEntryEditorMeta {
  origin: TypedParamEntryOrigin;
  sourceEntryId?: number;
  sourceIndex?: number;
  isDirty: boolean;
}

export function createInitialEntryEditorMeta(entryCount: number): TypedParamEntryEditorMeta[] {
  return Array.from({ length: entryCount }, () => ({
    origin: "loaded",
    isDirty: false,
  }));
}

export function removeEntryEditorMetaAt(
  meta: TypedParamEntryEditorMeta[],
  index: number,
): TypedParamEntryEditorMeta[] {
  return meta.filter((_, rowIndex) => rowIndex !== index);
}

export function appendEntryEditorMeta(
  meta: TypedParamEntryEditorMeta[],
  next: TypedParamEntryEditorMeta,
): TypedParamEntryEditorMeta[] {
  return [...meta, next];
}

export function markEntryEditorMetaDirty(
  meta: TypedParamEntryEditorMeta[],
  index: number,
): TypedParamEntryEditorMeta[] {
  if (index < 0 || index >= meta.length) return meta;
  return meta.map((item, rowIndex) =>
    rowIndex === index ? { ...item, isDirty: true } : item,
  );
}

export function shiftHighlightedEntryIndices(indices: Set<number>, deletedIndex: number): Set<number> {
  const next = new Set<number>();
  indices.forEach((entryIndex) => {
    if (entryIndex === deletedIndex) return;
    next.add(entryIndex > deletedIndex ? entryIndex - 1 : entryIndex);
  });
  return next;
}

export interface HexPreviewRow {
  offset: string;
  hex: string;
  ascii: string;
}

export interface TypedEntryHexPreview {
  entryId: number;
  bytes: number[];
  rows: HexPreviewRow[];
}

export interface TypedEntryFieldLayout {
  key: string;
  offset: number;
  kind: number;
}

export type ParseHexPreviewResult =
  | { ok: true; bytes: number[] }
  | { ok: false; error: string };

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/^0x/, "").replace(/[^a-z0-9.-]/g, "");
}

function readableKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
}

function cloneEntry(entry: TypedParamEntry): TypedParamEntry {
  return { ...entry };
}

export function readTypedEntryId(entry: TypedParamEntry, index: number): number {
  const raw = entry.entryId;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw >>> 0;
  }
  return index >>> 0;
}

export function nextTypedEntryId(entries: TypedParamEntry[]): number {
  return (entries.reduce((acc, entry, index) => Math.max(acc, readTypedEntryId(entry, index)), 0) + 1) >>> 0;
}

export function createCopyAsNewTypedParamEntry(entries: TypedParamEntry[], sourceIndex: number): TypedParamEntry | null {
  const source = entries[sourceIndex] ?? entries[0];
  if (!source) return null;
  const created = cloneEntry(source);
  created.entryId = nextTypedEntryId(entries);
  return created;
}

export function createBlankTypedParamEntry(entries: TypedParamEntry[], sourceIndex: number): TypedParamEntry | null {
  const source = entries[sourceIndex] ?? entries[0];
  if (!source) return null;
  const nextId = nextTypedEntryId(entries);
  const created: TypedParamEntry = {};
  Object.entries(source).forEach(([key, value]) => {
    if (key === "entryId") {
      created[key] = nextId;
      return;
    }
    if (typeof value === "number") {
      created[key] = 0;
      return;
    }
    if (typeof value === "boolean") {
      created[key] = false;
      return;
    }
    if (typeof value === "string") {
      created[key] = "";
      return;
    }
    created[key] = null;
  });
  if (created.entryId === undefined) {
    created.entryId = nextId;
  }
  return created;
}

function valueSearchCandidates(value: TypedFieldValue): string[] {
  if (typeof value === "number") {
    const candidates = [String(value), formatHash(value >>> 0)];
    const bytes = new Uint8Array(4);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, value >>> 0, false);
    candidates.push(Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join(" "));
    return candidates;
  }
  if (typeof value === "boolean") return [value ? "true" : "false"];
  if (value === null) return ["null"];
  return [value];
}

export function filterTypedParamEntryRows(entries: TypedParamEntry[], query: string): TypedParamEntryRow[] {
  const trimmed = query.trim();
  const rows = entries.map((entry, index) => ({
    entry,
    index,
    entryId: readTypedEntryId(entry, index),
  }));
  if (!trimmed) return rows;

  if (trimmed.startsWith("#")) {
    const indexQuery = trimmed.slice(1).trim();
    return rows.filter((row) => String(row.index).includes(indexQuery));
  }

  const normalizedQuery = normalizeSearchText(trimmed);
  return rows.filter((row) => {
    const baseCandidates = [
      `#${row.index}`,
      String(row.index),
      String(row.entryId),
      formatHash(row.entryId),
    ];
    if (baseCandidates.some((candidate) => normalizeSearchText(candidate).includes(normalizedQuery))) {
      return true;
    }
    return Object.entries(row.entry).some(([key, value]) => {
      const candidates = [key, readableKey(key), ...valueSearchCandidates(value)];
      return candidates.some((candidate) => normalizeSearchText(candidate).includes(normalizedQuery));
    });
  });
}

function fieldSpecOffset(spec: Record<string, number> | undefined, fallback: number): number {
  if (!spec) return fallback;
  return spec.entryOffset ?? spec.offset ?? fallback;
}

function fieldSpecKind(spec: Record<string, number> | undefined): number {
  return spec?.kind ?? 1;
}

function numericValue(value: TypedFieldValue): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readFieldBytes(bytes: number[], offset: number, kind: number): number {
  const view = new DataView(Uint8Array.from(bytes).buffer);
  if (kind === 5) {
    return view.getFloat32(offset, true);
  }
  if (kind === 2) {
    return view.getInt32(offset, true);
  }
  return view.getUint32(offset, true);
}

function writeFieldBytes(bytes: number[], offset: number, kind: number, value: TypedFieldValue): void {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  const n = numericValue(value);
  if (kind === 5) {
    view.setFloat32(0, n, true);
  } else if (kind === 2) {
    view.setInt32(0, n | 0, true);
  } else {
    view.setUint32(0, n >>> 0, true);
  }
  const raw = Array.from(new Uint8Array(buffer));
  for (let i = 0; i < raw.length; i += 1) {
    bytes[offset + i] = raw[i] ?? 0;
  }
}

function formatHexPreviewRows(bytes: number[]): HexPreviewRow[] {
  const rows: HexPreviewRow[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.slice(offset, offset + 16);
    const hexBytes = chunk.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"));
    const asciiChars = chunk.map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "."));
    rows.push({
      offset: offset.toString(16).toUpperCase().padStart(8, "0"),
      hex: hexBytes.join(" "),
      ascii: asciiChars.join(""),
    });
  }
  return rows;
}

export function buildTypedEntryFieldLayout(
  data: TypedParamFile,
  entryIndex: number,
): TypedEntryFieldLayout[] | null {
  const entry = data.entries[entryIndex];
  if (!entry) return null;
  const keys = Object.keys(entry).filter((key) => key !== "entryId" && !key.endsWith("Size"));
  return keys.map((key, index) => {
    const spec = data.fieldSpecs[index];
    return {
      key,
      offset: fieldSpecOffset(spec, index * 4),
      kind: fieldSpecKind(spec),
    };
  });
}

export function formatHexPreviewEditText(bytes: number[]): string {
  const rows: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.slice(offset, offset + 16);
    const hexBytes = chunk.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"));
    rows.push(hexBytes.join(" "));
  }
  return rows.join("\n");
}

export function parseHexPreviewEditText(text: string, expectedLength: number): ParseHexPreviewResult {
  const tokens = text.match(/[0-9A-Fa-f]{2}/g);
  if (!tokens || tokens.length === 0) {
    return { ok: false, error: "No hex bytes found in editor text." };
  }
  const bytes = tokens.map((token) => Number.parseInt(token, 16));
  if (bytes.length !== expectedLength) {
    return {
      ok: false,
      error: `Expected ${expectedLength} bytes, found ${bytes.length}.`,
    };
  }
  return { ok: true, bytes };
}

export function applyHexBytesToTypedEntry(
  entry: TypedParamEntry,
  fieldLayout: TypedEntryFieldLayout[],
  bytes: number[],
): TypedParamEntry {
  const next: TypedParamEntry = { ...entry };
  fieldLayout.forEach((field) => {
    next[field.key] = readFieldBytes(bytes, field.offset, field.kind);
  });
  return next;
}

export function buildTypedEntryHexPreview(data: TypedParamFile, entryIndex: number): TypedEntryHexPreview | null {
  const fieldLayout = buildTypedEntryFieldLayout(data, entryIndex);
  const entry = data.entries[entryIndex];
  if (!entry || !fieldLayout) return null;
  const size = fieldLayout.reduce((acc, field) => Math.max(acc, field.offset + 4), 0);
  const bytes = Array.from({ length: size }, () => 0);
  fieldLayout.forEach((field) => {
    writeFieldBytes(bytes, field.offset, field.kind, entry[field.key]);
  });
  return {
    entryId: readTypedEntryId(entry, entryIndex),
    bytes,
    rows: formatHexPreviewRows(bytes),
  };
}
