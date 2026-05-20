#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";

const xmlPath = process.argv[2];
const objPath = process.argv[3];
const targetSection = parseInt(process.argv[4] || "0");
if (!xmlPath || !objPath) {
  console.error("Usage: node hkt_xml_to_obj_debug.mjs <input.xml> <output.obj> [sectionIdx]");
  process.exit(1);
}

const xml = readFileSync(xmlPath, "utf-8");
const lines = xml.split("\n");

function findFieldRegion(startLine, fieldName) {
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes(`name="${fieldName}"`) && line.startsWith("<field")) {
      let depth = 0;
      for (let j = i; j < lines.length; j++) {
        const l = lines[j];
        const opens = (l.match(/<field[\s>]/g) || []).length;
        const closes = (l.match(/<\/field>/g) || []).length;
        depth += opens - closes;
        if (depth <= 0) return [i, j];
      }
    }
  }
  return null;
}

function extractIntegers(startLine, endLine) {
  const result = [];
  for (let i = startLine; i <= endLine; i++) {
    const matches = lines[i].matchAll(/value="(-?\d+)"/g);
    for (const m of matches) result.push(m[1]);
  }
  return result;
}

function extractReals(startLine, endLine) {
  const result = [];
  for (let i = startLine; i <= endLine; i++) {
    const matches = lines[i].matchAll(/dec="([^"]+)"/g);
    for (const m of matches) result.push(parseFloat(m[1]));
  }
  return result;
}

function findMeshTreeStart(lineIdx) {
  for (let i = lineIdx; i < lines.length; i++) {
    if (lines[i].trim().includes('name="meshTree"') && lines[i].trim().includes("<field")) return i;
  }
  return -1;
}

const meshTreeFieldStart = findMeshTreeStart(0);
const domainRegion = findFieldRegion(meshTreeFieldStart, "domain");
const minRegion = findFieldRegion(domainRegion[0], "min");
const maxRegion = findFieldRegion(domainRegion[0], "max");
const domain = {
  min: extractReals(minRegion[0], minRegion[1]).slice(0, 3),
  max: extractReals(maxRegion[0], maxRegion[1]).slice(0, 3),
};
console.log("Domain:", domain);

const sectionsRegion = findFieldRegion(meshTreeFieldStart, "sections");
const sections = [];
let scanPos = sectionsRegion[0];
while (scanPos <= sectionsRegion[1]) {
  const cpRegion = findFieldRegion(scanPos, "codecParms");
  if (!cpRegion || cpRegion[0] > sectionsRegion[1]) break;
  const codecParms = extractReals(cpRegion[0], cpRegion[1]);
  let fpvi = 0, fsvi = 0, fpi = 0, npv = 0, np = 0;
  for (let i = cpRegion[1]; i < Math.min(cpRegion[1] + 30, sectionsRegion[1]); i++) {
    const line = lines[i].trim();
    const m = line.match(/name="(firstPackedVertexIndex|firstSharedVertexIndex|firstPrimitiveIndex|numPackedVertices|numPrimitives)".*?value="(\d+)"/);
    if (m) {
      const val = parseInt(m[2]);
      switch (m[1]) {
        case "firstPackedVertexIndex": fpvi = val; break;
        case "firstSharedVertexIndex": fsvi = val; break;
        case "firstPrimitiveIndex": fpi = val; break;
        case "numPackedVertices": npv = val; break;
        case "numPrimitives": np = val; break;
      }
    }
  }
  sections.push({ codecParms, firstPackedVertexIndex: fpvi, firstSharedVertexIndex: fsvi, firstPrimitiveIndex: fpi, numPackedVertices: npv, numPrimitives: np });
  scanPos = cpRegion[1] + 1;
}
console.log(`Found ${sections.length} sections`);

const primRegion = findFieldRegion(sectionsRegion[1], "primitives");
const primitives = [];
let primScanPos = primRegion[0];
while (primScanPos <= primRegion[1]) {
  const idxRegion = findFieldRegion(primScanPos, "indices");
  if (!idxRegion || idxRegion[0] > primRegion[1]) break;
  const ints = extractIntegers(idxRegion[0], idxRegion[1]).map(Number);
  if (ints.length >= 4) primitives.push([ints[0], ints[1], ints[2], ints[3]]);
  primScanPos = idxRegion[1] + 1;
}

const sviRegion = findFieldRegion(primRegion[1], "sharedVerticesIndex");
const sharedVerticesIndex = [];
if (sviRegion) {
  for (const v of extractIntegers(sviRegion[0], sviRegion[1])) sharedVerticesIndex.push(parseInt(v));
}

const pvRegion = findFieldRegion(sviRegion ? sviRegion[1] : primRegion[1], "packedVertices");
const packedVertices = [];
for (const v of extractIntegers(pvRegion[0], pvRegion[1])) packedVertices.push(Number(v) >>> 0);

const svRegion = findFieldRegion(pvRegion[1], "sharedVertices");
const sharedVertices = [];
if (svRegion) {
  for (const v of extractIntegers(svRegion[0], svRegion[1])) sharedVertices.push(BigInt(v));
}

