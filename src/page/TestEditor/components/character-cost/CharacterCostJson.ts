import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

import type { CharacterCost, CharacterCostData } from "@/models/characterCost";

export type CharacterCostJsonRow = {
  id: number;
  Cost: number;
  Hp: number;
};

export interface CharacterCostImportPreview {
  filePath: string;
  totalCount: number;
  validCount: number;
  invalidCount: number;
  ids: number[];
  duplicateIds: number[];
  rows: CharacterCostJsonRow[];
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

function normalizeRow(raw: unknown): CharacterCostJsonRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const id = coerceInt(obj.id) ?? coerceInt(obj.CharacterId);
  if (id === null) return null;

  const cost = coerceInt(obj.Cost);
  const hp = coerceInt(obj.Hp);
  if (cost === null || hp === null) return null;

  return { id, Cost: cost, Hp: hp };
}

export function buildCharacterCostJsonPayload(table: CharacterCost): CharacterCostJsonRow[] {
  return table.CharacterData.map((row) => ({
    id: row.CharacterId,
    Cost: row.Cost,
    Hp: row.Hp,
  }));
}

export async function exportCharacterCostToJsonFile(
  table: CharacterCost,
  options?: { defaultFileName?: string }
): Promise<{ filePath: string; count: number } | null> {
  const filePath = await save({
    filters: [{ name: "Character Cost JSON", extensions: ["json"] }],
    defaultPath: options?.defaultFileName ?? "character_cost.json",
  });
  if (!filePath) return null;

  const payload = buildCharacterCostJsonPayload(table);
  const jsonString = JSON.stringify(payload, null, 2);
  await writeTextFile(filePath, jsonString);

  return { filePath, count: payload.length };
}

export async function pickCharacterCostImportPreview(): Promise<CharacterCostImportPreview | null> {
  const filePath = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Character Cost JSON", extensions: ["json"] }],
  });
  if (!filePath) return null;

  const text = await readTextFile(filePath);
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid JSON: expected an array");
  }

  const totalCount = parsed.length;
  const rows: CharacterCostJsonRow[] = [];
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

export function applyCharacterCostImport(table: CharacterCost, rows: CharacterCostJsonRow[]): CharacterCost {
  const nextRows: CharacterCostData[] = rows.map(
    (r) =>
      ({
        CharacterId: r.id,
        Cost: r.Cost,
        Hp: r.Hp,
      }) as CharacterCostData
  );

  return Object.assign(Object.create(Object.getPrototypeOf(table)), table, {
    CharacterData: nextRows,
    CharacterCount: nextRows.length,
  });
}
