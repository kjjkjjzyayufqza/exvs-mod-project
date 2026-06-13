import {
  buildRegistryEntryFromSeed,
  type ResourceRegistryDocument,
  type ResourceRegistryEntry,
  UNIT_SLOT_TO_FIELD_KEY,
} from "./types";

interface CustomUnitRow {
  id?: number;
  name?: string;
  gameName?: string;
  modelName?: string;
  aleoName?: string;
  nu3bankName?: string;
  ammoName?: string;
  mscName?: string;
  animeName?: string;
  Model?: number;
  Effect?: number;
  Sound?: number;
  Param?: number;
  Msc?: number;
  Motion?: number;
}

const UNIT_IMPORT_SLOTS: Array<{
  slot: keyof typeof UNIT_SLOT_TO_FIELD_KEY;
  seedKey: keyof CustomUnitRow;
  hashKey: keyof CustomUnitRow;
}> = [
  { slot: "model", seedKey: "modelName", hashKey: "Model" },
  { slot: "effect", seedKey: "aleoName", hashKey: "Effect" },
  { slot: "sound", seedKey: "nu3bankName", hashKey: "Sound" },
  { slot: "param", seedKey: "ammoName", hashKey: "Param" },
  { slot: "msc", seedKey: "mscName", hashKey: "Msc" },
  { slot: "motion", seedKey: "animeName", hashKey: "Motion" },
];

export interface CustomUnitImportResult {
  entries: ResourceRegistryEntry[];
  warnings: string[];
}

export function importCustomUnitRows(rows: CustomUnitRow[]): CustomUnitImportResult {
  const entries: ResourceRegistryEntry[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    const displayName = typeof row.name === "string" ? row.name : undefined;
    const unitLabel = displayName ?? `unit-${row.id ?? "?"}`;

    for (const mapping of UNIT_IMPORT_SLOTS) {
      const seedValue = row[mapping.seedKey];
      if (typeof seedValue !== "string" || !seedValue.trim()) {
        continue;
      }
      const entry = buildRegistryEntryFromSeed({
        category: "unit",
        slot: mapping.slot,
        seed: seedValue,
        displayName: `${unitLabel} / ${mapping.slot}`,
        notes: row.id != null ? `custom_unit id=${row.id}` : undefined,
      });

      const storedHash = row[mapping.hashKey];
      if (typeof storedHash === "number" && storedHash !== entry.hashInt32) {
        warnings.push(
          `Hash mismatch for ${unitLabel} ${mapping.slot}: stored ${storedHash}, seed "${seedValue}" -> ${entry.hashInt32}. Trusting seed.`,
        );
      }

      entries.push(entry);
    }
  }

  return { entries, warnings };
}

export function mergeImportedEntries(
  workspaceDoc: ResourceRegistryDocument,
  imported: ResourceRegistryEntry[],
): ResourceRegistryDocument {
  const next: ResourceRegistryDocument = {
    version: 1,
    entries: [...workspaceDoc.entries],
  };
  for (const entry of imported) {
    const index = next.entries.findIndex(
      (row) =>
        row.category === entry.category &&
        row.slot === entry.slot &&
        row.seed === entry.seed,
    );
    if (index >= 0) {
      next.entries[index] = { ...entry, id: next.entries[index].id, updatedAt: new Date().toISOString() };
    } else {
      next.entries.push(entry);
    }
  }
  return next;
}
