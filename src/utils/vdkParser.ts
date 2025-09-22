import { VdkConfig, VdkObjectInfo } from '../types/vdk';

/**
 * Parse VDK configuration from text content
 * @param content The raw text content from the .bin file
 * @returns Array of parsed VDK configurations
 */
export function parseVdkConfig(content: string): VdkConfig[] {
    const configs: VdkConfig[] = [];
    const lines = content.trim().split('\n').filter(line => line.trim() !== '');

    for (const line of lines) {
        const config: Partial<VdkConfig> = {};
        const pairs = line.split(',');

        for (let i = 0; i < pairs.length; i += 2) {
            const key = pairs[i]?.trim();
            const value = pairs[i + 1]?.trim();

            if (!key || !value) continue;

            switch (key) {
                case 'VDK_TYPE':
                    config.VDK_TYPE = value as any;
                    break;
                case 'VDK_INITIAL_SPAWN':
                    config.VDK_INITIAL_SPAWN = value === 'TRUE';
                    break;
                case 'VDK_POSITION_X':
                case 'VDK_POSITION_Y':
                case 'VDK_POSITION_Z':
                case 'VDK_ROTATION_X':
                case 'VDK_ROTATION_Y':
                case 'VDK_ROTATION_Z':
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                        (config as any)[key] = numValue;
                    }
                    break;
                case 'VDK_PLACEMENT_NAME':
                    config.VDK_PLACEMENT_NAME = value;
                    break;
                case 'VDK_OBJECTNUMBER':
                case 'VDK_PROGRAMID':
                    const intValue = parseInt(value, 10);
                    if (!isNaN(intValue)) {
                        (config as any)[key] = intValue;
                    }
                    break;
                case 'VDK_HITPOINT':
                    config.VDK_HITPOINT = value;
                    break;
                case 'VDK_SHADOW_CAST':
                    config.VDK_SHADOW_CAST = value === 'TRUE';
                    break;
            }
        }

        if (config.VDK_TYPE) {
            configs.push(config as VdkConfig);
        }
    }

    return configs;
}

/**
 * Group VDK OBJECT configurations by object number and collect all positions/rotations
 * @param configs Array of VDK configurations
 * @returns Map of object number to object info with all positions and rotations
 */
export function groupVdkObjects(configs: VdkConfig[]): Map<number, VdkObjectInfo> {
    const objectMap = new Map<number, VdkObjectInfo>();

    // Filter only OBJECT type configs
    const objectConfigs = configs.filter(config => config.VDK_TYPE === 'OBJECT');

    // Group configs by object number and collect all positions/rotations
    for (const config of objectConfigs) {
        if (config.VDK_OBJECTNUMBER !== undefined) {
            const objectNumber = config.VDK_OBJECTNUMBER;

            if (!objectMap.has(objectNumber)) {
                // Create new entry for this object number
                objectMap.set(objectNumber, {
                    objectNumber: objectNumber,
                    programId: config.VDK_PROGRAMID || 0,
                    hitPoint: config.VDK_HITPOINT || 'UNBREAKABLE',
                    shadowCast: config.VDK_SHADOW_CAST || false,
                    positions: [],
                    rotations: [],
                    count: 0
                });
            }

            // Add this config's position and rotation to the arrays
            const objectInfo = objectMap.get(objectNumber)!;
            objectInfo.positions.push([
                config.VDK_POSITION_X || 0,
                config.VDK_POSITION_Y || 0,
                config.VDK_POSITION_Z || 0
            ]);
            objectInfo.rotations.push([
                config.VDK_ROTATION_X || 0,
                config.VDK_ROTATION_Y || 0,
                config.VDK_ROTATION_Z || 0
            ]);
            objectInfo.count += 1;

            console.log(`VDK Debug: Added config for object ${objectNumber}, position: [${objectInfo.positions[objectInfo.positions.length - 1]}], total count: ${objectInfo.count}`);
        }
    }

    // Debug: Log final grouped results
    console.log('VDK Debug: Final grouped objects:');
    for (const [objectNumber, objectInfo] of objectMap) {
        console.log(`  Object ${objectNumber}: ${objectInfo.count} instances`);
        objectInfo.positions.forEach((pos, index) => {
            console.log(`    Instance ${index}: position [${pos.join(', ')}], rotation [${objectInfo.rotations[index].join(', ')}]`);
        });
    }

    return objectMap;
}

/**
 * Load and parse VDK configuration from file path
 * @param filePath Path to the .bin file
 * @returns Promise resolving to parsed VDK configurations
 */
export async function loadVdkConfig(filePath: string): Promise<VdkConfig[]> {
    try {
        const { readFile } = await import('@tauri-apps/plugin-fs');
        const fileContent = await readFile(filePath);
        const textContent = new TextDecoder().decode(fileContent);
        return parseVdkConfig(textContent);
    } catch (error) {
        console.error('Failed to load VDK config:', error);
        throw error;
    }
}
