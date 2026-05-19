# Plan: Havok HKT ↔ XML Binary Tagfile Converter

**Complexity**: Large
**Goal**: 在 Rust 端实现 HKT 二进制 tagfile 与 XML tagfile 的双向转换，摆脱对 Havok GUI 工具的依赖

## Summary

通过逆向分析已完全破解 Havok 2016/2018 Binary Tagfile (TAG0) 格式。将在 Rust 端实现原生的 HKT↔XML 双向转换器，作为 Tauri command 暴露给前端。格式基于 FourCC 分段容器，使用 VarInt 编码和 ITEM 索引表映射对象。

## 格式规范 (逆向分析结果)

### 1. Chunk 结构
```
struct HkChunk {
    flags_and_size: u32,  // BE: (flags << 24) | total_size
    magic: [u8; 4],       // FourCC ASCII tag
    // data: [u8; total_size - 8]
}
// flags: 0x40 = leaf chunk (no sub-chunks)
// size: total_size & 0x3FFFFFFF, includes header(4) + tag(4) + data
```

### 2. 文件层级结构
```
TAG0 (file_size)
├── SDKV  → SDK version string, e.g. "20160200"
├── DATA  → Serialized object data (objects referenced by ITEM table)
├── TYPE  → Type system definitions
│   ├── TSTR  → Null-terminated type name strings
│   ├── TNA1  → Type name → TSTR offset mapping (packed ints)
│   ├── FSTR  → Null-terminated field name strings
│   ├── TBDY  → Type body definitions (packed int encoding)
│   └── TPAD  → Padding (empty)
└── INDX  → Object index
    ├── ITEM  → Object → DATA offset mapping (12 bytes/entry, LE)
    └── PTCH  → Pointer patch table (optional)
```

### 3. VarInt (Packed Integer) 编码
```
MSB pattern → byte count → value bits:
0xxxxxxx          → 1 byte  →  7 bits (0..127)
10xxxxxx xxxxxxxx → 2 bytes → 14 bits (0..16383)
110xxxxx xxxxxxxx xxxxxxxx → 3 bytes → 21 bits
111xxxxx xxxxxxxx xxxxxxxx xxxxxxxx → 4 bytes → 27 bits
```

### 4. ITEM 条目 (每条 12 bytes, Little-Endian)
```
struct ItemEntry {
    flags: u32,   // bits[0:23] = type_index, bits[24:31] = flags
                  //   0x10 = pointer/reference to object
                  //   0x20 = inline record/array data
    offset: u32,  // byte offset relative to DATA section start
    count: u32,   // number of elements (1 for single objects)
}
```

### 5. TBDY 类型定义编码 (per type, all packed ints)
```
type_index, parent_type, flags_bitfield
Conditional fields based on flags:
  0x01 → SubType: subTypeFlags (packed)
  0x02 → Pointer: pointer_type_index (packed)
  0x04 → Version: version (packed)
  0x08 → ByteSize: size(packed), alignment(packed)
  0x10 → AbstractValue: value (packed)
  0x20 → Members: count(packed), then per member:
           name_index(packed), flags(packed), byteOffset(packed), type_index(packed)
  0x40 → Interfaces: count(packed), then per interface record
```

### 6. DATA 区段对象编码
```
Type-based reading:
  Bool     → 1 byte
  Int8/16/32/64 → fixed-width LE
  Float    → 4-byte LE IEEE 754
  String   → u32 LE item_index → char array ITEM
  Pointer  → u32 LE item_index → referenced object ITEM
  Array    → u32 LE item_index → element array ITEM
  Record   → member-by-member at byteOffset, recursive
  Tuple    → tupleSize = subTypeFlags >> 8, fixed element array
```

