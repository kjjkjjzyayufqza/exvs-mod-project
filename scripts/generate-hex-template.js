/**
 * Clone a hex template per bone entry: patch floats (LE) and bone_index (uint32 BE).
 * Writes all records concatenated to OUTPUT_BIN (overwrites each run).
 * Run: node scripts/generate-hex-template.js
 */

import fs from 'fs'
import path from 'path'

const OUTPUT_BIN = 'E:\\XB\\解包\\com\\file\\0xA014012A\\test.bin'

const TEMPLATE_HEX = `
00 00 00 00 00 00 00 00 01 00 00 00 F6 7F 84 0C 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 8A 02 00 00 00 00 00 00 00 00 00 00 00 00 A0 42 00 00 C8 41 00 00 00 00 17 E6 F0 7F 00 00 00 00 00 00 00 00 00 00 96 42 00 00 00 00 00 00 00 C1 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 00 00 00 00 00 00 00 00 00 00 00 64 2A 8B 73 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 42 F6 5D 0F FC 00 00 34 42 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 92 5A 9A FF 00 00 00 00 00 00 00 41 00 00 00 00 EF 01 60 92 00 00 00 C0 00 00 00 00 00 00 00 00 13 07 EC F8 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
`

/** Eight hex digits per entry (uint32), written big-endian at 0xf8. */
const BONE_INDEX_HEX = [
  '9A97B437',
  '137F837B',
  'EA6DA304',
  'BE39AE13',
  '9884F420',
  '1ACEBFBA',
  '9E0D4DFC',
  '5A6D0ACD',
  '3AD9150B',
  '45652AAE',
  '656612FB',
  '5214070E',
  'F6D75A3B',
  '346707D2',
  '8FB3B918',
  '3C2046FC',
  '92E24B81',
  '20DD2C37',
  '7C9424D1',
  '29D34188',
  '175D08C0',
  'A3266962',
  '651D18D9',
  'F259C723',
  '413856F8',
  '262C6307',
  '8B3E9607',
  '5A66EE68',
  '0587364D',
  '7F109729',
  'E55E5FB3',
  'A313B3DD'
]

/**
 * Per float field: `initial` is the base for stepped mode.
 * `type` is either { kind: "step", step } or { kind: "random", min, max }.
 */
const LEFT_RIGHT = {
  initial: 80,
  type: { kind: 'random', min: 60, max: 120 }
}
const WAIT_TIME = {
  initial: 25,
  type: { kind: 'step', step: 5 }
}
const UP_DOWN = {
  initial: -8,
  type: { kind: 'step', step: 10 }
}

/**
 * When true and PLACEMENTS_PER_BONE length matches BONE_INDEX_HEX, left_right / up_down
 * come from the array (paste from plot-lr-ud.html "Copy all result"). LEFT_RIGHT / UP_DOWN are ignored for those floats.
 */
const USE_PLACEMENT_OVERRIDES = true

/**
 * Per-record overrides from plot-lr-ud.html copy (left_right: canvas left = positive).
 * Set to null when USE_PLACEMENT_OVERRIDES is false.
 * @type {{ left_right: number, up_down: number }[] | null}
 */
const PLACEMENTS_PER_BONE = [
  { left_right: 80, up_down: -8 },
  { left_right: 86, up_down: 2 },
  { left_right: 91, up_down: 14 },
  { left_right: 91, up_down: 26 },
  { left_right: 88, up_down: 44 },
  { left_right: 86, up_down: 58 },
  { left_right: 98, up_down: -7 },
  { left_right: 102, up_down: 5 },
  { left_right: 108, up_down: 18 },
  { left_right: 108, up_down: 34 },
  { left_right: 114, up_down: 48 },
  { left_right: 121, up_down: 61 },
  { left_right: 116, up_down: 1 },
  { left_right: 123, up_down: 13 },
  { left_right: 128, up_down: 30 },
  { left_right: 135, up_down: 45 },
  { left_right: -80, up_down: -8 },
  { left_right: -84, up_down: 5 },
  { left_right: -82, up_down: 15 },
  { left_right: -78, up_down: 26 },
  { left_right: -75, up_down: 40 },
  { left_right: -73, up_down: 54 },
  { left_right: -94, up_down: -6 },
  { left_right: -97, up_down: 8 },
  { left_right: -103, up_down: 23 },
  { left_right: -104, up_down: 37 },
  { left_right: -109, up_down: 51 },
  { left_right: -115, up_down: 63 },
  { left_right: -111, up_down: -5 },
  { left_right: -119, up_down: 8 },
  { left_right: -129, up_down: 24 },
  { left_right: -158, up_down: 45 }
]
/**
 * Float32 LE at 0x10c per record, aligned with BONE_INDEX_HEX order.
 * Ranges: 9A97B437–1ACEBFBA → 10; 9E0D4DFC–5214070E → 20; F6D75A3B–3C2046FC → 30;
 * 92E24B81–A3266962 → -10; 651D18D9–5A66EE68 → -20; 0587364D–A313B3DD → -30.
 */
