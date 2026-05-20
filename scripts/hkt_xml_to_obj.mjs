#!/usr/bin/env node
// Havok XML tagfile → OBJ converter
// Properly handles per-section vertex decompression with codecParms
//
// Usage: node scripts/hkt_xml_to_obj.mjs <input.xml> <output.obj>

import { readFileSync, writeFileSync } from "fs";

const xmlPath = process.argv[2];
const objPath = process.argv[3];
if (!xmlPath || !objPath) {
  console.error("Usage: node hkt_xml_to_obj.mjs <input.xml> <output.obj>");
  process.exit(1);
}

console.log(`Reading ${xmlPath}...`);
const xml = readFileSync(xmlPath, "utf-8");
const lines = xml.split("\n");
console.log(`${lines.length} lines loaded.`);

// --- State machine parser ---
// We look for specific field contexts and extract values.

let inMeshTree = false;
let meshTreeDepth = 0;
let currentField = "";
let fieldStack = [];
let arrayContext = "";
let inSectionArray = false;
let sectionArrayDepth = 0;
let inSectionRecord = false;
let sectionRecordDepth = 0;
let inPrimArray = false;
let primArrayDepth = 0;
let inPrimRecord = false;

// Data to collect
const domain = { min: [], max: [] };
const sections = [];
const packedVertices = [];
const sharedVertices = [];
const sharedVerticesIndex = [];
const primitives = [];

let currentSection = null;
let currentPrimIndices = [];

// Simpler approach: find key regions by line patterns
let state = "SCAN";
let subState = "";
let depthCounter = 0;
let collectTarget = null;
let collectBuffer = [];
let sectionFieldBuffer = {};

function findMeshTreeStart(lineIdx) {
  // Find: <field name="meshTree"> inside the hknpCompressedMeshShapeData object
  for (let i = lineIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('name="meshTree"') && line.includes("<field")) {
      return i;
    }
  }
  return -1;
}

function findFieldRegion(startLine, fieldName) {
  // Find <field name="fieldName"> and return [startLine, endLine]
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i].trim();
    if (
      line.includes(`name="${fieldName}"`) &&
      line.startsWith("<field")
    ) {
      // Find closing </field> at same depth
      let depth = 0;
      for (let j = i; j < lines.length; j++) {
        const l = lines[j];
        const opens = (l.match(/<field[\s>]/g) || []).length;
        const closes = (l.match(/<\/field>/g) || []).length;
        depth += opens - closes;
        if (depth <= 0) {
          return [i, j];
        }
      }
    }
  }
  return null;
}

function extractIntegers(startLine, endLine) {
  const result = [];
  for (let i = startLine; i <= endLine; i++) {
    const matches = lines[i].matchAll(/value="(-?\d+)"/g);
    for (const m of matches) {
      result.push(m[1]);
    }
  }
  return result;
}

function extractReals(startLine, endLine) {
  const result = [];
  for (let i = startLine; i <= endLine; i++) {
    const matches = lines[i].matchAll(/dec="([^"]+)"/g);
    for (const m of matches) {
      result.push(parseFloat(m[1]));
    }
  }
  return result;
}

// Step 1: Find meshTree region
console.log("Finding meshTree...");
const meshTreeFieldStart = findMeshTreeStart(0);
if (meshTreeFieldStart < 0) {
  console.error("Cannot find meshTree field");
  process.exit(1);
}
console.log(`meshTree starts at line ${meshTreeFieldStart + 1}`);

// Find the end of the meshTree region (it's a huge region)
// Instead, let's find specific sub-fields within meshTree

// Step 2: Domain AABB
console.log("Extracting domain AABB...");
const domainRegion = findFieldRegion(meshTreeFieldStart, "domain");
if (!domainRegion) {
  console.error("Cannot find domain field");
  process.exit(1);
}

const minRegion = findFieldRegion(domainRegion[0], "min");
const maxRegion = findFieldRegion(domainRegion[0], "max");
if (!minRegion || !maxRegion) {
  console.error("Cannot find min/max in domain");
  process.exit(1);
}

domain.min = extractReals(minRegion[0], minRegion[1]).slice(0, 3);
domain.max = extractReals(maxRegion[0], maxRegion[1]).slice(0, 3);
console.log(`  Domain min: [${domain.min}]`);
console.log(`  Domain max: [${domain.max}]`);

