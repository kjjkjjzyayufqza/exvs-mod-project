import { crc32Ieee } from "@/utils/crc32Ieee";
import { isApplyCollision, probeResourcePaths } from "./probeResourcePaths";
import type { ResourceRegistryCategory, ResourceRegistrySlot } from "./types";

export interface SuggestUniqueSeedParams {
  baseSeed: string;
  category: ResourceRegistryCategory;
  slot: ResourceRegistrySlot;
  obDplCachePath: string;
  obModPath: string;
  workspacePath: string;
  maxAttempts?: number;
}

export interface SeedSuggestion {
  seed: string;
  hashInt32: number;
  hashHex: string;
  obExists: boolean;
  modExists: boolean;
  workspaceExists: boolean;
  isClear: boolean;
}

export interface SuggestUniqueSeedResult {
  suggestions: SeedSuggestion[];
  exhausted: boolean;
  firstClear?: SeedSuggestion;
}

function buildCandidateSeeds(baseSeed: string, maxAttempts: number): string[] {
  const trimmed = baseSeed.trim();
  const candidates = [trimmed];
  for (let i = 1; i <= maxAttempts; i++) {
    candidates.push(`${trimmed}_${i}`);
  }
  return candidates;
}

export async function suggestUniqueSeed(
  params: SuggestUniqueSeedParams,
): Promise<SuggestUniqueSeedResult> {
  const maxAttempts = params.maxAttempts ?? 99;
  const candidates = buildCandidateSeeds(params.baseSeed, maxAttempts);
  const suggestions: SeedSuggestion[] = [];
  let firstClear: SeedSuggestion | undefined;

  for (const seed of candidates) {
    if (!seed) continue;
    const crc = crc32Ieee(seed);
    const probe = await probeResourcePaths({
      category: params.category,
      slot: params.slot,
      hashInt32: crc.hashInt32,
      obDplCachePath: params.obDplCachePath,
      obModPath: params.obModPath,
      workspacePath: params.workspacePath,
    });
    const isClear = !isApplyCollision(probe);
    const row: SeedSuggestion = {
      seed,
      hashInt32: crc.hashInt32,
      hashHex: crc.hashHex,
      obExists: probe.obExists,
      modExists: probe.modExists,
      workspaceExists: probe.workspaceExists,
      isClear,
    };
    suggestions.push(row);
    if (isClear && !firstClear) {
      firstClear = row;
      break;
    }
  }

  return {
    suggestions,
    exhausted: !firstClear,
    firstClear,
  };
}

export async function evaluateSeed(params: SuggestUniqueSeedParams & { seed: string }): Promise<SeedSuggestion> {
  const seed = params.seed.trim();
  const crc = crc32Ieee(seed);
  const probe = await probeResourcePaths({
    category: params.category,
    slot: params.slot,
    hashInt32: crc.hashInt32,
    obDplCachePath: params.obDplCachePath,
    obModPath: params.obModPath,
    workspacePath: params.workspacePath,
  });
  return {
    seed,
    hashInt32: crc.hashInt32,
    hashHex: crc.hashHex,
    obExists: probe.obExists,
    modExists: probe.modExists,
    workspaceExists: probe.workspaceExists,
    isClear: !isApplyCollision(probe),
  };
}
