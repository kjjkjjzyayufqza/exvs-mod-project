import { formatHash } from "@/models/commandTable"
import type {
  EffectFolderFileItem,
  EffectFolderHash,
  EffectFolderInventory,
  EffectFolderModel,
} from "@/services/effectFolder/effectFolderService"
import { getBaseName, getParentDir, toWindowsPath } from "@/services/effectFolder/effectFolderService"
import type { EffectListItem } from "../effect-folder-editor/effectFolderEditorUtils"
import { readTypedEntryId, sortTypedParamFileByUnsignedEntryId } from "./paramEntryUtils"
import type { TypedParamEntry, TypedParamFile } from "./typedParamTypes"

export const PROJECTILE_DEPICTION_TABLE_FILE_TYPE = "projectile_depiction_table"

export type ProjectileDepictionHashRole = "efxbn" | "model" | "material" | "sound"

export type ProjectileDepictionHashFieldSpec = {
  key: string
  role: ProjectileDepictionHashRole
}

export const PROJECTILE_DEPICTION_HASH_FIELDS: readonly ProjectileDepictionHashFieldSpec[] = [
  { key: "mainEffectHash", role: "efxbn" },
  { key: "subEffectHash", role: "efxbn" },
  { key: "modelHash", role: "model" },
  { key: "trailEffectHash", role: "efxbn" },
  { key: "soundEffectHash", role: "sound" },
  { key: "materialHash", role: "material" },
  { key: "spawnEffectHash", role: "efxbn" },
  { key: "destroyEffectHash", role: "efxbn" },
]

export type ProjectileDepictionHashStatus = "empty" | "resolved" | "error" | "warning" | "info"

export type ProjectileDepictionHashRow = {
  key: string
  role: ProjectileDepictionHashRole
  unsigned: number
  signed: number
  hex: string
  leBytes: string
  empty: boolean
}

export type ProjectileDepictionHashResolution = ProjectileDepictionHashRow & {
  status: ProjectileDepictionHashStatus
  message: string
  efxbn: EffectFolderFileItem | null
  model: EffectFolderModel | null
  texture: EffectFolderFileItem | null
}

export type EfxbnCopyAction = "copy" | "overwrite" | "keep"

export type EfxbnCopyPolicyDraft = {
  fileIndex: number
  hashUnsigned: number
  sourceName: string
  sourcePath: string
  destName: string
  action: EfxbnCopyAction
}

export type EfxbnOutputPreview = {
  fileIndex: number
  sourcePath: string
  outputPath: string
  action: EfxbnCopyAction
}

export type EfxbnCopyPolicyValidation = {
  fileIndex: number
  ok: boolean
  error: string | null
}

export type EffectFolderCopyEfxbnPolicy = {
  fileIndex: number
  destFileName: string | null
  overwrite: boolean
  skip: boolean
}

export function isProjectileDepictionTableFileType(fileType: string): boolean {
  return fileType === PROJECTILE_DEPICTION_TABLE_FILE_TYPE
}

function camelToSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (part) => `_${part.toLowerCase()}`)
}

export function readUnsignedEntryField(entry: TypedParamEntry, key: string): number {
  const fromValue = (raw: TypedParamEntry[string] | undefined): number | null => {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw >>> 0
    if (typeof raw === "boolean") return raw ? 1 : 0
    if (typeof raw === "string" && raw.trim()) {
      const parsed = Number(raw)
      if (Number.isFinite(parsed)) return parsed >>> 0
    }
    return null
  }
  const primary = fromValue(entry[key])
  if (primary !== null && primary !== 0) return primary
  const fallback = fromValue(entry[camelToSnakeKey(key)])
  if (fallback !== null) return fallback
  return primary ?? 0
}

export function formatHashLeBytes(value: number): string {
  const unsigned = value >>> 0
  const bytes = [unsigned & 0xff, (unsigned >>> 8) & 0xff, (unsigned >>> 16) & 0xff, (unsigned >>> 24) & 0xff]
  return bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ")
}