### 7. 已验证的交叉对比
```
ITEM[1]: type=1  (hkRootLevelContainer) ptr,  offset=0x0000, count=1
ITEM[2]: type=3  (NamedVariant)         rec,  offset=0x0004, count=2
ITEM[5]: type=15 (char)                 rec,  offset=0x001C, count=11 → "Scene Data\0"  ✓
ITEM[6]: type=15 (char)                 rec,  offset=0x0027, count=19 → "Physics Scene Data\0"  ✓
ITEM[7]: type=15 (char)                 rec,  offset=0x003A, count=9  → "hkxScene\0"  ✓
ITEM[8]: type=15 (char)                 rec,  offset=0x0043, count=21 → "hknpPhysicsSceneData\0"  ✓
```

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Rust modules | `src-tauri/src/havok_cli.rs` | `HavokCliConfig`, Tauri command pattern |
| XML parsing | `src/utils/havokXmlParser.ts` | Havok XML tagfile v3 type/object structure |
| Error handling | `src-tauri/src/scene_memory_session.rs` | `Result<T, String>` for Tauri commands |
| Binary parsing | (new pattern) | `nom` or manual cursor-based reader with `byteorder` crate |

## Files to Change

| File | Action | Why |
|---|---|---|
| `src-tauri/src/havok_tagfile/mod.rs` | CREATE | Module root, re-exports |
| `src-tauri/src/havok_tagfile/chunk.rs` | CREATE | Chunk header parsing (TAG0/SDKV/DATA/TYPE/INDX) |
| `src-tauri/src/havok_tagfile/varint.rs` | CREATE | VarInt (packed integer) encode/decode |
| `src-tauri/src/havok_tagfile/types.rs` | CREATE | TSTR/TNA1/FSTR/TBDY type system parsing |
| `src-tauri/src/havok_tagfile/items.rs` | CREATE | ITEM table parsing |
| `src-tauri/src/havok_tagfile/data.rs` | CREATE | DATA section object deserialization |
| `src-tauri/src/havok_tagfile/reader.rs` | CREATE | HKT binary → in-memory HavokDocument |
| `src-tauri/src/havok_tagfile/writer.rs` | CREATE | In-memory HavokDocument → HKT binary |
| `src-tauri/src/havok_tagfile/xml_reader.rs` | CREATE | XML tagfile → in-memory HavokDocument |
| `src-tauri/src/havok_tagfile/xml_writer.rs` | CREATE | In-memory HavokDocument → XML tagfile |
| `src-tauri/src/havok_cli.rs` | UPDATE | Add convert commands, remove "not supported" error |
| `src-tauri/src/main.rs` | UPDATE | Register new Tauri commands |
| `src-tauri/Cargo.toml` | UPDATE | Add `quick-xml`, `byteorder` dependencies |

## Core Data Model

```rust
/// In-memory representation shared between binary and XML formats
pub struct HavokDocument {
    pub sdk_version: String,           // e.g. "20160200"
    pub types: Vec<HavokType>,         // Type definitions
    pub objects: Vec<HavokObject>,     // Serialized objects
    pub root_object_index: usize,      // Entry point
}

pub struct HavokType {
    pub name: String,
    pub parent: Option<usize>,         // Parent type index
    pub format: HavokFormat,           // Record, Array, Pointer, Int32, etc.
    pub version: Option<u32>,
    pub members: Vec<HavokMember>,
    pub sub_type: Option<usize>,
    pub flags: u32,
}

pub struct HavokMember {
    pub name: String,
    pub type_index: usize,
    pub flags: u32,
    pub byte_offset: u32,
}

pub enum HavokValue {
    Null,
    Bool(bool),
    Int(i64),
    Float(f32),
    String(String),
    Pointer(usize),                    // Object index
    Array(Vec<HavokValue>),
    Record(Vec<(String, HavokValue)>),
    Tuple(Vec<HavokValue>),
    RawBytes(Vec<u8>),
}

pub struct HavokObject {
    pub type_index: usize,
    pub values: HavokValue,            // Always Record at top level
}
```

## Tasks

