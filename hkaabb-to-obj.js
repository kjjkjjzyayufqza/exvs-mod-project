// hkAabb to OBJ converter - specialized for Havok AABB collision volumes
// Usage: node hkaabb-to-obj.js <xml_file_path> [output_obj_path]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse all hkAabb records from Havok XML
 * @param {string} xmlContent - XML content
 * @returns {Array} Array of AABB objects with min/max bounds
 */
function parseHkAabbFromXML(xmlContent) {
    const aabbs = [];

    // Find all hkAabb records in the XML
    const hkAabbRegex = /<record>\s*<!-- hkAabb -->[\s\S]*?<\/record>/g;
    let match;

    while ((match = hkAabbRegex.exec(xmlContent)) !== null) {
        const aabbContent = match[0];

        // Extract min values
        const minMatch = aabbContent.match(/<field name="min">[\s\S]*?<array[^>]*>([\s\S]*?)<\/array>/);
        const maxMatch = aabbContent.match(/<field name="max">[\s\S]*?<array[^>]*>([\s\S]*?)<\/array>/);

        if (minMatch && maxMatch) {
            // Extract min values
            const minValues = [];
            const minRealMatches = minMatch[1].match(/<real[^>]*dec="([^"]+)"/g);
            if (minRealMatches && minRealMatches.length >= 3) {
                for (let i = 0; i < 3; i++) { // Only use first 3 values (x, y, z)
                    const value = minRealMatches[i].match(/dec="([^"]+)"/)[1];
                    minValues.push(parseFloat(value));
                }
            }

            // Extract max values
            const maxValues = [];
            const maxRealMatches = maxMatch[1].match(/<real[^>]*dec="([^"]+)"/g);
            if (maxRealMatches && maxRealMatches.length >= 3) {
                for (let i = 0; i < 3; i++) { // Only use first 3 values (x, y, z)
                    const value = maxRealMatches[i].match(/dec="([^"]+)"/)[1];
                    maxValues.push(parseFloat(value));
                }
            }

            if (minValues.length === 3 && maxValues.length === 3) {
                aabbs.push({
                    min: minValues,
                    max: maxValues,
                    index: aabbs.length
                });
                console.log(`Found hkAabb ${aabbs.length}: min=[${minValues.join(', ')}], max=[${maxValues.join(', ')}]`);
            }
        }
    }

    return aabbs;
}

/**
 * Create cube mesh data from AABB bounds
 * @param {Array} aabbs - Array of AABB objects
 * @returns {Object} Mesh data with vertices and faces
 */
function createCubeMeshesFromAABBs(aabbs) {
    const vertices = [];
    const faces = [];

    aabbs.forEach((aabb, aabbIndex) => {
        const [minX, minY, minZ] = aabb.min;
        const [maxX, maxY, maxZ] = aabb.max;

        // Create 8 vertices for the cube (0-based indexing for this AABB)
        const cubeVertices = [
            [minX, minY, minZ], // 0: bottom-left-front
            [maxX, minY, minZ], // 1: bottom-right-front
            [maxX, maxY, minZ], // 2: top-right-front
            [minX, maxY, minZ], // 3: top-left-front
            [minX, minY, maxZ], // 4: bottom-left-back
            [maxX, minY, maxZ], // 5: bottom-right-back
            [maxX, maxY, maxZ], // 6: top-right-back
            [minX, maxY, maxZ]  // 7: top-left-back
        ];

        // Add vertices to global vertex list
        const vertexOffset = vertices.length;
        cubeVertices.forEach(vertex => {
            vertices.push({
                position: vertex,
                aabbIndex: aabbIndex
            });
        });

        // Define cube faces (triangles) - 12 triangles total (6 faces * 2 triangles each)
        const cubeFaces = [
            // Front face
            [0, 1, 2], [0, 2, 3],
            // Back face
            [4, 7, 6], [4, 6, 5],
            // Left face
            [0, 3, 7], [0, 7, 4],
            // Right face
            [1, 5, 6], [1, 6, 2],
            // Bottom face
            [0, 4, 5], [0, 5, 1],
            // Top face
            [3, 2, 6], [3, 6, 7]
        ];

        // Add faces with vertex offset
        cubeFaces.forEach(face => {
            faces.push({
                indices: face.map(idx => idx + vertexOffset),
                aabbIndex: aabbIndex
            });
        });
    });

    return {
        vertices,
        faces,
        numAABBs: aabbs.length,
        totalVertices: vertices.length,
        totalFaces: faces.length
    };
}

