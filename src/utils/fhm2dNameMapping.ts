import mappingDocument from "@/assets/fhm2d-name-map.generated.json";

import {
  normalizeFhm2dHashName,
  sanitizeFhm2dStructureName,
} from "./fhm2dStructureMetadata";

export type Fhm2dNameMappingConfidence =
  | "exact-meta-path"
  | "ob-unit-list"
  | "ob-param-unit-id"
  | "manual-research-note"
  | "manual-override"
  | "ob-dplcache-internal"
  | "ob-dplcache-fallback"
  | "inferred-ob-ai-string";

export interface Fhm2dNameMappingEntry {
  hashName: string;
  name: string;
  routeId: string | null;
  routePrefix: string | null;
  source: string;
  confidence: Fhm2dNameMappingConfidence | string;
  packagePath: string | null;
  gameRelativePath: string | null;
  categoryPath: string | null;
  aliases: string[];
  sourcePathCount: number;
  matchedPathCount: number;
  character?: {
    characterId: number;
    characterName?: string | null;
    pilotName?: string | null;
    seriesId?: string | null;
  } | null;
}

export interface Fhm2dNameSuggestionOptions {
  routeId?: string | null;
  routePrefix?: string | null;
  structureJsonPath?: string | null;
  sourceNameOrPath?: string | null;
  fallbackName?: string | null;
}

const ROUTE_PREFIX_BY_ROUTE_ID: Record<string, string> = {
  "stage.model": "001stage",
  "unit.model": "002chara",
  "unit.motion": "003motion",
  "unit.effect": "006effect",
  "unit.msc": "040msc",
  "unit.param": "041cpm",
  "unit.sound": "090sound",
  "list.character": "012list",
  "list.series": "012list",
  "list.stage": "012list",
  "gui.card-icons": "009gui",
  "gui.series-icons": "009gui",
  "gui.stage-icons": "009gui",
  "param.for-outgame": "041cpm",
  "msc.workspace": "040msc",
};

const KNOWN_ROUTE_PREFIXES = new Set(Object.values(ROUTE_PREFIX_BY_ROUTE_ID));

const mappingEntries = (mappingDocument.entries ?? []) as Fhm2dNameMappingEntry[];
let indexByHash: Map<string, Fhm2dNameMappingEntry[]> | null = null;

export const fhm2dNameMappingStats = mappingDocument.stats;

function buildIndex(): Map<string, Fhm2dNameMappingEntry[]> {
  const next = new Map<string, Fhm2dNameMappingEntry[]>();
  for (const entry of mappingEntries) {
    const hashName = normalizeFhm2dHashName(entry.hashName);
    if (!hashName) continue;
    const bucket = next.get(hashName) ?? [];
    bucket.push(entry);
    next.set(hashName, bucket);
  }
  return next;
}

function routePrefixForOptions(options?: Fhm2dNameSuggestionOptions): string | null {
  const direct = options?.routePrefix?.trim().toLowerCase();
  if (direct) return direct;
  const fromRoute = options?.routeId ? ROUTE_PREFIX_BY_ROUTE_ID[options.routeId] : null;
  if (fromRoute) return fromRoute;
  return inferFhm2dRoutePrefixFromPath(options?.structureJsonPath ?? options?.sourceNameOrPath);
}

export function inferFhm2dRoutePrefixFromPath(path: string | null | undefined): string | null {
  const normalized = path?.replace(/\\/g, "/").toLowerCase() ?? "";
  if (!normalized) return null;
  for (const segment of normalized.split("/")) {
    if (KNOWN_ROUTE_PREFIXES.has(segment)) return segment;
  }
  return null;
}

function routeScore(entry: Fhm2dNameMappingEntry, options?: Fhm2dNameSuggestionOptions): number {
  const routeId = options?.routeId?.trim();
  const routePrefix = routePrefixForOptions(options);
  if (routeId && entry.routeId === routeId) return 4;
  if (routePrefix && entry.routePrefix?.toLowerCase() === routePrefix) return 3;
  if (!routeId && !routePrefix) return 1;
  return 0;
}

function confidenceScore(entry: Fhm2dNameMappingEntry): number {
  if (entry.confidence === "exact-meta-path") return 5;
  if (entry.confidence === "ob-unit-list") return 4;
  if (entry.confidence === "ob-param-unit-id") return 3;
  if (entry.confidence === "manual-research-note" || entry.confidence === "manual-override") return 3;
  if (entry.confidence === "ob-dplcache-internal") return 2;
  if (entry.confidence === "inferred-ob-ai-string") return 1;
  if (entry.confidence === "ob-dplcache-fallback") return 0;
  return 0;
}

export function findFhm2dNameMapping(
  hashNameOrPath: string | null | undefined,
  options?: Fhm2dNameSuggestionOptions,
): Fhm2dNameMappingEntry | null {
  const hashName = normalizeFhm2dHashName(hashNameOrPath);
  if (!hashName) return null;

  indexByHash ??= buildIndex();
  const entries = indexByHash.get(hashName) ?? [];
  if (entries.length === 0) return null;

  const routeMatched = entries.filter((entry) => routeScore(entry, options) > 0);
  const candidates = routeMatched.length > 0 ? routeMatched : entries;
  return [...candidates].sort((a, b) => {
    const byRoute = routeScore(b, options) - routeScore(a, options);
    if (byRoute !== 0) return byRoute;
    const byConfidence = confidenceScore(b) - confidenceScore(a);
    if (byConfidence !== 0) return byConfidence;
    const byMatchedPaths = b.matchedPathCount - a.matchedPathCount;
    if (byMatchedPaths !== 0) return byMatchedPaths;
    return a.name.localeCompare(b.name);
  })[0] ?? null;
}

export function suggestFhm2dStructureName(
  hashNameOrPath: string | null | undefined,
  options?: Fhm2dNameSuggestionOptions,
): string | null {
  const entry = findFhm2dNameMapping(hashNameOrPath, options);
  if (entry) return sanitizeFhm2dStructureName(entry.name);
  const fallback = options?.fallbackName?.trim();
  return fallback ? sanitizeFhm2dStructureName(fallback) : null;
}