export function effectFolderHashMatchesUnsigned(hash: EffectFolderHash, unsigned: number): boolean {
  const target = unsigned >>> 0
  return hash.unsigned === target || (hash.signed >>> 0) === target
}

export function listProjectileDepictionHashRows(entry: TypedParamEntry): ProjectileDepictionHashRow[] {
  return PROJECTILE_DEPICTION_HASH_FIELDS.map((field) => {
    const unsigned = readUnsignedEntryField(entry, field.key)
    return {
      key: field.key,
      role: field.role,
      unsigned,
      signed: unsigned | 0,
      hex: formatHash(unsigned),
      leBytes: formatHashLeBytes(unsigned),
      empty: unsigned === 0,
    }
  })
}

export function inventoryToEffectListItems(inventory: EffectFolderInventory): EffectListItem[] {
  return [
    ...inventory.efxbns.map((item) => ({ category: "efxbn" as const, item })),
    ...inventory.models.map((model) => ({ category: "models" as const, model })),
    ...inventory.textures.map((item) => ({ category: "textures" as const, item })),
    ...inventory.otherFiles.map((item) => ({ category: "other" as const, item })),
  ]
}

function findEfxbnByHash(inventory: EffectFolderInventory, unsigned: number): EffectFolderFileItem | null {
  const fromEfxbn =
    inventory.efxbns.find((item) => item.hash && effectFolderHashMatchesUnsigned(item.hash, unsigned)) ?? null
  if (fromEfxbn) return fromEfxbn
  return (
    inventory.otherFiles.find(
      (item) =>
        item.actualExt === ".efxbn" && item.hash && effectFolderHashMatchesUnsigned(item.hash, unsigned),
    ) ?? null
  )
}

function resolveAsEfxbn(
  row: ProjectileDepictionHashRow,
  efxbn: EffectFolderFileItem,
): ProjectileDepictionHashResolution {
  if (efxbn.missing) {
    return {
      ...row,
      status: "error",
      message: `EFXBN ${efxbn.name || efxbn.fileBaseName || efxbn.fileIndex} is in the structure JSON but missing on disk.`,
      efxbn,
      model: null,
      texture: null,
    }
  }
  return {
    ...row,
    status: "resolved",
    message: `${efxbn.name || efxbn.fileBaseName || `efxbn #${efxbn.fileIndex}`} · fileIndex ${efxbn.fileIndex}`,
    efxbn,
    model: null,
    texture: null,
  }
}

function findModelByHash(inventory: EffectFolderInventory, unsigned: number): EffectFolderModel | null {
  return inventory.models.find((model) => effectFolderHashMatchesUnsigned(model.hash, unsigned)) ?? null
}

function findTextureByHash(inventory: EffectFolderInventory, unsigned: number): EffectFolderFileItem | null {
  return (
    inventory.textures.find((item) => item.hash && effectFolderHashMatchesUnsigned(item.hash, unsigned)) ??
    inventory.models
      .flatMap((model) => model.files)
      .find((item) => item.hash && effectFolderHashMatchesUnsigned(item.hash, unsigned)) ??
    null
  )
}

function modelHasMaterialHash(model: EffectFolderModel, unsigned: number): boolean {
  return (model.materialTextureIds ?? []).some((hash) => effectFolderHashMatchesUnsigned(hash, unsigned))
}

