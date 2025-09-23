import { readTextFile } from '@tauri-apps/plugin-fs'
import { VdkConfig, VdkObjectInfo } from '../types/vdk'

/**
 * Parse VDK configuration from text content
 * @param content The raw text content from the .bin file
 * @returns Array of parsed VDK configurations
 */
export function parseVdkConfig (content: string): VdkConfig[] {
  const configs: VdkConfig[] = []
  const lines = content
    .trim()
    .split('\n')
    .filter(line => line.trim() !== '')

  for (const line of lines) {
    const config: Partial<VdkConfig> = {}
    const pairs = line.split(',')

    for (let i = 0; i < pairs.length; i += 2) {
      const key = pairs[i]?.trim()
      const value = pairs[i + 1]?.trim()

      if (!key || !value) continue

      switch (key) {
        case 'VDK_TYPE':
          config.VDK_TYPE = value as any
          break
        case 'VDK_INITIAL_SPAWN':
          config.VDK_INITIAL_SPAWN = value === 'TRUE'
          break
        case 'VDK_SHADOW_CAST':
          config.VDK_SHADOW_CAST = value === 'TRUE'
          break
        case 'VDK_PROP_RELEASE_ATTACH':
          config.VDK_PROP_RELEASE_ATTACH = value === 'TRUE'
          break
        case 'VDK_POSITION_X':
          const posX = parseFloat(value)
          if (!isNaN(posX)) config.VDK_POSITION_X = posX
          break
        case 'VDK_POSITION_Y':
          const posY = parseFloat(value)
          if (!isNaN(posY)) config.VDK_POSITION_Y = posY
          break
        case 'VDK_POSITION_Z':
          const posZ = parseFloat(value)
          if (!isNaN(posZ)) config.VDK_POSITION_Z = posZ
          break
        case 'VDK_ROTATION_X':
          const rotX = parseFloat(value)
          if (!isNaN(rotX)) config.VDK_ROTATION_X = rotX
          break
        case 'VDK_ROTATION_Y':
          const rotY = parseFloat(value)
          if (!isNaN(rotY)) config.VDK_ROTATION_Y = rotY
          break
        case 'VDK_ROTATION_Z':
          const rotZ = parseFloat(value)
          if (!isNaN(rotZ)) config.VDK_ROTATION_Z = rotZ
          break
        case 'VDK_SCALE_X':
          const scaleX = parseFloat(value)
          if (!isNaN(scaleX)) config.VDK_SCALE_X = scaleX
          break
        case 'VDK_SCALE_Y':
          const scaleY = parseFloat(value)
          if (!isNaN(scaleY)) config.VDK_SCALE_Y = scaleY
          break
        case 'VDK_SCALE_Z':
          const scaleZ = parseFloat(value)
          if (!isNaN(scaleZ)) config.VDK_SCALE_Z = scaleZ
          break
        case 'VDK_BREAK_SHOCKWAVE_RADIUS':
          const shockRadius = parseFloat(value)
          if (!isNaN(shockRadius)) config.VDK_BREAK_SHOCKWAVE_RADIUS = shockRadius
          break
        case 'VDK_BREAK_SHOCKWAVE_POWER':
          const shockPower = parseFloat(value)
          if (!isNaN(shockPower)) config.VDK_BREAK_SHOCKWAVE_POWER = shockPower
          break
        case 'VDK_PROP_IMPULSE_EFFECT_RESTRAINT_RATIO':
          const restraintRatio = parseFloat(value)
          if (!isNaN(restraintRatio)) config.VDK_PROP_IMPULSE_EFFECT_RESTRAINT_RATIO = restraintRatio
          break
        case 'VDK_PROP_IMPULSE_EFFECT_SCALE':
          const impulseScale = parseFloat(value)
          if (!isNaN(impulseScale)) config.VDK_PROP_IMPULSE_EFFECT_SCALE = impulseScale
          break
        case 'VDK_PROP_IMPULSE_EFFECT_STRENGTH':
          const impulseStrength = parseFloat(value)
          if (!isNaN(impulseStrength)) config.VDK_PROP_IMPULSE_EFFECT_STRENGTH = impulseStrength
          break
        case 'VDK_OBJECTNUMBER':
          const objNum = parseInt(value, 10)
          if (!isNaN(objNum)) config.VDK_OBJECTNUMBER = objNum
          break
        case 'VDK_PROGRAMID':
          const progId = parseInt(value, 10)
          if (!isNaN(progId)) config.VDK_PROGRAMID = progId
          break
        case 'VDK_EFFECT_TIME_OFFSET':
          const effectOffset = parseInt(value, 10)
          if (!isNaN(effectOffset)) config.VDK_EFFECT_TIME_OFFSET = effectOffset
          break
        case 'VDK_SE_TIME_OFFSET':
          const seOffset = parseInt(value, 10)
          if (!isNaN(seOffset)) config.VDK_SE_TIME_OFFSET = seOffset
          break
        case 'VDK_PROP_LIFE_MAX':
          const lifeMax = parseInt(value, 10)
          if (!isNaN(lifeMax)) config.VDK_PROP_LIFE_MAX = lifeMax
          break
        case 'VDK_PLACEMENT_NAME':
          config.VDK_PLACEMENT_NAME = value
          break
        case 'VDK_HITPOINT':
          config.VDK_HITPOINT = value
          break
        case 'VDK_EFFECT_ID':
          config.VDK_EFFECT_ID = value
          break
        case 'VDK_SE_ID':
          config.VDK_SE_ID = value
          break
        case 'VDK_PROP_IMPULSE_EFFECT_WEAK_ID':
          config.VDK_PROP_IMPULSE_EFFECT_WEAK_ID = value
          break
        case 'VDK_PROP_IMPULSE_EFFECT_STRONG_ID':
          config.VDK_PROP_IMPULSE_EFFECT_STRONG_ID = value
          break
        case 'VDK_PROP_DISAPPEAR_EFFECT_ID':
          config.VDK_PROP_DISAPPEAR_EFFECT_ID = value
          break
        case 'VDK_SUBSTITUTE_PLACEMENT':
        case 'VDK_CAMERA_BIND_PLACEMENT':
          // Handle multiple placement values - they can appear multiple times in the same config
          const placementValue = parseInt(value, 10)
          if (!isNaN(placementValue)) {
            if (!config[key]) {
              config[key] = placementValue
            } else if (Array.isArray(config[key])) {
              ;(config[key] as number[]).push(placementValue)
            } else {
              // Convert single value to array and add new value
              config[key] = [config[key] as number, placementValue]
            }
          }
          break
      }
    }

    if (config.VDK_TYPE) {
      configs.push(config as VdkConfig)
    }
  }

  return configs
}

