#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";

const xmlPath = process.argv[2];
const objPath = process.argv[3];
if (!xmlPath || !objPath) {
  console.error("Usage: node hkt_xml_to_obj_grouped.mjs <input.xml> <output.obj>");
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

const sectionsRegion = findFieldRegion(meshTreeFieldStart, "sections");
const sections = [];
let scanPos = sectionsRegion[0];
while (scanPos <= sectionsRegion[1]) {
  const cpRegion = findFieldRegion(scanPos, "codecParms");
  if (!cpRegion || cpnst line = lines[i].trim();
    const m = line.match(/name="(firstPackedVertexIndex|firstSharedVertexIndex|firstPrimitiveIndex|numPackedVertices|numPrimitives)".*?value="(\d+)"/);
    if (m) {
      const val = parseInt(m[2]);
      switch (m[1]) {
        case "firstPackedVertexIndex": fpvi = val; break;
        case "firstSharedVertexIndex": fsvi = val; break;
        case "firstPrimitiveIndex": fpi = val; break;
        case "numPackedVertices": npv = val; break;
        case "numPrimitives": np = val; break;
 n}

const primRegion = findFieldRegion(sectionsRegion[1], "primitives");
const p
  const idxRegion = findFieldRegion(primScanPos, "indices");
  if (!idxRegion || idxRegion[0] > primRegion[1]) break;
  const ints = extractIntegers(ion[1] + 1;
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

const objVerts = [];
const sectionFaces = [];

for (let si = 0; si < sections.length; si++) {
  const sec = sections[si];
  const vertBase = objVerts.length;
  const [offX, offY, offZ, scaleX, scaleY, scaleZ] = sec.codecParms;

  for (let i = sec.firstPackedVertexIndex; i < sec.firstPackedVertexIndex + sec.numPackedVertices; i++) {
    const packed = packedVertices[i];
    const xi = packed & 0x7ff;
    const yi = (packed >>> 11) & 0x7ff;
    const zi = (packed >>> 22) & 0x3ff;
    objVerts.push([offX + xi * scaleX, offY + yi * scaleY, offZ + zi * scaleZ]);
  }

  const primStart = sec.firstPrimitiveIndex;
  const primEnd = primStart + sec.numPrimitives;
  let maxSharedLocal = -1;
  for (let pi = primStart; pi < primEnd; pi++) {
    for (const idx of pharedBase = objVerts.length;
  if (maxSharedLocal >= 0) {
    for (let j = 0; j <= maxSharedLocal; j++) {
      const sviIdx = sec.firstSharedVertexIndex + j;
      if (sviIdx < sharedVerticesIndex.length) {
        const globalIdx = sharedVerticesIndex[sviIdx];
        if (globalIdx < sharedVertices.length) {
          objVerts.push(decodeSharedVertex(sharedVertices[globalIdx]));
        } elss[pi];
    const resolve = (idx) => {
      if (idx < sec.numPackedVertices) return vertBase + idx;
      return sharedBase + (idx - sec.numPackedVertices);
    };
    const f0 = resolve(i0), f1 = resolve(i1), f2 = resolve(i2), f3 = resolve(i3);
    if (i2 === i3) {
      faces.push([f0, f1, f2]);
    } else {
      faces.push([f0, f1, f2]);
      faces.push([f2, f3, f0]);
    }
  }
  sectionFaces.push(faces);
}

console.log(`Mesh: ${objVerts.length} vertices, ${sectionFaces.reduce((s, f) => s + f.length, 0)} triangles, ${sections.length} sections`);

const out = [
h section groups",
  `# ${objVerts.length} vertices, ${sections.length} sections`,
  "",
];

for (const [x, y, z] of objVerts) {
  out.push(`v ${x} ${y} ${z}`);
}
out.push("");

for (let si = 0; si < sectionFaces.length; si++) {
  out.push(`g section_${si}`);
  for (const f of sectionFaces[si]) {
    out.push(`f ${f[0] + 1} ${f[1] + 1} ${f[2] + 1}`);
  }
}

writeFileSync(objPath, out.join("\n"), "utf-8");
console.log(`Written to ${objPath}`);
