import { describe, expect, it, vi } from "vitest"
import { writeText } from "@tauri-apps/plugin-clipboard-manager"
import { toast } from "sonner"
import type { TypedParamFile } from "./typedParamTypes"
import {
  buildTypedParamEntryClipboardPayload,
  buildTypedParamFileClipboardPayload,
  copyTypedParamEntryJsonToClipboard,
  copyTypedParamFileJsonToClipboard,
  formatTypedParamEntryJson,
} from "./typedParamClipboard"

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const sampleData: TypedParamFile = {
  header: { entryCount: 1, entrySize: 64 },
  fieldSpecs: [{ entryOffset: 0, kind: 5 }],
  entryIds: [0x12345678],
  entries: [{ entryId: 0x12345678, thrustParam: 1.25 }],
  trailingData: [1, 2, 3],
}

describe("typedParamClipboard", () => {
  it("builds selected entry payload with index and entryId", () => {
    const payload = buildTypedParamEntryClipboardPayload("vernier_table", sampleData, 0)
    expect(payload).toEqual({
      fileType: "vernier_table",
      index: 0,
      entryId: 0x12345678,
      entry: { entryId: 0x12345678, thrustParam: 1.25 },
    })
  })

  it("builds full view payload with all TypedParamFile fields", () => {
    const payload = buildTypedParamFileClipboardPayload("vernier_table", sampleData)
    expect(payload.fileType).toBe("vernier_table")
    expect(payload.header).toEqual(sampleData.header)
    expect(payload.fieldSpecs).toEqual(sampleData.fieldSpecs)
    expect(payload.entryIds).toEqual(sampleData.entryIds)
    expect(payload.entries).toEqual(sampleData.entries)
    expect(payload.trailingData).toEqual(sampleData.trailingData)
    expect(payload.entries).not.toBe(sampleData.entries)
  })

  it("formats selected entry JSON for the JSON view", () => {
    const text = formatTypedParamEntryJson("vernier_table", sampleData, 0)
    expect(text).toBe(
      JSON.stringify(buildTypedParamEntryClipboardPayload("vernier_table", sampleData, 0), null, 2),
    )
  })

  it("copies selected entry JSON to clipboard", async () => {
    await copyTypedParamEntryJsonToClipboard("vernier_table", sampleData, 0)
    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify(buildTypedParamEntryClipboardPayload("vernier_table", sampleData, 0), null, 2),
    )
    expect(toast.success).toHaveBeenCalledWith("Copied selected entry JSON to clipboard")
  })

  it("copies full view JSON to clipboard", async () => {
    await copyTypedParamFileJsonToClipboard("vernier_table", sampleData)
    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify(buildTypedParamFileClipboardPayload("vernier_table", sampleData), null, 2),
    )
    expect(toast.success).toHaveBeenCalledWith("Copied full view JSON to clipboard")
  })
})
