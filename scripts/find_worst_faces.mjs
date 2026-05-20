#!/usr/bin/env node
import { readFileSync } from "fs";

const objPath = "E:/XB/解包/com/test/map_hit_corrected.obj";
const objText = readFileSync(objPath, "utf-8");
const objLines = objText.split("\n");

const verts = [];
const faces = [];
for (const l of objLines) {
  if (l.startsWith("v ")) {
    const parts = l.split(" ");
    verts.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
  } else if (l.startsWith("f ")) {
    faces.push(l.split(" ").slice(1).map(s => parseInt(s) - 1));
  }
}

console.log("Verts:", verts.length, "Faces:", faces.length);

// Compute max edge per face
const faceEdges = [];
for (let fi = 0; fi < faces.length; fi++) {
  const f = faces[fi];
  let maxEdge = 0;
  for (let i = 0; i < f.length; i++) {
    const a = verts[f[i]];
    const b = verts[f[(i + 1) % f.length]];
    if (!a || !b) { maxEdge = 99999; break; }
    const d = Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
    if (d > maxEdge) maxEdge = d;
  }
  faceEdges.push(maxEdge);
}

// Distribution
const buckets = [10, 20, 30, 40, 50, 60, 80, 100, 200, 500];
console.log("\nMax edge length distribution:");
for (const b of buckets) {
  const count = faceEdges.filter(e => e <= b).length;
  console.log(`  <= ${b}: ${count}/${faces.length} (${(100*count/faces.length).toFixed(1)}%)`);
}

// Top 20 worst faces
const sorted = faceEdges.map((e, i) => ({e, i})).sort((a, b) => b.e - a.e).slice(0, 20);
console.log("\nTop 20 worst faces:");
for (const {e, i} of sorted) {
  const f = faces[i];
  const coords = f.map(vi => `(${verts[vi][0].toFixed(0)},${verts[vi][1].toFixed(0)},${verts[vi][2].toFixed(0)})`);
  console.log(`  face[${i}] maxEdge=${e.toFixed(1)} indices=[${f}] ${coords.join(" ")}`);
}

// Check for faces where vertices are in completely different regions
console.log("\nChecking for cross-region faces (vertices > 200 apart in any axis):");
let crossRegion = 0;
for (let fi = 0; fi < faces.length; fi++) {
  const f = faces[fi];
  const xs = f.map(vi => verts[vi][0]);
  const ys = f.map(vi => verts[vi][1]);
  const zs = f.map(vi => verts[vi][2]);
  const xSpan = Math.max(...xs) - Math.min(...xs);
  const ySpan = Math.max(...ys) - Math.min(...ys);
  const zSpan = Math.max(...zs) - Math.min(...zs);
  if (xSpan > 200 || ySpan > 200 || zSpan > 200) {
    crossRegion++;
    if (crossRegion <= 5) {
      console.log(`  face[${fi}] xSpan=${xSpan.toFixed(0)} ySpan=${ySpan.toFixed(0)} zSpan=${zSpan.toFixed(0)}`);
      const coords = f.map(vi => `(${verts[vi][0].toFixed(0)},${verts[vi][1].toFixed(0)},${verts[vi][2].toFixed(0)})`);
      console.log(`    ${coords.join(" ")}`);
    }
  }
}
console.log(`  Total cross-region faces: ${crossRegion}/${faces.length}`);

// Check vertex coordinate ranges
const allX = verts.map(v => v[0]);
const allY = verts.map(v => v[1]);
const allZ = verts.map(v => v[2]);
console.log(`\nVertex ranges:`);
console.log(`  X: [${Math.min(...allX).toFixed(1)}, ${Math.max(...allX).toFixed(1)}]`);
console.log(`  Y: [${Math.min(...allY).toFixed(1)}, ${Math.max(...allY).toFixed(1)}]`);
console.log(`  Z: [${Math.min(...allZ).toFixed(1)}, ${Math.max(...allZ).toFixed(1)}]`);

// Check for duplicate vertex positions (shared verts decoded multiple times)
console.log(`\nChecking for (0,0,0) vertices (failed shared vertex decode):`);
const zeroVerts = verts.filter(v => v[0] === 0 && v[1] === 0 && v[2] === 0);
console.log(`  Count: ${zeroVerts.length}`);
