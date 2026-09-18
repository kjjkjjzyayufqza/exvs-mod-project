import { classifyWorkspacePackPath } from "@/services/testEditorWorkspace/packIdentity";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import type {
  EffectFolderCopyEfxbnPolicy,
  EffectFolderFileItem,
  EffectFolderModel,
  EffectFolderSelection,
  EffectFolderHash,
} from "@/services/effectFolder/effectFolderService";
import { getBaseName, inferEffectFolderStructurePath } from "@/services/effectFolder/effectFolderService";
import { crc32Ieee } from "@/utils/crc32Ieee";
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

/** Role of an entry in the effect-folder copy plan (mirrors backend closure). */
export type EffectCopyPlanRole = "selected" | "dependency";

export type EffectCopyPlanCategory = "efxbn" | "model" | "texture" | "animation" | "other";

export type EffectCopyPlanFile = {
  path: string;
  name: string;
  actualExt: string;
  missing: boolean;
  hash: EffectFolderHash | null;
};

/**
 * One logical unit that the copy operation will attempt to transfer.
 * File-level rows expand models into their member files.
 */
export type EffectCopyPlanEntry = {
  role: EffectCopyPlanRole;
  category: EffectCopyPlanCategory;
  key: string;
  label: string;
  path: string;
  hash: EffectFolderHash | null;
  missing: boolean;
  /** Why this entry is in the plan (user selection vs efxbn model/texture closure). */
  reason: string;
  /** For models: member files that will be copied with the model folder. */
  files: EffectCopyPlanFile[];
  /** Backend will not transfer this category (e.g. non-efxbn/non-nutexb "other"). */
  unsupported?: boolean;
};

export type EffectFolderCopyPlan = {
  selected: EffectCopyPlanEntry[];
  dependencies: EffectCopyPlanEntry[];
  /** Flat file rows for the transfer table (efxbn + textures + model members). */
  transferFiles: Array<EffectCopyPlanFile & { entryKey: string; category: EffectCopyPlanCategory; role: EffectCopyPlanRole; reason: string }>;
  warnings: string[];
  summary: {
    selectedCount: number;
    efxbnCount: number;
    modelCount: number;
    textureCount: number;
    animationCount: number;
    otherCount: number;
    dependencyCount: number;
    transferFileCount: number;
    missingCount: number;
    unsupportedCount: number;
  };
};

function modelToPlanEntry(
  model: EffectFolderModel,
  role: EffectCopyPlanRole,
  reason: string,
): EffectCopyPlanEntry {
  const files: EffectCopyPlanFile[] = model.files.map((f) => ({
    path: f.path,
    name: f.name || f.fileBaseName,
    actualExt: f.actualExt,
    missing: f.missing,
    hash: f.hash,
  }));
  return {
    role,
    category: "model",
    key: `models:${model.hash.signed}`,
    label: model.name || formatEffectFolderHash(model.hash),
    path: files[0]?.path ? parentDirOf(files[0].path) ?? files[0].path : "",
    hash: model.hash,
    missing: model.missingRequiredExts.length > 0 || files.some((f) => f.missing),
    reason,
    files,
  };
}

function fileItemToPlanEntry(
  category: "efxbn" | "texture" | "animation" | "other",
  item: EffectFolderFileItem,
  role: EffectCopyPlanRole,
  reason: string,
  unsupported = false,
): EffectCopyPlanEntry {
  const file: EffectCopyPlanFile = {
    path: item.path,
    name: item.name || item.fileBaseName,
    actualExt: item.actualExt,
    missing: item.missing,
    hash: item.hash,
  };
  return {
    role,
    category,
    key: `${category === "texture" ? "textures" : category}:${item.fileIndex}`,
    label: item.name || item.fileBaseName || `${category} #${item.fileIndex}`,
    path: item.path,
    hash: item.hash,
    missing: item.missing,
    reason,
    files: [file],
    unsupported: unsupported || undefined,
  };
}

/**
 * Preview the source-local effect-folder dependency set the backend builds in
 * `build_copy_closure` (src-tauri/src/format/effect_folder.rs).
 *
 * Rules mirrored from Rust:
 * - Selected .efxbn → copy efxbn and expand:
 *   - meta modelIds (model folder hash + optional texture hash)
 *   - model-control colorMap texture hashes
 * - Legacy idTable pairs are control-curve references and never resolve files.
 * - Selected .nutexb texture → copy texture.
 * - Selected/referenced model → copy model folder + member files and matching
 *   source textures named by its NUMATB material references.
 * - EFXBN animationId → matching source NUANMB.
 * - Control-reference pairs are curve selectors, never FHM2D file indices.
 * - Non-efxbn / non-nutexb "other" selections are currently ignored by the backend.
 */
