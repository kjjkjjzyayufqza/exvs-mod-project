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

/** Role of an entry in the effect-folder copy plan (mirrors backend closure). */
export type EffectCopyPlanRole = "selected" | "dependency";

export type EffectCopyPlanCategory = "efxbn" | "model" | "texture" | "other";

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
    otherCount: number;
    dependencyCount: number;
    transferFileCount: number;
    missingCount: number;
    unsupportedCount: number;
  };
  /** Ordered steps the backend performs (for the Steps tab). */
  steps: string[];
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
  category: "efxbn" | "texture" | "other",
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
 * Preview the effect-folder copy closure the backend builds in
 * `build_copy_closure` (src-tauri/src/format/effect_folder.rs).
 *
 * Rules mirrored from Rust:
 * - Selected .efxbn → copy efxbn and expand:
 *   - meta modelIds (model folder hash + optional texture hash)
 *   - model-control colorMap texture hashes
 *   - effect id_table entries as structure fileIndex refs (textures, model members, nested efxbn)
 * - Nested efxbn referenced by id_table are expanded recursively.
 * - Selected .nutexb texture → copy texture.
 * - Selected model → copy model folder + member files.
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
  const wantedFileIndices = new Set<number>();
  const depEfxbnFileIndices = new Set<number>();
  const depModelKeys = new Set<string>();
  const depTextureKeys = new Set<string>();

  const inventoryEfxbn = allItems.filter(
    (item): item is Extract<EffectListItem, { category: "efxbn" }> => item.category === "efxbn",
  );
  const inventoryModels = allItems.filter(
    (item): item is Extract<EffectListItem, { category: "models" }> => item.category === "models",
  );
  const inventoryTextures = allItems.filter(
    (item): item is Extract<EffectListItem, { category: "textures" }> => item.category === "textures",
  );
  const inventoryOther = allItems.filter(
    (item): item is Extract<EffectListItem, { category: "other" }> => item.category === "other",
  );

  const efxbnByFileIndex = new Map(inventoryEfxbn.map((item) => [item.item.fileIndex, item]));
  const textureByFileIndex = new Map(inventoryTextures.map((item) => [item.item.fileIndex, item]));
  const otherByFileIndex = new Map(inventoryOther.map((item) => [item.item.fileIndex, item]));
  const modelByFileIndex = new Map<number, Extract<EffectListItem, { category: "models" }>>();
  for (const modelItem of inventoryModels) {
    for (const file of modelItem.model.files) {
      modelByFileIndex.set(file.fileIndex, modelItem);
    }
  }

  const absorbEfxbnSummary = (summary: NonNullable<EffectFolderFileItem["efxbn"]>) => {
    for (const modelHash of summary.modelIds) {
      if (modelHash.signed === 0) continue;
      wantedModelHashes.add(modelHash.signed);
      wantedTextureHashes.add(modelHash.signed);
    }
    for (const textureHash of summary.modelControlTextureIds) {
      if (textureHash.signed === 0) continue;
      wantedTextureHashes.add(textureHash.signed);
    }
    for (const effect of summary.effects) {
      for (const pair of effect.idTable) {
        if (pair.id !== 0) wantedFileIndices.add(pair.id);
      }
    }
  };

  const efxbnQueue: number[] = [];
  const visitedEfxbn = new Set<number>();

  const enqueueEfxbn = (fileIndex: number) => {
    if (visitedEfxbn.has(fileIndex)) return;
    visitedEfxbn.add(fileIndex);
    efxbnQueue.push(fileIndex);
  };

  for (const item of selectedItems) {
    const key = effectListItemKey(item);
    selectedKeys.add(key);

    switch (item.category) {
      case "efxbn": {
        selected.push(
          fileItemToPlanEntry("efxbn", item.item, "selected", "User selected this efxbn entry"),
        );
        if (item.item.hash) {
          wantedTextureHashes.add(item.item.hash.signed);
        }
        enqueueEfxbn(item.item.fileIndex);
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

  while (efxbnQueue.length > 0) {
    const fileIndex = efxbnQueue.pop()!;
    const efxbnItem = efxbnByFileIndex.get(fileIndex);
    if (!efxbnItem) {
      warnings.push(`Efxbn references missing fileIndex ${fileIndex}.`);
      continue;
    }
    if (efxbnItem.item.hash) {
      wantedTextureHashes.add(efxbnItem.item.hash.signed);
    }
    const summary = efxbnItem.item.efxbn;
    if (!summary) {
      warnings.push(
        `Efxbn "${effectListItemLabel(efxbnItem)}" has no parsed summary; related models/textures may be incomplete.`,
      );
      continue;
    }
    const before = wantedFileIndices.size;
    absorbEfxbnSummary(summary);
    // Newly discovered nested efxbn refs must be expanded in this BFS.
    if (wantedFileIndices.size !== before || wantedFileIndices.size > 0) {
      for (const refIndex of wantedFileIndices) {
        if (efxbnByFileIndex.has(refIndex)) {
          depEfxbnFileIndices.add(refIndex);
          enqueueEfxbn(refIndex);
        }
      }
    }
  }

  for (const refIndex of wantedFileIndices) {
    if (efxbnByFileIndex.has(refIndex)) {
      depEfxbnFileIndices.add(refIndex);
      continue;
    }
    const modelItem = modelByFileIndex.get(refIndex);
    if (modelItem) {
      depModelKeys.add(effectListItemKey(modelItem));
      continue;
    }
    const textureItem = textureByFileIndex.get(refIndex);
    if (textureItem) {
      depTextureKeys.add(effectListItemKey(textureItem));
      continue;
    }
    if (otherByFileIndex.has(refIndex)) {
      const other = otherByFileIndex.get(refIndex)!;
      warnings.push(
        `Efxbn id_table fileIndex ${refIndex} (${other.item.actualExt || "unknown"} "${effectListItemLabel(other)}") is not a texture or model member; skipped.`,
      );
    } else {
      warnings.push(`Efxbn id_table references missing fileIndex ${refIndex}.`);
    }
  }

  const dependencies: EffectCopyPlanEntry[] = [];
  const depKeys = new Set<string>();

  for (const modelItem of inventoryModels) {
    const key = effectListItemKey(modelItem);
    if (selectedKeys.has(key) || depKeys.has(key)) continue;
    const byHash = wantedModelHashes.has(modelItem.model.hash.signed);
    const byFileIndex = depModelKeys.has(key);
    if (!byHash && !byFileIndex) continue;
    depKeys.add(key);
    dependencies.push(
      modelToPlanEntry(
        modelItem.model,
        "dependency",
        byFileIndex
          ? `Referenced by efxbn id_table fileIndex (model folder ${formatEffectFolderHash(modelItem.model.hash)})`
          : `Referenced by efxbn modelId ${formatEffectFolderHash(modelItem.model.hash)}`,
      ),
    );
  }

  const resolvedModelHashes = new Set(
    inventoryModels
      .filter((m) => selectedKeys.has(effectListItemKey(m)) || depKeys.has(effectListItemKey(m)))
      .map((m) => m.model.hash.signed),
  );
  for (const hash of wantedModelHashes) {
    if (!resolvedModelHashes.has(hash)) {
      const display = `0x${(hash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
      warnings.push(`Selected efxbn references missing modelId ${display}.`);
    }
  }

  for (const textureItem of inventoryTextures) {
    const key = effectListItemKey(textureItem);
    if (selectedKeys.has(key) || depKeys.has(key)) continue;
    const hash = textureItem.item.hash;
    const byHash = hash != null && wantedTextureHashes.has(hash.signed);
    const byFileIndex = depTextureKeys.has(key);
    if (!byHash && !byFileIndex) continue;
    depKeys.add(key);
    dependencies.push(
      fileItemToPlanEntry(
        "texture",
        textureItem.item,
        "dependency",
        byFileIndex
          ? `Referenced by efxbn id_table fileIndex ${textureItem.item.fileIndex}`
          : `Auto-included via efxbn texture/model hash ${hash ? formatEffectFolderHash(hash) : "unknown"}`,
      ),
    );
  }

  for (const fileIndex of depEfxbnFileIndices) {
    const efxbnItem = efxbnByFileIndex.get(fileIndex);
    if (!efxbnItem) continue;
    const key = effectListItemKey(efxbnItem);
    if (selectedKeys.has(key) || depKeys.has(key)) continue;
    depKeys.add(key);
    dependencies.push(
      fileItemToPlanEntry(
        "efxbn",
        efxbnItem.item,
        "dependency",
        `Referenced by efxbn id_table fileIndex ${fileIndex}`,
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
  const otherCount = selected.filter((e) => e.category === "other").length;
  const missingCount = transferFiles.filter((f) => f.missing).length;
  const unsupportedCount = selected.filter((e) => e.unsupported).length;

  const steps = [
    "Validate source and destination effect pack folders exist.",
    "Read source and destination sibling *_structure.json files.",
    "Build a copy closure from your selection (efxbn modelIds + model-control textures + id_table fileIndex refs, including nested efxbn).",
    "Copy textures first, then model folders, then efxbn files (skip when destination already has the same ext+hash).",
    "Append new structure tree nodes and subFileData records for copied items.",
    "Write the destination *_structure.json (atomic). Source pack is never modified.",
  ];

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
      otherCount,
      dependencyCount: dependencies.length,
      transferFileCount: transferFiles.length,
      missingCount,
      unsupportedCount,
    },
    steps,
  };
}
