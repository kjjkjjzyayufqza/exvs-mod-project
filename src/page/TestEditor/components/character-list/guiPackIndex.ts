import type { Fhm2dNameMappingEntry } from "@/utils/fhm2dNameMapping";
import { formatGuiHashHex } from "./guiClonePlan";

export const CHARACTER_GUI_HASH_FIELDS = [
  "lmbCutIn",
  "lmbPilotClothing",
  "lmbBoost",
  "exPilotClothingLmbHash",
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
};

export type GuiPackPickerItem = {
  hash: number;
  label: string;
  secondaryText: string;
  folderPath: string | null;
  source: "workspace" | "name-map" | "character-list";
};

const PILOT_PATH_MARKERS = [
  "009gui/flash/pilot",
  "009gui/image/pilot",
  "009gui/flash/navi",
  "009gui/image/navi",
];

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
  const path = workspaceRelative.replace(/\\/g, "/").toLowerCase();
  if (path.includes("flash/pilot") || path.includes("image/pilot")) return true;
  if (path.includes("flash/navi") || path.includes("image/navi")) return true;
  return /^(st_p_|ex_p_|vs_p_|sc_p_|navi_)/i.test(name);
}

export function isGuiRelatedNameMapping(entry: Fhm2dNameMappingEntry): boolean {
  const path = (entry.packagePath ?? entry.gameRelativePath ?? "").replace(/\\/g, "/").toLowerCase();
  if (PILOT_PATH_MARKERS.some((marker) => path.includes(marker))) return true;
  return /^(st_p_|ex_p_|vs_p_|sc_p_|navi_)/i.test(entry.name);
}

export function fieldNamePrefix(fieldKey: string): string | null {
  if (fieldKey === "lmbCutIn" || fieldKey === "lmbPilotClothing") return "st_p_";
  if (fieldKey === "lmbBoost" || fieldKey === "exPilotClothingLmbHash") return "ex_p_";
  if (fieldKey.startsWith("vsPL")) return "vs_p_l_";
  if (fieldKey.startsWith("vsPR")) return "vs_p_r_";
  if (fieldKey === "scP") return "sc_p_";
  if (fieldKey.startsWith("navi") || /resourceHash/i.test(fieldKey)) return "navi_";
  return null;
}

function rankingName(item: GuiPackPickerItem): string {
  return item.label || "";
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
    } else if (!existing.folderPath && item.folderPath) {
      existing.folderPath = item.folderPath;
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
      source: "workspace",
    });
  }

  for (const usage of input.characterUsages) {
    upsert({
      hash: usage.hash,
      label: usage.label,
      secondaryText: formatGuiHashHex(usage.hash),
      folderPath: null,
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
