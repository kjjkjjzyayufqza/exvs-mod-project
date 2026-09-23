import { MISSION_MAPS } from "@/page/TestEditor/components/triad-route/missionMaps";
import type { AliasKind, GraphAlias, MissionGraph } from "./graph";

export interface ResourceOption {
  kind: AliasKind;
  value: number;
  label: string;
  source: "alias" | "builtin" | "catalog";
  evidence: "named" | "not-checked";
  /** Extra search text. Not shown as the committed hash. */
  keywords?: string;
}

export interface ResourceCatalog {
  maps: ResourceOption[];
  bgm: ResourceOption[];
  units: ResourceOption[];
  messages: ResourceOption[];
}

export const EMPTY_CATALOG: ResourceCatalog = { maps: [], bgm: [], units: [], messages: [] };

/** Cut-in id from embedded A-30-1 `waves[].message.id`. E1 template source, not in-game. */
export const TEMPLATE_MESSAGE_HASH = 0x2655484b;

export function builtinCatalog(): ResourceCatalog {
  return {
    maps: MISSION_MAPS.map((map) => ({
      kind: "map", value: map.hash >>> 0, label: `${map.label} / ${map.name}`, source: "builtin", evidence: "named",
    })),
    bgm: [],
    units: [],
    messages: [{
      kind: "message", value: TEMPLATE_MESSAGE_HASH, label: "A-30-1 cut-in (embedded template)", source: "builtin", evidence: "named",
    }],
  };
}

export function mergeCatalogs(...catalogs: ResourceCatalog[]): ResourceCatalog {
  const merge = (kind: keyof ResourceCatalog) => {
    const byValue = new Map<number, ResourceOption>();
    for (const catalog of catalogs) {
      for (const option of catalog[kind]) byValue.set(option.value >>> 0, option);
    }
    return [...byValue.values()];
  };
  return { maps: merge("maps"), bgm: merge("bgm"), units: merge("units"), messages: merge("messages") };
}

export function formatHash(value: number): string {
  return `0x${(value >>> 0).toString(16)}`;
}

export function parseHashInput(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = trimmed.toLowerCase().startsWith("0x") ? Number.parseInt(trimmed, 16) : Number(trimmed);
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff ? value : null;
}

export interface CharacterListUnitEntry {
  /** Character List card ID. This is the mission slot unit id. */
  entryId: number;
  characterName: string;
  pilotNameShort?: string;
  pilotNameFull?: string;
  variantDisplayNameDefault?: string;
}

/**
 * Character-list rows for the mission Unit ID picker.
 * The committed value is `entryId`. Pilot and variant names are search aliases.
 */
export function characterEntriesToUnitOptions(entries: readonly CharacterListUnitEntry[]): ResourceOption[] {
  const byId = new Map<number, ResourceOption>();
  for (const entry of entries) {
    const value = entry.entryId >>> 0;
    if (!value) continue;
    const name = entry.characterName.trim();
    const extra = [entry.pilotNameShort, entry.pilotNameFull, entry.variantDisplayNameDefault]
      .map((part) => part?.trim() ?? "")
      .filter(Boolean);
    const next: ResourceOption = {
      kind: "unit",
      value,
      label: name || String(value),
      source: "catalog",
      evidence: "named",
      keywords: [name, ...extra, String(value), hashKeywords(value)].filter(Boolean).join(" "),
    };
    const prior = byId.get(value);
    if (!prior) {
      byId.set(value, next);
      continue;
    }
    byId.set(value, {
      ...prior,
      label: prior.label === String(value) && name ? name : prior.label,
      keywords: `${prior.keywords ?? ""} ${next.keywords ?? ""}`,
    });
  }
  return [...byId.values()].sort((a, b) => (a.value >>> 0) - (b.value >>> 0));
}

export interface BgmListCueEntry {
  /** HUD `cueHash`. This is the value `sys_0(0x33f)` stores. */
  cueHash: number;
  /** HUD row id. Searchable, not the mission BGM hash. */
  musicId: number;
  title: string;
  titleWithNotePrefix?: string;
}

/**
 * HUD BGM-list rows for the mission Opening BGM picker.
 * The committed value is `cueHash`. `musicId` is only a search alias.
 */
