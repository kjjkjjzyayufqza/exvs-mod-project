# hknpCompressedMeshShape Decode Reference

Cross-verified against DSMapStudio (C#), Smithbox (C#), PyNifly (Python), soulstruct-havok (Python).

## Related Documents

- [havok_compressed_mesh_encode.md](./havok_compressed_mesh_encode.md) — Encode (OBJ to HKT) reference
- [havok_hkt_to_obj.md](./havok_hkt_to_obj.md) — Our conversion process notes and pitfalls
- [havok-hkt-xml-conversion-analysis.md](./havok-hkt-xml-conversion-analysis.md) — HKT binary format reverse engineering via IDA Pro
- [havok-xml-import-feature.md](./havok-xml-import-feature.md) — Three.js import feature design

## Source References

| Project | Repository | Key Files |
|---------|-----------|-----------|
| DSMapStudio | github.com/soulsmods/DSMapStudio | `src/HKX2/HKX2/Manual/hknpCompressedMeshShapeData.cs` |
| DSMapStudio | (same) | `src/HKX2/HKX2/Builders/hknpCollisionMeshBuilder.cs` |
| DSMapStudio | (same) | `src/Andre/SoulsFormats/SoulsFormats/Formats/HKX/Collision.cs` |
| Smithbox | github.com/vawser/Smithbox | `src/Smithbox.Program/Editors/Map Editor/Utils/HKLib_Helper.cs` |
| PyNifly | github.com/BadDogSkyrim/PyNifly | `io_scene_nifly/pyn/bhk_autounpack.py` (decode) |
| PyNifly | (same) | `io_scene_nifly/pyn/bhk_autopack.py` (encode) |
| PyNifly | (same) | `docs/fo4_havok_packfile_format.md` (format spec) |
| soulstruct-havok | github.com/Grimrukh/soulstruct-havok | `src/soulstruct/havok/types/hk2014/` |
| HKLib | github.com/The12thAvenger/HKLib | Havok file read/write library |
| HavokLib | github.com/PredatorCZ/HavokLib | C++ Havok format library |

## Binary Layout (hknpCompressedMeshShapeData)

| Offset | Type | Field |
|--------|------|-------|
| +0x20 | vec4 | aabb_min (global mesh bounding box minimum) |
| +0x30 | vec4 | aabb_max (global mesh bounding box maximum) |
| +0x50 | hkArray | sections |
| +0x60 | hkArray | primitives (quad indices, 4 bytes each) |
| +0x70 | hkArray | sharedVerticesIndex (per-section shared to global mapping, u16) |
| +0x80 | hkArray | packedVertices (11-11-10 compressed local vertices, u32) |
| +0x90 | hkArray | sharedVertices (21-21-22 compressed global vertices, u64) |

## Section Structure (stride = 0x60 = 96 bytes)

| Offset | Type | Field |
|--------|------|-------|
| +0x00 | hkArray | nodes (BVH tree nodes) |
| +0x10 | vec4 | domain.min (section local AABB min) |
| +0x20 | vec4 | domain.max (section local AABB max) |
| +0x30 | float | codecParms[0] = offset X |
| +0x34 | float | codecParms[1] = offset Y |
| +0x38 | float | codecParms[2] = offset Z |
| +0x3C | float | codecParms[3] = scale X |
| +0x40 | float | codecParms[4] = scale Y |
| +0x44 | float | codecParms[5] = scale Z |
| +0x48 | u32 | firstPackedVertex (index into global packedVertices) |
| +0x4C | u32 | packed: (firstSharedVertexIndex << 8) or numPackedVertices |
| +0x50 | u32 | packed: (firstPrimitiveIndex << 8) or numPrimitives |
| +0x54 | u32 | packed: (firstDataRunIndex << 8) or count |
| +0x58 | u8 | numPackedVertices |
| +0x59 | u8 | numSharedIndices |
| +0x5A | u16 | leafIndex |
| +0x5C | u8 | page |
| +0x5D | u8 | flags |
| +0x5E | u8 | layerData |
| +0x5F | u8 | unusedData |

### codecParms Layout

```
codecParms[0] = offset.X  (= section bounding box min X)
codecParms[1] = offset.Y  (= section bounding box min Y)
codecParms[2] = offset.Z  (= section bounding box min Z)
codecParms[3] = scale.X   (= (sectionMax.X - sectionMin.X) / 2047.0)
codecParms[4] = scale.Y   (= (sectionMax.Y - sectionMin.Y) / 2047.0)
codecParms[5] = scale.Z   (= (sectionMax.Z - sectionMin.Z) / 1023.0)
```

Layout is GROUPED (offsets first, then scales), NOT interleaved.

## Packed Vertex Decode (u32 to vec3)

Bit layout within a 32-bit unsigned integer:

```
 31      22 21      11 10       0
+----------+----------+----------+
| Z 10-bit | Y 11-bit | X 11-bit |
+----------+----------+----------+
```

| Component | Bits | Mask | Max Value |
|-----------|------|------|-----------|
| X | [0:10] | 0x7FF | 2047 |
| Y | [11:21] | 0x7FF | 2047 |
| Z | [22:31] | 0x3FF | 1023 |

### Decode Formula

```c
uint32_t packed = packedVertices[section.firstPackedVertex + localIndex];

uint32_t qx = packed & 0x7FF;
uint32_t qy = (packed >> 11) & 0x7FF;
uint32_t qz = (packed >> 22) & 0x3FF;

float x = (float)qx * codecParms[3] + codecParms[0];
float y = (float)qy * codecParms[4] + codecParms[1];
float z = (float)qz * codecParms[5] + codecParms[2];
```

### DSMapStudio C# (verbatim)

```csharp
public static Vector3 DecompressPackedVertex(uint vertex, Vector3 scale, Vector3 offset)
{
    var x = (float)(vertex & 0x7FF) * scale.X + offset.X;
    var y = (float)((vertex >> 11) & 0x7FF) * scale.Y + offset.Y;
    var z = (float)((vertex >> 22) & 0x3FF) * scale.Z + offset.Z;
    return new Vector3(x, y, z);
}
```

### PyNifly Python (verbatim)

```python
def unpack_vertex(v):
    return (v & 0x7FF), ((v >> 11) & 0x7FF), ((v >> 22) & 0x3FF)

def decode_vertices(data, buf_abs, count, base, scale):
    bx, by, bz = base
    sx, sy, sz = scale
    verts = []
    for i in range(count):
        v = u32(data, buf_abs + i * 4)
        qx, qy, qz = unpack_vertex(v)
        verts.append((bx + qx * sx, by + qy * sy, bz + qz * sz))
    return verts
```

### Our JavaScript (verified correct)

```javascript
const xi = packed & 0x7ff;
const yi = (packed >>> 11) & 0x7ff;
const zi = (packed >>> 22) & 0x3ff;
const x = offX + xi * scaleX;
const y = offY + yi * scaleY;
const z = offZ + zi * scaleZ;
```

## Shared Vertex Decode (u64 to vec3)

Bit layout within a 64-bit unsigned integer:

```
 63      42 41      21 20       0
+----------+----------+----------+
| Z 22-bit | Y 21-bit | X 21-bit |
+----------+----------+----------+
```

| Component | Bits | Mask | Max Value |
|-----------|------|------|-----------|
| X | [0:20] | 0x1FFFFF | 2097151 (2^21 - 1) |
| Y | [21:41] | 0x1FFFFF | 2097151 (2^21 - 1) |
| Z | [42:63] | 0x3FFFFF | 4194303 (2^22 - 1) |

Uses the **global mesh AABB** (meshTree.domain), NOT the section AABB.

### Decode Formula

```c
uint64_t sv = sharedVertices[globalIndex];

uint64_t qx = sv & 0x1FFFFF;
uint64_t qy = (sv >> 21) & 0x1FFFFF;
uint64_t qz = (sv >> 42) & 0x3FFFFF;

float scaleX = (bbMax.x - bbMin.x) / 2097151.0f;
float scaleY = (bbMax.y - bbMin.y) / 2097151.0f;
float scaleZ = (bbMax.z - bbMin.z) / 4194303.0f;

float x = (float)qx * scaleX + bbMin.x;
float y = (float)qy * scaleY + bbMin.y;
float z = (float)qz * scaleZ + bbMin.z;
```

### DSMapStudio C# (verbatim)

```csharp
public static Vector3 DecompressSharedVertex(ulong vertex, Vector3 min, Vector3 max)
{
    var scaleX = (max.X - min.X) / (float)((1 << 21) - 1);
    var scaleY = (max.Y - min.Y) / (float)((1 << 21) - 1);
    var scaleZ = (max.Z - min.Z) / (float)((1 << 22) - 1);

    var x = (float)(vertex & 0x1FFFFF) * scaleX + min.X;
    var y = (float)((vertex >> 21) & 0x1FFFFF) * scaleY + min.Y;
    var z = (float)((vertex >> 42) & 0x3FFFFF) * scaleZ + min.Z;
    return new Vector3(x, y, z);
}
```

### PyNifly Python (verbatim)

```python
def decode_large_vertices(data, buf_abs, count, bb_min, bb_max):
    sx = (bb_max[0] - bb_min[0]) / ((1 << 21) - 1)
    sy = (bb_max[1] - bb_min[1]) / ((1 << 21) - 1)
    sz = (bb_max[2] - bb_min[2]) / ((1 << 22) - 1)
    verts = []
    for i in range(count):
        v = u64(data, buf_abs + i * 8)
        qx = v & 0x1FFFFF
        qy = (v >> 21) & 0x1FFFFF
        qz = (v >> 42) & 0x3FFFFF
        verts.append((bb_min[0] + qx * sx, bb_min[1] + qy * sy, bb_min[2] + qz * sz))
    return verts
```

### Our JavaScript (verified correct)

```javascript
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
```

## Primitive Structure

Each primitive is 4 bytes: indices[0], indices[1], indices[2], indices[3].

### Triangle vs Quad Detection

```
if indices[2] == indices[3]:
    triangle: (indices[0], indices[1], indices[2])
else:
    quad, split into two triangles:
        triangle 1: (indices[0], indices[1], indices[2])
        triangle 2: (indices[0], indices[2], indices[3])
```

DSMapStudio and PyNifly both use (0,1,2) + (0,2,3) for quad triangulation.
Our JS uses (0,1,2) + (2,3,0) which produces the same geometry. Both are valid.

DSMapStudio checks for 0xDEADDEAD as a sentinel skip marker. Not all games emit this.

### Index Resolution

Each byte index is local to the section's combined vertex space:

```
if (index < section.numPackedVertices):
    vertex = DecompressPackedVertex(
        packedVertices[section.firstPackedVertex + index],
        scale, offset)
else:
    sharedLocalIndex = index - section.numPackedVertices
    globalIndex = sharedVerticesIndex[section.firstSharedVertexIndex + sharedLocalIndex]
    vertex = DecompressSharedVertex(
        sharedVertices[globalIndex],
        meshDomain.min, meshDomain.max)
```

The threshold numPackedVertices divides the index space:
- [0, numPackedVertices) -> packed vertices (section-local quantization)
- [numPackedVertices, ...) -> shared vertices (global quantization via indirection)

## XML Tagfile Signed Integer Handling

XML tagfiles store packedVertices as signed int32 and sharedVertices as signed int64.
Convert to unsigned before bit extraction:

```javascript
const packed = Number(signedInt32) >>> 0;                 // signed to unsigned u32
const shared = BigInt(signedInt64) & 0xFFFFFFFFFFFFFFFFn; // signed to unsigned u64
```

## Full Decode Pipeline

```
1. Parse global mesh domain AABB (min, max)
2. Parse all sections (codecParms, firstPackedVertex, firstSharedVertex, firstPrimitive, counts)
3. Parse global arrays: primitives, sharedVerticesIndex, packedVertices, sharedVertices
4. For each section:
   a. Decode packed vertices using section.codecParms
   b. Scan primitives to find max shared vertex local index
   c. Decode shared vertices via sharedVerticesIndex indirection
   d. Resolve primitive indices and emit triangles
5. Output vertices and faces
```

## Coordinate System

- Havok uses Y-up right-handed coordinate system
- Blender uses Z-up: import OBJ with Forward=-Z, Up=Y
- Three.js / WebGL uses Y-up: no conversion needed

## Verification Checklist

- Vertex coordinate ranges match the global domain AABB
- No (0,0,0) vertices (indicates failed shared vertex decode)
- 95%+ of face edges within expected scale
- Total triangulated face count matches numPrimitiveKeys in meshTree
- Each section's vertices fall within its local domain AABB

