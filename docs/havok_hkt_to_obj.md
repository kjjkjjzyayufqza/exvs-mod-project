# Havok HKT Collision Mesh (hknpCompressedMeshShape) → OBJ 转换指南

## Related Documents

- [havok_compressed_mesh_decode.md](./havok_compressed_mesh_decode.md) — Decode algorithm formal reference (cross-verified with DSMapStudio, PyNifly, Smithbox)
- [havok_compressed_mesh_encode.md](./havok_compressed_mesh_encode.md) — Encode (OBJ to HKT) pipeline reference for future write-back
- [havok-hkt-xml-conversion-analysis.md](./havok-hkt-xml-conversion-analysis.md) — HKT binary format reverse engineering via IDA Pro
- [havok-xml-import-feature.md](./havok-xml-import-feature.md) — Three.js import feature design

## 概述

本文档记录了将 Havok 2018 格式的 `.hkt` 碰撞体文件（`hknpCompressedMeshShape`）正确转换为 `.obj` 3D 模型的完整分析过程。

源文件：`E:\XB\解包\com\test\0x4D1F5138\0\0\base\map_hit.hkt`（WMMT 街机赛车游戏碰撞体）

## 转换管线

```
HKT (二进制) → XML (Havok Content Tools) → OBJ (JS 脚本)
```

1. 使用 Havok Content Tools (`hkxcmd`) 将 `.hkt` 转换为 XML tagfile
2. 使用 `scripts/hkt_xml_to_obj.mjs` 解析 XML 并输出 `.obj`

## 数据结构

### hkcdStaticMeshTree 顶层结构

```
meshTree
├── domain (hkAabb)          — 整个 mesh 的全局 AABB
│   ├── min [x, y, z, w]
│   └── max [x, y, z, w]
├── sections (array)         — 66 个独立的 section
├── primitives (array)       — 5688 个面（全局数组）
├── sharedVerticesIndex      — 共享顶点索引映射表
├── packedVertices           — 压缩顶点数据（uint32）
└── sharedVertices           — 共享顶点数据（uint64）
```

### Section 结构

每个 section 包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| nodes | array | AABB 压缩节点（BVH 树） |
| domain | hkAabb | 该 section 的局部 AABB |
| codecParms | float[6] | 顶点解压参数 `[offX, offY, offZ, scaleX, scaleY, scaleZ]` |
| firstPackedVertexIndex | uint32 | 在全局 packedVertices 数组中的起始索引 |
| firstSharedVertexIndex | uint32 | 在全局 sharedVerticesIndex 数组中的起始索引 |
| firstPrimitiveIndex | uint32 | 在全局 primitives 数组中的起始索引 |
| numPackedVertices | uint8 | 该 section 的压缩顶点数量（最大 255） |
| numPrimitives | uint8 | 该 section 的面数量（最大 255） |

### Primitive 结构

```
hkcdStaticMeshTree::Primitive
└── indices: uint8[4]  — 4 个顶点索引（局部于 section）
```

- 若 `indices[2] == indices[3]`：三角形（仅使用前 3 个索引）
- 若 `indices[2] != indices[3]`：四边形（4 个索引按 loop 顺序）

## 解码算法

### 1. Packed Vertex 解码（uint32 → xyz）

```javascript
// 位布局：X = bits[0-10], Y = bits[11-21], Z = bits[22-31]
const xi = packed & 0x7FF;           // 11 bits, 范围 [0, 2047]
const yi = (packed >>> 11) & 0x7FF;  // 11 bits, 范围 [0, 2047]
const zi = (packed >>> 22) & 0x3FF;  // 10 bits, 范围 [0, 1023]

// 使用 section 的 codecParms 解压
const [offX, offY, offZ, scaleX, scaleY, scaleZ] = section.codecParms;
const x = offX + xi * scaleX;
const y = offY + yi * scaleY;
const z = offZ + zi * scaleZ;
```

**关键点：**
- X 在低位，Z 在高位（不是反过来！）
- 使用 `>>>` 无符号右移（JavaScript 中 `>>` 是有符号右移）
- codecParms 布局是 `[offset, offset, offset, scale, scale, scale]`，不是交错的

### 2. Shared Vertex 解码（uint64 → xyz）

共享顶点使用全局 domain AABB 解码，精度更高：

