// Fixed Havok XML parser utility
// Correctly parses Havok 2018 HKT XML collision model data including 39.xml

export interface HavokVertex {
    position: [number, number, number];
    originalPacked: number;
}

export interface HavokPrimitive {
    indices: number[]; // 4 indices forming a quad
}

export interface HavokBounds {
    min: [number, number, number];
    max: [number, number, number];
}

export interface HavokMeshData {
    vertices: HavokVertex[];
    primitives: HavokPrimitive[];
    bounds: HavokBounds;
    metadata: {
        numPrimitiveKeys: number;
        bitsPerKey: number;
        maxKeyValue: number;
        meshType: string;
    };
}

/**
 * Parse Havok XML content and extract mesh data
 * Fixed to handle both 39.xml (3D box) and 33.xml (terrain) formats
 */
export function parseHavokXML(xmlContent: string): HavokMeshData {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Check for parsing errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        throw new Error('XML parsing failed: ' + parserError.textContent);
    }
    
    // Extract components in correct order
    const bounds = extractDomainBounds(xmlDoc);
    const packedVertices = extractPackedVertices(xmlDoc);
    const vertices = decompressVertices(packedVertices, bounds);
    const primitives = extractPrimitives(xmlDoc);
    const metadata = extractMetadata(xmlDoc);
    
    // Determine mesh type
    let meshType = 'Unknown';
    if (vertices.length === 8 && primitives.length === 6) {
        meshType = '3D Box/Cube';
    } else if (vertices.length > 100 && primitives.length > 50) {
        meshType = 'Complex Terrain';
    } else if (vertices.length > 10) {
        meshType = 'Complex Object';
    } else {
        meshType = 'Simple Object';
    }
    
    console.log(`Havok XML parsed successfully:`);
    console.log(`  Type: ${meshType}`);
    console.log(`  Vertices: ${vertices.length}`);
    console.log(`  Primitives: ${primitives.length}`);
    console.log(`  Bounds: [${bounds.min.join(', ')}] to [${bounds.max.join(', ')}]`);
    
    if (vertices.length > 0) {
        console.log(`  Sample vertices:`, vertices.slice(0, 3).map(v => ({
            pos: v.position.map(p => p.toFixed(2)),
            packed: v.originalPacked.toString(16)
        })));
    }
    
    if (primitives.length > 0) {
        console.log(`  Sample primitives:`, primitives.slice(0, 3).map(p => p.indices));
    }
    
    return {
        vertices,
        primitives,
        bounds,
        metadata: {
            ...metadata,
            meshType
        }
    };
}

/**
 * Extract domain bounds from XML (critical for correct vertex decompression)
 */
function extractDomainBounds(xmlDoc: Document): HavokBounds {
    // Default bounds (fallback)
    let bounds: HavokBounds = {
        min: [-40.01, -0.01, -40.01],
        max: [40.01, 40.01, 40.01]
    };
    
    // Find domain field with min/max bounds
    const domainFields = Array.from(xmlDoc.querySelectorAll('field'))
        .filter(field => field.getAttribute('name') === 'domain');
    
    for (const domainField of domainFields) {
        const minField = domainField.querySelector('field[name="min"]');
        const maxField = domainField.querySelector('field[name="max"]');
        
        if (minField && maxField) {
            const minReals = minField.querySelectorAll('real');
            const maxReals = maxField.querySelectorAll('real');
            
            if (minReals.length >= 3 && maxReals.length >= 3) {
                bounds.min = [
                    parseFloat(minReals[0].getAttribute('dec') || '0'),
                    parseFloat(minReals[1].getAttribute('dec') || '0'),
                    parseFloat(minReals[2].getAttribute('dec') || '0')
                ];
                bounds.max = [
                    parseFloat(maxReals[0].getAttribute('dec') || '0'),
                    parseFloat(maxReals[1].getAttribute('dec') || '0'),
                    parseFloat(maxReals[2].getAttribute('dec') || '0')
                ];
                
                console.log(`[DEBUG] Extracted domain bounds:`, bounds);
                break;
            }
        }
    }
    
    return bounds;
}

/**
 * Extract packed vertices from XML
 */
function extractPackedVertices(xmlDoc: Document): number[] {
    const packedVerticesFields = Array.from(xmlDoc.querySelectorAll('field'))
        .filter(field => field.getAttribute('name') === 'packedVertices');
    
    for (const field of packedVerticesFields) {
        const array = field.querySelector('array');
        if (array) {
            const integers = array.querySelectorAll('integer');
            const vertices = Array.from(integers).map(int => 
                parseInt(int.getAttribute('value') || '0')
            );
            
            if (vertices.length > 0) {
                console.log(`[DEBUG] Found ${vertices.length} packed vertices`);
                console.log(`[DEBUG] Sample packed values:`, vertices.slice(0, 5).map(v => v.toString(16)));
                return vertices;
            }
        }
    }
    
    console.warn('[DEBUG] No packed vertices found');
    return [];
}

/**
 * Decompress packed vertices to world coordinates
 */
