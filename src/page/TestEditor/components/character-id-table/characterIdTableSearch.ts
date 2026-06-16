import { int32ToHexDisplay } from "@/module/commonFunc";
import type { CharacterIdTableData } from "@/models/characterIdTable";

import { int32ToHashHex } from "./assetRef";

export interface CharacterIdTableRowRef {
  row: CharacterIdTableData;
  idx: number;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/^0x/, "").replace(/[^a-z0-9.-]/g, "");
}

function numericSearchCandidates(value: number): string[] {
  const unsigned = value >>> 0;
  const hashHex = int32ToHashHex(value);
  const displayHex = int32ToHexDisplay(value);
  const leBytes = new Uint8Array(4);
  const view = new DataView(leBytes.buffer);
  view.setUint32(0, unsigned, true);
  const rawLeHex = Array.from(leBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");

  return [
    String(value),
    String(unsigned),
    hashHex,
    hashHex.slice(2),
    displayHex,
    displayHex.replace(/\s+/g, ""),
    rawLeHex,
    rawLeHex.replace(/\s+/g, ""),
  ];
}

export function characterIdTableRowMatchesSearch(row: CharacterIdTableData, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;

  const normalizedQuery = normalizeSearchText(trimmed);
  const fieldValues = [
    row.CharacterId,
    row.Model,
    row.Effect,
    row.Sound,
    row.Param,
    row.Msc,
    row.Motion,
  ];

  return fieldValues.some((value) =>
    numericSearchCandidates(value).some((candidate) =>
      normalizeSearchText(candidate).includes(normalizedQuery),
    ),
  );
}

export function filterCharacterIdTableRows(
  rows: CharacterIdTableData[],
  query: string,
): CharacterIdTableRowRef[] {
  const mapped = rows.map((row, idx) => ({ row, idx }));
  if (!query.trim()) return mapped;
  return mapped.filter(({ row }) => characterIdTableRowMatchesSearch(row, query));
}