### Task 1: Chunk parser + VarInt codec
- **Action**: Implement `chunk.rs` (FourCC section reader/writer) and `varint.rs` (packed int encode/decode)
- **Validate**: Unit tests with known hex sequences from border_hit.hkt

### Task 2: Type system parser (TSTR/TNA1/FSTR/TBDY)
- **Action**: Implement `types.rs` — parse TYPE section into `Vec<HavokType>`
- **Validate**: Parse border_hit.hkt types, verify type names match 33.xml type definitions

### Task 3: ITEM table parser
- **Action**: Implement `items.rs` — parse INDX/ITEM section into item table
- **Validate**: Verify ITEM[5].offset → "Scene Data\0" at DATA+0x1C

### Task 4: DATA section reader
- **Action**: Implement `data.rs` — deserialize objects from DATA using type defs + ITEM table
- **Validate**: Parse border_hit.hkt root object, verify namedVariants = ["Scene Data", "Physics Scene Data"]

### Task 5: HKT binary reader (full pipeline)
- **Action**: Implement `reader.rs` — TAG0 → SDKV + DATA + TYPE + INDX → HavokDocument
- **Validate**: Read border_hit.hkt into HavokDocument, compare field values with XML

### Task 6: XML writer
- **Action**: Implement `xml_writer.rs` — HavokDocument → XML tagfile v3 (matching existing XML format)
- **Mirror**: Follow exact XML structure from project's 33.xml / 326.xml / 39.xml
- **Validate**: `read_hkt("border_hit.hkt") → write_xml() → diff with GUI-exported XML`

### Task 7: XML reader
- **Action**: Implement `xml_reader.rs` — XML tagfile v3 → HavokDocument
- **Validate**: `read_xml("33.xml") → HavokDocument` matches expected types and values

### Task 8: HKT binary writer
- **Action**: Implement `writer.rs` — HavokDocument → TAG0 binary
- **Validate**: `read_hkt("border_hit.hkt") → write_hkt() → byte-compare with original`

### Task 9: Tauri commands + integration
- **Action**: Update `havok_cli.rs` with `convert_hkt_to_xml` and `convert_xml_to_hkt` Tauri commands
- **Validate**: End-to-end: frontend calls convert, output file is valid

## Validation
```bash
cargo check -p tauri-app
cargo test -p tauri-app -- havok_tagfile
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| TBDY 编码有未知的 flag 组合 | 中 | 用多个 HKT 样本测试，遇到未知 flag 时 error 而非 panic |
| 某些类型的 DATA 编码有特殊处理 (e.g., hkQsTransformf) | 中 | 参考 TagTools 的特殊处理列表，按需添加 |
| 写入的 HKT 与原始字节不完全一致 (padding/alignment) | 高 | 优先保证语义正确，bit-exact 作为后续优化目标 |
| XML v3 格式在不同 Havok 版本间有微小差异 | 低 | 先只支持 SDKV 20160200，后续按需扩展 |

## Acceptance
- [ ] `convert_hkt_to_xml(border_hit.hkt)` 输出与 Havok GUI 导出的 XML 语义一致
- [ ] `convert_xml_to_hkt(33.xml)` 输出能被 Havok GUI 正常读取
- [ ] Round-trip: HKT → XML → HKT 保持数据完整性
- [ ] 所有 task 有单元测试覆盖

## References
- [TagTools (Python, Havok 2016 binary tagfile tools)](https://github.com/blueskythlikesclouds/TagTools)
- [Havok middleware format docs](https://lukascone.wordpress.com/2024/03/12/havok-middleware/)
- [Havok SDK source headers (2009)](https://github.com/nitaigao/engine-showcase/tree/master/etc/vendor/havok/Source/Common/Serialize/Tagfile/Binary)
- Sample HKT: `E:\XB\解包\vs2\bak\001stage\201stage201\info\border_hit.hkt` (19,760 bytes)
- Reference XMLs: `E:\TAURI_PROJECT\33.xml`, `326.xml`, `39.xml`