function decompressVertices(packedVertices: number[], bounds: HavokBounds): HavokVertex[] {
    const vertices: HavokVertex[] = [];
    
    const rangeX = bounds.max[0] - bounds.min[0];
    const rangeY = bounds.max[1] - bounds.min[1];
    const rangeZ = bounds.max[2] - bounds.min[2];
    
    console.log(`[DEBUG] Decompression ranges: X=${rangeX.toFixed(2)}, Y=${rangeY.toFixed(4)}, Z=${rangeZ.toFixed(2)}`);
    
    for (let i = 0; i < packedVertices.length; i++) {
        const packed = packedVertices[i];
        
        // Extract 8-bit components from 32-bit packed value
        const x8 = (packed) & 0xFF;
        const y8 = (packed >> 8) & 0xFF;
        const z8 = (packed >> 16) & 0xFF;
        
        // Normalize to 0-1 range
        const normalizedX = x8 / 255.0;
        const normalizedY = y8 / 255.0;
        const normalizedZ = z8 / 255.0;
        
        // Scale to world coordinates
        const worldX = bounds.min[0] + (normalizedX * rangeX);
        const worldY = bounds.min[1] + (normalizedY * rangeY);
        const worldZ = bounds.min[2] + (normalizedZ * rangeZ);
        
        vertices.push({
            position: [worldX, worldY, worldZ],
            originalPacked: packed
        });
        
        // Debug output for first few vertices
        if (i < 5) {
            console.log(`[DEBUG] V${i}: packed=0x${packed.toString(16).padStart(8,'0')} [${x8},${y8},${z8}] → [${worldX.toFixed(3)}, ${worldY.toFixed(3)}, ${worldZ.toFixed(3)}]`);
        }
    }
    
    return vertices;
}

/**
 * Extract primitives (face indices) from XML
 */
function extractPrimitives(xmlDoc: Document): HavokPrimitive[] {
    const primitivesFields = Array.from(xmlDoc.querySelectorAll('field'))
        .filter(field => field.getAttribute('name') === 'primitives');
    
    for (const field of primitivesFields) {
        const array = field.querySelector('array');
        if (array) {
            const primitives: HavokPrimitive[] = [];
            const records = array.querySelectorAll('record');
            
            records.forEach(record => {
                const indicesField = record.querySelector('field[name="indices"]');
                if (indicesField) {
                    const indicesArray = indicesField.querySelector('array');
                    if (indicesArray) {
                        const integers = indicesArray.querySelectorAll('integer');
                        const indices = Array.from(integers).map(int => 
                            parseInt(int.getAttribute('value') || '0')
                        );
                        
                        if (indices.length === 4) {
                            primitives.push({ indices });
                        }
                    }
                }
            });
            
            if (primitives.length > 0) {
                console.log(`[DEBUG] Found ${primitives.length} primitives`);
                return primitives;
            }
        }
    }
    
    console.warn('[DEBUG] No primitives found');
    return [];
}

/**
 * Extract metadata from XML
 */
function extractMetadata(xmlDoc: Document): { numPrimitiveKeys: number; bitsPerKey: number; maxKeyValue: number } {
    let numPrimitiveKeys = 0;
    let bitsPerKey = 4;
    let maxKeyValue = 15;
    
    // Extract numPrimitiveKeys
    const numPrimitiveKeysField = Array.from(xmlDoc.querySelectorAll('field'))
        .find(field => field.getAttribute('name') === 'numPrimitiveKeys');
    if (numPrimitiveKeysField) {
        const value = numPrimitiveKeysField.querySelector('integer')?.getAttribute('value');
        if (value) {
            numPrimitiveKeys = parseInt(value);
        }
    }
    
    // Extract bitsPerKey
    const bitsPerKeyField = Array.from(xmlDoc.querySelectorAll('field'))
        .find(field => field.getAttribute('name') === 'bitsPerKey');
    if (bitsPerKeyField) {
        const value = bitsPerKeyField.querySelector('integer')?.getAttribute('value');
        if (value) {
            bitsPerKey = parseInt(value);
        }
    }
    
    // Extract maxKeyValue
    const maxKeyValueField = Array.from(xmlDoc.querySelectorAll('field'))
        .find(field => field.getAttribute('name') === 'maxKeyValue');
    if (maxKeyValueField) {
        const value = maxKeyValueField.querySelector('integer')?.getAttribute('value');
        if (value) {
            maxKeyValue = parseInt(value);
        }
    }
    
    return {
        numPrimitiveKeys,
        bitsPerKey,
        maxKeyValue
    };
}

/**
 * Convert parsed mesh data to OBJ format
 */
export function convertToOBJ(meshData: HavokMeshData, modelName: string = 'HavokMesh'): string {
    let obj = `# Havok collision mesh converted to OBJ\n`;
    obj += `# Type: ${meshData.metadata.meshType}\n`;
    obj += `# Vertices: ${meshData.vertices.length}\n`;
    obj += `# Primitives: ${meshData.primitives.length}\n`;
    obj += `# Triangles: ${meshData.primitives.length * 2}\n\n`;
    
    obj += `o ${modelName}\n\n`;
    
    // Write vertices
    obj += `# Vertices\n`;
    meshData.vertices.forEach((vertex, i) => {
        const [x, y, z] = vertex.position;
        obj += `v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}  # V${i}\n`;
    });
    
    obj += `\n# Faces (quads converted to triangles)\n`;
    
    // Write faces
    let triangleCount = 0;
    meshData.primitives.forEach((primitive, faceIndex) => {
        const [a, b, c, d] = primitive.indices;
        
        // Validate indices
        if (a < meshData.vertices.length && b < meshData.vertices.length && 
            c < meshData.vertices.length && d < meshData.vertices.length &&
            a >= 0 && b >= 0 && c >= 0 && d >= 0) {
            
            // Convert quad to triangles (OBJ uses 1-based indexing)
            obj += `f ${a + 1} ${b + 1} ${c + 1}  # face ${faceIndex} triangle 1\n`;
            obj += `f ${a + 1} ${c + 1} ${d + 1}  # face ${faceIndex} triangle 2\n`;
            triangleCount += 2;
        }
    });
    
    obj += `\n# Generated ${triangleCount} triangular faces\n`;
    
    return obj;
}
