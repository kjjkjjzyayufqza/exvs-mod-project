import type {
  ChrSysMscLinks,
  ChrSysParamFile,
  ChrSysParamTable,
  ChrSysResolvedKey,
  ChrSysTableKey,
  ChrSysValueFormat,
} from "./chrSysTypes"

/** Action-table columns with engine-proven roles (see chrsysparam_schema.rs). */
export const ACTION_FIELD = {
  formIndex: 0x01,
  phaseTick: 0x02,
  commandType: 0x03,
  leverMask: 0x04,
  armsSlot: 0x08,
  emptyAmmoPolicy: 0x09,
  archetypeGroup: 0x0a,
  actionHash: 0x2e,
  derivedHashFirst: 0x30,
  derivedDelayFirst: 0x59,
  phaseEnter: 0x7c,
  phaseExit: 0x7d,
  transitionFirst: 0x7e,
  transitionLast: 0x7f,
} as const

export const DERIVED_SLOT_COUNT = 10
const FORM_FIELDS = [0x01, 0x68, 0x69, 0x6a, 0x6b, 0x6c, 0x6d]
const SCHEDULE_LEVER_MIN = 0x40
const SCHEDULE_LEVER_MAX = 0x46
const LEVER_SPECIAL = 71
const LEVER_CONDITION_BASE = 100
/** Button bit index (commandType % 100) to the EXVS command vocabulary key. */
const COMMAND_KEYS: Record<number, string> = {
  0: "shot",
  1: "melee",
  7: "sub",
  8: "specialShot",
  9: "specialMelee",
  10: "burstAttack",
  11: "shotCharge",
  12: "meleeCharge",
}
/** global2 lever masks that have their own word; other combinations fall back to the raw mask. */
const LEVER_KEYS: Record<number, string> = {
  0x00: "neutral",
  0x04: "front",
  0x08: "back",
  0x10: "left",
  0x20: "right",
  0x0c: "frontBack",
  0x30: "side",
  0x3c: "anyDirection",
}

export function cellOf(row: readonly number[] | undefined, field: number): number {
  return row?.[field] ?? 0
}

function isTable(value: unknown): value is ChrSysParamTable {
  const table = value as ChrSysParamTable | undefined
  return (
    typeof table === "object" &&
    table !== null &&
    typeof table.columns === "number" &&
    Array.isArray(table.rows) &&
    table.rows.every((row) => Array.isArray(row))
  )
}

/** Validates a `parse_chrsysparam_file` / `import_chrsysparam_document` result at the IPC boundary. */
export function isChrSysParamFile(value: unknown): value is ChrSysParamFile {
  const file = value as ChrSysParamFile | undefined
  return (
    typeof file === "object" &&
    file !== null &&
    typeof file.unitId === "number" &&
    isTable(file.actionTable) &&
    isTable(file.transitionTable)
  )
}

export function toSigned(value: number): number {
  return value | 0
}

