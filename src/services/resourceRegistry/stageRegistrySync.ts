import type { StageListEntry } from "@/models/stageListEntry";
import { int32ToHashHex } from "@/page/TestEditor/components/character-id-table/assetRef";
import { crc32Ieee } from "@/utils/crc32Ieee";
import {
  STAGE_HASH_SLOTS,
  makeRegistryEntryId,
  type MergedRegistryEntry,
  type ResourceRegistryEntry,
} from "./types";

export const STAGE_ENTRY_ID_NOTE_PREFIX = "stage entryId=";

export type StageHashSlot = (typeof STAGE_HASH_SLOTS)[number];

export function formatStageEntryIdNote(entryId: number): string {
  return `${STAGE_ENTRY_ID_NOTE_PREFIX}${entryId}`;
}

export function findStageRegistryEntriesByEntryId(
  entries: MergedRegistryEntry[],
  entryId: number,
): MergedRegistryEntry[] {
  const note = formatStageEntryIdNote(entryId);
  return entries.filter((entry) => entry.category === "stage" && entry.notes === note);
}

export interface StageRegistrySlotInput {
  slot: StageHashSlot;
  seed: string;
  hashInt32: number;
  seedVerified: boolean;
}

export function sanitizeStageSeedBase(name: string): string {
  const sanitized = name
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized.toLowerCase();
}

export function defaultStageSlotSeed(stage: StageListEntry, slot: StageHashSlot): string {
  const slug = sanitizeStageSeedBase(stage.name || "") || `stage_${stage.entryId}`;
  return `${slug}__${slot}`;
}

export function isSeedVerifiedForHash(seed: string, hashInt32: number): boolean {
  const trimmed = seed.trim();
  if (!trimmed) {
    return false;
  }
  return crc32Ieee(trimmed).hashInt32 === hashInt32;
}

export function lookupSeedByHashLoose(
  entries: MergedRegistryEntry[],
  hashInt32: number,
  slot: StageHashSlot,
): string | undefined {
  const sameSlot = entries.find(
    (entry) => entry.category === "stage" && entry.slot === slot && entry.hashInt32 === hashInt32,
  );
  if (sameSlot?.seed.trim()) {
    return sameSlot.seed.trim();
  }

  const anyStageSlot = entries.find(
    (entry) => entry.category === "stage" && entry.hashInt32 === hashInt32,
  );
  if (anyStageSlot?.seed.trim()) {
    return anyStageSlot.seed.trim();
  }

  const anyCategory = entries.find((entry) => entry.hashInt32 === hashInt32);
  return anyCategory?.seed.trim() || undefined;
}

export function buildRegistryEntryFromStageHash(input: {
  category: "stage";
  slot: StageHashSlot;
  hashInt32: number;
  seed: string;
  displayName?: string;
  notes?: string;
}): ResourceRegistryEntry {
  const trimmedSeed = input.seed.trim();
  const hashHex = int32ToHashHex(input.hashInt32);
  const now = new Date().toISOString();
  return {
    id: makeRegistryEntryId(),
    category: input.category,
    slot: input.slot,
    displayName: input.displayName?.trim() || undefined,
    seed: trimmedSeed,
    hashInt32: input.hashInt32,
    hashHex,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function resolveStageSlotSeeds(
  stage: StageListEntry,
  mergedEntries: MergedRegistryEntry[],
  seedDrafts: Partial<Record<StageHashSlot, string>>,
): StageRegistrySlotInput[] {
  const slots: StageRegistrySlotInput[] = [];

  for (const slot of STAGE_HASH_SLOTS) {
    const hashInt32 = stage[slot] ?? 0;
    if (!hashInt32) {
      continue;
    }

    const draft = seedDrafts[slot]?.trim();
    const known = lookupSeedByHashLoose(mergedEntries, hashInt32, slot);
    const seed = draft || known || defaultStageSlotSeed(stage, slot);
    slots.push({
      slot,
      seed,
      hashInt32,
      seedVerified: isSeedVerifiedForHash(seed, hashInt32),
    });
  }

  return slots;
}

export function buildStageRegistryEntries(
  stage: StageListEntry,
  slots: StageRegistrySlotInput[],
): ResourceRegistryEntry[] {
  const entryId = stage.entryId;
  const stageLabel = stage.name?.trim() || `Stage ${entryId}`;
  const note = formatStageEntryIdNote(entryId);

  return slots.map(({ slot, seed, hashInt32 }) =>
    buildRegistryEntryFromStageHash({
      category: "stage",
      slot,
      hashInt32,
      seed,
      displayName: `${stageLabel} / ${slot}`,
      notes: note,
    }),
  );
}
