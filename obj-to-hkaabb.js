/**
 * OBJ to hkAabb XML Updater
 * Updates hkAabb records in Havok XML files based on OBJ collision volumes
 * Usage: node obj-to-hkaabb.js <obj_file_path> <xml_file_path>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse OBJ file and extract vertex data
 * @param {string} objContent - OBJ file content
 * @returns {Array} Array of vertex coordinates [[x, y, z], ...]
 */
function parseOBJVertices(objContent) {
    const vertices = [];
    const lines = objContent.split('\n');

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('v ')) {
            const parts = trimmedLine.split(/\s+/);
            if (parts.length >= 4) {
                const x = parseFloat(parts[1]);
                const y = parseFloat(parts[2]);
                const z = parseFloat(parts[3]);
                if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                    vertices.push([x, y, z]);
                }
            }
        }
    }

    return vertices;
}

/**
 * Group vertices into cubes (8 vertices per cube)
 * @param {Array} vertices - Array of vertex coordinates
 * @returns {Array} Array of cubes, each cube is array of 8 vertices
 */
function groupVerticesIntoCubes(vertices) {
    const cubes = [];

    for (let i = 0; i < vertices.length; i += 8) {
        const cube = vertices.slice(i, i + 8);
        if (cube.length === 8) {
            cubes.push(cube);
        }
    }

    return cubes;
}

/**
 * Calculate AABB from cube vertices
 * @param {Array} cubeVertices - Array of 8 vertices for one cube
 * @returns {Object} AABB with min and max properties
 */
function calculateAABB(cubeVertices) {
    if (cubeVertices.length === 0) {
        throw new Error('No vertices provided for AABB calculation');
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const vertex of cubeVertices) {
        const [x, y, z] = vertex;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
    }

    // For hkAabb format, we need 4 values: [minX, minY, minZ, w] and [maxX, maxY, maxZ, w]
    // The w component seems to be related to the Y bounds in the XML
    const min = [minX, minY, minZ, minY]; // Using minY as w component for min
    const max = [maxX, maxY, maxZ, maxY]; // Using maxY as w component for max

    return { min, max };
}

/**
 * Convert float to Havok hex format
 * @param {number} value - Float value
 * @returns {string} Hex representation
 */
function floatToHavokHex(value) {
    // Convert float to IEEE 754 hex representation
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, value, true); // Little endian
    let hex = '';
    for (let i = 7; i >= 0; i--) {
        hex += view.getUint8(i).toString(16).padStart(2, '0');
    }
    return '#' + hex.toUpperCase();
}

/**
 * Update hkAabb records in XML content
 * @param {string} xmlContent - Original XML content
 * @param {Array} aabbs - Array of AABB objects with min/max
 * @returns {string} Updated XML content
 */
function updateHkAabbInXML(xmlContent, aabbs) {
    let updatedContent = xmlContent;
    let replacementCount = 0;

    // Find all hkAabb records
    const hkAabbRegex = /<record>\s*<!-- hkAabb -->[\s\S]*?<\/record>/g;
    let match;
    const matches = [];

    while ((match = hkAabbRegex.exec(xmlContent)) !== null) {
        matches.push({
            fullMatch: match[0],
            index: match.index,
            length: match[0].length
        });
    }

    console.log(`Found ${matches.length} hkAabb records in XML`);
    console.log(`Provided ${aabbs.length} AABB updates`);

    if (matches.length !== aabbs.length) {
        console.warn(`Warning: Number of hkAabb records (${matches.length}) doesn't match number of AABBs (${aabbs.length})`);
    }

    // Process each hkAabb record
    for (let i = 0; i < Math.min(matches.length, aabbs.length); i++) {
        const match = matches[i];
        const aabb = aabbs[i];

        // Create new hkAabb record
        const newHkAabb = createHkAabbRecord(aabb);

        // Replace the old record with new one
        updatedContent = updatedContent.replace(match.fullMatch, newHkAabb);

        console.log(`Updated hkAabb ${i + 1}:`);
        console.log(`  Min: [${aabb.min.join(', ')}]`);
        console.log(`  Max: [${aabb.max.join(', ')}]`);

        replacementCount++;
    }

    console.log(`Successfully updated ${replacementCount} hkAabb records`);

    return updatedContent;
}

/**
 * Create hkAabb XML record from AABB data
 * @param {Object} aabb - AABB object with min and max arrays
 * @returns {string} XML record string
 */
