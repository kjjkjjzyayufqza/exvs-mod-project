import type { TypedFieldValue, TypedParamEntry, TypedParamFile } from "./typedParamTypes"
import {
  applyHexBytesToTypedEntry,
  buildTypedEntryFieldLayout,
  buildTypedEntryHexPreview,
  isTypedEntryFieldKey,
  nextTypedEntryId,
  parseHexPreviewEditText,
} from "./paramEntryUtils"
import type { TypedParamEntryClipboardPayload } from "./typedParamClipboard"

export type TypedParamImportFormat = "hex" | "entry-json" | "unknown"

export interface TypedParamImportPreview {
  format: TypedParamImportFormat
  ok: boolean
  idle?: boolean
  error?: string
  warning?: string
  byteCount?: number
  fieldCount?: number
  sourceEntryId?: number
  sourceFileType?: string
}

export type TypedParamImportApplyResult =
  | { ok: true; entry: TypedParamEntry; format: TypedParamImportFormat }
  | { ok: false; error: string }

function getEntryFieldKeys(entry: TypedParamEntry): string[] {
  return Object.keys(entry).filter(isTypedEntryFieldKey)
}

function isTypedFieldValue(value: unknown): value is TypedFieldValue {
  return (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    value === null
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null
  }
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

function extractEntryFromJsonPayload(parsed: unknown): {
  entry: TypedParamEntry
  fileType?: string
  sourceEntryId?: number
} | null {
  if (!isRecord(parsed)) return null

  if (Array.isArray(parsed.entries)) {
    return null
  }

  if (isRecord(parsed.entry)) {
    return {
      entry: parsed.entry as TypedParamEntry,
      fileType: typeof parsed.fileType === "string" ? parsed.fileType : undefined,
      sourceEntryId: typeof parsed.entryId === "number" ? parsed.entryId >>> 0 : undefined,
    }
  }

  const keys = Object.keys(parsed)
  if (keys.length === 0) return null

  const looksLikeEntry = keys.some((key) => key !== "fileType" && key !== "index" && key !== "entryId")
  if (!looksLikeEntry) return null

  return {
    entry: parsed as TypedParamEntry,
    sourceEntryId: typeof parsed.entryId === "number" ? parsed.entryId >>> 0 : undefined,
  }
}

function validateImportedEntryFields(
  targetEntry: TypedParamEntry,
  importedEntry: TypedParamEntry,
): { ok: true; entry: TypedParamEntry } | { ok: false; error: string } {
  const fieldKeys = getEntryFieldKeys(targetEntry)
  if (fieldKeys.length === 0) {
    return { ok: false, error: "Selected entry has no importable fields." }
  }

  const unknownKeys = Object.keys(importedEntry).filter(
    (key) => isTypedEntryFieldKey(key) && !fieldKeys.includes(key),
  )
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `Unknown field(s): ${unknownKeys.slice(0, 4).join(", ")}${unknownKeys.length > 4 ? "…" : ""}.`,
    }
  }

  const missingKeys = fieldKeys.filter((key) => !(key in importedEntry))
  if (missingKeys.length > 0) {
    return {
      ok: false,
      error: `Missing field(s): ${missingKeys.slice(0, 4).join(", ")}${missingKeys.length > 4 ? "…" : ""}.`,
    }
  }

  for (const key of fieldKeys) {
    const value = importedEntry[key]
    if (!isTypedFieldValue(value)) {
      return { ok: false, error: `Field "${key}" must be a number, string, boolean, or null.` }
    }
    const targetValue = targetEntry[key]
    if (targetValue !== undefined && typeof targetValue !== typeof value && value !== null && targetValue !== null) {
      return {
        ok: false,
        error: `Field "${key}" type mismatch: expected ${typeof targetValue}, got ${typeof value}.`,
      }
    }
  }

  const nextEntry: TypedParamEntry = { ...targetEntry }
  for (const key of fieldKeys) {
    nextEntry[key] = importedEntry[key] as TypedFieldValue
  }

  return { ok: true, entry: nextEntry }
}

export function detectTypedParamImportFormat(text: string): TypedParamImportFormat {
  const trimmed = text.trim()
  if (!trimmed) return "unknown"

  const parsed = tryParseJson(trimmed)
  if (parsed !== null) {
    if (isRecord(parsed) && Array.isArray(parsed.entries)) {
      return "unknown"
    }
    if (extractEntryFromJsonPayload(parsed)) {
      return "entry-json"
    }
  }

  const tokens = trimmed.match(/[0-9A-Fa-f]{2}/g)
  if (tokens && tokens.length > 0) {
    return "hex"
  }

  return "unknown"
}

