import { writeText } from "@tauri-apps/plugin-clipboard-manager"
import { toast } from "sonner"
import type { TypedParamEntry, TypedParamFile } from "./typedParamTypes"
import { readTypedEntryId } from "./paramEntryUtils"

export interface TypedParamEntryClipboardPayload {
  fileType: string
  index: number
  entryId: number
  entry: TypedParamEntry
}

export interface TypedParamFileClipboardPayload {
  fileType: string
  header: TypedParamFile["header"]
  fieldSpecs: TypedParamFile["fieldSpecs"]
  entryIds: number[]
  entries: TypedParamEntry[]
  trailingData: number[]
}

export function buildTypedParamEntryClipboardPayload(
  fileType: string,
  data: TypedParamFile,
  selectedEntryIndex: number,
): TypedParamEntryClipboardPayload | null {
  const entry = data.entries[selectedEntryIndex]
  if (!entry) return null
  return {
    fileType,
    index: selectedEntryIndex,
    entryId: readTypedEntryId(entry, selectedEntryIndex),
    entry: { ...entry },
  }
}

export function formatTypedParamEntryJson(
  fileType: string,
  data: TypedParamFile,
  selectedEntryIndex: number,
): string | null {
  const payload = buildTypedParamEntryClipboardPayload(fileType, data, selectedEntryIndex)
  if (!payload) return null
  return JSON.stringify(payload, null, 2)
}

export function buildTypedParamFileClipboardPayload(
  fileType: string,
  data: TypedParamFile,
): TypedParamFileClipboardPayload {
  return {
    fileType,
    header: { ...data.header },
    fieldSpecs: data.fieldSpecs.map((spec) => ({ ...spec })),
    entryIds: [...data.entryIds],
    entries: data.entries.map((entry) => ({ ...entry })),
    trailingData: [...data.trailingData],
  }
}

export async function copyTypedParamEntryJsonToClipboard(
  fileType: string,
  data: TypedParamFile,
  selectedEntryIndex: number,
): Promise<boolean> {
  const payload = buildTypedParamEntryClipboardPayload(fileType, data, selectedEntryIndex)
  if (!payload) {
    toast.error("No entry selected to copy")
    return false
  }
  try {
    await writeText(JSON.stringify(payload, null, 2))
    toast.success("Copied selected entry JSON to clipboard")
    return true
  } catch {
    toast.error("Failed to copy entry JSON")
    return false
  }
}

export async function copyTypedParamFileJsonToClipboard(
  fileType: string,
  data: TypedParamFile,
): Promise<boolean> {
  try {
    const payload = buildTypedParamFileClipboardPayload(fileType, data)
    await writeText(JSON.stringify(payload, null, 2))
    toast.success("Copied full view JSON to clipboard")
    return true
  } catch {
    toast.error("Failed to copy view JSON")
    return false
  }
}
