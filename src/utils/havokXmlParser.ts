// Havok XML parser utility
// Parses Havok 2018 HKT XML collision model data

export interface HavokNode {
    xyz: [number, number, number];
    data: number;
}

export interface HavokPrimitive {
    indices: number[]; // 4 indices forming a quad
}

export interface HavokMeshData {
    nodes: HavokNode[];
    primitives: HavokPrimitive[];
    metadata: {
        numPrimitiveKeys: number;
        bitsPerKey: number;
        maxKeyValue: number;
    };
}

/**
 * Parse Havok XML content and extract mesh data
 */
export function parseHavokXML(xmlContent: string): HavokMeshData {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Check for parsing errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        throw new Error('XML parsing failed: ' + parserError.textContent);
    }
    
    const nodes = extractSections(xmlDoc);
    const primitives = extractPrimitives(xmlDoc);
    const metadata = extractMetadata(xmlDoc);
    
    console.log(`Havok XML parsed: ${nodes.length} nodes, ${primitives.length} primitives`);
    console.log('Sample nodes with values:', nodes.slice(0, 5).map(n => ({xyz: n.xyz, data: n.data})));
    console.log('Sample primitives with values:', primitives.slice(0, 5).map(p => ({indices: p.indices})));
    console.log('Metadata:', metadata);
    
    return {
        nodes,
        primitives,
        metadata
    };
}

/**
 * Extract sections data (nodes with xyz coordinates)
 */
function extractSections(xmlDoc: Document): HavokNode[] {
    // Find all sections fields and get the one that contains actual array data
    const allSectionsFields = Array.from(xmlDoc.querySelectorAll('field'))
        .filter(field => field.getAttribute('name') === 'sections');
    
    let sectionsFieldWithArray = null;
    for (const field of allSectionsFields) {
        const array = field.querySelector('array');
        if (array) {
            sectionsFieldWithArray = field;
            break;
        }
    }
    
    if (!sectionsFieldWithArray) {
        throw new Error('No sections field with array found in XML');
    }
    
    const nodes: HavokNode[] = [];
    
    // Find the array under sections field, then get the first record
    const sectionsArray = sectionsFieldWithArray.querySelector('array');
    if (!sectionsArray) {
        throw new Error('Sections array not found');
    }
    
    const sectionRecords = sectionsArray.querySelectorAll('record');
    if (sectionRecords.length === 0) {
        throw new Error('No section records found');
    }
    
    // Get the first section record
    const firstSection = sectionRecords[0];
    const nodesField = firstSection.querySelector('field[name="nodes"]');
    if (!nodesField) {
        throw new Error('Nodes field not found in section');
    }
    
    const nodeRecords = nodesField.querySelectorAll('record');
    
    nodeRecords.forEach(record => {
        const xyzField = record.querySelector('field[name="xyz"]');
        const dataField = record.querySelector('field[name="data"]');
        
        if (xyzField && dataField) {
            // xyz field contains an array with 3 integer values
            const xyzArray = xyzField.querySelector('array');
            if (xyzArray) {
                const xyzValues = Array.from(xyzArray.querySelectorAll('integer'))
                    .map(int => parseInt(int.getAttribute('value') || '0'));
                const dataValue = parseInt(dataField.querySelector('integer')?.getAttribute('value') || '0');
                
                if (xyzValues.length === 3) {
                    nodes.push({
                        xyz: [xyzValues[0], xyzValues[1], xyzValues[2]],
                        data: dataValue
                    });
                }
            }
        }
    });
    
    return nodes;
}

/**
 * Extract primitives data (index arrays)
 */
function extractPrimitives(xmlDoc: Document): HavokPrimitive[] {
    // Find all primitives fields and get the one that contains actual array data
    const allPrimitivesFields = Array.from(xmlDoc.querySelectorAll('field'))
        .filter(field => field.getAttribute('name') === 'primitives');
    
    let primitivesFieldWithArray = null;
    for (const field of allPrimitivesFields) {
        const array = field.querySelector('array');
        if (array) {
            primitivesFieldWithArray = field;
            break;
        }
    }
    
    if (!primitivesFieldWithArray) {
        throw new Error('No primitives field with array found in XML');
    }
    
    const primitives: HavokPrimitive[] = [];
    
    // Find the array under primitives field, then get records
    const primitivesArray = primitivesFieldWithArray.querySelector('array');
    if (!primitivesArray) {
        throw new Error('Primitives array not found');
    }
    
    const primitiveRecords = primitivesArray.querySelectorAll('record');
    
    primitiveRecords.forEach(record => {
        const indicesField = record.querySelector('field[name="indices"]');
        
        if (indicesField) {
            // indices field contains an array with 4 integer values
            const indicesArray = indicesField.querySelector('array');
            if (indicesArray) {
                const indices = Array.from(indicesArray.querySelectorAll('integer'))
                    .map(int => parseInt(int.getAttribute('value') || '0'));
                
                primitives.push({ indices });
            }
        }
    });
    
    return primitives;
}

/**
 * Extract metadata from XML
 */
function extractMetadata(xmlDoc: Document): { numPrimitiveKeys: number; bitsPerKey: number; maxKeyValue: number } {
    let numPrimitiveKeys = 0;
    let bitsPerKey = 8;
    let maxKeyValue = 255;
    
    // Try to extract actual values from XML
    const numPrimitiveKeysField = Array.from(xmlDoc.querySelectorAll('field'))
        .find(field => field.getAttribute('name') === 'numPrimitiveKeys');
    if (numPrimitiveKeysField) {
        const value = numPrimitiveKeysField.querySelector('integer')?.getAttribute('value');
        if (value) {
            numPrimitiveKeys = parseInt(value);
            console.log('[DEBUG] Found numPrimitiveKeys:', numPrimitiveKeys);
        }
    } else {
        console.log('[DEBUG] numPrimitiveKeys field not found');
    }
    
    const bitsPerKeyField = Array.from(xmlDoc.querySelectorAll('field'))
        .find(field => field.getAttribute('name') === 'bitsPerKey');
    if (bitsPerKeyField) {
        const value = bitsPerKeyField.querySelector('integer')?.getAttribute('value');
        if (value) {
            bitsPerKey = parseInt(value);
            console.log('[DEBUG] Found bitsPerKey:', bitsPerKey);
        }
    }
    
    const maxKeyValueField = Array.from(xmlDoc.querySelectorAll('field'))
        .find(field => field.getAttribute('name') === 'maxKeyValue');
    if (maxKeyValueField) {
        const value = maxKeyValueField.querySelector('integer')?.getAttribute('value');
        if (value) {
            maxKeyValue = parseInt(value);
            console.log('[DEBUG] Found maxKeyValue:', maxKeyValue);
        }
    }
    
    return {
        numPrimitiveKeys,
        bitsPerKey,
        maxKeyValue
    };
}
