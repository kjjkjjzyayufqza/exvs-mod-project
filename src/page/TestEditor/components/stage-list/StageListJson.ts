import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Buffer } from "buffer";

import { obfEncodeFromUtf8String } from "@/utils/obfString";
import type { StageDataEntry, StageList } from "@/models/stageList";

export type StageJsonRow = {
  id: number;
  name: string;
  unk1: number;
  unk2: number;
  unk3: number;
  unk4: number;
  unk5: number;
  unk6: number;
  vs_s_d: number;
  fileName: number;
  unk9: number;
  vs_s_l: number;
  unk11: number;
  unk13: number;
  unk14: number;
  unk15: number;
  uniqueIndex: number;
  vs_sn: number;
  unk18: number;
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

function toStageJsonRow(entry: StageDataEntry): StageJsonRow {
  const nameStr =
    entry.name && typeof entry.name === "object" && "Utf8String" in entry.name
      ? String((entry.name as { Utf8String: string }).Utf8String ?? "")
      : "";
  return {
    id: entry.id ?? 0,
    name: nameStr,
    unk1: entry.unk1 ?? 0,
    unk2: entry.unk2 ?? 0,
    unk3: entry.unk3 ?? 0,
    unk4: entry.unk4 ?? 0,
    unk5: entry.unk5 ?? 0,
    unk6: entry.unk6 ?? 0,
    vs_s_d: entry.vs_s_d ?? 0,
    fileName: entry.fileName ?? 0,
    unk9: entry.unk9 ?? 0,
    vs_s_l: entry.vs_s_l ?? 0,
    unk11: entry.unk11 ?? 0,
    unk13: entry.unk13 ?? 0,
    unk14: entry.unk14 ?? 0,
    unk15: entry.unk15 ?? 0,
    uniqueIndex: entry.uniqueIndex ?? 0,
    vs_sn: entry.vs_sn ?? 0,
    unk18: entry.unk18 ?? 0,
  };
}

export function buildStageJsonPayload(entries: StageDataEntry[]): StageJsonRow[] {
  return entries.map((e) => toStageJsonRow(e));
}

export async function exportStageJsonToFile(
  entries: StageDataEntry[],
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
    unk1: coerceInt(obj.unk1, 0),
    unk2: coerceInt(obj.unk2, 0),
    unk3: coerceInt(obj.unk3, 0),
    unk4: coerceInt(obj.unk4, 0),
    unk5: coerceInt(obj.unk5, 0),
    unk6: coerceInt(obj.unk6, 0),
    vs_s_d: coerceInt(obj.vs_s_d, 0),
    fileName: coerceInt(obj.fileName, 0),
    unk9: coerceInt(obj.unk9, 0),
    vs_s_l: coerceInt(obj.vs_s_l, 0),
    unk11: coerceInt(obj.unk11, 0),
    unk13: coerceInt(obj.unk13, 0),
    unk14: coerceInt(obj.unk14, 0),
    unk15: coerceInt(obj.unk15, 0),
    uniqueIndex: coerceInt(obj.uniqueIndex, 0),
    vs_sn: coerceInt(obj.vs_sn, 0),
    unk18: coerceInt(obj.unk18, 0),
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

function buildNameData(value: string): { StringBufferData: Buffer; Utf8String: string } {
  const utf8 = value ?? "";
  const encoded = Buffer.from(obfEncodeFromUtf8String(utf8));
  return { StringBufferData: encoded, Utf8String: utf8 };
}

export function applyStageJsonImportToList(currentList: StageList, rows: StageJsonRow[]): StageList {
  const nextRows: StageDataEntry[] = rows.map((row) => ({
    id: row.id,
    name: buildNameData(row.name),
    unk1: row.unk1,
    unk2: row.unk2,
    unk3: row.unk3,
    unk4: row.unk4,
    unk5: row.unk5,
    unk6: row.unk6,
    vs_s_d: row.vs_s_d,
    fileName: row.fileName,
    unk9: row.unk9,
    vs_s_l: row.vs_s_l,
    unk11: row.unk11,
    unk13: row.unk13,
    unk14: row.unk14,
    unk15: row.unk15,
    uniqueIndex: row.uniqueIndex,
    vs_sn: row.vs_sn,
    unk18: row.unk18,
  }));

  return Object.assign(Object.create(Object.getPrototypeOf(currentList)), currentList, {
    StageData: nextRows,
    StageCount: nextRows.length,
  });
}
