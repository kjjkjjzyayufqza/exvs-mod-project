import { classifyWorkspacePackPath } from "@/services/testEditorWorkspace/packIdentity";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import type {
  EffectFolderFileItem,
  EffectFolderModel,
  EffectFolderSelection,
  EffectFolderHash,
} from "@/services/effectFolder/effectFolderService";
import { inferEffectFolderStructurePath } from "@/services/effectFolder/effectFolderService";
import { resolveMigratedFhm2dFolderPath } from "@/utils/fhm2dFolderPathResolution";
import { STRUCTURE_JSON_SUFFIX } from "../fileTreeNodeRowUtils";

export type EffectInventoryCategory = "efxbn" | "models" | "textures" | "other";

export type EffectListItem =
  | { category: "efxbn"; item: EffectFolderFileItem }
  | { category: "models"; model: EffectFolderModel }
  | { category: "textures"; item: EffectFolderFileItem }
  | { category: "other"; item: EffectFolderFileItem };

export function structureBaseNameFromJsonPath(jsonPath: string): string | null {
  const normalized = jsonPath.replace(/\\/g, "/");
  const fileName = normalized.split("/").pop() ?? "";
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(STRUCTURE_JSON_SUFFIX)) return null;
  const base = fileName.slice(0, fileName.length - STRUCTURE_JSON_SUFFIX.length);
  return base || null;
}

export function parentDirOf(path: string): string | null {
  const trimmed = path.replace(/[\\/]+$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  const lastBackslash = trimmed.lastIndexOf("\\");
  const idx = Math.max(lastSlash, lastBackslash);
  if (idx < 0) return null;
  const parent = trimmed.slice(0, idx);
  if (/^[a-zA-Z]:$/.test(parent)) return `${parent}\\`;
  if (parent === "" && trimmed.startsWith("/")) return "/";
  return parent;
}

export function resolveEffectPackFromStructureJson(
  workspaceRoot: string,
  structureJsonPath: string | null | undefined,
  document: TestEditorWorkspaceDocument,
): WorkspacePackIdentity | null {
  if (!workspaceRoot.trim() || !structureJsonPath?.trim()) return null;
  const baseName = structureBaseNameFromJsonPath(structureJsonPath);
  if (!baseName) return null;
  const parentPath = parentDirOf(structureJsonPath);
  if (!parentPath) return null;
  const separator = parentPath.includes("\\") ? "\\" : "/";
  const folderPath = `${parentPath.replace(/[\\/]+$/, "")}${separator}${baseName}`;
  const identity = classifyWorkspacePackPath({
    workspaceRoot,
    nodePath: folderPath,
    nodeIsDirectory: true,
    document,
  });
  if (!identity || identity.routeId !== "unit.effect") return null;
  return identity;
}

export function resolveEffectPackFromFolderPath(
  workspaceRoot: string,
  folderPath: string,
  document: TestEditorWorkspaceDocument,
): WorkspacePackIdentity | null {
  const trimmed = folderPath.trim();
  if (!trimmed) return null;
  const identity = classifyWorkspacePackPath({
    workspaceRoot,
    nodePath: trimmed,
    nodeIsDirectory: true,
    document,
  });
  if (identity?.routeId === "unit.effect") {
    return {
      ...identity,
      folderPath: trimmed,
      structureJsonPath: inferEffectFolderStructurePath(trimmed),
    };
  }

  const normalized = trimmed.replace(/[\\/]+$/, "");
  const hashFolderName = normalized.split(/[\\/]/).filter(Boolean).pop() ?? normalized;
  const route = document.assetRoutes["unit.effect"];
  const prefix = route?.prefix ?? "006effect";
  return {
    packKey: `${prefix}/${hashFolderName}`,
    routeId: "unit.effect",
    prefix,
    hashFolderName,
    folderPath: trimmed,
    structureJsonPath: inferEffectFolderStructurePath(trimmed),
    sourceLayout: "configured",
  };
}

export async function resolveEffectPackFromFolderPathAsync(
  workspaceRoot: string,
  folderPath: string,
  document: TestEditorWorkspaceDocument,
): Promise<WorkspacePackIdentity | null> {
  const remappedFolderPath = await resolveMigratedFhm2dFolderPath(folderPath);
  return resolveEffectPackFromFolderPath(workspaceRoot, remappedFolderPath, document);
}

export function formatEffectFolderHash(hash: EffectFolderHash): string {
  return `${hash.hex} (${hash.signed})`;
}

export function effectFolderHashMatchesQuery(hash: EffectFolderHash, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    hash.hex.toLowerCase().includes(q) ||
    String(hash.signed).includes(q) ||
    String(hash.unsigned).includes(q)
  );
}