function createHkAabbRecord(aabb) {
    const { min, max } = aabb;

    return `            <record> <!-- hkAabb -->
              <field name="min">
                <array count="4" elementtypeid="type48"> <!-- ArrayOf float -->
                  <real dec="${min[0].toFixed(6)}" hex="${floatToHavokHex(min[0])}"/>
                  <real dec="${min[1].toFixed(6)}" hex="${floatToHavokHex(min[1])}"/>
                  <real dec="${min[2].toFixed(6)}" hex="${floatToHavokHex(min[2])}"/>
                  <real dec="${min[3].toFixed(6)}" hex="${floatToHavokHex(min[3])}"/>
                </array>
              </field>
              <field name="max">
                <array count="4" elementtypeid="type48"> <!-- ArrayOf float -->
                  <real dec="${max[0].toFixed(6)}" hex="${floatToHavokHex(max[0])}"/>
                  <real dec="${max[1].toFixed(6)}" hex="${floatToHavokHex(max[1])}"/>
                  <real dec="${max[2].toFixed(6)}" hex="${floatToHavokHex(max[2])}"/>
                  <real dec="${max[3].toFixed(6)}" hex="${floatToHavokHex(max[3])}"/>
                </array>
              </field>
            </record>`;
}

/**
 * Main function to update hkAabb data from OBJ to XML
 * @param {string} objFilePath - Path to OBJ file
 * @param {string} xmlFilePath - Path to XML file
 * @param {string} outputPath - Optional output path for updated XML
 */
function updateHkAabbFromOBJ(objFilePath, xmlFilePath, outputPath = null) {
    try {
        console.log(`Reading OBJ file: ${objFilePath}`);
        const objContent = fs.readFileSync(objFilePath, 'utf8');
        console.log(`OBJ file loaded, size: ${objContent.length} characters`);

        console.log('Parsing OBJ vertices...');
        const vertices = parseOBJVertices(objContent);
        console.log(`Found ${vertices.length} vertices in OBJ file`);

        console.log('Grouping vertices into cubes...');
        const cubes = groupVerticesIntoCubes(vertices);
        console.log(`Grouped into ${cubes.length} cubes`);

        console.log('Calculating AABBs for each cube...');
        const aabbs = cubes.map((cube, index) => {
            const aabb = calculateAABB(cube);
            console.log(`Cube ${index + 1} AABB: min=[${aabb.min.join(', ')}], max=[${aabb.max.join(', ')}]`);
            return aabb;
        });

        console.log(`Reading XML file: ${xmlFilePath}`);
        const xmlContent = fs.readFileSync(xmlFilePath, 'utf8');
        console.log(`XML file loaded, size: ${xmlContent.length} characters`);

        console.log('Updating hkAabb records in XML...');
        const updatedXmlContent = updateHkAabbInXML(xmlContent, aabbs);

        // Determine output path
        const finalOutputPath = outputPath || xmlFilePath.replace('.xml', '_updated.xml');

        console.log(`Writing updated XML to: ${finalOutputPath}`);
        fs.writeFileSync(finalOutputPath, updatedXmlContent, 'utf8');

        console.log('\nUpdate completed successfully!');
        console.log(`Input OBJ: ${objFilePath}`);
        console.log(`Input XML: ${xmlFilePath}`);
        console.log(`Output XML: ${finalOutputPath}`);
        console.log(`Updated ${aabbs.length} hkAabb records`);

        return {
            success: true,
            outputPath: finalOutputPath,
            aabbsUpdated: aabbs.length
        };

    } catch (error) {
        console.error('Error updating hkAabb from OBJ:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// ES module export
export { updateHkAabbFromOBJ, parseOBJVertices, groupVerticesIntoCubes, calculateAABB, updateHkAabbInXML };

// Command line interface
const isMainModule = process.argv[1] && (
    process.argv[1].endsWith('obj-to-hkaabb.js') ||
    process.argv[1].endsWith('obj-to-hkaabb') ||
    import.meta.url.endsWith('obj-to-hkaabb.js')
);

if (isMainModule) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: node obj-to-hkaabb.js <obj_file_path> <xml_file_path> [output_xml_path]');
        console.log('Example: node obj-to-hkaabb.js collision_boxes.obj 39.xml');
        console.log('Example: node obj-to-hkaabb.js collision_boxes.obj 39.xml 39_updated.xml');
        process.exit(1);
    }

    const objFilePath = args[0];
    const xmlFilePath = args[1];
    const outputPath = args[2] || null;

    const result = updateHkAabbFromOBJ(objFilePath, xmlFilePath, outputPath);

    if (!result.success) {
        console.error('\nUpdate failed:', result.error);
        process.exit(1);
    }
}
