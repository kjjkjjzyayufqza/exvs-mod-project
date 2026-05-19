// Havok XML parser utility
// Parses Havok 2018 HKT XML collision model data (hknpCompressedMeshShape)

export interface HavokAabb {
    min: [number, number, number];
    max: [number, number, number];
}

export interface HavokBodyInfo {
    name: string;
    position: [number, number, number];
    orientation: [number, number, number, number];
}

export interface HavokMeshData {
    vertices: [number, number, number][];
    quads: [number, number, number, number][];
    aabb: HavokAabb | null;
    bodies: HavokBodyInfo[];
}

/**
 * Parse Havok XML content and extract collision mesh data.
 * Uses packedVertices (uint32 encoded as x:11|y:11|z:10 bits) mapped to domain AABB.
 */
export function parseHavokXML(xmlContent: string): HavokMeshData {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        throw new Error('XML parsing failed: ' + parserError.textContent);
    }

    const aabb = extractDomainAabb(xmlDoc);
    const { vertices, quads } = extractMesh(xmlDoc, aabb);
    const bodies = extractBodies(xmlDoc);

    return { vertices, quads, aabb, bodies };
}

function extractDomainAabb(xmlDoc: Document): HavokAabb | null {
    // Find "domain" field containing hkAabb with min/max real arrays
    const domainFields = Array.from(xmlDoc.querySelectorAll('field'))
        .filter(f => f.getAttribute('name') === 'domain');

    for (const domainField of domainFields) {
        const record = domainField.querySelector('record');
        if (!record) continue;
        const minField = record.querySelector('field[name="min"]');
        const maxField = record.querySelector('field[name="max"]');
        if (!minField || !maxField) continue;

        const minReals = parseRealArray(minField);
        const maxReals = parseRealArray(maxField);
        if (minReals.length >= 3 && maxReals.length >= 3) {
            return {
                min: [minReals[0], minReals[1], minReals[2]],
                max: [maxReals[0], maxReals[1], maxReals[2]],
            };
        }
    }
    return null;
}

function extractMesh(xmlDoc: Document, aabb: HavokAabb | null): { vertices: [number, number, number][]; quads: [number, number, number, number][] } {
    const vertices: [number, number, number][] = [];
    const quads: [number, number, number, number][] = [];

    // Find packedVertices field (array of unsigned int at meshTree level)
    const pvFields = Array.from(xmlDoc.querySelectorAll('field'))
        .filter(f => f.getAttribute('name') === 'packedVertices');

    let packedArray: Element | null = null;
    for (const pv of pvFields) {
        const arr = pv.querySelector('array');
        if (arr && arr.getAttribute('count') !== '0') {
            packedArray = arr;
            break;
        }
    }

    if (!packedArray) return { vertices, quads };

    // Decode packed vertices: each uint32 = (x:11 bits << 21) | (y:11 bits << 10) | (z:10 bits)
    const domainMin = aabb?.min ?? [0, 0, 0];
    const domainMax = aabb?.max ?? [1, 1, 1];
    const xRange = domainMax[0] - domainMin[0];
    const yRange = domainMax[1] - domainMin[1];
    const zRange = domainMax[2] - domainMin[2];

    const intElements = packedArray.querySelectorAll('integer');
    for (const el of Array.from(intElements)) {
        const packed = parseInt(el.getAttribute('value') || '0') >>> 0;
        const xi = (packed >>> 21) & 0x7FF;
        const yi = (packed >>> 10) & 0x7FF;
        const zi = packed & 0x3FF;
        const x = domainMin[0] + (xi / 2047) * xRange;
        const y = domainMin[1] + (yi / 2047) * yRange;
        const z = domainMin[2] + (zi / 1023) * zRange;
        vertices.push([x, y, z]);
    }

    // Find primitives field (array of records with indices)
    const primFields = Array.from(xmlDoc.querySelectorAll('field'))
        .filter(f => f.getAttribute('name') === 'primitives');

    for (const primField of primFields) {
        const arr = primField.querySelector('array');
        if (!arr) continue;
        const count = arr.getAttribute('count');
        if (!count || count === '0') continue;
        // Check this is the right primitives (has records with "indices" field)
        const firstRec = arr.querySelector('record');
        if (!firstRec || !firstRec.querySelector('field[name="indices"]')) continue;

        for (const rec of Array.from(arr.querySelectorAll(':scope > record'))) {
            const idxField = rec.querySelector('field[name="indices"]');
            if (!idxField) continue;
            const idxArr = idxField.querySelector('array');
            if (!idxArr) continue;
            const ints = Array.from(idxArr.querySelectorAll('integer'))
                .map(e => parseInt(e.getAttribute('value') || '0'));
            if (ints.length >= 4) {
                quads.push([ints[0], ints[1], ints[2], ints[3]]);
            }
        }
        break; // only use first matching primitives field
    }

    return { vertices, quads };
}

function extractBodies(xmlDoc: Document): HavokBodyInfo[] {
    const bodies: HavokBodyInfo[] = [];
    const bodyCinfosFields = Array.from(xmlDoc.querySelectorAll('field'))
        .filter(f => f.getAttribute('name') === 'bodyCinfos');

    for (const field of bodyCinfosFields) {
        const arr = field.querySelector('array');
        if (!arr) continue;
        for (const rec of Array.from(arr.querySelectorAll(':scope > record'))) {
            const nameEl = rec.querySelector(':scope > field[name="name"] string');
            const name = nameEl?.getAttribute('value') || 'unnamed';

            const posReals = parseRealArray(rec.querySelector(':scope > field[name="position"]'));
            const position: [number, number, number] = posReals.length >= 3
                ? [posReals[0], posReals[1], posReals[2]] : [0, 0, 0];

            const oriReals = parseRealArray(rec.querySelector(':scope > field[name="orientation"]'));
            const orientation: [number, number, number, number] = oriReals.length >= 4
                ? [oriReals[0], oriReals[1], oriReals[2], oriReals[3]] : [0, 0, 0, 1];

            bodies.push({ name, position, orientation });
        }
    }
    return bodies;
}

function parseRealArray(field: Element | null): number[] {
    if (!field) return [];
    const arr = field.querySelector('array');
    if (!arr) return [];
    return Array.from(arr.querySelectorAll('real'))
        .map(r => parseFloat(r.getAttribute('dec') || '0'));
}