function decodeSharedVertex(sv64) {
  const xi = Number(sv64 & 0x1fffffn);
  const yi = Number((sv64 >> 21n) & 0x1fffffn);
  const zi = Number((sv64 >> 42n) & 0x3fffffn);
  const dx = domain.max[0] - domain.min[0];
  const dy = domain.max[1] - domain.min[1];
  const dz = domain.max[2] - domain.min[2];
  return [
    domain.min[0] + (xi / 2097151) * dx,
    domain.min[1] + (yi / 2097151) * dy,
    domain.min[2] + (zi / 4194303) * dz,
  ];
}

const sec = sections[targetSection];
console.log(`\nSection ${targetSection}:`);
console.log(`  codecParms: [${sec.codecParms.map(v => v.toFixed(4))}]`);
console.log(`  fpvi=${sec.firstPackedVertexIndex} fsvi=${sec.firstSharedVertexIndex} fpi=${sec.firstPrimitiveIndex} npv=${sec.numPackedVertices} np=${sec.numPrimitives}`);

const objVerts = [];
const objFaces = [];

const [offX, offY, offZ, scaleX, scaleY, scaleZ] = sec.codecParms;
const pvStart = sec.firstPackedVertexIndex;
const pvEnd = Math.min(pvStart + sec.numPackedVertices, packedVertices.length);
for (let i = pvStart; i < pvEnd; i++) {
  const packed = packedVertices[i];
  const xi = packed & 0x7ff;
  const yi = (packed >>> 11) & 0x7ff;
  const zi = (packed >>> 22) & 0x3ff;
  objVerts.push([offX + xi * scaleX, offY + yi * scaleY, offZ + zi * scaleZ]);
}
console.log(`  Packed verts: ${objVerts.length}`);

const primStart = sec.firstPrimitiveIndex;
const primEnd = Math.min(primStart + sec.numPrimitives, primitives.length);
let maxSharedLocal = -1;
for (let pi = primStart; pi < primEnd; pi++) {
  for (const idx of primitives[pi]) {
    if (idx >= sec.numPackedVertices) {
      const local = idx - sec.numPackedVertices;
      if (local > maxSharedLocal) maxSharedLocal = local;
    }
  }
}

const sharedBase = objVerts.length;
console.log(`  Max shared local: ${maxSharedLocal}, sharedBase: ${sharedBase}`);
if (maxSharedLocal >= 0) {
  for (let j = 0; j <= maxSharedLocal; j++) {
    const sviIdx = sec.firstSharedVertexIndex + j;
    if (sviIdx < sharedVerticesIndex.length) {
      const globalIdx = sharedVerticesIndex[sviIdx];
      if (globalIdx < sharedVertices.length) {
        objVerts.push(decodeSharedVertex(sharedVertices[globalIdx]));
      } else {
        console.warn(`  WARN: globalIdx ${globalIdx} out of range`);
        objVerts.push([0, 0, 0]);
      }
    } else {
      console.warn(`  WARN: sviIdx ${sviIdx} out of range`);
      objVerts.push([0, 0, 0]);
    }
  }
}
console.log(`  Total verts: ${objVerts.length}`);

let triCount = 0, quadCount = 0;
for (let pi = primStart; pi < primEnd; pi++) {
  const [i0, i1, i2, i3] = primitives[pi];
  const resolve = (idx) => {
    if (idx < sec.numPackedVertices) return idx;
    return sharedBase + (idx - sec.numPackedVertices);
  };
  const f0 = resolve(i0), f1 = resolve(i1), f2 = resolve(i2), f3 = resolve(i3);
  if (i2 === i3) { objFaces.push([f0, f1, f2]); triCount++; }
  else { objFaces.push([f0, f1, f2, f3]); quadCount++; }
}
console.log(`  Faces: ${triCount} tri + ${quadCount} quad = ${triCount + quadCount}`);

// Edge length stats
let maxEdge = 0, avgEdge = 0, edgeCount = 0;
for (const face of objFaces) {
  for (let i = 0; i < face.length; i++) {
    const a = objVerts[face[i]], b = objVerts[face[(i + 1) % face.length]];
    const d = Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
    if (d > maxEdge) maxEdge = d;
    avgEdge += d;
    edgeCount++;
  }
}
console.log(`  Edge stats: max=${maxEdge.toFixed(2)} avg=${(avgEdge/edgeCount).toFixed(2)}`);

// Show first 5 faces with coords
console.log(`\n  First 5 faces:`);
for (let fi = 0; fi < Math.min(5, objFaces.length); fi++) {
  const f = objFaces[fi];
  const prim = primitives[primStart + fi];
  const coords = f.map(vi => `(${objVerts[vi].map(v => v.toFixed(1)).join(",")})`);
  console.log(`    prim[${primStart+fi}] raw=[${prim}] resolved=[${f}] → ${coords.join(" ")}`);
}

const objLines = [`# Section ${targetSection} only`, `# ${objVerts.length} verts, ${triCount} tri, ${quadCount} quad`, ""];
for (const [x, y, z] of objVerts) objLines.push(`v ${x} ${y} ${z}`);
objLines.push("");
for (const face of objFaces) {
  if (face.length === 3) objLines.push(`f ${face[0]+1} ${face[1]+1} ${face[2]+1}`);
  else objLines.push(`f ${face[0]+1} ${face[1]+1} ${face[2]+1} ${face[3]+1}`);
}
writeFileSync(objPath, objLines.join("\n"), "utf-8");
console.log(`\nWritten to ${objPath}`);