export function buildEffectFolderCopyPlan(params: {
  selectedItems: EffectListItem[];
  allItems: EffectListItem[];
}): EffectFolderCopyPlan {
  const { selectedItems, allItems } = params;
  const warnings: string[] = [];
  const selected: EffectCopyPlanEntry[] = [];
  const selectedKeys = new Set<string>();

  const wantedModelHashes = new Set<number>();
  const wantedTextureHashes = new Set<number>();
  const wantedAnimationHashes = new Set<number>();

  const inventoryModels = allItems.filter(
    (item): item is Extract<EffectListItem, { category: "models" }> => item.category === "models",
  );
  const inventoryTextures = allItems.filter(
    (item): item is Extract<EffectListItem, { category: "textures" }> => item.category === "textures",
  );
  const inventoryOther = allItems.filter(
    (item): item is Extract<EffectListItem, { category: "other" }> => item.category === "other",
  );

  const absorbEfxbnSummary = (summary: NonNullable<EffectFolderFileItem["efxbn"]>) => {
    for (const modelHash of summary.modelIds) {
      if (modelHash.signed === 0) continue;
      wantedModelHashes.add(modelHash.signed);
    }
    for (const textureHash of summary.modelControlTextureIds) {
      if (textureHash.signed === 0) continue;
      wantedTextureHashes.add(textureHash.signed);
    }
    for (const animationHash of summary.animationIds) {
      if (animationHash.signed === 0) continue;
      wantedAnimationHashes.add(animationHash.signed);
    }
  };

  for (const item of selectedItems) {
    const key = effectListItemKey(item);
    selectedKeys.add(key);

    switch (item.category) {
      case "efxbn": {
        selected.push(
          fileItemToPlanEntry("efxbn", item.item, "selected", "User selected this efxbn entry"),
        );
        if (item.item.efxbn) {
          absorbEfxbnSummary(item.item.efxbn);
        } else {
          warnings.push(
            `Efxbn "${effectListItemLabel(item)}" has no parsed summary; related source assets may be incomplete.`,
          );
        }
        break;
      }
      case "textures":
        selected.push(
          fileItemToPlanEntry("texture", item.item, "selected", "User selected this texture"),
        );
        break;
      case "models":
        selected.push(
          modelToPlanEntry(item.model, "selected", "User selected this model folder"),
        );
        break;
      case "other":
        selected.push(
          fileItemToPlanEntry(
            "other",
            item.item,
            "selected",
            "User selected this file — backend currently only copies efxbn, nutexb, and models",
            true,
          ),
        );
        warnings.push(
          `Selection "${effectListItemLabel(item)}" (${item.item.actualExt || "unknown"}) is not copied by the backend.`,
        );
        break;
    }
  }

  const dependencies: EffectCopyPlanEntry[] = [];
  const depKeys = new Set<string>();

  for (const modelItem of inventoryModels) {
    const key = effectListItemKey(modelItem);
    if (selectedKeys.has(key) || depKeys.has(key)) continue;
    const byHash = wantedModelHashes.has(modelItem.model.hash.signed);
    if (!byHash) continue;
    depKeys.add(key);
    dependencies.push(
      modelToPlanEntry(
        modelItem.model,
        "dependency",
        `Referenced by efxbn modelId ${formatEffectFolderHash(modelItem.model.hash)}`,
      ),
    );
  }

  for (const modelItem of inventoryModels) {
    const key = effectListItemKey(modelItem);
    if (!selectedKeys.has(key) && !depKeys.has(key)) continue;
    for (const textureHash of modelItem.model.materialTextureIds ?? []) {
      if (textureHash.signed !== 0) wantedTextureHashes.add(textureHash.signed);
    }
  }

  for (const textureItem of inventoryTextures) {
    const key = effectListItemKey(textureItem);
    if (selectedKeys.has(key) || depKeys.has(key)) continue;
    const hash = textureItem.item.hash;
    const byHash = hash != null && wantedTextureHashes.has(hash.signed);
    if (!byHash) continue;
    depKeys.add(key);
    dependencies.push(
      fileItemToPlanEntry(
        "texture",
        textureItem.item,
        "dependency",
        `Referenced by efxbn/model texture hash ${hash ? formatEffectFolderHash(hash) : "unknown"}`,
      ),
    );
  }

  for (const animationItem of inventoryOther) {
    if (animationItem.item.actualExt.toLowerCase() !== ".nuanmb") continue;
    const key = effectListItemKey(animationItem);
    // Direct "other" selections are unsupported, but the backend still copies a
    // source-local NUANMB when a selected EFXBN references it.
    if (depKeys.has(key)) continue;
    const hash = animationItem.item.hash;
    if (!hash || !wantedAnimationHashes.has(hash.signed)) continue;
    depKeys.add(key);
    dependencies.push(
      fileItemToPlanEntry(
        "animation",
        animationItem.item,
        "dependency",
        `Referenced by efxbn animationId ${formatEffectFolderHash(hash)}`,
      ),
    );
  }

  const transferable = [...selected, ...dependencies].filter((entry) => !entry.unsupported);
  const transferFiles = transferable.flatMap((entry) =>
    entry.files.map((file) => ({
      ...file,
      entryKey: entry.key,
      category: entry.category,
      role: entry.role,
      reason: entry.reason,
    })),
  );

  const efxbnCount = transferable.filter((e) => e.category === "efxbn").length;
  const modelCount = transferable.filter((e) => e.category === "model").length;
  const textureCount = transferable.filter((e) => e.category === "texture").length;
  const animationCount = transferable.filter((e) => e.category === "animation").length;
  const otherCount = selected.filter((e) => e.category === "other").length;
  const missingCount = transferFiles.filter((f) => f.missing).length;
  const unsupportedCount = selected.filter((e) => e.unsupported).length;

  return {
    selected,
    dependencies,
    transferFiles,
    warnings,
    summary: {
      selectedCount: selectedItems.length,
      efxbnCount,
      modelCount,
      textureCount,
      animationCount,
      otherCount,
      dependencyCount: dependencies.length,
      transferFileCount: transferFiles.length,
      missingCount,
      unsupportedCount,
    },
  };
}

