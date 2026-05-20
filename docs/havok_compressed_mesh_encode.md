# hknpCompressedMeshShape Encode Reference

How to build a hknpCompressedMeshShape from raw vertices and triangles.

## Related Documents

- [havok_compressed_mesh_decode.md](./havok_compressed_mesh_decode.md) — Decode (HKT to OBJ) reference
- [havok_hkt_to_obj.md](./havok_hkt_to_obj.md) — Our conversion process notes and pitfalls
- [havok-hkt-xml-conversion-analysis.md](./havok-hkt-xml-conversion-analysis.md) — HKT binary format reverse engineering via IDA Pro

## Source References

| Project | Repository | Key Files |
|---------|-----------|-----------|
| DSMapStudio | github.com/soulsmods/DSMapStudio | `src/HKX2/HKX2/Builders/hknpCollisionMeshBuilder.cs` (full encode pipeline) |
| PyNifly | github.com/BadDogSkyrim/PyNifly | `io_scene_nifly/pyn/bhk_autopack.py` (simplified single-section encode) |
| Project-Rito | github.com/Project-Rito/HKX2Builders | Havok mesh builders (encode direction) |

## Overview

```
Input: vertices (vec3[]), triangles (uint[][3])
Output: hknpCompressedMeshShapeData binary structure

Pipeline:
1. Compute global AABB
2. Build BVH tree from triangles
3. Split into sections (max 255 primitives, max 255 vertices per section)
4. Identify shared vertices (used by multiple sections)
5. Compress shared vertices using global AABB (21-21-22 bit)
6. For each section: compress local vertices using section AABB (11-11-10 bit)
7. Build primitives with local indices
8. Assemble final binary structure
```

## Step 1: Compute Global AABB

```csharp
Vector3 bbMin = new Vector3(float.MaxValue);
Vector3 bbMax = new Vector3(float.MinValue);
foreach (var v in vertices)
{
    bbMin = Vector3.Min(bbMin, v);
    bbMax = Vector3.Max(bbMax, v);
}
```

## Step 2: Section Splitting

Each section has hard limits:
- Max 255 packed vertices (u8 index space)
- Max 255 primitives (u8 count field)
- Spatially coherent (BVH-based grouping)

DSMapStudio uses BVH node traversal to group primitives into sections.
PyNifly uses a simpler approach: one section per mesh (works for small meshes).

## Step 3: Identify Shared Vertices

A vertex is "shared" if it appears in more than one section.
Shared vertices get higher precision (21-21-22 bit) and use the global AABB.

```
for each vertex:
    count how many sections reference it
    if count > 1: mark as shared
```

## Step 4: Compress Shared Vertices (u64, 21-21-22 bit)

Uses global mesh AABB for quantization.

### Encode Formula

```csharp
float scaleX = (bbMax.X - bbMin.X) / (float)((1 << 21) - 1);  // / 2097151
float scaleY = (bbMax.Y - bbMin.Y) / (float)((1 << 21) - 1);
float scaleZ = (bbMax.Z - bbMin.Z) / (float)((1 << 22) - 1);  // / 4194303

ulong qx = (ulong)((vertex.X - bbMin.X) / scaleX);
ulong qy = (ulong)((vertex.Y - bbMin.Y) / scaleY);
ulong qz = (ulong)((vertex.Z - bbMin.Z) / scaleZ);

ulong encoded = (qx & 0x1FFFFF) | ((qy & 0x1FFFFF) << 21) | ((qz & 0x3FFFFF) << 42);
```

### PyNifly Python

```python
sx = (bb_max[0] - bb_min[0]) / ((1 << 21) - 1)
sy = (bb_max[1] - bb_min[1]) / ((1 << 21) - 1)
sz = (bb_max[2] - bb_min[2]) / ((1 << 22) - 1)

qx = int((x - bb_min[0]) / sx) if sx else 0
qy = int((y - bb_min[1]) / sy) if sy else 0
qz = int((z - bb_min[2]) / sz) if sz else 0

encoded = (qx & 0x1FFFFF) | ((qy & 0x1FFFFF) << 21) | ((qz & 0x3FFFFF) << 42)
```

## Step 5: Compress Packed Vertices (u32, 11-11-10 bit)

Uses section-local AABB for quantization.

### Compute Section codecParms

```csharp
Vector3 sectionMin = /* section bounding box min */;
Vector3 sectionMax = /* section bounding box max */;

// codecParms[0..2] = offset (section min)
float offsetX = sectionMin.X;
float offsetY = sectionMin.Y;
float offsetZ = sectionMin.Z;

// codecParms[3..5] = scale (extent / max quantized value)
float scaleX = (sectionMax.X - sectionMin.X) / 2047.0f;  // 0x7FF
float scaleY = (sectionMax.Y - sectionMin.Y) / 2047.0f;
float scaleZ = (sectionMax.Z - sectionMin.Z) / 1023.0f;  // 0x3FF
```

### Encode Formula

```csharp
uint qx = (uint)Math.Min(Math.Max((vertex.X - offsetX) / scaleX, 0), 0x7FF);
uint qy = (uint)Math.Min(Math.Max((vertex.Y - offsetY) / scaleY, 0), 0x7FF);
uint qz = (uint)Math.Min(Math.Max((vertex.Z - offsetZ) / scaleZ, 0), 0x3FF);

uint packed = (qx & 0x7FF) | ((qy & 0x7FF) << 11) | ((qz & 0x3FF) << 22);
```