/**
 * Convert mesh data to OBJ format
 * @param {Object} meshData - Mesh data with vertices and faces
 * @param {string} modelName - Name for the OBJ object
 * @returns {string} OBJ formatted string
 */
function convertMeshToOBJ(meshData, modelName = 'HkAabbCollisionMeshes') {
    let obj = `# hkAabb collision volumes converted to OBJ\n`;
    obj += `# Generated from ${meshData.numAABBs} hkAabb records\n`;
    obj += `# Total vertices: ${meshData.totalVertices}\n`;
    obj += `# Total faces: ${meshData.totalFaces}\n\n`;

    obj += `o ${modelName}\n\n`;

    // Write vertices
    obj += `# Vertices\n`;
    meshData.vertices.forEach((vertex, i) => {
        const [x, y, z] = vertex.position;
        obj += `v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}\n`;
    });

    obj += `\n# Faces\n`;

    // Write faces (OBJ uses 1-based indexing)
    meshData.faces.forEach((face, faceIndex) => {
        const [a, b, c] = face.indices;
        obj += `f ${a + 1} ${b + 1} ${c + 1}\n`;
    });

    obj += `\n# End of file\n`;

    return obj;
}

/**
 * Main function to convert hkAabb data from Havok XML to OBJ
 * @param {string} xmlFilePath - Path to the Havok XML file
 * @param {string} outputPath - Optional output path for OBJ file
 */
function convertHkAabbToOBJ(xmlFilePath, outputPath = null) {
    try {
        console.log(`Reading Havok XML file: ${xmlFilePath}`);

        // Read the XML file
        const xmlContent = fs.readFileSync(xmlFilePath, 'utf8');
        console.log(`XML file loaded, size: ${xmlContent.length} characters`);

        // Parse hkAabb records
        console.log('Parsing hkAabb records from XML...');
        const aabbs = parseHkAabbFromXML(xmlContent);

        if (aabbs.length === 0) {
            throw new Error('No hkAabb records found in the XML file');
        }

        console.log(`Found ${aabbs.length} hkAabb records`);

        // Create cube meshes from AABBs
        console.log('Creating cube meshes from AABB bounds...');
        const meshData = createCubeMeshesFromAABBs(aabbs);

        // Convert to OBJ format
        console.log('Converting to OBJ format...');
        const objContent = convertMeshToOBJ(meshData, 'HkAabbCollisionVolumes');

        // Determine output path
        const finalOutputPath = outputPath || xmlFilePath.replace('.xml', '_aabb.obj');

        // Write OBJ file
        fs.writeFileSync(finalOutputPath, objContent, 'utf8');
        console.log(`OBJ file written successfully: ${finalOutputPath}`);
        console.log(`Mesh statistics:`);
        console.log(`  - hkAabb records: ${meshData.numAABBs}`);
        console.log(`  - Total vertices: ${meshData.totalVertices}`);
        console.log(`  - Total faces: ${meshData.totalFaces}`);
        console.log(`  - Triangles per cube: 12`);

        return {
            success: true,
            outputPath: finalOutputPath,
            meshData: meshData
        };

    } catch (error) {
        console.error('Error converting hkAabb to OBJ:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// ES module export
export { convertHkAabbToOBJ, parseHkAabbFromXML, createCubeMeshesFromAABBs };

// Command line interface
const isMainModule = process.argv[1] && (
    process.argv[1].endsWith('hkaabb-to-obj.js') ||
    process.argv[1].endsWith('hkaabb-to-obj') ||
    import.meta.url.endsWith('hkaabb-to-obj.js')
);

if (isMainModule) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node hkaabb-to-obj.js <xml_file_path> [output_obj_path]');
        console.log('Example: node hkaabb-to-obj.js 33.xml');
        console.log('Example: node hkaabb-to-obj.js 33.xml collision_boxes.obj');
        process.exit(1);
    }

    const xmlFilePath = args[0];
    const outputPath = args[1] || null;

    const result = convertHkAabbToOBJ(xmlFilePath, outputPath);

    if (result.success) {
        console.log('\nConversion completed successfully!');
        console.log(`Output file: ${result.outputPath}`);
    } else {
        console.error('\nConversion failed:', result.error);
        process.exit(1);
    }
}
