import { sanitizeFhm2dStructureName } from "@/utils/fhm2dStructureMetadata";
import { crc32IeeeUint32 } from "@/utils/crc32Ieee";

export const DEFAULT_GUI_CLONE_DONOR_ENTRY_ID = 16_001_001;
export const MIXED_GUI_CLONE_DONOR_ENTRY_ID = 28_001_001;
export const DEFAULT_GUI_CLONE_TARGET_ENTRY_ID = 900_000_004;
export const NAVI_LIST_PACK_HASH_HEX = "0x6FCC0FBA";

export const PILOT_GUI_CLONE_FIELDS = [
  { key: "lmbCutIn", label: "LMB Cut In", donorName: "st_p_016_001_c01" },
  { key: "lmbPilotClothing", label: "LMB Pilot Clothing", donorName: "st_p_016_001_c02" },
  { key: "lmbBoost", label: "LMB Boost", donorName: "ex_p_016_001_c01" },
  { key: "exPilotClothingLmbHash", label: "EX Pilot Clothing LMB", donorName: "ex_p_016_001_c02" },
  { key: "vsPL", label: "VS Pilot Left", donorName: "vs_p_l_016_001_c01" },
  { key: "vsPR", label: "VS Pilot Right", donorName: "vs_p_r_016_001_c01" },
  { key: "scP", label: "SC P", donorName: "sc_p_016_001_c01" },
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
export type NaviGuiCloneFieldKey = (typeof NAVI_GUI_CLONE_FIELDS)[number]["key"];

const PILOT_KEY_SET = new Set<string>(PILOT_GUI_CLONE_FIELDS.map((field) => field.key));
const NAVI_KEY_SET = new Set<string>(NAVI_GUI_CLONE_FIELDS.map((field) => field.key));
const FIELD_LABELS = new Map<string, string>(
  [...PILOT_GUI_CLONE_FIELDS, ...NAVI_GUI_CLONE_FIELDS].map((field) => [field.key, field.label]),
);

export function isPilotGuiCloneKey(key: string): boolean {
  return PILOT_KEY_SET.has(key);
}

export function isNaviGuiCloneKey(key: string): boolean {
  return NAVI_KEY_SET.has(key);
}

export function guiCloneFieldLabel(key: string): string {
  return FIELD_LABELS.get(key) ?? key;
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