export type EfxbnCloneIdentityDraft = {
  fileIndex: number;
  sourceName: string;
  sourcePath: string;
  sourceHash: EffectFolderHash | null;
  destFileName: string;
  destHashInput: string;
};

export type EfxbnCloneIdentityValidation = {
  fileIndex: number;
  ok: boolean;
  errorKey: string | null;
};

export function normalizeFolderPath(path: string): string {
  return path.trim().replace(/\//g, "\\").replace(/\\+$/g, "").toLowerCase();
}

export function pathsReferToSameFolder(left: string, right: string): boolean {
  const a = normalizeFolderPath(left);
  const b = normalizeFolderPath(right);
  return a.length > 0 && a === b;
}

export function efxbnDisplayFileName(item: EffectFolderFileItem): string {
  const fromPath = getBaseName(item.path);
  if (fromPath) return fromPath;
  if (item.name && item.name.includes(".")) return item.name;
  const ext = item.actualExt || ".efxbn";
  const stem = item.name || item.fileBaseName || `efxbn_${item.fileIndex}`;
  return stem.toLowerCase().endsWith(ext.toLowerCase()) ? stem : `${stem}${ext}`;
}

export function suggestCopiedEfxbnFileName(sourceName: string): string {
  const trimmed = sourceName.trim() || "effect.efxbn";
  const stem = trimmed.replace(/\.efxbn$/i, "") || "effect";
  return `${stem}_copy.efxbn`;
}

export function efxbnFileNameStem(name: string): string {
  const trimmed = name.trim() || "effect.efxbn";
  return trimmed.replace(/\.efxbn$/i, "") || "effect";
}

export function hashPreviewFromSigned(signed: number): EffectFolderHash {
  const unsigned = signed >>> 0;
  return {
    signed: signed | 0,
    unsigned,
    hex: `0x${unsigned.toString(16).toUpperCase().padStart(8, "0")}`,
  };
}

export function hashHexFromDestFileName(destFileName: string): string {
  return crc32Ieee(efxbnFileNameStem(destFileName)).hashHex;
}

export function isSingleEfxbnFileName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (/[\\/]/.test(trimmed) || trimmed === "." || trimmed === ".." || trimmed.includes("..")) {
    return false;
  }
  return true;
}

export function normalizeCopiedEfxbnFileName(name: string, fallback: string): string {
  const trimmed = name.trim() || fallback.trim() || "effect.efxbn";
  if (/\.efxbn$/i.test(trimmed)) return trimmed;
  return `${trimmed}.efxbn`;
}