// Step 3: Sections
console.log("Extracting sections...");
const sectionsRegion = findFieldRegion(meshTreeFieldStart, "sections");
if (!sectionsRegion) {
  console.error("Cannot find sections field");
  process.exit(1);
}

// Parse section records within the sections array
// Each section record has: nodes, domain, codecParms, firstPackedVertexIndex, etc.
// We look for codecParms as the marker for each section's useful data
let scanPos = sectionsRegion[0];
while (scanPos <= sectionsRegion[1]) {
  const cpRegion = findFieldRegion(scanPos, "codecParms");
  if (!cpRegion || cpRegion[0] > sectionsRegion[1]) break;

  const codecParms = extractReals(cpRegion[0], cpRegion[1]);

  // Extract scalar fields after codecParms
  const extractScalar = (name) => {
    const region = findFieldRegion(cpRegion[1], name);
    if (!region || region[0] > cpRegion[1] + 20) return 0;
    const vals = extractIntegers(region[0], region[1]);
    return vals.length > 0 ? parseInt(vals[0]) : 0;
  };

  // The scalar fields come right after codecParms in the section record
  // Let's scan the next ~20 lines for them
  let fpvi = 0,
    fsvi = 0,
    fpi = 0,
    npv = 0,
    np = 0;
  for (let i = cpRegion[1]; i < Math.min(cpRegion[1] + 30, sectionsRegion[1]); i++) {
    const line = lines[i].trim();
    const m = line.match(
      /name="(firstPackedVertexIndex|firstSharedVertexIndex|firstPrimitiveIndex|numPackedVertices|numPrimitives)".*?value="(\d+)"/
    );
    if (m) {
      const val = parseInt(m[2]);
      switch (m[1]) {
        case "firstPackedVertexIndex":
          fpvi = val;
          break;
        case "firstSharedVertexIndex":
          fsvi = val;
          break;
        case "firstPrimitiveIndex":
          fpi = val;
          break;
        case "numPackedVertices":
          npv = val;
          break;
        case "numPrimitives":
          np = val;
          break;
      }
    }
  }

  sections.push({
    codecParms,
    firstPackedVertexIndex: fpvi,
    firstSharedVertexIndex: fsvi,
    firstPrimitiveIndex: fpi,
    numPackedVertices: npv,
    numPrimitives: np,
  });

  scanPos = cpRegion[1] + 1;
}
console.log(`  Found ${sections.length} sections`);
if (sections.length > 0) {
  const s0 = sections[0];
  console.log(
    `  Section 0: codecParms=[${s0.codecParms.map((v) => v.toFixed(4))}], pvStart=${s0.firstPackedVertexIndex}, npv=${s0.numPackedVertices}, primStart=${s0.firstPrimitiveIndex}, np=${s0.numPrimitives}`
  );
}

// Step 4: Primitives
console.log("Extracting primitives...");
const primRegion = findFieldRegion(sectionsRegion[1], "primitives");
if (!primRegion) {
  console.error("Cannot find primitives field");
  process.exit(1);
}

// Parse primitive records: each has indices array of 4 uint8
let primScanPos = primRegion[0];
while (primScanPos <= primRegion[1]) {
  const idxRegion = findFieldRegion(primScanPos, "indices");
  if (!idxRegion || idxRegion[0] > primRegion[1]) break;
  const ints = extractIntegers(idxRegion[0], idxRegion[1]).map(Number);
  if (ints.length >= 4) {
    primitives.push([ints[0], ints[1], ints[2], ints[3]]);
  }
  primScanPos = idxRegion[1] + 1;
}
console.log(`  Found ${primitives.length} primitives`);

// Step 5: sharedVerticesIndex
console.log("Extracting sharedVerticesIndex...");
const sviRegion = findFieldRegion(primRegion[1], "sharedVerticesIndex");
if (sviRegion) {
  const vals = extractIntegers(sviRegion[0], sviRegion[1]);
  for (const v of vals) sharedVerticesIndex.push(parseInt(v));
  console.log(`  Found ${sharedVerticesIndex.length} sharedVerticesIndex entries`);
}

