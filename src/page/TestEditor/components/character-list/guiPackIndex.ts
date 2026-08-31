import type { Fhm2dNameMappingEntry } from "@/utils/fhm2dNameMapping";
import { findFhm2dNameMapping } from "@/utils/fhm2dNameMapping";
import { sanitizeFhm2dStructureName } from "@/utils/fhm2dStructureMetadata";
import { formatGuiHashHex } from "./guiClonePlan";

export const CHARACTER_GUI_HASH_FIELDS = [
  "lmbCutIn",
  "lmbPilotClothing",
  "lmbBoost",
  "exPilotClothingLmbHash",
  "msIghR",
  "msVsR",
  "msVsL",
  "msTracker",
  "msMsL",
  "msMsS",
  "msMn",
  "msCrs",
  "vsPL",
  "vsPLC02",
  "vsPLC03",
  "vsPLC04",
  "vsPR",
  "vsPRC02",
  "vsPRC03",
  "vsPRC04",
  "scP",
] as const;

export type CharacterGuiHashField = (typeof CHARACTER_GUI_HASH_FIELDS)[number];

export type WorkspaceGuiPack = {
  hash: number;
  hashName: string;
  name: string;
  folderPath: string;
  structureJsonPath: string;
  workspaceRelative: string;
  previewNutexbPath?: string | null;
};

export type GuiPackPickerItem = {
  hash: number;
  label: string;
  secondaryText: string;
  folderPath: string | null;
  packagePath: string | null;
  nutexbPath: string | null;
  source: "workspace" | "name-map" | "character-list";
};

export type GuiPackExtractPlan = {
  hash: number;
  packagePath: string;
  structureName: string;
};

const GUI_PATH_MARKERS = [
  "flash/pilot",
  "image/pilot",
  "flash/navi",
  "image/navi",
] as const;

const GUI_NAME_PREFIX_RE = /^(st_p_|ex_p_|vs_p_|sc_p_|navi_)/i;

const MS_GUI_PREFIX_TO_PACKAGE_BASE = {
  ms_igh_r_: "009gui/image/ms/ms_igh_r",
  ms_vs_r_: "009gui/image/ms/ms_vs_r",
  ms_vs_l_: "009gui/image/ms/ms_vs_l",
  ms_tracker_: "009gui",
  ms_ms_l_: "009gui/image/ms/ms_ms_l",
  ms_ms_s_: "009gui/image/ms/ms_ms_s",
  ms_mn_: "009gui/image/ms/ms_mn",
  ms_crs_: "009gui/image/ms/ms_crs",
} as const;

const MS_GUI_FIELD_PREFIXES: Record<string, keyof typeof MS_GUI_PREFIX_TO_PACKAGE_BASE> = {
  msIghR: "ms_igh_r_",
  msVsR: "ms_vs_r_",
  msVsL: "ms_vs_l_",
  msTracker: "ms_tracker_",
  msMsL: "ms_ms_l_",
  msMsS: "ms_ms_s_",
  msMn: "ms_mn_",
  msCrs: "ms_crs_",
};

const MS_GUI_PREFIXES = Object.keys(MS_GUI_PREFIX_TO_PACKAGE_BASE) as Array<
  keyof typeof MS_GUI_PREFIX_TO_PACKAGE_BASE
>;

const MS_GUI_IMAGE_PATH_MARKERS = MS_GUI_PREFIXES.filter((prefix) => prefix !== "ms_tracker_").map(
  (prefix) => `image/ms/${prefix.slice(0, -1)}/`,
);

function normalizeGuiRelativePath(path: string): string {
  let normalized = path.replace(/\\/g, "/").trim().replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
  if (normalized.startsWith("app/data/")) normalized = normalized.slice("app/data/".length);
  if (normalized.startsWith("x64/")) normalized = normalized.slice("x64/".length);
  if (normalized.startsWith("009gui/")) normalized = normalized.slice("009gui/".length);
  return normalized;
}

function isGuiPackName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return GUI_NAME_PREFIX_RE.test(normalized) || MS_GUI_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isMsGuiPath(path: string): boolean {
  const relative = normalizeGuiRelativePath(path);
  if (!relative) return false;
  if (relative.startsWith("ms_tracker_")) return true;
  return MS_GUI_IMAGE_PATH_MARKERS.some((marker) => relative.includes(marker));
}