export function createEfxbnCloneIdentityDrafts(
  items: EffectListItem[],
  inPlace: boolean,
): EfxbnCloneIdentityDraft[] {
  const drafts: EfxbnCloneIdentityDraft[] = [];
  const seen = new Set<number>();
  for (const item of items) {
    if (item.category !== "efxbn") continue;
    if (seen.has(item.item.fileIndex)) continue;
    seen.add(item.item.fileIndex);
    const sourceName = efxbnDisplayFileName(item.item);
    const destFileName = inPlace ? suggestCopiedEfxbnFileName(sourceName) : sourceName;
    drafts.push({
      fileIndex: item.item.fileIndex,
      sourceName,
      sourcePath: item.item.path,
      sourceHash: item.item.hash,
      destFileName,
      destHashInput: inPlace ? hashHexFromDestFileName(destFileName) : "",
    });
  }
  return drafts;
}

export function destEfxbnNameSetFromItems(items: EffectListItem[]): Set<string> {
  const names = new Set<string>();
  for (const item of items) {
    if (item.category !== "efxbn") continue;
    names.add(efxbnDisplayFileName(item.item).toLowerCase());
  }
  return names;
}

export function destEfxbnHashSetFromItems(items: EffectListItem[]): Set<number> {
  const hashes = new Set<number>();
  for (const item of items) {
    if (item.category !== "efxbn" || !item.item.hash) continue;
    hashes.add(item.item.hash.unsigned >>> 0);
    hashes.add(item.item.hash.signed >>> 0);
  }
  return hashes;
}

export function validateEfxbnCloneIdentityDrafts(
  drafts: EfxbnCloneIdentityDraft[],
  params: {
    inPlace: boolean;
    existingNames: Set<string>;
    existingHashes: Set<number>;
  },
): EfxbnCloneIdentityValidation[] {
  const claimedNames = new Set<string>();
  const claimedHashes = new Set<number>();
  return drafts.map((draft) => {
    const destNameRaw = draft.destFileName.trim();
    if (params.inPlace && !destNameRaw) {
      return { fileIndex: draft.fileIndex, ok: false, errorKey: "destNameRequiredInPlace" };
    }
    if (destNameRaw && !isSingleEfxbnFileName(destNameRaw)) {
      return { fileIndex: draft.fileIndex, ok: false, errorKey: "destNameInvalid" };
    }
    const destName = destNameRaw
      ? normalizeCopiedEfxbnFileName(destNameRaw, draft.sourceName).toLowerCase()
      : "";
    if (destName) {
      if (params.inPlace && params.existingNames.has(destName)) {
        return { fileIndex: draft.fileIndex, ok: false, errorKey: "destNameTaken" };
      }
      if (claimedNames.has(destName)) {
        return { fileIndex: draft.fileIndex, ok: false, errorKey: "duplicateDestName" };
      }
      claimedNames.add(destName);
    }

    const destHashRaw = draft.destHashInput.trim();
    if (!destHashRaw) {
      if (params.inPlace) {
        return { fileIndex: draft.fileIndex, ok: false, errorKey: "destHashRequiredInPlace" };
      }
      return { fileIndex: draft.fileIndex, ok: true, errorKey: null };
    }
    const destHash = parseHashInput(destHashRaw);
    if (destHash == null) {
      return { fileIndex: draft.fileIndex, ok: false, errorKey: "invalidDestHash" };
    }
    const destHashSigned = destHash | 0;
    const destHashUnsigned = destHash >>> 0;
    if (params.inPlace && draft.sourceHash && destHashSigned === (draft.sourceHash.signed | 0)) {
      return { fileIndex: draft.fileIndex, ok: false, errorKey: "destHashUnchanged" };
    }
    if (params.inPlace && params.existingHashes.has(destHashUnsigned)) {
      return { fileIndex: draft.fileIndex, ok: false, errorKey: "destHashTaken" };
    }
    if (claimedHashes.has(destHashUnsigned)) {
      return { fileIndex: draft.fileIndex, ok: false, errorKey: "duplicateDestHash" };
    }
    claimedHashes.add(destHashUnsigned);
    claimedHashes.add(destHashSigned >>> 0);
    return { fileIndex: draft.fileIndex, ok: true, errorKey: null };
  });
}

export function toEfxbnCloneCopyPolicies(drafts: EfxbnCloneIdentityDraft[]): EffectFolderCopyEfxbnPolicy[] {
  return drafts.map((draft) => {
    const destNameRaw = draft.destFileName.trim();
    const destHashRaw = draft.destHashInput.trim();
    const destHash = destHashRaw ? parseHashInput(destHashRaw) : null;
    const policy: EffectFolderCopyEfxbnPolicy = {
      fileIndex: draft.fileIndex,
      destFileName: destNameRaw
        ? normalizeCopiedEfxbnFileName(destNameRaw, draft.sourceName)
        : null,
      overwrite: false,
      skip: false,
    };
    if (destHash != null) {
      policy.destHashId = destHash | 0;
    }
    return policy;
  });
}
