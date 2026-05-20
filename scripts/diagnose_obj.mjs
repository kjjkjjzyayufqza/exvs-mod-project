#!/usr/bin/env node
import { readFileSync } from "fs";

const objPath = "E:/XB/解包/com/test/map_hit_corrected.obj";
const lines = readFileSync(objPath, "utf-8").split("\n");

const verts = [];
const faces = [];
for (const l of lines) {
  if (l.startsWith("v ")) {
    const [, x, y, z] = l.split(" ").map(Number);
    verts.push([x, y, z]);
  } else if (l.startsWith("f ")) {
    faces.push(l.split(" ").slice(1).map((i) => parseInt(i) - 1));
  }
}

console.log("Total verts:", verts.length, "faces:", faces.length);

// Section boundaries from the converter output
// We need to reconstruct which vertices belong to which section
// by re-running the converter logic. Instead, let's analyze face quality.

// Check edge lengths per face and find problematic faces
const edgeLengths = [];
let longFaces = 0;
for (let fi = 0; fi < faces.length; fi++) {
  const f = faces[fi];
  let maxEdge = 0;
  for (let i = 0; i < f.length; i++) {
    const a = verts[f[i]],
      b = verts[f[(i + 1) % f.length]];
    if (!a || !b) {
      maxEdge = 99999;
      break;
    }
    const d = Math.sqrt(
      (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
    );
    if (d > maxEdge) maxEdge = d;
  }
  edgeLengths.push(maxEdge);
  if (maxEdge > 100) longFaces++;
}

console.log("Faces with max edge > 100:", longFaces, "/", faces.length);
console.log(
  "Percentage:",
  ((100 * longFaces) / faces.length).toFixed(1) + "%"
);

// Distribution
const buckets = [10, 20, 30, 50, 100, 200, 500, 1000];
console.log("\nMax edge length distribution:");
for (const b of buckets) {
  const count = edgeLengths.filter((e) => e <= b).length;
  console.log(`  <= ${b}: ${count} (${((100 * count) / faces.length).toFixed(1)}%)`);
}

// Show top 10 worst faces
const sorted = edgeLengths
  .map((e, i) => ({ e, i }))
  .sort((a, b) => b.e - a.e)
  .slice(0, 10);
console.log("\nTop 10 worst faces:");
for (const { e, i } of sorted) {
  const f = faces[i];
  const coords = f.map((vi) =>
    verts[vi] ? `(${verts[vi].map((v) => v.toFixed(1)).join(",")})` : "INVALID"
  );
  console.log(`  face ${i}: maxEdge=${e.toFixed(1)} indices=[${f}] → ${coords.join(" ")}`);
}

// Check if problematic faces use high vertex indices (shared vertices)
console.log("\nAnalyzing vertex index patterns in worst faces:");
for (const { e, i } of sorted.slice(0, 5)) {
  const f = faces[i];
  console.log(`  face ${i}: vertex indices = [${f}]`);
}