export function previewTypedParamImport(
  text: string,
  fileType: string,
  data: TypedParamFile,
  selectedEntryIndex: number,
): TypedParamImportPreview {
  const trimmed = text.trim()
  if (!trimmed) {
    return { format: "unknown", ok: false, idle: true }
  }

  const targetEntry = data.entries[selectedEntryIndex]
  if (!targetEntry) {
    return { format: "unknown", ok: false, error: "No entry selected." }
  }

  const format = detectTypedParamImportFormat(trimmed)

  if (format === "hex") {
    const preview = buildTypedEntryHexPreview(data, selectedEntryIndex)
    if (!preview) {
      return { format: "hex", ok: false, error: "Unable to resolve entry byte layout." }
    }
    const parsed = parseHexPreviewEditText(trimmed, preview.bytes.length)
    if (!parsed.ok) {
      return { format: "hex", ok: false, error: parsed.error, byteCount: preview.bytes.length }
    }
    return { format: "hex", ok: true, byteCount: parsed.bytes.length }
  }

  if (format === "entry-json") {
    const parsed = tryParseJson(trimmed)
    if (parsed === null) {
      return { format: "entry-json", ok: false, error: "Invalid JSON." }
    }
    if (isRecord(parsed) && Array.isArray(parsed.entries)) {
      return {
        format: "unknown",
        ok: false,
        error: "Full file JSON is not supported. Paste a single entry JSON payload.",
      }
    }

    const extracted = extractEntryFromJsonPayload(parsed)
    if (!extracted) {
      return { format: "entry-json", ok: false, error: "JSON does not contain a valid entry object." }
    }

    if (extracted.fileType && extracted.fileType !== fileType) {
      return {
        format: "entry-json",
        ok: false,
        error: `File type mismatch: expected "${fileType}", got "${extracted.fileType}".`,
        sourceFileType: extracted.fileType,
      }
    }

    const validated = validateImportedEntryFields(targetEntry, extracted.entry)
    if (!validated.ok) {
      return {
        format: "entry-json",
        ok: false,
        error: validated.error,
        sourceEntryId: extracted.sourceEntryId,
        fieldCount: getEntryFieldKeys(targetEntry).length,
      }
    }

    const warning =
      extracted.sourceEntryId !== undefined && extracted.sourceEntryId !== targetEntry.entryId
        ? "Imported entryId will be ignored; current entry id is kept."
        : undefined

    return {
      format: "entry-json",
      ok: true,
      fieldCount: getEntryFieldKeys(targetEntry).length,
      sourceEntryId: extracted.sourceEntryId,
      sourceFileType: extracted.fileType,
      warning,
    }
  }

  const parsedJson = tryParseJson(trimmed)
  if (parsedJson !== null && isRecord(parsedJson) && Array.isArray(parsedJson.entries)) {
    return {
      format: "unknown",
      ok: false,
      error: "Full file JSON is not supported. Paste a single entry JSON payload.",
    }
  }

  return {
    format: "unknown",
    ok: false,
    error: "Unrecognized import data. Paste hex bytes or entry JSON copied from this editor.",
  }
}

export function applyTypedParamImport(
  text: string,
  fileType: string,
  data: TypedParamFile,
  selectedEntryIndex: number,
): TypedParamImportApplyResult {
  const preview = previewTypedParamImport(text, fileType, data, selectedEntryIndex)
  if (!preview.ok) {
    return { ok: false, error: preview.error ?? "Import validation failed." }
  }

  const targetEntry = data.entries[selectedEntryIndex]
  if (!targetEntry) {
    return { ok: false, error: "No entry selected." }
  }

  if (preview.format === "hex") {
    const hexPreview = buildTypedEntryHexPreview(data, selectedEntryIndex)
    const fieldLayout = buildTypedEntryFieldLayout(data, selectedEntryIndex)
    if (!hexPreview || !fieldLayout) {
      return { ok: false, error: "Unable to resolve entry field layout." }
    }
    const parsed = parseHexPreviewEditText(text.trim(), hexPreview.bytes.length)
    if (!parsed.ok) {
      return { ok: false, error: parsed.error }
    }
    return {
      ok: true,
      format: "hex",
      entry: applyHexBytesToTypedEntry(targetEntry, fieldLayout, parsed.bytes),
    }
  }

  const parsed = tryParseJson(text.trim())
  if (parsed === null) {
    return { ok: false, error: "Invalid JSON." }
  }
  const extracted = extractEntryFromJsonPayload(parsed)
  if (!extracted) {
    return { ok: false, error: "JSON does not contain a valid entry object." }
  }

  const validated = validateImportedEntryFields(targetEntry, extracted.entry)
  if (!validated.ok) {
    return { ok: false, error: validated.error }
  }

  return { ok: true, format: "entry-json", entry: validated.entry }
}

export function applyTypedParamEntryJson(
  text: string,
  fileType: string,
  data: TypedParamFile,
  selectedEntryIndex: number,
): TypedParamImportApplyResult {
  const preview = previewTypedParamImport(text, fileType, data, selectedEntryIndex)
  if (preview.format === "hex") {
    return { ok: false, error: "JSON view does not accept hex bytes. Use Import for hex." }
  }
  return applyTypedParamImport(text, fileType, data, selectedEntryIndex)
}

export function cloneTypedParamEntryFromJson(
  text: string,
  fileType: string,
  data: TypedParamFile,
  selectedEntryIndex: number,
): TypedParamImportApplyResult {
  const applied = applyTypedParamEntryJson(text, fileType, data, selectedEntryIndex)
  if (!applied.ok) return applied
  return {
    ok: true,
    format: "entry-json",
    entry: { ...applied.entry, entryId: nextTypedEntryId(data.entries) },
  }
}

export function isTypedParamEntryClipboardPayload(value: unknown): value is TypedParamEntryClipboardPayload {
  if (!isRecord(value) || !isRecord(value.entry)) return false
  return typeof value.fileType === "string" && typeof value.index === "number"
}
