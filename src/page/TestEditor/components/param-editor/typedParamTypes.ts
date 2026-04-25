export type TypedFieldValue = number | string | boolean | null

export type TypedParamEntry = Record<string, TypedFieldValue>

export interface TypedParamFile {
  header: Record<string, number>
  fieldSpecs: Array<Record<string, number>>
  entryIds: number[]
  entries: TypedParamEntry[]
  trailingData: number[]
}