```javascript
function decodeSharedVertex(sv64) {
  // 位布局：X = bits[0-20], Y = bits[21-41], Z = bits[42-63]
  const xi = Number(sv64 & 0x1FFFFFn);           // 21 bits, 范围 [0, 2097151]
  const yi = Number((sv64 >> 21n) & 0x1FFFFFn);  // 21 bits, 范围 [0, 2097151]
  const zi = Number((sv64 >> 42n) & 0x3FFFFFn);  // 22 bits, 范围 [0, 4194303]

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

**关键点：**
- X 和 Y 各 21 bits，Z 是 22 bits（不是全部 21 bits）
- Z 的除数是 4194303（2^22 - 1），不是 2097151（2^21 - 1）
- 使用 BigInt（`n` 后缀）处理 64 位整数
- 使用全局 domain AABB 而非 section 的局部 domain

### 3. 顶点索引解析

Primitive 中的索引是 section 局部的：

```javascript
function resolveIndex(idx, section, vertBase, sharedBase) {
  if (idx < section.numPackedVertices) {
    return vertBase + idx;  // 直接映射到 packed vertex
  } else {
    // 共享顶点需要通过 sharedVerticesIndex 间接寻址
    const localSharedIdx = idx - section.numPackedVertices;
    return sharedBase + localSharedIdx;
  }
}
```

### 4. 共享顶点间接寻址

```javascript
// 对于 section 中的第 j 个共享顶点：
const sviIdx = section.firstSharedVertexIndex + j;
const globalVertexIdx = sharedVerticesIndex[sviIdx];
const vertex = decodeSharedVertex(sharedVertices[globalVertexIdx]);
```

### 5. 四边形分解（三角化方式）

```javascript
// quad (i0, i1, i2, i3) → 两个三角形
triangle1 = [i0, i1, i2];
triangle2 = [i2, i3, i0];
```

## 踩坑记录

### 错误 1：Packed Vertex 位布局反转（严重）

**错误写法：**
```javascript
const xi = (packed >>> 21) & 0x7FF;  // ✗ 错！
const yi = (packed >>> 10) & 0x7FF;  // ✗ 错！
const zi = packed & 0x3FF;           // ✗ 错！
```

**正确写法：**
```javascript
const xi = packed & 0x7FF;           // ✓ X 在低位
const yi = (packed >>> 11) & 0x7FF;  // ✓ Y 在中间
const zi = (packed >>> 22) & 0x3FF;  // ✓ Z 在高位
```

**验证来源：** Smithbox (C#), WoT-Blender-Addons (Python), jnifj3d (Java)

### 错误 2：Shared Vertex 位布局和 Z 除数（严重）

**错误写法：**
```javascript
const xi = Number((sv64 >> 43n) & 0x1FFFFFn);  // ✗ 位置错
const zi = Number(sv64 & 0x1FFFFFn);            // ✗ 位置错
// 全部用 / 2097151                              // ✗ Z 除数错
```

**正确写法：**
```javascript
const xi = Number(sv64 & 0x1FFFFFn);            // ✓ bits[0-20]
const yi = Number((sv64 >> 21n) & 0x1FFFFFn);   // ✓ bits[21-41]
const zi = Number((sv64 >> 42n) & 0x3FFFFFn);   // ✓ bits[42-63], 22 bits
// X, Y 除以 2097151; Z 除以 4194303
```

**验证来源：** Smithbox (C#), WoT-Blender-Addons (Python)

### 错误 3：codecParms 布局误解

**错误布局：** 交错布局 `[offX, scaleX, offY, scaleY, offZ, scaleZ]`

**正确布局：** 分组布局 `[offX, offY, offZ, scaleX, scaleY, scaleZ]`

## 参考实现

| 项目 | 语言 | 链接 |
|------|------|------|
| Smithbox | C# | github.com/vawser/Smithbox |
| WoT-Blender-Addons | Python | github.com/peterino2/WoT-Blender-Addons |
| jnifj3d | Java | github.com/philjord/jnifj3d |
| Crash-NST-Level-Editor | C# | github.com/BetaM/Crash-NST-Level-Editor |
| NavMeshStudio | C# | github.com/Jeongmin94/NavMeshStudio |

## 输出验证

正确转换后的 mesh 特征：
- 顶点坐标范围匹配 domain AABB（本例：X[-1099, 1057], Y[-8, 437], Z[-960, 990]）
- 98% 的面边长 <= 80 单位（道路表面）
- 少量大面（~16/5688）是边界墙面，跨度可达 ~450 单位
- 三角化后总面数 = XML 中的 `numPrimitiveKeys`（本例：11131）
- 无 (0,0,0) 顶点（表示无失败的共享顶点解码）

## 坐标系

- Havok 使用 **Y-up** 右手坐标系
- Blender 使用 Z-up，导入 OBJ 时会自动转换
- 导入设置：Forward = -Z, Up = Y（Blender 默认）

## 文件清单

| 文件 | 说明 |
|------|------|
| `scripts/hkt_xml_to_obj.mjs` | 主转换脚本（XML → OBJ） |
| `scripts/hkt_xml_to_obj_debug.mjs` | 单 section 调试脚本 |
| `scripts/diagnose_obj.mjs` | OBJ 质量诊断脚本 |
| `scripts/find_worst_faces.mjs` | 面质量分析脚本 |
| `map_hit_debug.xml` | HKT 转换后的 XML tagfile（16MB） |
