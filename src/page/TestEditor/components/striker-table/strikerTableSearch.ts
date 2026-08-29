import { int32ToHexDisplay } from "@/module/commonFunc";
import type { StrikerTableRow } from "@/models/strikerTable";
import { unsignedId } from "@/models/strikerTable";

export interface StrikerTableRowRef {
  row: StrikerTableRow;
  idx: number;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/^0x/, "").replace(/[^a-z0-9.-]/g, "");
}

function numericSearchCandidates(value: number): string[] {
  const unsigned = unsignedId(value);
  const displayHex = int32ToHexDisplay(value);
  return [
    String(value),
    String(unsigned),
    displayHex,
    displayHex.replace(/\s+/g, ""),
    `0x${unsigned.toString(16)}`,
    unsigned.toString(16),
  ];
}

export function strikerTableRowMatchesSearch(row: StrikerTableRow, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const normalizedQuery = normalizeSearchText(trimmed);
  return [row.HostUnitId, row.Slot1, row.Slot2].some((value) =>
    numericSearchCandidates(value).some((candidate) =>
      normalizeSearchText(candidate).includes(normalizedQuery),
    ),
  );
}

export function filterStrikerTableRows(rows: StrikerTableRow[], query: string): StrikerTableRowRef[] {
  const mapped = rows.map((row, idx) => ({ row, idx }));
  if (!query.trim()) return mapped;
  return mapped.filter(({ row }) => strikerTableRowMatchesSearch(row, query));
}
