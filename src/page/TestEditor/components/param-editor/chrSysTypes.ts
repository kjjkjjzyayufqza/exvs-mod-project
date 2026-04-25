export interface ChrSysParamEntry {
  hash: number
  valueA: number
  valueB: number
  valueC: number
  valueD: number
}

export interface ChrSysParamFile {
  magic: number
  headerBytes: number[]
  entries: ChrSysParamEntry[]
}