/**
 * Group VDK OBJECT configurations by object number and collect all positions/rotations
 * @param configs Array of VDK configurations
 * @returns Map of object number to object info with all positions and rotations
 */
export function groupVdkObjects (configs: VdkConfig[]): Map<number, VdkObjectInfo> {
  const objectMap = new Map<number, VdkObjectInfo>()

  // Filter only OBJECT type configs
  const objectConfigs = configs.filter(config => config.VDK_TYPE === 'OBJECT')

  // Group configs by object number and collect all positions/rotations
  for (const config of objectConfigs) {
    if (config.VDK_OBJECTNUMBER !== undefined) {
      const objectNumber = config.VDK_OBJECTNUMBER

      if (!objectMap.has(objectNumber)) {
        // Create new entry for this object number
        objectMap.set(objectNumber, {
          objectNumber: objectNumber,
          programId: config.VDK_PROGRAMID || 0,
          hitPoint: config.VDK_HITPOINT || 'UNBREAKABLE',
          shadowCast: config.VDK_SHADOW_CAST || false,
          positions: [],
          rotations: [],
          count: 0,
          breakShockwaveRadius: [],
          breakShockwavePower: [],
          substitutePlacements: [],
          cameraBindPlacements: []
        })
      }

      // Add this config's position and rotation to the arrays
      const objectInfo = objectMap.get(objectNumber)!
      objectInfo.positions.push([config.VDK_POSITION_X || 0, config.VDK_POSITION_Y || 0, config.VDK_POSITION_Z || 0])
      objectInfo.rotations.push([config.VDK_ROTATION_X || 0, config.VDK_ROTATION_Y || 0, config.VDK_ROTATION_Z || 0])
      
      // Add object enhancement properties
      objectInfo.breakShockwaveRadius.push(config.VDK_BREAK_SHOCKWAVE_RADIUS || 0)
      objectInfo.breakShockwavePower.push(config.VDK_BREAK_SHOCKWAVE_POWER || 0)
      objectInfo.substitutePlacements.push(config.VDK_SUBSTITUTE_PLACEMENT || [])
      objectInfo.cameraBindPlacements.push(config.VDK_CAMERA_BIND_PLACEMENT || [])
      
      objectInfo.count += 1

      console.log(`VDK Debug: Added config for object ${objectNumber}, position: [${objectInfo.positions[objectInfo.positions.length - 1]}], total count: ${objectInfo.count}`)
    }
  }

  // Debug: Log final grouped results
  console.log('VDK Debug: Final grouped objects:')
  for (const [objectNumber, objectInfo] of objectMap) {
    console.log(`  Object ${objectNumber}: ${objectInfo.count} instances`)
    objectInfo.positions.forEach((pos, index) => {
      console.log(`    Instance ${index}: position [${pos.join(', ')}], rotation [${objectInfo.rotations[index].join(', ')}]`)
    })
  }

  return objectMap
}

/**
 * Load and parse VDK configuration from file path
 * @param filePath Path to the .bin file
 * @returns Promise resolving to parsed VDK configurations
 */
export async function loadVdkConfig (filePath: string): Promise<VdkConfig[]> {
  try {
    const fileContent = await readTextFile(filePath)
    return parseVdkConfig(fileContent)
  } catch (error) {
    console.error('Failed to load VDK config:', error)
    throw error
  }
}