// Step 6: packedVertices
console.log("Extracting packedVertices...");
const pvRegion = findFieldRegion(
  sviRegion ? sviRegion[1] : primRegion[1],
  "packedVertices"
);
if (!pvRegion) {
  console.error("Cannot find packedVertices field");
  process.exit(1);
}
{
  const vals = extractIntegers(pvRegion[0], pvRegion[1]);
  for (const v of vals) packedVertices.push(Number(v) >>> 0);
  console.log(`  Found ${packedVertices.length} packedVertices`);
}

// Step 7: sharedVertices
console.log("Extracting sharedVertices...");
const svRegion = findFieldRegion(pvRegion[1], "sharedVertices");
if (svRegion) {
  const vals = extractIntegers(svRegion[0], svRegion[1]);
  for (const v of vals) sharedVertices.push(BigInt(v));
  console.log(`  Found ${sharedVertices.length} sharedVertices`);
}

// --- Build OBJ ---
console.log("\nBuilding OBJ mesh...");

const objVerts = [];
const objFaces = [];
let triCount = 0;
let quadCount = 0;

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

for (let si = 0; si < sections.length; si++) {
  const sec = sections[si];
  const vertBase = objVerts.length;

  const [offX, offY, offZ, scaleX, scaleY, scaleZ] = sec.codecParms;
  const pvStart = sec.firstPackedVertexIndex;
  const pvEnd = Math.min(pvStart + sec.numPackedVertices, packedVertices.length);
  for (let i = pvStart; i < pvEnd; i++) {
    const packed = packedVertices[i];
    const xi = packed & 0x7ff;
    const yi = (packed >>> 11) & 0x7ff;
    const zi = (packed >>> 22) & 0x3ff;
    const x = offX + xi * scaleX;
    const y = offY + yi * scaleY;
    const z = offZ + zi * scaleZ;
    objVerts.push([x, y, z]);
  }

  // Find max shared vertex index used by this section
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

  // Decompress shared vertices
  const sharedBase = objVerts.length;
  if (maxSharedLocal >= 0) {
    for (let j = 0; j <= maxSharedLocal; j++) {
      const sviIdx = sec.firstSharedVertexIndex + j;
      if (sviIdx < sharedVerticesIndex.length) {
        const globalIdx = sharedVerticesIndex[sviIdx];
        if (globalIdx < sharedVertices.length) {
          objVerts.push(decodeSharedVertex(sharedVertices[globalIdx]));
        } else {
          objVerts.push([0, 0, 0]);
        }
      } else {
        objVerts.push([0, 0, 0]);
      }
    }
  }

  // Process primitives
  for (let pi = primStart; pi < primEnd; pi++) {
    const [i0, i1, i2, i3] = primitives[pi];
    const resolve = (idx) => {
      if (idx < sec.numPackedVertices) {
        return vertBase + idx;
      } else {
        return sharedBase + (idx - sec.numPackedVertices);
      }
    };

    const f0 = resolve(i0);
    const f1 = resolve(i1);
    const f2 = resolve(i2);
    const f3 = resolve(i3);

    if (i2 === i3) {
      objFaces.push([f0, f1, f2]);
      triCount++;
    } else {
      objFaces.push([f0, f1, f2, f3]);
      quadCount++;
    }
  }
}

console.log(
  `Mesh: ${objVerts.length} vertices, ${triCount} triangles, ${quadCount} quads`
);

// Write OBJ
console.log(`Writing ${objPath}...`);
const objLines = [
  `# Havok Collision Mesh (hknpCompressedMeshShape)`,
  `# Sections: ${sections.length}, Vertices: ${objVerts.length}, Triangles: ${triCount}, Quads: ${quadCount}`,
  ``,
];

for (const [x, y, z] of objVerts) {
  objLines.push(`v ${x} ${y} ${z}`);
}
objLines.push(``);

for (const face of objFaces) {
  // OBJ is 1-indexed
  if (face.length === 3) {
    objLines.push(`f ${face[0] + 1} ${face[1] + 1} ${face[2] + 1}`);
  } else {
    objLines.push(
      `f ${face[0] + 1} ${face[1] + 1} ${face[2] + 1} ${face[3] + 1}`
    );
  }
}

writeFileSync(objPath, objLines.join("\n"), "utf-8");
console.log("Done!");
