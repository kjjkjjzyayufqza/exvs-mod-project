import type { HavokAabb, HavokBodyInfo, HavokMeshData, HavokSection } from './havokXmlParserTypes';

export type { HavokAabb, HavokBodyInfo, HavokMeshData, HavokSection };

interface HavokMeshTreeData {
  aabb: HavokAabb | null;
  sections: HavokSection[];
  primitives: [number, number, number, number][];
  sharedVerticesIndex: number[];
  packedVertices: number[];
  sharedVertices: bigint[];
}

export function parseHavokXML(xmlContent: string): HavokMeshData {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('XML parsing failed: ' + parserError.textContent);
  }

  const meshTrees = extractMeshTrees(xmlDoc);
  const bodies = extractBodies(xmlDoc);
  const { vertices, quads, aabb } = buildMesh(meshTrees);
  return { vertices, quads, aabb, bodies };
}

function buildMesh(
  meshTrees: HavokMeshTreeData[],
): { vertices: [number, number, number][]; quads: [number, number, number, number][]; aabb: HavokAabb | null } {
  const verts: [number, number, number][] = [];
  const quads: [number, number, number, number][] = [];
  let mergedAabb: HavokAabb | null = null;

  for (const meshTree of meshTrees) {
    const dMin = meshTree.aabb?.min ?? [0, 0, 0];
    const dMax = meshTree.aabb?.max ?? [1, 1, 1];
    mergedAabb = mergeAabbs(mergedAabb, meshTree.aabb);

    for (const sec of meshTree.sections) {
      const vBase = verts.length;
      const [offX, offY, offZ, sX, sY, sZ] = sec.codecParms;

      const pvEnd = Math.min(
        sec.firstPackedVertexIndex + sec.numPackedVertices,
        meshTree.packedVertices.length,
      );
      for (let i = sec.firstPackedVertexIndex; i < pvEnd; i++) {
        const p = meshTree.packedVertices[i];
        const xi = p & 0x7FF;
        const yi = (p >>> 11) & 0x7FF;
        const zi = (p >>> 22) & 0x3FF;
        verts.push([offX + xi * sX, offY + yi * sY, offZ + zi * sZ]);
      }

      const pEnd = Math.min(
        sec.firstPrimitiveIndex + sec.numPrimitives,
        meshTree.primitives.length,
      );
      let maxSL = -1;
      for (let pi = sec.firstPrimitiveIndex; pi < pEnd; pi++) {
        for (const idx of meshTree.primitives[pi]) {
          if (idx >= sec.numPackedVertices) {
            const l = idx - sec.numPackedVertices;
            if (l > maxSL) maxSL = l;
          }
        }
      }

      const sBase = verts.length;
      for (let j = 0; j <= maxSL; j++) {
        const si = sec.firstSharedVertexIndex + j;
        if (si >= meshTree.sharedVerticesIndex.length) {
          throw new Error(
            `Shared vertex index out of range: section shared slot ${j}, sharedVerticesIndex index ${si}`,
          );
        }
        const globalIdx = meshTree.sharedVerticesIndex[si];
        if (globalIdx >= meshTree.sharedVertices.length) {
          throw new Error(
            `Shared vertex lookup out of range: sharedVerticesIndex[${si}]=${globalIdx}, sharedVertices length ${meshTree.sharedVertices.length}`,
          );
        }
        verts.push(decodeShared(meshTree.sharedVertices[globalIdx], dMin, dMax));
      }

      for (let pi = sec.firstPrimitiveIndex; pi < pEnd; pi++) {
        const [i0, i1, i2, i3] = meshTree.primitives[pi];
        const r = (idx: number) =>
          idx < sec.numPackedVertices ? vBase + idx : sBase + (idx - sec.numPackedVertices);
        quads.push([r(i0), r(i1), r(i2), r(i3)]);
      }
    }
  }

  return { vertices: verts, quads, aabb: mergedAabb };
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

function extractMeshTrees(doc: Document): HavokMeshTreeData[] {
  const meshTrees: HavokMeshTreeData[] = [];
  const fields = Array.from(doc.querySelectorAll('field')).filter(
    (field) => field.getAttribute('name') === 'meshTree',
  );
  for (const field of fields) {
    const meshTree = field.querySelector(':scope > record');
    if (!meshTree) {
      continue;
    }
    meshTrees.push({
      aabb: extractDomainAabb(meshTree),
      sections: extractSections(meshTree),
      primitives: extractPrimitives(meshTree),
      sharedVerticesIndex: extractSharedVerticesIndex(meshTree),
      packedVertices: extractPackedVertices(meshTree),
      sharedVertices: extractSharedVertices(meshTree),
    });
  }
  return meshTrees;
}

function extractDomainAabb(meshTree: Element): HavokAabb | null {
  const record = findNamedFieldRecord(meshTree, 'domain');
  if (!record) {
    return null;
  }
  const minF = record.querySelector(':scope > field[name="min"]');
  const maxF = record.querySelector(':scope > field[name="max"]');
  if (!minF || !maxF) {
    return null;
  }
  const mn = parseReals(minF);
  const mx = parseReals(maxF);
  if (mn.length < 3 || mx.length < 3) {
    return null;
  }
  return { min: [mn[0], mn[1], mn[2]], max: [mx[0], mx[1], mx[2]] };
}

function extractSections(meshTree: Element): HavokSection[] {
  const sections: HavokSection[] = [];
  const arr = findNamedFieldArray(meshTree, 'sections');
  if (!arr || arr.getAttribute('count') === '0') {
    return sections;
  }
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
  return sections;
}

function extractPrimitives(meshTree: Element): [number, number, number, number][] {
  const result: [number, number, number, number][] = [];
  const arr = findNamedFieldArray(meshTree, 'primitives');
  if (!arr || arr.getAttribute('count') === '0') {
    return result;
  }
  const first = arr.querySelector(':scope > record');
  if (!first || !first.querySelector('field[name="indices"]')) {
    return result;
  }
  for (const rec of Array.from(arr.querySelectorAll(':scope > record'))) {
    const idxF = rec.querySelector('field[name="indices"]');
    if (!idxF) continue;
    const idxA = idxF.querySelector('array');
    if (!idxA) continue;
    const ints = Array.from(idxA.querySelectorAll('integer')).map((el) =>
      parseInt(el.getAttribute('value') || '0'),
    );
    if (ints.length >= 4) result.push([ints[0], ints[1], ints[2], ints[3]]);
  }
  return result;
}

function extractIntArray(meshTree: Element, name: string): number[] {
  const result: number[] = [];
  const arr = findNamedFieldArray(meshTree, name);
  if (!arr || arr.getAttribute('count') === '0') {
    return result;
  }
  for (const el of Array.from(arr.querySelectorAll('integer'))) {
    result.push(parseInt(el.getAttribute('value') || '0'));
  }
  return result;
}

function extractSharedVerticesIndex(meshTree: Element): number[] {
  return extractIntArray(meshTree, 'sharedVerticesIndex');
}

function extractPackedVertices(meshTree: Element): number[] {
  return extractIntArray(meshTree, 'packedVertices').map((v) => v >>> 0);
}

function extractSharedVertices(meshTree: Element): bigint[] {
  const result: bigint[] = [];
  const arr = findNamedFieldArray(meshTree, 'sharedVertices');
  if (!arr || arr.getAttribute('count') === '0') {
    return result;
  }
  for (const el of Array.from(arr.querySelectorAll('integer'))) {
    result.push(BigInt(el.getAttribute('value') || '0') & 0xFFFFFFFFFFFFFFFFn);
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

function findNamedFieldArray(parent: Element, name: string): Element | null {
  return parent.querySelector(`:scope > field[name="${name}"] > array`);
}

function findNamedFieldRecord(parent: Element, name: string): Element | null {
  return parent.querySelector(`:scope > field[name="${name}"] > record`);
}

function intVal(parent: Element, name: string): number {
  const f = parent.querySelector(`field[name="${name}"]`);
  if (!f) return 0;
  const el = f.querySelector('integer');
  if (!el) return 0;
  return parseInt(el.getAttribute('value') || '0');
}

function mergeAabbs(current: HavokAabb | null, next: HavokAabb | null): HavokAabb | null {
  if (!next) {
    return current;
  }
  if (!current) {
    return { min: [...next.min] as [number, number, number], max: [...next.max] as [number, number, number] };
  }
  return {
    min: [
      Math.min(current.min[0], next.min[0]),
      Math.min(current.min[1], next.min[1]),
      Math.min(current.min[2], next.min[2]),
    ],
    max: [
      Math.max(current.max[0], next.max[0]),
      Math.max(current.max[1], next.max[1]),
      Math.max(current.max[2], next.max[2]),
    ],
  };
}
