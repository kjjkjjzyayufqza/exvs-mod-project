import type { HavokAabb, HavokBodyInfo, HavokMeshData, HavokSection } from './havokXmlParserTypes';

export type { HavokAabb, HavokBodyInfo, HavokMeshData, HavokSection };

export function parseHavokXML(xmlContent: string): HavokMeshData {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('XML parsing failed: ' + parserError.textContent);
  }

  const aabb = extractDomainAabb(xmlDoc);
  const sections = extractSections(xmlDoc);
  const primitives = extractPrimitives(xmlDoc);
  const svi = extractSharedVerticesIndex(xmlDoc);
  const packedVerts = extractPackedVertices(xmlDoc);
  const sharedVerts = extractSharedVertices(xmlDoc);
  const bodies = extractBodies(xmlDoc);

  const { vertices, quads } = buildMesh(aabb, sections, primitives, svi, packedVerts, sharedVerts);
  return { vertices, quads, aabb, bodies };
}

function buildMesh(
  aabb: HavokAabb | null,
  sections: HavokSection[],
  primitives: [number, number, number, number][],
  svi: number[],
  packedVerts: number[],
  sharedVerts: bigint[],
): { vertices: [number, number, number][]; quads: [number, number, number, number][] } {
  const verts: [number, number, number][] = [];
  const quads: [number, number, number, number][] = [];
  const dMin = aabb?.min ?? [0, 0, 0];
  const dMax = aabb?.max ?? [1, 1, 1];

  for (const sec of sections) {
    const vBase = verts.length;
    const [offX, offY, offZ, sX, sY, sZ] = sec.codecParms;

    const pvEnd = Math.min(sec.firstPackedVertexIndex + sec.numPackedVertices, packedVerts.length);
    for (let i = sec.firstPackedVertexIndex; i < pvEnd; i++) {
      const p = packedVerts[i];
      const xi = p & 0x7FF;
      const yi = (p >>> 11) & 0x7FF;
      const zi = (p >>> 22) & 0x3FF;
      verts.push([offX + xi * sX, offY + yi * sY, offZ + zi * sZ]);
    }

    const pEnd = Math.min(sec.firstPrimitiveIndex + sec.numPrimitives, primitives.length);
    let maxSL = -1;
    for (let pi = sec.firstPrimitiveIndex; pi < pEnd; pi++) {
      for (const idx of primitives[pi]) {
        if (idx >= sec.numPackedVertices) {
          const l = idx - sec.numPackedVertices;
          if (l > maxSL) maxSL = l;
        }
      }
    }

    const sBase = verts.length;
    for (let j = 0; j <= maxSL; j++) {
      const si = sec.firstSharedVertexIndex + j;
      if (si >= svi.length) {
        throw new Error(
          `Shared vertex index out of range: section shared slot ${j}, sharedVerticesIndex index ${si}`,
        );
      }
      const globalIdx = svi[si];
      if (globalIdx >= sharedVerts.length) {
        throw new Error(
          `Shared vertex lookup out of range: sharedVerticesIndex[${si}]=${globalIdx}, sharedVertices length ${sharedVerts.length}`,
        );
      }
      verts.push(decodeShared(sharedVerts[globalIdx], dMin, dMax));
    }

    for (let pi = sec.firstPrimitiveIndex; pi < pEnd; pi++) {
      const [i0, i1, i2, i3] = primitives[pi];
      const r = (idx: number) => idx < sec.numPackedVertices ? vBase + idx : sBase + (idx - sec.numPackedVertices);
      quads.push([r(i0), r(i1), r(i2), r(i3)]);
    }
  }

  return { vertices: verts, quads };
}

function decodeShared(sv: bigint, dMin: [number, number, number], dMax: [number, number, number]): [number, number, number] {
  const xi = Number(sv & 0x1FFFFFn);
  const yi = Number((sv >> 21n) & 0x1FFFFFn);
  const zi = Number((sv >> 42n) & 0x3FFFFFn);
  return [
    dMin[0] + (xi / 2097151) * (dMax[0] - dMin[0]),
    dMin[1] + (yi / 2097151) * (dMax[1] - dMin[1]),
    dMin[2] + (zi / 4194303) * (dMax[2] - dMin[2]),
  ];
}

function extractDomainAabb(doc: Document): HavokAabb | null {
  const fields = Array.from(doc.querySelectorAll('field')).filter(f => f.getAttribute('name') === 'domain');
  for (const df of fields) {
    const rec = df.querySelector('record');
    if (!rec) continue;
    const minF = rec.querySelector('field[name="min"]');
    const maxF = rec.querySelector('field[name="max"]');
    if (!minF || !maxF) continue;
    const mn = parseReals(minF);
    const mx = parseReals(maxF);
    if (mn.length >= 3 && mx.length >= 3) {
      return { min: [mn[0], mn[1], mn[2]], max: [mx[0], mx[1], mx[2]] };
    }
  }
  return null;
}