export function resolveProjectileDepictionHashes(
  entry: TypedParamEntry,
  inventory: EffectFolderInventory,
): ProjectileDepictionHashResolution[] {
  return listProjectileDepictionHashRows(entry).map((row) => {
    if (row.empty) {
      return {
        ...row,
        status: "empty",
        message: "Empty",
        efxbn: null,
        model: null,
        texture: null,
      }
    }

    if (row.role === "sound") {
      return {
        ...row,
        status: "info",
        message: "Sound hash is not stored in an effect pack and will not be copied.",
        efxbn: null,
        model: null,
        texture: null,
      }
    }

    const efxbn = findEfxbnByHash(inventory, row.unsigned)
    if (efxbn) {
      return resolveAsEfxbn(row, efxbn)
    }

    const model = findModelByHash(inventory, row.unsigned)
    if (model) {
      const missing = model.missingRequiredExts.length > 0 || model.files.some((file) => file.missing)
      if (missing) {
        return {
          ...row,
          status: "error",
          message: `Model ${model.name || row.hex} is incomplete or missing files on disk.`,
          efxbn: null,
          model,
          texture: null,
        }
      }
      return {
        ...row,
        status: "resolved",
        message: `${model.name || row.hex} · ${model.files.length} file(s)`,
        efxbn: null,
        model,
        texture: null,
      }
    }

    const texture = findTextureByHash(inventory, row.unsigned)
    const materialModel = inventory.models.find((item) => modelHasMaterialHash(item, row.unsigned)) ?? null
    if (texture || materialModel) {
      return {
        ...row,
        status: "resolved",
        message: texture
          ? `Texture ${texture.name || texture.fileBaseName}`
          : `Material/model ${materialModel?.name || row.hex}`,
        efxbn: null,
        model: materialModel,
        texture,
      }
    }

    if (row.role === "material") {
      return {
        ...row,
        status: "warning",
        message: `Hash ${row.hex} is not an EFXBN, model, or texture in the source pack.`,
        efxbn: null,
        model: null,
        texture: null,
      }
    }

    return {
      ...row,
      status: "error",
      message: `No EFXBN or model with hash ${row.hex} in the source effect folder.`,
      efxbn: null,
      model: null,
      texture: null,
    }
  })
}

export function sourceResolveBlocksCopy(resolutions: ProjectileDepictionHashResolution[]): boolean {
  return resolutions.some((row) => row.status === "error")
}

export function selectedEffectItemsFromResolutions(
  resolutions: ProjectileDepictionHashResolution[],
): EffectListItem[] {
  const items: EffectListItem[] = []
  const seen = new Set<string>()
  for (const row of resolutions) {
    if (row.status !== "resolved") continue
    if (row.efxbn) {
      const key = `efxbn:${row.efxbn.fileIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({ category: "efxbn", item: row.efxbn })
      continue
    }
    if (row.role === "model" && row.model) {
      const key = `models:${row.model.hash.signed}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({ category: "models", model: row.model })
    }
  }
  return items
}

export function efxbnDisplayFileName(item: EffectFolderFileItem): string {
  const fromPath = getBaseName(item.path)
  if (fromPath) return fromPath
  if (item.name && item.name.includes(".")) return item.name
  const ext = item.actualExt || ".efxbn"
  const stem = item.name || item.fileBaseName || `efxbn_${item.fileIndex}`
  return stem.toLowerCase().endsWith(ext.toLowerCase()) ? stem : `${stem}${ext}`
}

export function isSingleEfxbnFileName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return true
  if (/[\\/]/.test(trimmed) || trimmed === "." || trimmed === ".." || trimmed.includes("..")) {
    return false
  }
  return true
}

export function normalizeEfxbnFileName(name: string, fallback: string): string {
  const trimmed = name.trim() || fallback.trim() || "effect.efxbn"
  if (!isSingleEfxbnFileName(trimmed)) {
    throw new Error("Destination EFXBN name must be a single file name.")
  }
  if (/\.efxbn$/i.test(trimmed)) return trimmed
  return `${trimmed}.efxbn`
}

export function destEfxbnNameSet(inventory: EffectFolderInventory): Set<string> {
  const names = new Set<string>()
  for (const item of inventory.efxbns) {
    names.add(efxbnDisplayFileName(item).toLowerCase())
  }
  return names
}