export function isCharacterGuiHashField(name: string): name is CharacterGuiHashField {
  return (CHARACTER_GUI_HASH_FIELDS as readonly string[]).includes(name);
}

export function normalizeGuiHash(value: number): number {
  return value >>> 0;
}

export function vs2GuiExtractRelative(packagePath: string, donorName: string): string {
  const normalized = packagePath.replace(/\\/g, "/").trim().replace(/^\/+/, "");
  const withoutRoot = normalized.startsWith("009gui/") ? normalized.slice("009gui/".length) : normalized;
  const segments = withoutRoot.split("/").filter(Boolean);
  if (segments.length === 0) return donorName;
  const last = segments[segments.length - 1];
  const prev = segments[segments.length - 2];
  if (segments.length >= 2 && last === donorName && prev === donorName) {
    segments.pop();
  } else if (last !== donorName) {
    return `${segments.join("/")}/${donorName}`;
  }
  return segments.join("/");
}

export function expectedWorkspaceGuiFolder(
  workspaceRoot: string,
  packagePath: string,
  donorName: string,
): string {
  const root = workspaceRoot.replace(/[\\/]+$/, "");
  const relative = vs2GuiExtractRelative(packagePath, donorName);
  return `${root}\\009gui\\${relative.replace(/\//g, "\\")}`;
}

export function isPilotOrNaviExtract(workspaceRelative: string, name: string): boolean {
  const path = normalizeGuiRelativePath(workspaceRelative);
  if (GUI_PATH_MARKERS.some((marker) => path.includes(marker))) return true;
  if (isMsGuiPath(path)) return true;
  return isGuiPackName(name);
}

export function isGuiRelatedNameMapping(entry: Fhm2dNameMappingEntry): boolean {
  const path = normalizeGuiRelativePath(entry.packagePath ?? entry.gameRelativePath ?? "");
  if (GUI_PATH_MARKERS.some((marker) => path.includes(marker))) return true;
  if (isMsGuiPath(path)) return true;
  return isGuiPackName(entry.name);
}

export function fieldNamePrefix(fieldKey: string): string | null {
  if (fieldKey === "lmbCutIn" || fieldKey === "lmbPilotClothing") return "st_p_";
  if (fieldKey === "lmbBoost" || fieldKey === "exPilotClothingLmbHash") return "ex_p_";
  const msPrefix = MS_GUI_FIELD_PREFIXES[fieldKey];
  if (msPrefix) return msPrefix;
  if (fieldKey.startsWith("vsPL")) return "vs_p_l_";
  if (fieldKey.startsWith("vsPR")) return "vs_p_r_";
  if (fieldKey === "scP") return "sc_p_";
  if (fieldKey.startsWith("navi") || /resourceHash/i.test(fieldKey)) return "navi_";
  return null;
}

function rankingName(item: GuiPackPickerItem): string {
  return item.label || "";
}

export function fallbackGuiPackagePath(fieldKey: string, structureName: string): string {
  const name = sanitizeFhm2dStructureName(structureName) || "gui_pack";
  if (fieldKey.startsWith("vsPL") || name.startsWith("vs_p_l_")) {
    return `009gui/image/pilot/vs_p_l/${name}`;
  }
  if (fieldKey.startsWith("vsPR") || name.startsWith("vs_p_r_")) {
    return `009gui/image/pilot/vs_p_r/${name}`;
  }
  if (fieldKey === "scP" || name.startsWith("sc_p_")) {
    return `009gui/image/pilot/sc_p/${name}`;
  }
  if (fieldKey === "lmbCutIn" || fieldKey === "lmbPilotClothing" || name.startsWith("st_p_")) {
    return `009gui/flash/pilot/${name}`;
  }
  if (fieldKey === "lmbBoost" || fieldKey === "exPilotClothingLmbHash" || name.startsWith("ex_p_")) {
    return `009gui/flash/pilot/${name}`;
  }
  if (name.startsWith("navi_bt_s_") || /naviBtS/i.test(fieldKey)) {
    return `009gui/image/navi/navi_bt_s/${name}`;
  }
  if (name.startsWith("navi_pl_s_") || /naviPlS/i.test(fieldKey)) {
    return `009gui/image/navi/navi_pl_s/${name}`;
  }
  if (name.startsWith("navi_bt_") || /naviBt/i.test(fieldKey)) {
    return `009gui/flash/navi/battle/${name}`;
  }
  if (name.startsWith("navi_pl_") || /naviPl|resourceHash/i.test(fieldKey)) {
    return `009gui/flash/navi/player/${name}`;
  }
  const msPrefix = MS_GUI_FIELD_PREFIXES[fieldKey] ?? MS_GUI_PREFIXES.find((prefix) => name.startsWith(prefix));
  if (msPrefix) {
    return `${MS_GUI_PREFIX_TO_PACKAGE_BASE[msPrefix]}/${name}`;
  }
  return `009gui/${name}`;
}