export function effectListItemKey(item: EffectListItem): string {
  switch (item.category) {
    case "efxbn":
    case "textures":
    case "other":
      return `${item.category}:${item.item.fileIndex}`;
    case "models":
      return `models:${item.model.hash.signed}`;
  }
}

export function effectListItemLabel(item: EffectListItem): string {
  switch (item.category) {
    case "efxbn":
      return item.item.name || item.item.fileBaseName || `efxbn #${item.item.fileIndex}`;
    case "textures":
      return item.item.name || item.item.fileBaseName || `texture #${item.item.fileIndex}`;
    case "other":
      return item.item.name || item.item.fileBaseName || `file #${item.item.fileIndex}`;
    case "models":
      return item.model.name || formatEffectFolderHash(item.model.hash);
  }
}

export function effectListItemSubtitle(item: EffectListItem): string {
  switch (item.category) {
    case "efxbn": {
      const count = item.item.efxbn?.effectCount;
      return count != null ? `${count} effects` : item.item.actualExt;
    }
    case "textures":
      return item.item.actualExt;
    case "other":
      return item.item.actualExt;
    case "models": {
      const missing = item.model.missingRequiredExts.length;
      return missing > 0 ? `${item.model.files.length} files, ${missing} missing ext` : `${item.model.files.length} files`;
    }
  }
}

export function effectListItemMissing(item: EffectListItem): boolean {
  switch (item.category) {
    case "efxbn":
    case "textures":
    case "other":
      return item.item.missing;
    case "models":
      return item.model.missingRequiredExts.length > 0 || item.model.files.some((f) => f.missing);
  }
}

export function toEffectFolderSelections(items: EffectListItem[]): EffectFolderSelection[] {
  const out: EffectFolderSelection[] = [];
  for (const item of items) {
    switch (item.category) {
      case "efxbn":
        out.push({ kind: "efxbn", fileIndex: item.item.fileIndex });
        break;
      case "textures":
        out.push({ kind: "texture", fileIndex: item.item.fileIndex });
        break;
      case "other":
        out.push({
          kind: "file",
          fileIndex: item.item.fileIndex,
          name: item.item.name || item.item.fileBaseName,
        });
        break;
      case "models":
        out.push({
          kind: "model",
          hashId: item.model.hash.signed,
          name: item.model.name,
        });
        break;
    }
  }
  return out;
}

export function filterEffectListItems(items: EffectListItem[], query: string): EffectListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const label = effectListItemLabel(item).toLowerCase();
    const subtitle = effectListItemSubtitle(item).toLowerCase();
    if (label.includes(q) || subtitle.includes(q)) return true;
    switch (item.category) {
      case "efxbn":
      case "textures":
      case "other":
        return (
          item.item.path.toLowerCase().includes(q) ||
          item.item.fileUrl.toLowerCase().includes(q) ||
          (item.item.hash ? effectFolderHashMatchesQuery(item.item.hash, q) : false)
        );
      case "models":
        return (
          effectFolderHashMatchesQuery(item.model.hash, q) ||
          item.model.files.some(
            (f) =>
              f.name.toLowerCase().includes(q) ||
              f.path.toLowerCase().includes(q) ||
              (f.hash ? effectFolderHashMatchesQuery(f.hash, q) : false),
          )
        );
    }
  });
}

export function parseHashInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const unsigned = Number.parseInt(trimmed.slice(2), 16);
    if (!Number.isFinite(unsigned)) return null;
    return unsigned | 0;
  }
  if (/^-?\d+$/.test(trimmed)) {
    const value = Number.parseInt(trimmed, 10);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}
