export interface ChrSysParamTable {
  marker: number
  reserved: number
  columns: number
  rows: number[][]
}

export interface ChrSysParamFile {
  unitId: number
  headerReserved: number
  actionTable: ChrSysParamTable
  transitionTable: ChrSysParamTable
}

export type ChrSysTableKey = "actionTable" | "transitionTable"

export type ChrSysValueFormat = "hash" | "signed" | "mask"

export type ChrSysFieldSection =
  | "identity"
  | "inputCommand"
  | "routing"
  | "phaseHooks"
  | "derivedChain"
  | "motionTuning"
  | "archetypeParams"
  | "transition"
  | "unused"

export type ChrSysEvidenceGrade = "E0" | "E1" | "E2"

export interface ChrSysFieldSpec {
  field: number
  key: string
  label: string
  section: ChrSysFieldSection
  format: ChrSysValueFormat
  evidence: ChrSysEvidenceGrade
  description: string
}

export interface ChrSysRouteEntry {
  group: number
  route: number
  flags: number
  alternateFlags: number
}

export interface ChrSysSchema {
  action: ChrSysFieldSpec[]
  transition: ChrSysFieldSpec[]
  routeTable: ChrSysRouteEntry[]
}

export interface ChrSysIssue {
  level: "error" | "warning"
  table: "action" | "transition"
  row: number | null
  field: number | null
  message: string
}

export interface ChrSysResolvedKey {
  key: number
  function: string | null
  rawValue: number | null
}

export interface ChrSysFieldReader {
  function: string
  table: number
  fields: number[]
}

export interface ChrSysFieldGlobal {
  field: number
  global: string
  loaderFunction: string
  readerFunctions: string[]
}

export interface ChrSysMscLinks {
  scriptDir: string
  registrationFunction: string
  groupResolverFunction: string
  phaseResolverFunction: string
  rowReaderFunction: string
  groupCallbacks: ChrSysResolvedKey[]
  phaseCallbacks: ChrSysResolvedKey[]
  fieldGlobals: ChrSysFieldGlobal[]
  scriptFieldReaders: ChrSysFieldReader[]
  inputBridgeReaders: ChrSysFieldReader[]
  pointerTableAvailable: boolean
}
