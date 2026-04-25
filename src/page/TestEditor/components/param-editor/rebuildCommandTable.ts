import type { ParsedCommandTable, ParsedEntry, CommandFieldValue } from "@/models/commandTable"
import { encodeFieldValueToHex } from "@/models/commandTable"

export function rebuildCommandTableForSave(
  parsed: ParsedCommandTable,
): {
  header: ParsedCommandTable["header"]
  commands: ParsedCommandTable["commands"]
  entryIds: number[]
  entriesRaw: number[][]
  trailingData: number[]
} {
  const entrySize = parsed.header.entrySize
  const entriesRaw = parsed.entries.map((entry) => {
    const raw = new Uint8Array(entrySize)
    for (const field of entry.fields) {
      const offset = field.offset
      if (offset + 4 > entrySize) continue
      const buf = new ArrayBuffer(4)
      const dv = new DataView(buf)
      switch (field.kind) {
        case 1:
          dv.setUint32(0, field.valueUint ?? 0, true)
          break
        case 2:
          dv.setInt32(0, field.valueInt ?? 0, true)
          break
        case 5:
          dv.setFloat32(0, field.valueFloat ?? 0, true)
          break
        case 7:
          dv.setUint32(0, field.valueUint ?? 0, true)
          break
        default:
          dv.setUint32(0, field.valueUint ?? 0, true)
          break
      }
      raw.set(new Uint8Array(buf), offset)
    }
    return Array.from(raw)
  })

  return {
    header: parsed.header,
    commands: parsed.commands,
    entryIds: parsed.entries.map((e) => e.entryId),
    entriesRaw,
    trailingData: [],
  }
}

function nextFieldValue(f: CommandFieldValue, kind: number, newValue: number | string): CommandFieldValue {
  const numVal = typeof newValue === "string" ? 0 : newValue
  return {
    ...f,
    valueInt: kind === 2 ? (numVal as number) : f.valueInt,
    valueUint: kind === 1 ? ((numVal as number) >>> 0) : f.valueUint,
    valueFloat: kind === 5 ? (numVal as number) : f.valueFloat,
    valueString: kind === 7 ? String(newValue) : f.valueString,
    valueHex: encodeFieldValueToHex(kind, numVal),
  }
}

export function updateEntryField(
  entry: ParsedEntry,
  hash: number,
  kind: number,
  newValue: number | string,
): ParsedEntry {
  return {
    ...entry,
    fields: entry.fields.map((f) => (f.hash === hash ? nextFieldValue(f, kind, newValue) : f)),
  }
}
