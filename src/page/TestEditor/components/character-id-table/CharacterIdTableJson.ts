import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

import type { CharacterIdTable, CharacterIdTableData } from "@/models/characterIdTable";

const REQUIRED_KEYS = ["Model", "Effect", "Sound", "Param", "Msc", "Motion"] as const;
type RequiredKey = (typeof REQUIRED_KEYS)[number];

export type CharacterIdTableJsonRow = {
  id: number;
  Model: number;
  Effect: number;
  Sound: number;
  Param: number;
  Msc: number;
  Motion: number;
};

export interface CharacterIdTableImportPreview {
  filePath: string;
  totalCount: number;
  validCount: number;
  invalidCount: number;
  ids: number[];
  duplicateIds: number[];
  rows: CharacterIdTableJsonRow[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInt32Number(value: number): boolean {
  if (!Number.isInteger(value)) return false;
  return value >= -2147483648 && value <= 2147483647;
}

function coerceInt(value: unknown): number | null {
  if (isFiniteNumber(value)) return isInt32Number(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^-?\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return isInt32Number(n) ? n : null;
  }
  return null;
}

function normalizeRow(raw: unknown): CharacterIdTableJsonRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const id = coerceInt(obj.id) ?? coerceInt(obj.CharacterId);
  if (id === null) return null;

  const out: Record<string, number> = { id };
  for (const key of REQUIRED_KEYS) {
    const v = coerceInt(obj[key]);
    if (v === null) return null;
    out[key] = v;
  }

  return out as CharacterIdTableJsonRow;
}

export function buildCharacterIdTableJsonPayload(table: CharacterIdTable): CharacterIdTableJsonRow[] {
  return table.CharacterData.map((row) => ({
    id: row.CharacterId,
    Model: row.Model,
    Effect: row.Effect,
    Sound: row.Sound,
    Param: row.Param,
    Msc: row.Msc,
    Motion: row.Motion,
  }));
}

export async function exportCharacterIdTableToJsonFile(
  table: CharacterIdTable,
  options?: { defaultFileName?: string }
): Promise<{ filePath: string; count: number } | null> {
  const filePath = await save({
    filters: [{ name: "Character ID Table JSON", extensions: ["json"] }],
    defaultPath: options?.defaultFileName ?? "character_id_table.json",
  });
  if (!filePath) return null;

  const payload = buildCharacterIdTableJsonPayload(table);
  const jsonString = JSON.stringify(payload, null, 2);
  await writeTextFile(filePath, jsonString);

  return { filePath, count: payload.length };
}

export async function pickCharacterIdTableImportPreview(): Promise<CharacterIdTableImportPreview | null> {
  const filePath = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Character ID Table JSON", extensions: ["json"] }],
  });
  if (!filePath) return null;

  const text = await readTextFile(filePath);
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid JSON: expected an array");
  }

  const totalCount = parsed.length;
  const rows: CharacterIdTableJsonRow[] = [];
  for (const item of parsed) {
    const row = normalizeRow(item);
    if (!row) continue;
    rows.push(row);
  }

  const ids = rows.map((r) => r.id);
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  const duplicateIds = [...counts.entries()]
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

export function applyCharacterIdTableImport(table: CharacterIdTable, rows: CharacterIdTableJsonRow[]): CharacterIdTable {
  const nextRows: CharacterIdTableData[] = rows.map((r) => ({
    CharacterId: r.id,
    Model: r.Model,
    Effect: r.Effect,
    Sound: r.Sound,
    Param: r.Param,
    Msc: r.Msc,
    Motion: r.Motion,
  })) as CharacterIdTableData[];

  return Object.assign(Object.create(Object.getPrototypeOf(table)), table, {
    CharacterData: nextRows,
    CharacterCount: nextRows.length,
  });
}