export function formatHex(value: number): string {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}`
}

export function formatCell(value: number, format: ChrSysValueFormat): string {
  return format === "signed" ? String(toSigned(value)) : formatHex(value)
}

/** Accepts `0x` hex (1..8 digits) or a decimal integer in -2^31..2^32-1; returns the u32 or null. */
export function parseCellInput(text: string): number | null {
  const trimmed = text.trim()
  const hex = /^0x([0-9a-f]{1,8})$/i.exec(trimmed)
  if (hex) return Number.parseInt(hex[1], 16) >>> 0
  if (!/^-?\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value) || value < -2147483648 || value > 4294967295) return null
  return value >>> 0
}

export function formMask(row: readonly number[]): number {
  return FORM_FIELDS.map((field) => toSigned(cellOf(row, field)))
    .filter((index) => index >= 0)
    .reduce((mask, index) => (mask | (1 << (index & 31))) >>> 0, 0)
}

/** Form indices a row answers to; an empty list means every form (mask 0 skips the form test). */
export function formsOf(row: readonly number[]): number[] {
  const mask = formMask(row)
  return Array.from({ length: 32 }, (_, index) => index).filter((index) => (mask >>> index) & 1)
}

export function isInputSelectable(row: readonly number[]): boolean {
  const commandType = cellOf(row, ACTION_FIELD.commandType)
  return commandType !== 400 && commandType % 100 !== 31 && cellOf(row, ACTION_FIELD.archetypeGroup) !== 39
}

/** One translation token: a key under the `test-chrsys-action-table` namespace plus its values. */
export interface ChrSysLabelToken {
  key: string
  params?: Record<string, string | number>
}

export interface ChrSysInputLabel {
  kind: "input" | "derived" | "script"
  command: ChrSysLabelToken
  lever: ChrSysLabelToken
  /** Charge level shown next to the command, 0 when the row is not a charge row. */
  tier: number
}

function commandToken(commandType: number): { token: ChrSysLabelToken; tier: number; kind: ChrSysInputLabel["kind"] } {
  if (commandType === 400) return { token: { key: "scriptOnly" }, tier: 0, kind: "script" }
  if (commandType === 300) return { token: { key: "awakening" }, tier: 0, kind: "input" }
  if (commandType % 100 === 31) return { token: { key: "derivedOnly" }, tier: 0, kind: "derived" }
  const bit = commandType < 0 ? commandType : commandType % 100
  const key = COMMAND_KEYS[bit]
  const token: ChrSysLabelToken = key ? { key } : { key: "buttonBit", params: { bit } }
  const tier = commandType > 0 ? Math.floor(commandType / 100) : 0
  return { token, tier, kind: "input" }
}

function leverToken(lever: number, kind: ChrSysInputLabel["kind"]): ChrSysLabelToken {
  if (kind !== "input" && lever >= SCHEDULE_LEVER_MIN && lever <= SCHEDULE_LEVER_MAX) {
    return { key: "schedule", params: { value: lever.toString(16).toUpperCase() } }
  }
  if (lever === LEVER_SPECIAL) return { key: "special71" }
  if (lever >= LEVER_CONDITION_BASE) {
    return { key: "condition", params: { value: (lever - LEVER_CONDITION_BASE).toString(16).toUpperCase() } }
  }
  const key = LEVER_KEYS[lever]
  return key ? { key } : { key: "combo", params: { bits: formatHex(lever) } }
}

/**
 * Turns one action row into the EXVS command vocabulary (N / 前 / 横 + 主射 / 特格 / ...).
 * A lever mask of 0 is reported as neutral: the engine skips the lever test, and rows that do
 * carry a direction are sorted ahead of it, so in practice the neutral input lands here.
 */
export function describeInput(row: readonly number[]): ChrSysInputLabel {
  const commandType = toSigned(cellOf(row, ACTION_FIELD.commandType))
  const { token, tier, kind } = commandToken(commandType)
  return {
    kind,
    command: token,
    lever: leverToken(cellOf(row, ACTION_FIELD.leverMask), kind),
    tier,
  }
}

export interface DerivedLink {
  slot: number
  hash: number
  targetRow: number | null
  delay: number
}

export function rowByHash(rows: readonly number[][], hash: number): number | null {
  if (hash === 0) return null
  const index = rows.findIndex((row, rowIndex) => rowIndex > 0 && cellOf(row, ACTION_FIELD.actionHash) === hash)
  return index < 0 ? null : index
}

export function derivedLinks(rows: readonly number[][], rowIndex: number): DerivedLink[] {
  const row = rows[rowIndex]
  return Array.from({ length: DERIVED_SLOT_COUNT }, (_, slot) => ({
    slot,
    hash: cellOf(row, ACTION_FIELD.derivedHashFirst + slot),
    targetRow: rowByHash(rows, cellOf(row, ACTION_FIELD.derivedHashFirst + slot)),
    delay: toSigned(cellOf(row, ACTION_FIELD.derivedDelayFirst + slot)),
  })).filter((link) => link.hash !== 0)
}

export function incomingDerivedRows(rows: readonly number[][], rowIndex: number): number[] {
  const hash = cellOf(rows[rowIndex], ACTION_FIELD.actionHash)
  if (hash === 0) return []
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) =>
      index > 0 &&
      Array.from({ length: DERIVED_SLOT_COUNT }, (_, slot) => cellOf(row, ACTION_FIELD.derivedHashFirst + slot)).includes(hash),
    )
    .map(({ index }) => index)
}

function withTable(
  file: ChrSysParamFile,
  tableKey: ChrSysTableKey,
  update: (table: ChrSysParamTable) => ChrSysParamTable,
): ChrSysParamFile {
  return { ...file, [tableKey]: update(file[tableKey]) }
}

export function setCell(
  file: ChrSysParamFile,
  tableKey: ChrSysTableKey,
  rowIndex: number,
  field: number,
  value: number,
): ChrSysParamFile {
  return withTable(file, tableKey, (table) => ({
    ...table,
    rows: table.rows.map((row, index) =>
      index === rowIndex ? row.map((cell, column) => (column === field ? value >>> 0 : cell)) : row,
    ),
  }))
}

export function appendClonedRow(file: ChrSysParamFile, tableKey: ChrSysTableKey, sourceRow: number): ChrSysParamFile {
  const source = file[tableKey].rows[sourceRow]
  if (!source) throw new Error(`Row ${sourceRow} does not exist`)
  return withTable(file, tableKey, (table) => ({ ...table, rows: [...table.rows, [...source]] }))
}

/** Mirrors exvs2-json deleteChrSysRow: refuses to orphan derived links or split transition ranges. */
export function deleteRow(file: ChrSysParamFile, tableKey: ChrSysTableKey, rowIndex: number): ChrSysParamFile {
  if (rowIndex <= 0) throw new Error("Row 0 is reserved and cannot be deleted")
  if (rowIndex >= file[tableKey].rows.length) throw new Error(`Row ${rowIndex} does not exist`)
  if (tableKey === "actionTable") {
    const sources = incomingDerivedRows(file.actionTable.rows, rowIndex)
    if (sources.length > 0) {
      throw new Error(`Row ${rowIndex} is a derived target of row ${sources.join(", ")}; clear those links first`)
    }
    return withTable(file, tableKey, (table) => ({ ...table, rows: table.rows.filter((_, index) => index !== rowIndex) }))
  }
  const actionRows = file.actionTable.rows.map((row, index) => {
    const first = toSigned(cellOf(row, ACTION_FIELD.transitionFirst))
    const last = toSigned(cellOf(row, ACTION_FIELD.transitionLast))
    if (first < 0) return row
    if (first <= rowIndex && rowIndex <= last) {
      throw new Error(`Transition row ${rowIndex} is inside the range of action row ${index}; edit that range first`)
    }
    if (first <= rowIndex) return row
    return row.map((cell, column) =>
      column === ACTION_FIELD.transitionFirst || column === ACTION_FIELD.transitionLast ? (toSigned(cell) - 1) >>> 0 : cell,
    )
  })
  return {
    ...file,
    actionTable: { ...file.actionTable, rows: actionRows },
    transitionTable: {
      ...file.transitionTable,
      rows: file.transitionTable.rows.filter((_, index) => index !== rowIndex),
    },
  }
}

export function describeResolved(entries: readonly ChrSysResolvedKey[] | undefined, key: number): string | null {
  const entry = entries?.find((candidate) => candidate.key === key)
  if (!entry) return null
  if (entry.function) return entry.function
  return entry.rawValue !== null ? `raw 0x${entry.rawValue.toString(16).toUpperCase()}` : null
}

export function groupEnterFunction(links: ChrSysMscLinks | null, group: number): string | null {
  return links ? describeResolved(links.groupCallbacks, group) : null
}

export function phaseFunction(links: ChrSysMscLinks | null, key: number): string | null {
  return links && key !== 0 ? describeResolved(links.phaseCallbacks, key) : null
}