const SHOT_DIRECTION_PER_BONE = [10, 10, 10, 10, 10, 10, 20, 20, 20, 20, 20, 20, 30, 30, 30, 30, -10, -10, -10, -10, -10, -10, -20, -20, -20, -20, -20, -20, -30, -30, -30, -30]

const OFFSETS = {
  left_right: 0x44,
  wait_time: 0x48,
  up_down: 0x64,
  bone_index: 0xf8,
  shot_direction: 0x10c
}

function hexStringToUint8Array (hexStr) {
  const cleaned = hexStr.replace(/\s+/g, '')
  if (cleaned.length % 2 !== 0) {
    throw new Error(`Invalid hex string length (must be even): ${cleaned.length}`)
  }
  const out = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) {
      throw new Error(`Invalid hex at pair index ${i}`)
    }
    out[i] = byte
  }
  return out
}

function bytesToHexSpaced (bytes) {
  return Array.from(bytes, b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
}

function assertU32Hex8 (s) {
  if (typeof s !== 'string' || !/^[0-9A-Fa-f]{8}$/.test(s)) {
    throw new Error(`bone_index entry must be exactly 8 hex digits, got: ${JSON.stringify(s)}`)
  }
}

function cloneTemplateBytes () {
  return new Uint8Array(hexStringToUint8Array(TEMPLATE_HEX))
}

function randomFloatInRange (min, max) {
  if (min > max) {
    throw new Error(`random range invalid: min (${min}) > max (${max})`)
  }
  return min + Math.random() * (max - min)
}

function resolveRangedFloat (spec, recordIndex) {
  const t = spec.type
  if (t.kind === 'random') {
    if (typeof t.min !== 'number' || typeof t.max !== 'number') {
      throw new Error('type { kind: "random" } requires numeric min and max')
    }
    return randomFloatInRange(t.min, t.max)
  }
  if (t.kind === 'step') {
    if (typeof spec.initial !== 'number' || typeof t.step !== 'number') {
      throw new Error('type { kind: "step" } requires numeric initial and step')
    }
    return spec.initial + recordIndex * t.step
  }
  throw new Error(`Unknown float field type.kind: ${JSON.stringify(t)}`)
}

function getLeftRightUpDown (recordIndex) {
  if (USE_PLACEMENT_OVERRIDES && PLACEMENTS_PER_BONE != null && PLACEMENTS_PER_BONE.length === BONE_INDEX_HEX.length) {
    const o = PLACEMENTS_PER_BONE[recordIndex]
    return { leftRight: o.left_right, upDown: o.up_down }
  }
  if (USE_PLACEMENT_OVERRIDES && PLACEMENTS_PER_BONE != null) {
    throw new Error(`USE_PLACEMENT_OVERRIDES is true but PLACEMENTS_PER_BONE.length (${PLACEMENTS_PER_BONE.length}) !== BONE_INDEX_HEX.length (${BONE_INDEX_HEX.length})`)
  }
  return {
    leftRight: resolveRangedFloat(LEFT_RIGHT, recordIndex),
    upDown: resolveRangedFloat(UP_DOWN, recordIndex)
  }
}

function getShotDirection (recordIndex) {
  if (SHOT_DIRECTION_PER_BONE.length !== BONE_INDEX_HEX.length) {
    throw new Error(`SHOT_DIRECTION_PER_BONE.length (${SHOT_DIRECTION_PER_BONE.length}) must equal BONE_INDEX_HEX.length (${BONE_INDEX_HEX.length})`)
  }
  const v = SHOT_DIRECTION_PER_BONE[recordIndex]
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`Invalid shot_direction at index ${recordIndex}: ${JSON.stringify(v)}`)
  }
  return v
}