export function destEfxbnOutputDir(inventory: EffectFolderInventory): string {
  const counts = new Map<string, number>()
  for (const item of [...inventory.efxbns, ...inventory.textures]) {
    const parent = getParentDir(item.path)
    if (!parent) continue
    counts.set(parent, (counts.get(parent) ?? 0) + 1)
  }
  let best = toWindowsPath(inventory.effectRoot)
  let bestCount = 0
  for (const [dir, count] of counts) {
    if (count > bestCount) {
      best = dir
      bestCount = count
    }
  }
  return best
}

export function findDestEfxbnByHash(
  inventory: EffectFolderInventory,
  hashUnsigned: number,
): EffectFolderFileItem | null {
  return (
    inventory.efxbns.find((item) => item.hash && effectFolderHashMatchesUnsigned(item.hash, hashUnsigned)) ?? null
  )
}

export function previewEfxbnOutputPath(
  policy: EfxbnCopyPolicyDraft,
  destInventory: EffectFolderInventory,
): EfxbnOutputPreview {
  const existing = findDestEfxbnByHash(destInventory, policy.hashUnsigned)
  if ((policy.action === "overwrite" || policy.action === "keep") && existing?.path) {
    return {
      fileIndex: policy.fileIndex,
      sourcePath: policy.sourcePath,
      outputPath: toWindowsPath(existing.path),
      action: policy.action,
    }
  }
  const destName = isSingleEfxbnFileName(policy.destName)
    ? normalizeEfxbnFileName(policy.destName, policy.sourceName)
    : policy.sourceName
  return {
    fileIndex: policy.fileIndex,
    sourcePath: policy.sourcePath,
    outputPath: `${destEfxbnOutputDir(destInventory)}\\${destName}`,
    action: policy.action,
  }
}

export function previewEfxbnOutputPaths(
  policies: EfxbnCopyPolicyDraft[],
  destInventory: EffectFolderInventory,
): EfxbnOutputPreview[] {
  return policies.map((policy) => previewEfxbnOutputPath(policy, destInventory))
}

export function destEfxbnHashSet(inventory: EffectFolderInventory): Set<number> {
  const hashes = new Set<number>()
  for (const item of inventory.efxbns) {
    if (!item.hash) continue
    hashes.add(item.hash.unsigned >>> 0)
    hashes.add(item.hash.signed >>> 0)
  }
  return hashes
}

export function createDefaultEfxbnPolicies(items: EffectListItem[]): EfxbnCopyPolicyDraft[] {
  const policies: EfxbnCopyPolicyDraft[] = []
  const seen = new Set<number>()
  for (const item of items) {
    if (item.category !== "efxbn") continue
    if (seen.has(item.item.fileIndex)) continue
    seen.add(item.item.fileIndex)
    policies.push({
      fileIndex: item.item.fileIndex,
      hashUnsigned: item.item.hash ? item.item.hash.unsigned >>> 0 : 0,
      sourceName: efxbnDisplayFileName(item.item),
      sourcePath: item.item.path,
      destName: efxbnDisplayFileName(item.item),
      action: "copy",
    })
  }
  return policies
}