export function planGuiPackExtract(
  hash: number,
  fieldKey: string,
  items: readonly GuiPackPickerItem[],
): GuiPackExtractPlan | null {
  const normalized = normalizeGuiHash(hash);
  if (normalized === 0) return null;
  const item = items.find((entry) => itemHash(entry) === normalized);
  if (item?.folderPath) return null;

  const mapping = findFhm2dNameMapping(formatGuiHashHex(normalized), { routePrefix: "009gui" });
  const labelName =
    item && item.source !== "character-list" ? item.label : "";
  const structureName = sanitizeFhm2dStructureName(
    mapping?.name ||
      labelName ||
      `${fieldNamePrefix(fieldKey) ?? "gui_"}${formatGuiHashHex(normalized).slice(2).toLowerCase()}`,
  );
  if (!structureName) return null;
  const packagePath =
    (item?.packagePath && item.packagePath.trim()) ||
    mapping?.packagePath ||
    fallbackGuiPackagePath(fieldKey, structureName);
  return { hash: normalized, packagePath, structureName };
}

function itemHash(item: GuiPackPickerItem): number {
  return normalizeGuiHash(item.hash);
}

function matchesFieldPrefix(item: GuiPackPickerItem, prefix: string): boolean {
  const normalizedPrefix = prefix.toLowerCase();
  const label = rankingName(item).toLowerCase();
  if (label.startsWith(normalizedPrefix)) return true;

  const normalizedPath = normalizeGuiRelativePath(item.packagePath ?? "");
  if (!normalizedPath) return false;
  if (normalizedPath.startsWith(normalizedPrefix)) return true;

  const pathToken = normalizedPrefix.endsWith("_") ? normalizedPrefix.slice(0, -1) : normalizedPrefix;
  if (normalizedPath.includes(`/${pathToken}/`) || normalizedPath.endsWith(`/${pathToken}`)) {
    return true;
  }

  const packageLeaf = normalizedPath.split("/").filter(Boolean).pop();
  return packageLeaf?.startsWith(normalizedPrefix) ?? false;
}

export function filterGuiPackPickerItems(
  fieldKey: string,
  items: readonly GuiPackPickerItem[],
  selectedValue?: number,
): GuiPackPickerItem[] {
  const prefix = fieldNamePrefix(fieldKey);
  if (!prefix) return [...items];
  const selectedHash = selectedValue === undefined ? null : normalizeGuiHash(selectedValue);
  return items.filter((item) => itemHash(item) === selectedHash || matchesFieldPrefix(item, prefix));
}

export function sortGuiPackPickerItems(fieldKey: string, items: GuiPackPickerItem[]): GuiPackPickerItem[] {
  const prefix = fieldNamePrefix(fieldKey);
  return [...items].sort((a, b) => {
    if (prefix) {
      const aMatch = rankingName(a).toLowerCase().startsWith(prefix) ? 0 : 1;
      const bMatch = rankingName(b).toLowerCase().startsWith(prefix) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
    }
    const byFolder = Number(Boolean(b.folderPath)) - Number(Boolean(a.folderPath));
    if (byFolder !== 0) return byFolder;
    return rankingName(a).localeCompare(rankingName(b));
  });
}

