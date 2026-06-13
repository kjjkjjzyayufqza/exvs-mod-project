import { crc32Ieee } from "@/utils/crc32Ieee";

export const REGISTRY_VERSION = 1 as const;
export const GLOBAL_REGISTRY_STORE_KEY = "resourceRegistryGlobal";
export const WORKSPACE_REGISTRY_FILENAME = "resource_registry.json";

export type ResourceRegistryCategory = "stage" | "unit" | "prop" | "custom";

export type ResourceRegistrySlot = string;

export interface ResourceRegistryEntry {
  id: string;
  category: ResourceRegistryCategory;
  slot: ResourceRegistrySlot;
  displayName?: string;
  seed: string;
  hashInt32: number;
  hashHex: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceRegistryDocument {
  version: typeof REGISTRY_VERSION;
  entries: ResourceRegistryEntry[];
}

export type RegistrySourceLayer = "global" | "workspace";

export interface MergedRegistryEntry extends ResourceRegistryEntry {
  sourceLayer: RegistrySourceLayer;
}

export type ValidationIssueCode =
  | "hash_seed_mismatch"
  | "duplicate_hash"
  | "duplicate_seed"
  | "empty_seed"
  | "invalid_version";

export interface ValidationIssue {
  code: ValidationIssueCode;
  message: string;
  entryId?: string;
  relatedEntryId?: string;
}

export interface RegisterResult {
  ok: boolean;
  entry?: ResourceRegistryEntry;
  reason?: "duplicate_hash" | "empty_seed";
  existingEntryId?: string;
}

export const STAGE_HASH_SLOTS = ["fileName", "vsSD", "vsSL", "vsSn"] as const;

export const UNIT_SLOT_TO_FIELD_KEY: Record<string, string> = {
  model: "Model",
  effect: "Effect",
  sound: "Sound",
  param: "Param",
  msc: "Msc",
  motion: "Motion",
};

export const UNIT_FIELD_KEY_TO_SLOT: Record<string, string> = Object.fromEntries(
  Object.entries(UNIT_SLOT_TO_FIELD_KEY).map(([slot, field]) => [field, slot]),
);

export function createEmptyRegistryDocument(): ResourceRegistryDocument {
  return { version: REGISTRY_VERSION, entries: [] };
}

export function makeRegistryEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `reg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildRegistryEntryFromSeed(input: {
  category: ResourceRegistryCategory;
  slot: ResourceRegistrySlot;
  seed: string;
  displayName?: string;
  notes?: string;
  id?: string;
  createdAt?: string;
  updatedAt?: string;
}): ResourceRegistryEntry {
  const trimmedSeed = input.seed.trim();
  const crc = crc32Ieee(trimmedSeed);
  const now = new Date().toISOString();
  return {
    id: input.id ?? makeRegistryEntryId(),
    category: input.category,
    slot: input.slot,
    displayName: input.displayName?.trim() || undefined,
    seed: trimmedSeed,
    hashInt32: crc.hashInt32,
    hashHex: crc.hashHex,
    notes: input.notes?.trim() || undefined,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

export function mergeEntryKey(entry: Pick<ResourceRegistryEntry, "category" | "slot" | "seed">): string {
  return `${entry.category}\0${entry.slot}\0${entry.seed}`;
}

export function hashEntryKey(
  entry: Pick<ResourceRegistryEntry, "category" | "slot" | "hashInt32">,
): string {
  return `${entry.category}\0${entry.slot}\0${entry.hashInt32}`;
}
