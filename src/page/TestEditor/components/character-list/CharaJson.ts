import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Buffer } from "buffer";

import { obfEncodeFromUtf8String } from "@/utils/obfString";
import { CharacterDataOB as CharacterDataOBClass } from "@/models/characterListOB";
import type { CharacterDataOB, CharacterListOB } from "@/models/characterListOB";

export const CHARACTER_STRING_FIELDS = [
  "CharacterNameOffset",
  "UnkStringOffset1",
  "UnkStringOffset2",
  "UnkStringOffset3",
  "UnkStringOffset4",
  "UnkStringOffset5",
  "UnkStringOffset6",
  "UnkStringOffset7",
  "UnkStringOffset8",
  "UnkStringOffset9",
  "UnkStringOffset10",
  "UnkStringOffset11",
  "UnkStringOffset12",
  "UnkStringOffset13",
  "UnkStringOffset14",
] as const;

export const CHARACTER_STRING_FIELD_LABELS: Record<string, string> = {
  CharacterNameOffset: "Character Name (0x1C)",
  UnkStringOffset1: "Unknown String 1 (0x68)",
  UnkStringOffset2: "Unknown String 2 (0x7C)",
  UnkStringOffset3: "Unknown String 3 (0x84)",
  UnkStringOffset4: "Unknown String 4 (0x90)",
  UnkStringOffset5: "Unknown String 5 (0x98)",
  UnkStringOffset6: "Unknown String 6 (0xA4)",
  UnkStringOffset7: "Unknown String 7 (0xB8)",
  UnkStringOffset8: "Unknown String 8 (0xC0)",
  UnkStringOffset9: "Unknown String 9 (0x134)",
  UnkStringOffset10: "Unknown String 10 (0x144)",
  UnkStringOffset11: "Unknown String 11 (0x158)",
  UnkStringOffset12: "Unknown String 12 (0x18C)",
  UnkStringOffset13: "Unknown String 13 (0x19C)",
  UnkStringOffset14: "Unknown String 14 (0x1B0)",
};

export type CharaJsonRow = Record<string, unknown> & { id: number };

export interface CharaJsonImportPreview {
  filePath: string;
  totalCount: number;
  validCount: number;
  invalidCount: number;
  ids: number[];
  duplicateIds: number[];
  rows: CharaJsonRow[];
}

function toCharaJsonRow(character: CharacterDataOB): CharaJsonRow {
  const raw = character as unknown as Record<string, unknown>;
  const id = raw.CharacterId;
  if (typeof id !== "number" || Number.isNaN(id)) {
    throw new Error("Invalid CharacterId: each exported object must contain a numeric id");
  }
  const row: Record<string, unknown> = { id };

  for (const [key, value] of Object.entries(raw)) {
    if (key === "id") continue;
    if (typeof value === "number") row[key] = value;
  }

  for (const key of CHARACTER_STRING_FIELDS) {
    const v = raw[key] as unknown;
    if (typeof v === "string") {
      row[key] = v;
      continue;
    }
    if (v && typeof v === "object" && "Utf8String" in (v as any)) {
      const utf8 = (v as any).Utf8String;
      row[key] = typeof utf8 === "string" ? utf8 : "";
      continue;
    }
    row[key] = "";
  }

  return row as CharaJsonRow;
}

export function buildCharaJsonPayload(characters: CharacterDataOB[]): CharaJsonRow[] {
  return characters.map((c) => toCharaJsonRow(c));
}

export async function exportCharaJsonToFile(
  characters: CharacterDataOB[],
  options?: { defaultFileName?: string }
): Promise<{ filePath: string; count: number } | null> {
  const filePath = await save({
    filters: [{ name: "Chara JSON", extensions: ["json"] }],
    defaultPath: options?.defaultFileName ?? `character_list.json`,
  });

  if (!filePath) return null;

  const payload = buildCharaJsonPayload(characters);
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

function normalizeImportRow(raw: unknown): CharaJsonRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id = coerceId(obj.id) ?? coerceId(obj.CharacterId);
  if (id === null) return null;
  return { ...obj, id } as CharaJsonRow;
}

export async function pickCharaJsonImportPreview(): Promise<CharaJsonImportPreview | null> {
  const filePath = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Chara JSON", extensions: ["json"] }],
  });

  if (!filePath) return null;

  const text = await readTextFile(filePath);
  const parsed: unknown = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid JSON: expected an array");
  }

  const totalCount = parsed.length;
  const rows: CharaJsonRow[] = [];

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

function buildStringFieldObject(value: string): { StringBufferData: Buffer; Utf8String: string } {
  const utf8 = value ?? "";
  const encoded = Buffer.from(obfEncodeFromUtf8String(utf8));
  return { StringBufferData: encoded, Utf8String: utf8 };
}

export function applyCharaJsonImportToList(currentList: CharacterListOB, rows: CharaJsonRow[]): CharacterListOB {
  const nextRows: CharacterDataOB[] = rows.map((row) => {
    const id = row.id;
    const next = new CharacterDataOBClass(Buffer.alloc(0x2000), Buffer.alloc(0x1d8), id) as unknown as Record<string, unknown>;

    // Enforce id / CharacterId consistency.
    (next as any).CharacterId = id;

    for (const [key, value] of Object.entries(row)) {
      if (key === "id") continue;
      if (key === "CharacterId") continue;

      if (CHARACTER_STRING_FIELDS.includes(key as any)) {
        const s = typeof value === "string" ? value : "";
        next[key] = buildStringFieldObject(s);
        continue;
      }

      if (typeof value === "number" && key in next) {
        next[key] = value;
      }
    }

    // Ensure string fields exist even if missing from JSON.
    for (const key of CHARACTER_STRING_FIELDS) {
      if (!(key in next)) next[key] = buildStringFieldObject("");
      const v = next[key] as any;
      if (!v || typeof v !== "object" || typeof v.Utf8String !== "string" || !v.StringBufferData) {
        next[key] = buildStringFieldObject("");
      }
    }

    return next as unknown as CharacterDataOB;
  });

  return Object.assign(Object.create(Object.getPrototypeOf(currentList)), currentList, {
    CharacterData: nextRows,
    CharacterCount: nextRows.length,
  });
}

