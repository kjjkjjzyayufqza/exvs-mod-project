import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { StrikerTable, StrikerTableRow } from "@/models/strikerTable";
import { cloneStrikerTable, unsignedId } from "@/models/strikerTable";

export type StrikerTableJsonRow = {
  hostUnitId: number;
  slot1: number;
  slot2: number;
};

export interface StrikerTableImportPreview {
  filePath: string;
  totalCount: number;
  validCount: number;
  invalidCount: number;
  ids: number[];
  duplicateIds: number[];
  rows: StrikerTableJsonRow[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isUint32Number(value: number): boolean {
  if (!Number.isInteger(value)) return false;
  return value >= 0 && value <= 4294967295;
}

function coerceUint32(value: unknown): number | null {
  if (isFiniteNumber(value)) return isUint32Number(value) ? unsignedId(value) : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = trimmed.toLowerCase().startsWith("0x")
      ? Number.parseInt(trimmed, 16)
      : /^-?\d+$/.test(trimmed)
        ? Number(trimmed)
        : Number.NaN;
    if (!Number.isFinite(parsed)) return null;
    const asUint = unsignedId(parsed);
    return isUint32Number(asUint) ? asUint : null;
  }
  return null;
}

function normalizeRow(raw: unknown): StrikerTableJsonRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const hostUnitId =
    coerceUint32(obj.hostUnitId) ??
    coerceUint32(obj.HostUnitId) ??
    coerceUint32(obj.id) ??
    coerceUint32(obj.CharacterId);
  const slot1 = coerceUint32(obj.slot1) ?? coerceUint32(obj.Slot1);
  const slot2 = coerceUint32(obj.slot2) ?? coerceUint32(obj.Slot2);
  if (hostUnitId === null || slot1 === null || slot2 === null) return null;
  return { hostUnitId, slot1, slot2 };
}

export function buildStrikerTableJsonPayload(table: StrikerTable): StrikerTableJsonRow[] {
  return table.rows.map((row) => ({
    hostUnitId: unsignedId(row.HostUnitId),
    slot1: unsignedId(row.Slot1),
    slot2: unsignedId(row.Slot2),
  }));
}

export async function exportStrikerTableToJsonFile(
  table: StrikerTable,
  options?: { defaultFileName?: string },
): Promise<{ filePath: string; count: number } | null> {
  const filePath = await save({
    filters: [{ name: "Striker Table JSON", extensions: ["json"] }],
    defaultPath: options?.defaultFileName ?? "strikertable.json",
  });
  if (!filePath) return null;

  const payload = buildStrikerTableJsonPayload(table);
  await writeTextFile(filePath, JSON.stringify(payload, null, 2));
  return { filePath, count: payload.length };
}

export async function pickStrikerTableImportPreview(): Promise<StrikerTableImportPreview | null> {
  const filePath = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Striker Table JSON", extensions: ["json"] }],
  });
  if (!filePath) return null;

  const parsed: unknown = JSON.parse(await readTextFile(filePath));
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid JSON: expected an array");
  }

  const rows: StrikerTableJsonRow[] = [];
  for (const item of parsed) {
    const row = normalizeRow(item);
    if (row) rows.push(row);
  }

  const ids = rows.map((r) => r.hostUnitId);
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  const duplicateIds = [...counts.entries()]
    .filter(([, c]) => c > 1)
    .map(([id]) => id)
    .sort((a, b) => a - b);

  return {
    filePath: filePath as string,
    totalCount: parsed.length,
    validCount: rows.length,
    invalidCount: parsed.length - rows.length,
    ids: [...new Set(ids)].sort((a, b) => a - b),
    duplicateIds,
    rows,
  };
}

export function applyStrikerTableImport(
  table: StrikerTable,
  rows: StrikerTableJsonRow[],
): StrikerTable {
  const nextRows = rows.map(
    (r) =>
      ({
        HostUnitId: r.hostUnitId,
        Slot1: r.slot1,
        Slot2: r.slot2,
      }) as StrikerTableRow,
  );
  return cloneStrikerTable(table, nextRows);
}
