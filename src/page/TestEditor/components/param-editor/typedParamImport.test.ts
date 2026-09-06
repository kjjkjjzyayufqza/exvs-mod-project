import { describe, expect, it } from "vitest"
import type { TypedParamFile } from "./typedParamTypes"
import { buildTypedParamEntryClipboardPayload } from "./typedParamClipboard"
import {
  applyTypedParamEntryJson,
  applyTypedParamImport,
  cloneTypedParamEntryFromJson,
  detectTypedParamImportFormat,
  previewTypedParamImport,
} from "./typedParamImport"
import { formatHexPreviewEditText, buildTypedEntryHexPreview } from "./paramEntryUtils"

const sampleData: TypedParamFile = {
  header: { entryCount: 1, entrySize: 16 },
  fieldSpecs: [
    { entryOffset: 0, kind: 1 },
    { entryOffset: 4, kind: 1 },
    { entryOffset: 8, kind: 5 },
    { entryOffset: 12, kind: 1 },
  ],
  entryIds: [0x12345678],
  entries: [
    {
      entryId: 0x12345678,
      ammoCount: 0x12345678,
      damage: -2,
      speedRate: 1,
      bulletEffectHash: 0x41424344,
    },
  ],
  trailingData: [],
}

describe("typedParamImport", () => {
  it("detects hex import format", () => {
    expect(detectTypedParamImportFormat("78 56 34 12 FE FF FF FF")).toBe("hex")
  })

  it("detects entry JSON clipboard payload", () => {
    const payload = buildTypedParamEntryClipboardPayload("vernier_table", sampleData, 0)
    expect(detectTypedParamImportFormat(JSON.stringify(payload))).toBe("entry-json")
  })

  it("returns idle preview for empty paste buffer", () => {
    const preview = previewTypedParamImport("", "vernier_table", sampleData, 0)
    expect(preview.idle).toBe(true)
    expect(preview.ok).toBe(false)
    expect(preview.error).toBeUndefined()
  })

  it("rejects full file JSON as unknown format", () => {
    const text = JSON.stringify({
      fileType: "vernier_table",
      header: sampleData.header,
      fieldSpecs: sampleData.fieldSpecs,
      entryIds: sampleData.entryIds,
      entries: sampleData.entries,
      trailingData: [],
    })
    expect(detectTypedParamImportFormat(text)).toBe("unknown")
    const preview = previewTypedParamImport(text, "vernier_table", sampleData, 0)
    expect(preview.ok).toBe(false)
    expect(preview.error).toContain("Full file JSON")
  })

  it("validates hex byte count before apply", () => {
    const preview = previewTypedParamImport("FF 00", "vernier_table", sampleData, 0)
    expect(preview.format).toBe("hex")
    expect(preview.ok).toBe(false)
    expect(preview.error).toContain("Expected 16 bytes")
  })

  it("applies hex import to selected entry fields", () => {
    const hexPreview = buildTypedEntryHexPreview(sampleData, 0)
    expect(hexPreview).not.toBeNull()
    if (!hexPreview) return

    const text = formatHexPreviewEditText(hexPreview.bytes)
    const result = applyTypedParamImport(text, "vernier_table", sampleData, 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.format).toBe("hex")
    expect(result.entry.ammoCount).toBe(0x12345678)
    expect(result.entry.entryId).toBe(0x12345678)
  })

  it("applies entry JSON import and keeps current entryId", () => {
    const payload = buildTypedParamEntryClipboardPayload("vernier_table", sampleData, 0)
    expect(payload).not.toBeNull()
    if (!payload) return

    const imported = {
      ...payload,
      entryId: 0x99999999,
      entry: {
        ...payload.entry,
        entryId: 0x99999999,
        damage: -99,
      },
    }

    const result = applyTypedParamImport(JSON.stringify(imported), "vernier_table", sampleData, 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entry.damage).toBe(-99)
    expect(result.entry.entryId).toBe(0x12345678)
  })

  it("rejects entry JSON with file type mismatch", () => {
    const payload = buildTypedParamEntryClipboardPayload("other_table", sampleData, 0)
    expect(payload).not.toBeNull()
    if (!payload) return

    const preview = previewTypedParamImport(JSON.stringify(payload), "vernier_table", sampleData, 0)
    expect(preview.ok).toBe(false)
    expect(preview.error).toContain("File type mismatch")
  })

  it("rejects entry JSON with missing fields", () => {
    const payload = buildTypedParamEntryClipboardPayload("vernier_table", sampleData, 0)
    expect(payload).not.toBeNull()
    if (!payload) return

    const broken = {
      ...payload,
      entry: {
        entryId: payload.entryId,
        ammoCount: 1,
      },
    }

    const preview = previewTypedParamImport(JSON.stringify(broken), "vernier_table", sampleData, 0)
    expect(preview.ok).toBe(false)
    expect(preview.error).toContain("Missing field")
  })

  it("rejects hex bytes in the JSON-only apply path", () => {
    const result = applyTypedParamEntryJson("78 56 34 12 FE FF FF FF", "vernier_table", sampleData, 0)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("hex")
  })

  it("clones entry JSON with a new unique entryId", () => {
    const payload = buildTypedParamEntryClipboardPayload("vernier_table", sampleData, 0)
    expect(payload).not.toBeNull()
    if (!payload) return

    const edited = {
      ...payload,
      entry: {
        ...payload.entry,
        ammoCount: 2,
      },
    }
    const result = cloneTypedParamEntryFromJson(JSON.stringify(edited), "vernier_table", sampleData, 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entry.ammoCount).toBe(2)
    expect(result.entry.entryId).toBe(0x12345679)
  })
})
