import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

import type { StageListData, StageListEntry } from "@/models/stageListEntry";

export type StageJsonRow = {
  id: number;
  name: string;
  recordLookupId: number;
  randomSelectWeightDefault: number;
  randomSelectWeightAlt: number;
  unk0x0c: number;
  seriesAltGroupId: number;
  unk0x14: number;
  vsSD: number;
  fileName: number;
  selectOrderAlt: number;
  vsSL: number;
  seriesDefaultGroupId: number;
  unk0x34: number;
  unk0x38: number;
  selectOrderDefault: number;
  vsSn: number;
  iconIndex: number;
};

export interface StageJsonImportPreview {
  filePath: string;
  totalCount: number;
  validCount: number;
  invalidCount: number;
  ids: number[];
  duplicateIds: number[];
  rows: StageJsonRow[];
}

function toStageJsonRow(entry: StageListEntry): StageJsonRow {
  return {
    id: entry.entryId ?? 0,
    name: typeof entry.name === "string" ? entry.name : "",
    recordLookupId: entry.recordLookupId ?? 0,
    randomSelectWeightDefault: entry.randomSelectWeightDefault ?? 0,
    randomSelectWeightAlt: entry.randomSelectWeightAlt ?? 0,
    unk0x0c: entry.unk0x0c ?? 0,
    seriesAltGroupId: entry.seriesAltGroupId ?? 0,
    unk0x14: entry.unk0x14 ?? 0,
    vsSD: entry.vsSD ?? 0,
    fileName: entry.fileName ?? 0,
    selectOrderAlt: entry.selectOrderAlt ?? 0,
    vsSL: entry.vsSL ?? 0,
    seriesDefaultGroupId: entry.seriesDefaultGroupId ?? 0,
    unk0x34: entry.unk0x34 ?? 0,
    unk0x38: entry.unk0x38 ?? 0,
    selectOrderDefault: entry.selectOrderDefault ?? 0,
    vsSn: entry.vsSn ?? 0,
    iconIndex: entry.iconIndex ?? 0,
  };
}

export function buildStageJsonPayload(entries: StageListEntry[]): StageJsonRow[] {
  return entries.map((e) => toStageJsonRow(e));
}

export async function exportStageJsonToFile(
  entries: StageListEntry[],
  options?: { defaultFileName?: string }
): Promise<{ filePath: string; count: number } | null> {
  const filePath = await save({
    filters: [{ name: "Stage List JSON", extensions: ["json"] }],
    defaultPath: options?.defaultFileName ?? "stage_list.json",
  });

  if (!filePath) return null;

  const payload = buildStageJsonPayload(entries);
  const jsonString = JSON.stringify(payload, null, 2);
  await writeTextFile(filePath, jsonString);

  return { filePath, count: payload.length };
}

function coerceId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^-?\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return n;
  }
  return null;
}

function coerceInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value | 0;
  if (typeof value === "string") {
    const n = parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function normalizeImportRow(raw: unknown): StageJsonRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id = coerceId(obj.id);
  if (id === null) return null;

  const nameStr = typeof obj.name === "string" ? obj.name : "";
  return {
    id,
    name: nameStr,
    recordLookupId: coerceInt(obj.recordLookupId, 0),
    randomSelectWeightDefault: coerceInt(obj.randomSelectWeightDefault, 0),
    randomSelectWeightAlt: coerceInt(obj.randomSelectWeightAlt, 0),
    unk0x0c: coerceInt(obj.unk0x0c, 0),
    seriesAltGroupId: coerceInt(obj.seriesAltGroupId, 0),
    unk0x14: coerceInt(obj.unk0x14, 0),
    vsSD: coerceInt(obj.vsSD, 0),
    fileName: coerceInt(obj.fileName, 0),
    selectOrderAlt: coerceInt(obj.selectOrderAlt, 0),
    vsSL: coerceInt(obj.vsSL, 0),
    seriesDefaultGroupId: coerceInt(obj.seriesDefaultGroupId, 0),
    unk0x34: coerceInt(obj.unk0x34, 0),
    unk0x38: coerceInt(obj.unk0x38, 0),
    selectOrderDefault: coerceInt(obj.selectOrderDefault, 0),
    vsSn: coerceInt(obj.vsSn, 0),
    iconIndex: coerceInt(obj.iconIndex, 0),
  };
}

export async function pickStageJsonImportPreview(): Promise<StageJsonImportPreview | null> {
  const filePath = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Stage List JSON", extensions: ["json"] }],
  });

  if (!filePath) return null;

  const text = await readTextFile(filePath);
  const parsed: unknown = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid JSON: expected an array");
  }

  const totalCount = parsed.length;
  const rows: StageJsonRow[] = [];

  for (const item of parsed) {
    const row = normalizeImportRow(item);
    if (!row) continue;
    rows.push(row);
  }

  const ids = rows.map((r) => r.id);
  const idCounts = new Map<number, number>();
  for (const id of ids) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  const duplicateIds = [...idCounts.entries()]
    .filter(([, c]) => c > 1)
    .map(([id]) => id)
    .sort((a, b) => a - b);

  return {
    filePath: filePath as string,
    totalCount,
    validCount: rows.length,
    invalidCount: totalCount - rows.length,
    ids: [...new Set(ids)].sort((a, b) => a - b),
    duplicateIds,
    rows,
  };
}

function rowToEntry(row: StageJsonRow): StageListEntry {
  return {
    entryId: row.id,
    name: row.name,
    recordLookupId: row.recordLookupId,
    randomSelectWeightDefault: row.randomSelectWeightDefault,
    randomSelectWeightAlt: row.randomSelectWeightAlt,
    unk0x0c: row.unk0x0c,
    seriesAltGroupId: row.seriesAltGroupId,
    unk0x14: row.unk0x14,
    vsSD: row.vsSD,
    fileName: row.fileName,
    selectOrderAlt: row.selectOrderAlt,
    vsSL: row.vsSL,
    seriesDefaultGroupId: row.seriesDefaultGroupId,
    unk0x34: row.unk0x34,
    unk0x38: row.unk0x38,
    selectOrderDefault: row.selectOrderDefault,
    vsSn: row.vsSn,
    iconIndex: row.iconIndex,
  };
}

export function applyStageJsonImportToList(currentList: StageListData, rows: StageJsonRow[]): StageListData {
  const nextRows: StageListEntry[] = rows.map(rowToEntry);
  return {
    ...currentList,
    entries: nextRows,
    header: { ...currentList.header, entryCount: nextRows.length },
  };
}