function patchRecord (bytes, recordIndex) {
  const boneHex = BONE_INDEX_HEX[recordIndex]
  assertU32Hex8(boneHex)

  const minLen = Math.max(OFFSETS.left_right, OFFSETS.wait_time, OFFSETS.up_down, OFFSETS.bone_index, OFFSETS.shot_direction) + 4
  if (bytes.length < minLen) {
    throw new Error(`Template length ${bytes.length} < required ${minLen}`)
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  const { leftRight, upDown } = getLeftRightUpDown(recordIndex)
  const waitTime = resolveRangedFloat(WAIT_TIME, recordIndex)

  view.setFloat32(OFFSETS.left_right, leftRight, true)
  view.setFloat32(OFFSETS.wait_time, waitTime, true)
  view.setFloat32(OFFSETS.up_down, upDown, true)
  view.setUint32(OFFSETS.bone_index, parseInt(boneHex, 16), false)
  view.setFloat32(OFFSETS.shot_direction, getShotDirection(recordIndex), true)
}

function readFloat32LE (view, offset) {
  return view.getFloat32(offset, true)
}

function readHexStringU32BE (view, offset) {
  const v = view.getUint32(offset, false)
  return `0x${v.toString(16).toUpperCase().padStart(8, '0')}`
}

function summarizeRecord (bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    left_right: readFloat32LE(view, OFFSETS.left_right),
    wait_time: readFloat32LE(view, OFFSETS.wait_time),
    up_down: readFloat32LE(view, OFFSETS.up_down),
    bone_index: readHexStringU32BE(view, OFFSETS.bone_index),
    shot_direction: readFloat32LE(view, OFFSETS.shot_direction)
  }
}

function buildRecords () {
  const records = []
  for (let i = 0; i < BONE_INDEX_HEX.length; i++) {
    const bytes = cloneTemplateBytes()
    patchRecord(bytes, i)
    records.push(bytes)
  }
  return records
}

function concatRecordBytes (records) {
  const total = records.reduce((sum, r) => sum + r.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const r of records) {
    out.set(r, offset)
    offset += r.length
  }
  return out
}

function writeBinFile (filePath, data) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, Buffer.from(data))
}

function main () {
  const baseLen = hexStringToUint8Array(TEMPLATE_HEX).length
  console.log('Template byte length:', baseLen)
  console.log('Record count:', BONE_INDEX_HEX.length)
  console.log('left_right:', LEFT_RIGHT.type.kind === 'random' ? `random [${LEFT_RIGHT.type.min}, ${LEFT_RIGHT.type.max}]` : `step initial=${LEFT_RIGHT.initial} step=${LEFT_RIGHT.type.step}`)
  console.log('wait_time:', WAIT_TIME.type.kind === 'random' ? `random [${WAIT_TIME.type.min}, ${WAIT_TIME.type.max}]` : `step initial=${WAIT_TIME.initial} step=${WAIT_TIME.type.step}`)
  console.log('up_down:', UP_DOWN.type.kind === 'random' ? `random [${UP_DOWN.type.min}, ${UP_DOWN.type.max}]` : `step initial=${UP_DOWN.initial} step=${UP_DOWN.type.step}`)
  if (USE_PLACEMENT_OVERRIDES && PLACEMENTS_PER_BONE && PLACEMENTS_PER_BONE.length === BONE_INDEX_HEX.length) {
    console.log('left_right / up_down: PLACEMENTS_PER_BONE (overrides)')
  }
  console.log('shot_direction: per bone (SHOT_DIRECTION_PER_BONE)')
  console.log('')

  const records = buildRecords()
  const combined = concatRecordBytes(records)

  writeBinFile(OUTPUT_BIN, combined)
  console.log(`Wrote ${combined.length} bytes to ${OUTPUT_BIN}`)
  console.log('')

  records.forEach((bytes, i) => {
    const s = summarizeRecord(bytes)
    console.log(`--- record ${i} (bone ${BONE_INDEX_HEX[i]}) ---`)
    console.log(`  left_right: ${s.left_right}`)
    console.log(`  wait_time: ${s.wait_time}`)
    console.log(`  up_down: ${s.up_down}`)
    console.log(`  bone_index (u32 BE): ${s.bone_index}`)
    console.log(`  shot_direction: ${s.shot_direction}`)
    console.log(`  hex: ${bytesToHexSpaced(bytes)}`)
    console.log('')
  })
}

main()