function extractSections(doc: Document): HavokSection[] {
  const sections: HavokSection[] = [];
  const fields = Array.from(doc.querySelectorAll('field')).filter(f => f.getAttribute('name') === 'sections');
  for (const sf of fields) {
    const arr = sf.querySelector('array');
    if (!arr || arr.getAttribute('count') === '0') continue;
    for (const rec of Array.from(arr.querySelectorAll(':scope > record'))) {
      const cp = rec.querySelector('field[name="codecParms"]');
      if (!cp) continue;
      const codecParms = parseReals(cp);
      if (codecParms.length < 6) continue;
      sections.push({
        codecParms,
        firstPackedVertexIndex: intVal(rec, 'firstPackedVertexIndex'),
        firstSharedVertexIndex: intVal(rec, 'firstSharedVertexIndex'),
        firstPrimitiveIndex: intVal(rec, 'firstPrimitiveIndex'),
        numPackedVertices: intVal(rec, 'numPackedVertices'),
        numPrimitives: intVal(rec, 'numPrimitives'),
      });
    }
    break;
  }
  return sections;
}

function extractPrimitives(doc: Document): [number, number, number, number][] {
  const result: [number, number, number, number][] = [];
  const fields = Array.from(doc.querySelectorAll('field')).filter(f => f.getAttribute('name') === 'primitives');
  for (const pf of fields) {
    const arr = pf.querySelector('array');
    if (!arr || arr.getAttribute('count') === '0') continue;
    const first = arr.querySelector('record');
    if (!first || !first.querySelector('field[name="indices"]')) continue;
    for (const rec of Array.from(arr.querySelectorAll(':scope > record'))) {
      const idxF = rec.querySelector('field[name="indices"]');
      if (!idxF) continue;
      const idxA = idxF.querySelector('array');
      if (!idxA) continue;
      const ints = Array.from(idxA.querySelectorAll('integer')).map(el => parseInt(el.getAttribute('value') || '0'));
      if (ints.length >= 4) result.push([ints[0], ints[1], ints[2], ints[3]]);
    }
    break;
  }
  return result;
}

function extractIntArray(doc: Document, name: string): number[] {
  const result: number[] = [];
  const fields = Array.from(doc.querySelectorAll('field')).filter(f => f.getAttribute('name') === name);
  for (const f of fields) {
    const arr = f.querySelector('array');
    if (!arr || arr.getAttribute('count') === '0') continue;
    for (const el of Array.from(arr.querySelectorAll('integer'))) {
      result.push(parseInt(el.getAttribute('value') || '0'));
    }
    if (result.length > 0) break;
  }
  return result;
}

function extractSharedVerticesIndex(doc: Document): number[] {
  return extractIntArray(doc, 'sharedVerticesIndex');
}

function extractPackedVertices(doc: Document): number[] {
  return extractIntArray(doc, 'packedVertices').map(v => v >>> 0);
}

function extractSharedVertices(doc: Document): bigint[] {
  const result: bigint[] = [];
  const fields = Array.from(doc.querySelectorAll('field')).filter(f => f.getAttribute('name') === 'sharedVertices');
  for (const f of fields) {
    const arr = f.querySelector('array');
    if (!arr || arr.getAttribute('count') === '0') continue;
    for (const el of Array.from(arr.querySelectorAll('integer'))) {
      result.push(BigInt(el.getAttribute('value') || '0') & 0xFFFFFFFFFFFFFFFFn);
    }
    if (result.length > 0) break;
  }
  return result;
}

function extractBodies(doc: Document): HavokBodyInfo[] {
  const bodies: HavokBodyInfo[] = [];
  const fields = Array.from(doc.querySelectorAll('field')).filter(f => f.getAttribute('name') === 'bodyCinfos');
  for (const f of fields) {
    const arr = f.querySelector('array');
    if (!arr) continue;
    for (const rec of Array.from(arr.querySelectorAll(':scope > record'))) {
      const nameEl = rec.querySelector(':scope > field[name="name"] string');
      const nm = nameEl?.getAttribute('value') || 'unnamed';
      const pos = parseReals(rec.querySelector(':scope > field[name="position"]'));
      const ori = parseReals(rec.querySelector(':scope > field[name="orientation"]'));
      bodies.push({
        name: nm,
        position: pos.length >= 3 ? [pos[0], pos[1], pos[2]] : [0, 0, 0],
        orientation: ori.length >= 4 ? [ori[0], ori[1], ori[2], ori[3]] : [0, 0, 0, 1],
      });
    }
  }
  return bodies;
}

function parseReals(field: Element | null): number[] {
  if (!field) return [];
  const arr = field.querySelector('array');
  if (!arr) return [];
  return Array.from(arr.querySelectorAll('real')).map(r => parseFloat(r.getAttribute('dec') || '0'));
}

function intVal(parent: Element, name: string): number {
  const f = parent.querySelector(`field[name="${name}"]`);
  if (!f) return 0;
  const el = f.querySelector('integer');
  if (!el) return 0;
  return parseInt(el.getAttribute('value') || '0');
}
