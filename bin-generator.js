import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate random number within specified range
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} precision - Decimal precision (default: 1)
 * @returns {number} Random number
 */
function randomRange(min, max, precision = 1) {
    const factor = Math.pow(10, precision);
    return Math.round((Math.random() * (max - min) + min) * factor) / factor;
}

/**
 * Generate OBJECT entry string
 * @param {Object} config - Configuration object
 * @param {Object} config.position - Position configuration {x: {min, max}, y: {min, max}, z: {min, max}}
 * @param {Object} config.rotation - Rotation configuration {x: {min, max}, y: {min, max}, z: {min, max}}
 * @param {Object} config.options - Additional options
 * @returns {string} OBJECT entry string
 */
function generateObjectEntry(config) {
    const { position, rotation, options = {} } = config;
    
    const posX = randomRange(position.x.min, position.x.max);
    const posY = randomRange(position.y.min, position.y.max);
    const posZ = randomRange(position.z.min, position.z.max);
    
    const rotX = randomRange(rotation.x.min, rotation.x.max);
    const rotY = randomRange(rotation.y.min, rotation.y.max);
    const rotZ = randomRange(rotation.z.min, rotation.z.max);
    
    const defaultOptions = {
        initialSpawn: true,
        placementName: '',
        objectNumber: 0,
        programId: 0,
        hitpoint: 'UNBREAKABLE',
        shadowCast: true
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    return `VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,${finalOptions.initialSpawn ? 'TRUE' : 'FALSE'},VDK_POSITION_X,${posX},VDK_POSITION_Y,${posY},VDK_POSITION_Z,${posZ},VDK_ROTATION_X,${rotX},VDK_ROTATION_Y,${rotY},VDK_ROTATION_Z,${rotZ},VDK_PLACEMENT_NAME,${finalOptions.placementName},VDK_OBJECTNUMBER,${finalOptions.objectNumber},VDK_PROGRAMID,${finalOptions.programId},VDK_HITPOINT,${finalOptions.hitpoint},VDK_SHADOW_CAST,${finalOptions.shadowCast ? 'TRUE' : 'FALSE'}`;
}

/**
 * Generate multiple objects with specified configuration
 * @param {number} count - Number of objects to generate
 * @param {Object} config - Configuration object
 * @returns {string[]} Array of OBJECT entry strings
 */
function generateObjects(count, config) {
    const objects = [];
    for (let i = 0; i < count; i++) {
        objects.push(generateObjectEntry(config));
    }
    return objects;
}

/**
 * Read existing .bin file
 * @param {string} filePath - Path to .bin file
 * @returns {string} File content
 */
function readBinFile(filePath) {
    try {
        return readFileSync(filePath, 'utf-8');
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error.message);
        throw error;
    }
}

/**
 * Append objects to .bin file
 * @param {string} filePath - Path to .bin file
 * @param {string[]} objects - Array of OBJECT entry strings
 * @param {string} comment - Optional comment to add before objects
 */
function appendToBinFile(filePath, objects, comment = '') {
    try {
        let existingContent = readBinFile(filePath);
        
        // Remove trailing empty lines
        existingContent = existingContent.replace(/\n+$/, '');
        
        let newContent = existingContent;
        
        // Add comment if provided
        if (comment) {
            newContent += `\n//${comment}`;
        }
        
        // Add new objects
        objects.forEach(obj => {
            newContent += `\n${obj}`;
        });
        
        // Add final newline
        newContent += '\n';
        
        writeFileSync(filePath, newContent, 'utf-8');
        console.log(`Successfully added ${objects.length} objects to ${filePath}`);
    } catch (error) {
        console.error(`Error writing to file ${filePath}:`, error.message);
        throw error;
    }
}

/**
 * Predefined configurations for different object types
 */
const PRESET_CONFIGS = {
    // Inside game area objects
    gameArea: {
        position: {
            x: { min: -480, max: 480 },
            y: { min: 1.0, max: 10.0 },
            z: { min: -480, max: 480 }
        },
        rotation: {
            x: { min: -35, max: 35 },
            y: { min: 0, max: 360 },
            z: { min: -35, max: 35 }
        }
    },
    
    // Outside decoration objects (background)
    outsideDecoration: {
        position: {
            x: { min: -2000, max: 2000 },
            y: { min: 40.0, max: 200.0 },
            z: { min: -2000, max: 2000 }
        },
        rotation: {
            x: { min: -60, max: 60 },
            y: { min: 0, max: 360 },
            z: { min: -60, max: 60 }
        }
    },
    
    // High altitude objects
    skyline: {
        position: {
            x: { min: -3000, max: 3000 },
            y: { min: 100.0, max: 1000.0 },
            z: { min: -3000, max: 3000 }
        },
        rotation: {
            x: { min: -90, max: 90 },
            y: { min: 0, max: 360 },
            z: { min: -90, max: 90 }
        }
    }
};

/**
 * Main function to demonstrate usage
 */
function main() {
    const binFilePath = join(__dirname, '17.bin');
    
    // Example: Add 10 game area objects
    console.log('Generating game area objects...');
    const gameObjects = generateObjects(10, PRESET_CONFIGS.gameArea);
    appendToBinFile(binFilePath, gameObjects, 'Game Area Objects');
    
    // Example: Add 15 outside decoration objects
    console.log('Generating outside decoration objects...');
    const decorationObjects = generateObjects(15, PRESET_CONFIGS.outsideDecoration);
    appendToBinFile(binFilePath, decorationObjects, 'Outside Decoration Objects');
    
    // Example: Add 8 skyline objects
    console.log('Generating skyline objects...');
    const skylineObjects = generateObjects(8, PRESET_CONFIGS.skyline);
    appendToBinFile(binFilePath, skylineObjects, 'Skyline Objects');
    
    console.log('All objects generated successfully!');
}

// Export functions for use in other modules
export {
    randomRange,
    generateObjectEntry,
    generateObjects,
    readBinFile,
    appendToBinFile,
    PRESET_CONFIGS
};

main();