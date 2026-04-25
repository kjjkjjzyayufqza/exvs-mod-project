import { invoke } from '@tauri-apps/api/core'

export interface CommandTableHeader {
  magic: number
  unk04: number
  fileSize: number
  unk0c: number
  entryCount: number
  commandsCount: number
  entrySize: number
  unk1c: number
}

export interface CommandDefinition {
  hash: number
  entryOffset: number
  flags: number
  kind: number
}

export interface CommandFieldValue {
  hash: number
  kind: number
  offset: number
  valueInt: number | null
  valueUint: number | null
  valueFloat: number | null
  valueString: string | null
  valueHex: string
}

export interface ParsedEntry {
  entryId: number
  entryIndex: number
  fields: CommandFieldValue[]
}

export interface ParsedCommandTable {
  header: CommandTableHeader
  commands: CommandDefinition[]
  entries: ParsedEntry[]
  fileType: string
}

export const COMMAND_TABLE_MAGIC = 0xCDABB8A9

export const KIND_LABELS: Record<number, string> = {
  1: 'u32 (raw/hash)',
  2: 'int (enum/id)',
  5: 'float',
  7: 'string offset',
}

export const FILE_TYPE_LABELS: Record<string, string> = {
  armsparam: 'Arms Param',
  bulletparam: 'Bullet Param',
  characterparam: 'Character Param',
  grapparam: 'Grap Param',
  hitgroupiddef: 'Hit Group ID Def',
  interactionid: 'Interaction ID',
  projectile_depiction_table: 'Projectile Depiction',
  speedparam: 'Speed Param',
  effect_project: 'Effect Project',
  vernier_table: 'Vernier Table',
}

export function detectFileType(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.includes('armsparam')) return 'armsparam'
  if (lower.includes('bulletparam')) return 'bulletparam'
  if (lower.includes('characterparam')) return 'characterparam'
  if (lower.includes('grapparam')) return 'grapparam'
  if (lower.includes('hitgroupiddef')) return 'hitgroupiddef'
  if (lower.includes('interactionid')) return 'interactionid'
  if (lower.includes('projectile_depiction')) return 'projectile_depiction_table'
  if (lower.includes('speedparam')) return 'speedparam'
  if (lower.includes('effect_project')) return 'effect_project'
  if (lower.includes('vernier_table')) return 'vernier_table'
  if (lower.includes('chrsysparam') || lower.endsWith('.csyspm')) return 'chrsysparam'
  return 'unknown'
}

export function isCommandTableFile(fileName: string): boolean {
  const type = detectFileType(fileName)
  return type !== 'unknown' && type !== 'chrsysparam'
}

export function isVgsht2File(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.vgsht2')
}

export function scanParamFileNames(fileList: string[]): string[] {
  const known = [
    "grapparam.bin",
    "projectile_depiction_table.bin",
    "chrsysparam.csyspm",
    "characterparam.bin",
    "interactionid.bin",
    "hitgroupiddef.bin",
    "bulletparam.bin",
    "speedparam.bin",
    "armsparam.bin",
  ]
  const vgsht2 = fileList.filter(f => {
    const lower = f.toLowerCase()
    return lower.endsWith('.vgsht2') && (lower.includes('effect_project') || lower.includes('vernier_table') || lower.includes('projectile_depiction'))
  })
  return [...known, ...vgsht2]
}

export async function parseCommandTableFile(path: string, fileType: string): Promise<ParsedCommandTable> {
  return await invoke<ParsedCommandTable>('parse_command_table_file', { path, fileType })
}

export async function buildCommandTableFile(tableJson: any, outputPath: string, fileType: string): Promise<void> {
  return await invoke('build_command_table_file', { tableJson, outputPath, fileType })
}

export async function updateCommandTableEntry(
  path: string,
  entryIndex: number,
  cmdHash: number,
  valueHex: string
): Promise<void> {
  return await invoke('update_command_table_entry', { path, entryIndex, cmdHash, valueHex })
}

export function formatHash(hash: number): string {
  return `0x${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`
}

export function formatFieldValue(field: CommandFieldValue): string {
  switch (field.kind) {
    case 1:
      return formatHash(field.valueUint ?? 0)
    case 2:
      return String(field.valueInt ?? 0)
    case 5: {
      const f = field.valueFloat ?? 0
      return Number.isFinite(f) ? f.toFixed(4) : 'NaN'
    }
    case 7:
      return field.valueString ?? ''
    default:
      return field.valueHex
  }
}

export function getFieldDisplayValue(field: CommandFieldValue): number | string {
  switch (field.kind) {
    case 1:
      return field.valueUint ?? 0
    case 2:
      return field.valueInt ?? 0
    case 5:
      return field.valueFloat ?? 0
    case 7:
      return field.valueString ?? ''
    default:
      return field.valueUint ?? 0
  }
}

export function encodeFieldValueToHex(kind: number, value: number | string): string {
  const buf = new ArrayBuffer(4)
  const view = new DataView(buf)
  switch (kind) {
    case 1:
      view.setUint32(0, Number(value), true)
      break
    case 2:
      view.setInt32(0, Number(value), true)
      break
    case 5:
      view.setFloat32(0, Number(value), true)
      break
    default:
      view.setUint32(0, Number(value), true)
      break
  }
  const arr = new Uint8Array(buf)
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