### PyNifly Python

```python
sx = (sec_max[0] - sec_min[0]) / 2047
sy = (sec_max[1] - sec_min[1]) / 2047
sz = (sec_max[2] - sec_min[2]) / 1023

qx = min(2047, max(0, round((x - sec_min[0]) / sx))) if sx else 0
qy = min(2047, max(0, round((y - sec_min[1]) / sy))) if sy else 0
qz = min(1023, max(0, round((z - sec_min[2]) / sz))) if sz else 0

packed = qx | (qy << 11) | (qz << 22)
```

## Step 6: Build Primitives

Each triangle becomes a degenerate quad: [a, b, c, c].
Each real quad uses all 4 indices: [a, b, c, d].

Indices are local to the section's vertex space:
- [0, numPackedVertices) references packed (local) vertices
- [numPackedVertices, ...) references shared vertices via sharedVerticesIndex

```csharp
// For a triangle with local vertex indices a, b, c:
byte[] primitive = new byte[4] { (byte)a, (byte)b, (byte)c, (byte)c };

// For a quad:
byte[] primitive = new byte[4] { (byte)a, (byte)b, (byte)c, (byte)d };
```

## Step 7: Build sharedVerticesIndex

For each section, build a mapping from local shared index to global shared vertex index:

```
sharedVerticesIndex[section.firstSharedVertexIndex + localSharedIdx] = globalSharedVertexIdx
```

This allows primitives to reference shared vertices by local index,
which gets resolved through this indirection table to the global shared vertex array.

## Step 8: Assemble Section Fields

```csharp
section.codecParms = [offsetX, offsetY, offsetZ, scaleX, scaleY, scaleZ];
section.firstPackedVertex = globalPackedVertexOffset;
section.firstSharedVertexIndex = globalSharedIndexOffset;
section.firstPrimitiveIndex = globalPrimitiveOffset;
section.numPackedVertices = localPackedVertexCount;   // u8, max 255
section.numPrimitives = localPrimitiveCount;          // u8, max 255
```

## Step 9: Build BVH Tree

The BVH (Bounding Volume Hierarchy) accelerates collision queries.

### Mesh-level BVH

- Each leaf references a section index
- Internal nodes store compressed AABB deltas (quadratic encoding)
- Node size: 5 bytes (BBX, BBY, BBZ, IDX_LO, IDX_HI)

### Section-level BVH

- Each leaf references a primitive index within the section
- Node size: 4 bytes (BBX, BBY, BBZ, IDX)

### AABB Compression (quadratic encoding)

```
// Encode: float delta -> u4 (nibble)
nibble = sqrt(delta / parentExtent * 226)

// Decode: u4 -> float delta
delta = (nibble^2) * (1/226) * parentExtent
```

DSMapStudio builds BVH using a top-down spatial median split.
PyNifly skips BVH construction for simple single-section meshes.

## Step 10: Assemble Binary ShapeData

### hknpCompressedMeshShapeData header (0xA0 bytes)

```
+0x20: aabb_min (vec4)
+0x30: aabb_max (vec4)
+0x50: hkArray sections     (count, capacity, flags)
+0x60: hkArray primitives
+0x70: hkArray sharedVerticesIndex
+0x80: hkArray packedVertices
+0x90: hkArray sharedVertices
```

### hknpCompressedMeshShape header (0xC0 bytes)

Contains vtable pointer, type flags, version hash, and pointer to ShapeData.
See PyNifly `_CM_SHAPE_HDR` constant for exact byte layout.

## Limitations and Notes

- Single section max 255 vertices: for meshes with more vertices per region,
  must split into multiple sections
- Single section max 255 primitives: same splitting requirement
- PyNifly encoder does NOT generate shared vertices (only local packed vertices).
  This works for simple meshes but loses cross-section vertex sharing.
- DSMapStudio encoder is the only open-source implementation with full
  shared vertex support and BVH construction.
- Quantization introduces precision loss. Max error per axis:
  - Packed: sectionExtent / maxQuantized (e.g. 100m / 2047 = ~0.05m)
  - Shared: globalExtent / maxQuantized (e.g. 2000m / 2097151 = ~0.001m)

## Encode Pipeline Summary

```
Input: vertices[], triangles[]
  |
  v
[Compute global AABB] --> bbMin, bbMax
  |
  v
[Build BVH / Split into sections] --> sections[]
  |
  v
[Identify shared vertices] --> sharedSet
  |
  v
[Compress shared vertices (21-21-22, global AABB)] --> sharedVertices[]
  |
  v
[For each section:]
  |-- [Compute section AABB] --> codecParms
  |-- [Compress local vertices (11-11-10, section AABB)] --> packedVertices[]
  |-- [Build sharedVerticesIndex mapping]
  |-- [Build primitives with local indices]
  |-- [Build section-level BVH]
  |
  v
[Build mesh-level BVH]
  |
  v
[Assemble binary: ShapeData header + arrays + BVH nodes]
  |
  v
Output: hknpCompressedMeshShapeData binary
```