export function mergeGuiPackPickerItems(input: {
  workspacePacks: WorkspaceGuiPack[];
  nameMappings: readonly Fhm2dNameMappingEntry[];
  characterUsages: Array<{ hash: number; label: string }>;
}): GuiPackPickerItem[] {
  const byHash = new Map<number, GuiPackPickerItem>();

  const upsert = (item: GuiPackPickerItem) => {
    const hash = normalizeGuiHash(item.hash);
    if (hash === 0) return;
    const existing = byHash.get(hash);
    if (!existing) {
      byHash.set(hash, { ...item, hash });
      return;
    }
    if (item.source === "workspace") {
      existing.folderPath = item.folderPath;
      existing.label = item.label || existing.label;
      existing.source = "workspace";
      existing.secondaryText = item.secondaryText;
      existing.nutexbPath = item.nutexbPath;
      existing.packagePath = item.packagePath || existing.packagePath;
    } else if (!existing.folderPath && item.folderPath) {
      existing.folderPath = item.folderPath;
    }
    if (!existing.packagePath && item.packagePath) {
      existing.packagePath = item.packagePath;
    }
    if (!existing.nutexbPath && item.nutexbPath) {
      existing.nutexbPath = item.nutexbPath;
    }
    if (item.source === "character-list") {
      existing.secondaryText = existing.secondaryText
        ? `${existing.secondaryText} · ${item.label}`
        : item.label;
    }
  };

  for (const mapping of input.nameMappings) {
    if (!isGuiRelatedNameMapping(mapping)) continue;
    const hash = parseHashHex(mapping.hashName);
    if (hash === null) continue;
    upsert({
      hash,
      label: mapping.name,
      secondaryText: formatGuiHashHex(hash),
      folderPath: null,
      packagePath: mapping.packagePath,
      nutexbPath: null,
      source: "name-map",
    });
  }

  for (const pack of input.workspacePacks) {
    if (!isPilotOrNaviExtract(pack.workspaceRelative, pack.name)) continue;
    upsert({
      hash: pack.hash,
      label: pack.name || pack.workspaceRelative,
      secondaryText: `${formatGuiHashHex(pack.hash)}  009gui/${pack.workspaceRelative}`,
      folderPath: pack.folderPath,
      packagePath: `009gui/${pack.workspaceRelative.replace(/\\/g, "/")}`,
      nutexbPath: pack.previewNutexbPath ?? null,
      source: "workspace",
    });
  }

  for (const usage of input.characterUsages) {
    upsert({
      hash: usage.hash,
      label: usage.label,
      secondaryText: formatGuiHashHex(usage.hash),
      folderPath: null,
      packagePath: null,
      nutexbPath: null,
      source: "character-list",
    });
  }

  return [...byHash.values()];
}

export function collectCharacterGuiUsages(
  entries: Array<Record<string, unknown>>,
): Array<{ hash: number; label: string }> {
  const usages: Array<{ hash: number; label: string }> = [];
  for (const entry of entries) {
    const entryId = Number(entry.entryId ?? 0);
    const name = typeof entry.characterName === "string" ? entry.characterName : "";
    const who = name || `ID ${entryId}`;
    for (const field of CHARACTER_GUI_HASH_FIELDS) {
      const raw = entry[field];
      if (typeof raw !== "number" || normalizeGuiHash(raw) === 0) continue;
      usages.push({
        hash: normalizeGuiHash(raw),
        label: `${who} ${field}`,
      });
    }
  }
  return usages;
}

function parseHashHex(value: string): number | null {
  const trimmed = value.trim();
  const stem = trimmed.replace(/\.fhm2d$/i, "");
  const hex = stem.startsWith("0x") || stem.startsWith("0X") ? stem.slice(2) : stem;
  if (hex.length !== 8) return null;
  const parsed = Number.parseInt(hex, 16);
  return Number.isFinite(parsed) ? parsed >>> 0 : null;
}

export function resolveGuiPackFolder(
  hash: number,
  items: GuiPackPickerItem[],
): string | null {
  const normalized = normalizeGuiHash(hash);
  if (normalized === 0) return null;
  return items.find((item) => item.hash === normalized)?.folderPath ?? null;
}

export function resolveGuiPackNutexbPath(
  hash: number,
  items: GuiPackPickerItem[],
): string | null {
  const normalized = normalizeGuiHash(hash);
  if (normalized === 0) return null;
  return items.find((item) => item.hash === normalized)?.nutexbPath ?? null;
}

export function canExtractGuiPack(item: Pick<GuiPackPickerItem, "hash" | "folderPath">): boolean {
  return normalizeGuiHash(item.hash) !== 0 && !item.folderPath;
}