export function validateEfxbnCopyPolicy(
  policy: EfxbnCopyPolicyDraft,
  destNames: Set<string>,
  destHashes: Set<number>,
): EfxbnCopyPolicyValidation {
  if (!isSingleEfxbnFileName(policy.destName)) {
    return {
      fileIndex: policy.fileIndex,
      ok: false,
      error: "Destination EFXBN name must be a single file name.",
    }
  }
  const destName = normalizeEfxbnFileName(policy.destName, policy.sourceName).toLowerCase()
  const nameClash = destNames.has(destName)
  const hashClash = destHashes.has(policy.hashUnsigned >>> 0)

  if (policy.action === "keep") {
    if (!hashClash) {
      return {
        fileIndex: policy.fileIndex,
        ok: false,
        error: "Keep existing is only valid when the destination pack already has this EFXBN hash.",
      }
    }
    return { fileIndex: policy.fileIndex, ok: true, error: null }
  }

  if (policy.action === "overwrite") {
    if (!hashClash) {
      return {
        fileIndex: policy.fileIndex,
        ok: false,
        error: "Overwrite is only valid when the destination pack already has this EFXBN hash.",
      }
    }
    return { fileIndex: policy.fileIndex, ok: true, error: null }
  }

  if (hashClash) {
    return {
      fileIndex: policy.fileIndex,
      ok: false,
      error: "Destination already has this EFXBN hash. Choose Overwrite or Keep existing.",
    }
  }
  if (nameClash) {
    return {
      fileIndex: policy.fileIndex,
      ok: false,
      error: "Destination already has this EFXBN file name. Rename it or choose a free name.",
    }
  }
  return { fileIndex: policy.fileIndex, ok: true, error: null }
}

export function validateEfxbnCopyPolicies(
  policies: EfxbnCopyPolicyDraft[],
  destInventory: EffectFolderInventory,
): EfxbnCopyPolicyValidation[] {
  const destNames = destEfxbnNameSet(destInventory)
  const destHashes = destEfxbnHashSet(destInventory)
  const claimedNames = new Set<string>()
  return policies.map((policy) => {
    const result = validateEfxbnCopyPolicy(policy, destNames, destHashes)
    if (!result.ok || policy.action !== "copy") return result
    const destName = normalizeEfxbnFileName(policy.destName, policy.sourceName).toLowerCase()
    if (claimedNames.has(destName)) {
      return {
        fileIndex: policy.fileIndex,
        ok: false,
        error: "Another EFXBN in this copy already uses that destination file name.",
      }
    }
    claimedNames.add(destName)
    return result
  })
}

export function toEffectFolderCopyEfxbnPolicies(policies: EfxbnCopyPolicyDraft[]): EffectFolderCopyEfxbnPolicy[] {
  return policies.map((policy) => ({
    fileIndex: policy.fileIndex,
    destFileName: policy.action === "copy" ? normalizeEfxbnFileName(policy.destName, policy.sourceName) : null,
    overwrite: policy.action === "overwrite",
    skip: policy.action === "keep",
  }))
}

export function findProjectileDepictionEntryIndex(data: TypedParamFile, entryId: number): number {
  const target = entryId >>> 0
  return data.entries.findIndex((entry, index) => readTypedEntryId(entry, index) === target)
}

export function mergeProjectileDepictionEntry(
  target: TypedParamFile,
  sourceEntry: TypedParamEntry,
  mode: "append" | "replace",
): TypedParamFile {
  if (typeof sourceEntry.entryId !== "number" || !Number.isFinite(sourceEntry.entryId)) {
    throw new Error("Source entry is missing entryId.")
  }
  const sourceEntryId = sourceEntry.entryId >>> 0
  const cloned = { ...sourceEntry, entryId: sourceEntryId }
  if (mode === "replace") {
    const existingIndex = findProjectileDepictionEntryIndex(target, sourceEntryId)
    if (existingIndex < 0) {
      throw new Error(`Target table has no entry ${formatHash(sourceEntryId)} to replace.`)
    }
    const entries = target.entries.map((entry, index) => (index === existingIndex ? cloned : entry))
    return sortTypedParamFileByUnsignedEntryId({ ...target, entries })
  }
  return sortTypedParamFileByUnsignedEntryId({
    ...target,
    entries: [...target.entries, cloned],
  })
}

export function normalizeFsPath(path: string): string {
  return path.trim().replace(/\//g, "\\").replace(/\\+$/g, "").toLowerCase()
}

export function pathsReferToSameFile(left: string, right: string): boolean {
  const a = normalizeFsPath(left)
  const b = normalizeFsPath(right)
  return a.length > 0 && a === b
}
