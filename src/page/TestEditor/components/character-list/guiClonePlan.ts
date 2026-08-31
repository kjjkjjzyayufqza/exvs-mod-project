import { sanitizeFhm2dStructureName } from "@/utils/fhm2dStructureMetadata";
import { crc32IeeeUint32 } from "@/utils/crc32Ieee";

export const MIXED_GUI_CLONE_DONOR_ENTRY_ID = 28_001_001;
export const DEFAULT_GUI_CLONE_TARGET_ENTRY_ID = 900_000_004;
export const NAVI_LIST_PACK_HASH_HEX = "0x6FCC0FBA";

export const PILOT_GUI_CLONE_FIELDS = [
  { key: "lmbCutIn", label: "LMB Cut In", donorName: "st_p_016_001_c01" },
  { key: "lmbPilotClothing", label: "LMB Pilot Clothing", donorName: "st_p_016_001_c02" },
  { key: "lmbBoost", label: "LMB Boost", donorName: "ex_p_016_001_c01" },
  { key: "exPilotClothingLmbHash", label: "EX Pilot Clothing LMB", donorName: "ex_p_016_001_c02" },
  { key: "vsPL", label: "VS Pilot Left", donorName: "vs_p_l" },
  { key: "vsPLC02", label: "VS Pilot Left C02", donorName: "vs_p_l" },
  { key: "vsPLC03", label: "VS Pilot Left C03", donorName: "vs_p_l" },
  { key: "vsPLC04", label: "VS Pilot Left C04", donorName: "vs_p_l" },
  { key: "vsPR", label: "VS Pilot Right", donorName: "vs_p_r" },
  { key: "vsPRC02", label: "VS Pilot Right C02", donorName: "vs_p_r" },
  { key: "vsPRC03", label: "VS Pilot Right C03", donorName: "vs_p_r" },
  { key: "vsPRC04", label: "VS Pilot Right C04", donorName: "vs_p_r" },
  { key: "scP", label: "SC P", donorName: "sc_p" },
] as const;

export const MS_GUI_CLONE_FIELDS = [
  { key: "msIghR", label: "MS IGH R", donorName: "ms_igh_r_016_001_001" },
  { key: "msVsR", label: "MS VS R", donorName: "ms_vs_r_016_001_001" },
  { key: "msVsL", label: "MS VS L", donorName: "ms_vs_l_016_001_001" },
  { key: "msTracker", label: "MS Tracker", donorName: "ms_tracker_016_001_001" },
  { key: "msMsL", label: "MS MS L", donorName: "ms_ms_l_016_001_001" },
  { key: "msMsS", label: "MS MS S", donorName: "ms_ms_s_016_001_001" },
  { key: "msMn", label: "MS MN", donorName: "ms_mn_016_001_001" },
  { key: "msCrs", label: "MS CRS", donorName: "ms_crs_016_001_001" },
] as const;

export const NAVI_GUI_CLONE_FIELDS = [
  { key: "naviBt", label: "Navi battle flash", donorName: "navi_bt_016_o01" },
  { key: "naviBtS", label: "Navi battle thumbnail", donorName: "navi_bt_s_016_o01" },
  { key: "naviPlC01", label: "Navi player flash c01", donorName: "navi_pl_016_o01_c01_a2" },
  { key: "naviPlC02", label: "Navi player flash c02", donorName: "navi_pl_016_o01_c02_a2" },
  { key: "naviPlSC01", label: "Navi player thumbnail c01", donorName: "navi_pl_s_016_o01_c01" },
  { key: "naviPlSC02", label: "Navi player thumbnail c02", donorName: "navi_pl_s_016_o01_c02" },
] as const;

export type PilotGuiCloneFieldKey = (typeof PILOT_GUI_CLONE_FIELDS)[number]["key"];
export type MsGuiCloneFieldKey = (typeof MS_GUI_CLONE_FIELDS)[number]["key"];
export type NaviGuiCloneFieldKey = (typeof NAVI_GUI_CLONE_FIELDS)[number]["key"];

const PILOT_KEY_SET = new Set<string>(PILOT_GUI_CLONE_FIELDS.map((field) => field.key));
const MS_KEY_SET = new Set<string>(MS_GUI_CLONE_FIELDS.map((field) => field.key));
const FIELD_LABELS = new Map<string, string>(
  [...PILOT_GUI_CLONE_FIELDS, ...MS_GUI_CLONE_FIELDS, ...NAVI_GUI_CLONE_FIELDS].map((field) => [
    field.key,
    field.label,
  ]),
);

const GUI_CLONE_NAME_PREFIXES: Record<string, string> = {
  lmbCutIn: "st_p_",
  lmbPilotClothing: "st_p_",
  lmbBoost: "ex_p_",
  exPilotClothingLmbHash: "ex_p_",
  scP: "sc_p_",
  msIghR: "ms_igh_r_",
  msVsR: "ms_vs_r_",
  msVsL: "ms_vs_l_",
  msTracker: "ms_tracker_",
  msMsL: "ms_ms_l_",
  msMsS: "ms_ms_s_",
  msMn: "ms_mn_",
  msCrs: "ms_crs_",
};

export function isPilotGuiCloneKey(key: string): boolean {
  return PILOT_KEY_SET.has(key);
}

export function isMsGuiCloneKey(key: string): boolean {
  return MS_KEY_SET.has(key);
}

export function isNaviGuiCloneKey(key: string): boolean {
  return key.startsWith("navi");
}

export function guiCloneFieldLabel(key: string): string {
  return FIELD_LABELS.get(key) ?? key;
}