export function bgmEntriesToOptions(entries: readonly BgmListCueEntry[]): ResourceOption[] {
  const byHash = new Map<number, ResourceOption>();
  for (const entry of entries) {
    const value = entry.cueHash >>> 0;
    if (!value) continue;
    const title = entry.title.trim();
    const note = entry.titleWithNotePrefix?.trim() ?? "";
    const musicId = entry.musicId >>> 0;
    const next: ResourceOption = {
      kind: "bgm",
      value,
      label: title || formatHash(value),
      source: "catalog",
      evidence: "named",
      keywords: [title, note, musicId ? String(musicId) : "", hashKeywords(value)].filter(Boolean).join(" "),
    };
    const prior = byHash.get(value);
    if (!prior) {
      byHash.set(value, next);
      continue;
    }
    byHash.set(value, {
      ...prior,
      label: prior.label === formatHash(value) && title ? title : prior.label,
      keywords: `${prior.keywords ?? ""} ${next.keywords ?? ""}`,
    });
  }
  return [...byHash.values()];
}

export interface StageListMapEntry {
  /** Param id table. This is `sys_0(0x40e)` and the stage-list card "ID". */
  entryId: number;
  /** Offset 0x00. A small lookup key, not the mission map hash. */
  recordLookupId: number;
  name: string;
  /** Geometry pack hash. Searchable, not the mission map hash. */
  fileName: number;
}

function hashKeywords(value: number): string {
  const raw = (value >>> 0).toString(16);
  const padded = raw.padStart(8, "0");
  return `0x${raw} 0x${padded} ${value >>> 0}`;
}

/**
 * Stage-list rows for the mission Map hash picker.
 * The committed value is `entryId` (`sys_0(0x40e)`, the stage-list card ID).
 * `recordLookupId` and `fileName` are search aliases only.
 */
export function stageEntriesToMapOptions(entries: readonly StageListMapEntry[]): ResourceOption[] {
  const byHash = new Map<number, ResourceOption>();
  for (const entry of entries) {
    const value = entry.entryId >>> 0;
    const name = entry.name.trim();
    const next: ResourceOption = {
      kind: "map",
      value,
      label: name || formatHash(value),
      source: "catalog",
      evidence: "named",
      keywords: `${name} ${hashKeywords(value)} ${hashKeywords(entry.recordLookupId)} ${hashKeywords(entry.fileName)}`,
    };
    const prior = byHash.get(value);
    if (!prior) {
      byHash.set(value, next);
      continue;
    }
    byHash.set(value, {
      ...prior,
      label: prior.label === formatHash(value) && name ? name : prior.label,
      keywords: `${prior.keywords ?? ""} ${next.keywords ?? ""}`,
    });
  }
  return [...byHash.values()];
}

/** Keep the built-in mission names, and add stage-list rows the 19-map list does not have. */
export function mergeMissionMapOptions(builtin: readonly ResourceOption[], stage: readonly ResourceOption[]): ResourceOption[] {
  const byValue = new Map<number, ResourceOption>();
  for (const option of builtin) byValue.set(option.value >>> 0, option);
  for (const option of stage) {
    const value = option.value >>> 0;
    const prior = byValue.get(value);
    if (!prior) {
      byValue.set(value, option);
      continue;
    }
    const stageName = option.label;
    const label = prior.label.toLowerCase().includes(stageName.toLowerCase())
      ? prior.label
      : `${prior.label} · ${stageName}`;
    byValue.set(value, {
      ...prior,
      label,
      keywords: [prior.keywords, option.keywords, prior.label, stageName].filter(Boolean).join(" "),
    });
  }
  return [...byValue.values()];
}

export function resourceOptions(graph: MissionGraph, kind: AliasKind, catalog: ResourceCatalog = builtinCatalog()): ResourceOption[] {
  const extra = kind === "map" ? catalog.maps : kind === "bgm" ? catalog.bgm : kind === "unit" ? catalog.units : catalog.messages;
  const byValue = new Map<number, ResourceOption>();
  for (const option of extra) byValue.set(option.value >>> 0, option);
  for (const alias of graph.aliases.filter((entry) => entry.kind === kind)) {
    const prior = byValue.get(alias.value >>> 0);
    byValue.set(alias.value >>> 0, {
      kind,
      value: alias.value >>> 0,
      label: alias.alias,
      source: "alias",
      evidence: "named",
      keywords: prior?.keywords,
    });
  }
  const options = [...byValue.values()];
  if (kind === "unit") return options.sort((a, b) => (a.value >>> 0) - (b.value >>> 0));
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export function describeHash(graph: MissionGraph, kind: AliasKind, value: number, catalog: ResourceCatalog = builtinCatalog()): ResourceOption {
  const found = resourceOptions(graph, kind, catalog).find((option) => option.value === (value >>> 0));
  return found ?? { kind, value: value >>> 0, label: formatHash(value), source: "catalog", evidence: "not-checked" };
}

export function upsertAlias(graph: MissionGraph, next: GraphAlias): MissionGraph {
  const aliases = graph.aliases.filter((entry) => !(entry.kind === next.kind && entry.value === next.value));
  return { ...graph, aliases: [...aliases, next] };
}
