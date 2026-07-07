import type { CharacterIdTableData } from "@/models/characterIdTable";
import { sanitizeFhm2dStructureName } from "@/utils/fhm2dStructureMetadata";
import { suggestFhm2dStructureName } from "@/utils/fhm2dNameMapping";
import { int32ToHashHex } from "./assetRef";

export interface BulkMscExtractCandidate {
  rawValue: number;
  hashHex: string;
  packName: string;
  characterIds: number[];
  rowIndexes: number[];
}

export interface BulkMscExtractPlan {
  candidates: BulkMscExtractCandidate[];
  totalRows: number;
  nonZeroRows: number;
  skippedZeroRows: number;
  duplicateRows: number;
}

function defaultMscPackName(hashHex: string): string {
  return sanitizeFhm2dStructureName(`Msc_${hashHex.replace(/^0x/i, "")}`);
}

export function buildBulkMscExtractPlan(
  rows: readonly CharacterIdTableData[],
): BulkMscExtractPlan {
  const candidatesByHash = new Map<string, BulkMscExtractCandidate>();
  let nonZeroRows = 0;
  let duplicateRows = 0;

  rows.forEach((row, rowIndex) => {
    if (row.Msc === 0) {
      return;
    }

    nonZeroRows += 1;
    const hashHex = int32ToHashHex(row.Msc);
    const current = candidatesByHash.get(hashHex);
    if (current) {
      current.characterIds.push(row.CharacterId);
      current.rowIndexes.push(rowIndex);
      duplicateRows += 1;
      return;
    }

    const fallbackName = defaultMscPackName(hashHex);
    candidatesByHash.set(hashHex, {
      rawValue: row.Msc,
      hashHex,
      packName:
        suggestFhm2dStructureName(hashHex, {
          routeId: "unit.msc",
          fallbackName,
        }) ?? fallbackName,
      characterIds: [row.CharacterId],
      rowIndexes: [rowIndex],
    });
  });

  return {
    candidates: [...candidatesByHash.values()],
    totalRows: rows.length,
    nonZeroRows,
    skippedZeroRows: rows.length - nonZeroRows,
    duplicateRows,
  };
}