export function guiCloneFieldNamePrefix(fieldKey: string): string {
  if (GUI_CLONE_NAME_PREFIXES[fieldKey]) return GUI_CLONE_NAME_PREFIXES[fieldKey];
  if (fieldKey.startsWith("vsPL")) return "vs_p_l_";
  if (fieldKey.startsWith("vsPR")) return "vs_p_r_";
  if (fieldKey.startsWith("navi")) return "navi_";
  return "gui_";
}

export function defaultGuiCloneStructureName(fieldKey: string, targetEntryId: number): string {
  return `${guiCloneFieldNamePrefix(fieldKey)}${targetEntryId >>> 0}`;
}

export function occupiedGuiCloneLeafNames(
  items: readonly { label?: string; folderPath?: string | null }[],
): string[] {
  const names: string[] = [];
  for (const item of items) {
    if (item.label) names.push(item.label);
    const folder = (item.folderPath ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (!folder) continue;
    const leaf = folder.slice(folder.lastIndexOf("/") + 1);
    if (leaf) names.push(leaf);
  }
  return names;
}

export function uniqueGuiCloneStructureName(
  fieldKey: string,
  targetEntryId: number,
  occupiedNames: Iterable<string>,
): string {
  const occupied = new Set(
    [...occupiedNames].map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const base = sanitizeFhm2dStructureName(defaultGuiCloneStructureName(fieldKey, targetEntryId));
  if (!base) return `gui_${targetEntryId >>> 0}`;
  if (!occupied.has(base.toLowerCase())) return base;
  for (let n = 2; n < 10_000; n += 1) {
    const candidate = `${base}_${n}`;
    if (!occupied.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error(`exhausted unique GUI clone names for ${fieldKey}`);
}

export interface ClonedGuiPack {
  fieldKey: string;
  donorName: string;
  donorHash: number;
  newHash: number;
  donorFileName: string;
  newFileName: string;
  bindTarget: string;
  sourcePath: string;
  outputPath: string;
  workspaceRelative: string;
  structureJsonPath: string;
  structureName: string;
  innerFileCount: number;
  obModOutputPath: string | null;
  byteLen: number;
}

export interface NaviCloneResult {
  naviListPath: string;
  newCharacterUniqueId: number;
  appendedEntryIds: number[];
  remappedPackCount: number;
}

export interface CloneGuiSetResult {
  preview: boolean;
  packs: ClonedGuiPack[];
  characterFieldUpdates: Record<string, number>;
  navi: NaviCloneResult | null;
  warnings: string[];
}

export function formatGuiHashHex(value: number): string {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function guiCloneHashSeed(
  targetEntryId: number,
  structureName: string,
  fieldKey: string,
  n = 0,
): string {
  if (n === 0) {
    return `GUI_CLONE|${targetEntryId}|${structureName}|${fieldKey}`;
  }
  return `GUI_CLONE|${targetEntryId}|${structureName}|${fieldKey}#${n}`;
}

export function previewGuiCloneHash(
  targetEntryId: number,
  structureName: string,
  fieldKey: string,
): number {
  return crc32IeeeUint32(guiCloneHashSeed(targetEntryId, structureName, fieldKey, 0));
}

export function replaceGuiExtractLeaf(
  workspaceRelative: string,
  donorName: string,
  leafName: string,
): string {
  const relative = workspaceRelative.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const leaf = leafName.trim();
  if (!leaf || leaf === donorName) return relative;
  const slash = relative.lastIndexOf("/");
  if (slash < 0) return leaf;
  return `${relative.slice(0, slash)}/${leaf}`;
}

export function previewGuiCloneFieldName(
  targetEntryId: number,
  fieldKey: string,
  customName: string,
): { structureName: string; newHash: number; hashHex: string; seed: string } {
  const structureName = sanitizeFhm2dStructureName(customName);
  const newHash = previewGuiCloneHash(targetEntryId, structureName, fieldKey);
  return {
    structureName,
    newHash,
    hashHex: formatGuiHashHex(newHash),
    seed: guiCloneHashSeed(targetEntryId, structureName, fieldKey, 0),
  };
}

export function overlayClonedGuiPack(
  pack: ClonedGuiPack,
  customName: string,
  targetEntryId: number,
  workspaceGuiRoot: string,
): ClonedGuiPack {
  const structureName = sanitizeFhm2dStructureName(customName || pack.donorName);
  const workspaceRelative = replaceGuiExtractLeaf(
    pack.workspaceRelative,
    pack.donorName,
    structureName,
  );
  const newHash = previewGuiCloneHash(targetEntryId, structureName, pack.fieldKey);
  const root = workspaceGuiRoot.replace(/[\\/]+$/, "");
  const outputPath = `${root}\\${workspaceRelative.replace(/\//g, "\\")}`;
  return {
    ...pack,
    structureName,
    newHash,
    newFileName: `${formatGuiHashHex(newHash)}.fhm2d`,
    workspaceRelative,
    outputPath,
    structureJsonPath: `${outputPath}_structure.json`,
  };
}

export function clonedGuiPackIdentity(pack: ClonedGuiPack): {
  packKey: string;
  routeId: null;
  prefix: "009gui";
  hashFolderName: string;
  folderPath: string;
  structureJsonPath: string;
  sourceLayout: "configured";
} {
  return {
    packKey: pack.structureJsonPath || pack.outputPath,
    routeId: null,
    prefix: "009gui",
    hashFolderName: pack.structureName || formatGuiHashHex(pack.newHash),
    folderPath: pack.outputPath,
    structureJsonPath: pack.structureJsonPath,
    sourceLayout: "configured",
  };
}

export function applyCharacterGuiFieldUpdates<T>(
  entry: T,
  updates: Record<string, number>,
): T {
  const patched: Record<string, number> = {};
  for (const [key, value] of Object.entries(updates)) {
    patched[key] = value >>> 0;
  }
  return { ...entry, ...patched } as T;
}
