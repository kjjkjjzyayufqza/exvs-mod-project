# Havok HKT ↔ XML Conversion: Complete Reverse Engineering & Implementation Analysis

## Related Documents

- [havok_compressed_mesh_decode.md](./havok_compressed_mesh_decode.md) — Decode algorithm formal reference
- [havok_compressed_mesh_encode.md](./havok_compressed_mesh_encode.md) — Encode pipeline reference
- [havok_hkt_to_obj.md](./havok_hkt_to_obj.md) — HKT to OBJ conversion process and pitfalls
- [havok-xml-import-feature.md](./havok-xml-import-feature.md) — Three.js import feature design

> **Date**: 2026-05-19  
> **Havok Version**: Havok 2018 Content Tools (SDK version `20180100`)  
> **Installation Path**: `C:\Program Files\Havok\HavokContentTools`  
> **DLL Analyzed**: `hkCompatFormats.dll` (47 MB, 64-bit PE)  
> **Tools Used**: IDA Pro (via ida-pro-mcp), manual binary inspection, CLI experimentation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Goal & Motivation](#2-goal--motivation)
3. [Havok Binary Tagfile (TAG0) Format Specification](#3-havok-binary-tagfile-tag0-format-specification)
4. [Havok Streaming Binary Tagfile Format](#4-havok-streaming-binary-tagfile-format)
5. [Havok XML Tagfile v3 Format](#5-havok-xml-tagfile-v3-format)
6. [Reverse Engineering: hkCompatFormats.dll](#6-reverse-engineering-hkcompatformatsdll)
7. [Reverse Engineering: hctStandAloneFilterManager.exe](#7-reverse-engineering-hctstandalonefiltermanagerexe)
8. [Reverse Engineering: "Write to Platform" Filter](#8-reverse-engineering-write-to-platform-filter)
9. [Eliminated Approaches](#9-eliminated-approaches)
10. [Chosen Approach: CLI-Based Conversion](#10-chosen-approach-cli-based-conversion)
11. [HKO Configuration Format](#11-hko-configuration-format)
12. [Implementation Details](#12-implementation-details)
13. [Verified Test Results](#13-verified-test-results)
14. [Future Work: Native Rust Parser](#14-future-work-native-rust-parser)
15. [Reference Materials](#15-reference-materials)

---

## 1. Executive Summary

This document records the complete reverse engineering analysis performed on Havok 2018 Content Tools to achieve **bidirectional HKT ↔ XML conversion** without depending on the Havok GUI application. The final implementation uses `hctStandAloneFilterManager.exe` in headless CLI mode (`--interactive=0`) with custom `.hko` configuration files that invoke the "Write to Platform" filter with the `xmlFormat` flag toggled appropriately.

**Key discovery**: The critical `xmlFormat` boolean field inside the `hctPlatformWriterOptions` class controls whether output is XML tagfile or binary tagfile. This was found by reverse engineering the filter registration at `sub_1805FB380` in `hkCompatFormats.dll` via IDA Pro.

---

## 2. Goal & Motivation

### Problem Statement

Havok `.hkt` files (binary tagfile format) are opaque binary blobs. To inspect, modify, or template collision data, human-readable XML is essential. The Havok GUI tool (`hctStandAloneFilterManager.exe`) can perform this conversion interactively, but:

1. Manual GUI operation is slow and not automatable
2. The workflow requires launching the GUI, loading a file, selecting the filter, configuring output, and running — multiple clicks per file
3. No batch processing capability in GUI mode

### Requirements

- **HKT → XML**: Convert binary tagfile (`.hkt`) to XML tagfile v3 format
- **XML → HKT**: Convert XML tagfile back to binary tagfile
- **Automation**: Must work without GUI interaction (headless/CLI)
- **Integration**: Callable from a Tauri v2 application (Rust backend, TypeScript frontend)
- **Simplicity**: Minimal implementation — avoid writing a full binary parser if possible

---

## 3. Havok Binary Tagfile (TAG0) Format Specification

### Overview

The Havok Binary Tagfile is a **FourCC chunk container format** identified by the `TAG0` magic at the file start. All multi-byte integers in chunk headers are **big-endian**; data within the `DATA` section is **little-endian**.

### 3.1 Chunk Header Structure

```
Offset  Size  Description
------  ----  -----------
0x00    4     flags_and_size (big-endian u32)
              - bits[24:31] = flags
                  0x40 = leaf chunk (contains raw data, no sub-chunks)
              - bits[0:23]  = total_size (includes 8-byte header)
0x04    4     magic (FourCC ASCII, e.g., "TAG0", "SDKV", "DATA")
0x08    ...   data (total_size - 8 bytes)
```

The `total_size` field includes the 8-byte header itself. To extract:
```
flags = (flags_and_size >> 24) & 0xFF
total_size = flags_and_size & 0x00FFFFFF
data_size = total_size - 8
```

### 3.2 File-Level Chunk Hierarchy

```
TAG0 (root, size = file size)
├── SDKV (leaf)        → SDK version string, e.g., "20160200" or "20180100"
├── DATA (leaf)        → Serialized object data (binary blob)
├── TYPE (container)   → Type system definitions
│   ├── TSTR (leaf)    → Null-terminated type name string pool
│   ├── TNA1 (leaf)    → Type name → TSTR offset mapping (packed ints)
│   ├── FSTR (leaf)    → Null-terminated field name string pool
│   ├── TBDY (leaf)    → Type body definitions (packed int encoding)
│   └── TPAD (leaf)    → Padding/alignment (typically empty)
└── INDX (container)   → Object index
    ├── ITEM (leaf)    → Object → DATA offset mapping (12 bytes per entry, LE)
    └── PTCH (leaf)    → Pointer patch table (optional, for relocations)
```

### 3.3 VarInt (Packed Integer) Encoding

Used extensively in `TNA1` and `TBDY` sections. Encoding:

```
MSB Pattern              Byte Count    Value Bits    Range
-----------------------  ----------    ----------    ----------
0xxxxxxx                 1 byte        7 bits        0..127
10xxxxxx xxxxxxxx        2 bytes       14 bits       0..16383
110xxxxx xxxxxxxx xx...  3 bytes       21 bits       0..2097151
111xxxxx xxxxxxxx xx...  4 bytes       27 bits       0..134217727
```

Decoding algorithm:
```
if (byte0 & 0x80) == 0:
    value = byte0 & 0x7F
elif (byte0 & 0xC0) == 0x80:
    value = ((byte0 & 0x3F) << 8) | byte1
elif (byte0 & 0xE0) == 0xC0:
    value = ((byte0 & 0x1F) << 16) | (byte1 << 8) | byte2
elif (byte0 & 0xE0) == 0xE0:
    value = ((byte0 & 0x1F) << 24) | (byte1 << 16) | (byte2 << 8) | byte3
```

### 3.4 ITEM Table Entry Format

Each ITEM entry is 12 bytes, **little-endian**:

```
Offset  Size  Description
------  ----  -----------
0x00    4     flags (u32 LE)
              - bits[0:23]  = type_index (index into type table)
              - bits[24:31] = item_flags
                  0x10 = pointer/reference to another object
                  0x20 = inline record or array data
0x04    4     offset (u32 LE) — byte offset relative to DATA section start
0x08    4     count (u32 LE) — number of elements (1 for single objects)
```

The first ITEM entry (index 0) is always a null sentinel with all zeros.

### 3.5 TBDY Type Definition Encoding

Each type definition in TBDY is encoded as a sequence of packed integers:

```
type_index (packed)
parent_type_index (packed)  — 0 if no parent
flags_bitfield (packed)

Conditional fields based on flags:
  bit 0 (0x01) → SubType:
      subTypeFlags (packed)
  bit 1 (0x02) → Pointer:
      pointer_type_index (packed)
  bit 2 (0x04) → Version:
      version (packed)
  bit 3 (0x08) → ByteSize:
      size (packed)
      alignment (packed)
  bit 4 (0x10) → AbstractValue:
      value (packed)
  bit 5 (0x20) → Members:
      count (packed)
      For each member:
          name_index (packed)  — index into FSTR string pool
          flags (packed)
          byteOffset (packed)
          type_index (packed)
  bit 6 (0x40) → Interfaces:
      count (packed)
      For each interface:
          interface record (packed ints)
```

### 3.6 DATA Section Object Encoding

Objects in the DATA section are read type-by-type using the type definitions:

```
Type            Encoding
-----------     ------------------------------------------
Bool            1 byte (0x00 = false, non-zero = true)
Int8            1 byte, signed
Int16           2 bytes LE, signed
Int32           4 bytes LE, signed
Int64           8 bytes LE, signed
UInt8           1 byte, unsigned
UInt16          2 bytes LE, unsigned
UInt32          4 bytes LE, unsigned
UInt64          8 bytes LE, unsigned
Float           4 bytes LE, IEEE 754
String          4 bytes LE → ITEM index → char array ITEM
Pointer         4 bytes LE → ITEM index → referenced object ITEM
Array           4 bytes LE → ITEM index → element array ITEM
Record          Members read sequentially at their byteOffsets
Tuple           tupleSize = (subTypeFlags >> 8), fixed-count element array
```

### 3.7 Cross-Validation Results

Verified against `border_hit.hkt` (19,760 bytes, SDK version `20160200`):

```
ITEM    Type    Flags   Offset   Count   Resolved Content
------  ------  ------  -------  ------  --------------------------------
[0]     0       0x00    0x0000   0       (null sentinel)
[1]     1       ptr     0x0000   1       hkRootLevelContainer
[2]     3       rec     0x0004   2       NamedVariant[2]
[5]     15      rec     0x001C   11      "Scene Data\0"              ✓
[6]     15      rec     0x0027   19      "Physics Scene Data\0"      ✓
[7]     15      rec     0x003A   9       "hkxScene\0"                ✓
[8]     15      rec     0x0043   21      "hknpPhysicsSceneData\0"    ✓
```

---

## 4. Havok Streaming Binary Tagfile Format

### Overview

A **different** binary format from the TAG0 chunk format. Identified by a two-part magic number. This format is used internally by `hkCompatFormats.dll` for streaming deserialization.

### 4.1 Magic Number

```
Offset  Size  Value         Description
------  ----  ----------    -----------
0x00    4     0xCAB00D1E    Primary magic (big-endian)
0x04    4     0xD011FACE    Secondary magic (big-endian)
```

Both magic values must be present for the file to be recognized as a streaming binary tagfile.

### 4.2 Signed LEB128 VarInt

Unlike the TAG0 format's unsigned packed integers, the streaming format uses **signed LEB128** variable-length integers. The sign is encoded in the least significant bit of the final byte.

### 4.3 Command Tags

The streaming format uses a tag-based command protocol:

```
Tag  Name          Description
---  -----------   ----------------------------------------
1    TypeDef       Define a new type
2    ObjectStart   Begin a new object instance
3    ObjectEnd     End current object instance
4    FieldValue    Set a field value
5    ArrayStart    Begin an array
6    ArrayEnd      End an array
7    Reference     Object reference/pointer
```

### 4.4 IDA Analysis Location

The streaming tagfile reader implementation was found at:
- **Function**: `sub_18078C4A0` in `hkCompatFormats.dll`
- **Header parser**: `sub_18078B190` (validates magic, reads version and SDK string)

---

## 5. Havok XML Tagfile v3 Format

### 5.1 File Structure

```xml
<?xml version="1.0" encoding="utf-8"?>
<hktagfile version="3">
  <!-- Type definitions -->
  <type id="type1">
    <name value="hkRootLevelContainer"/>
    <format value="7"/>  <!-- 7 = record -->
    <fields count="N">
      <field name="fieldName" typeid="typeN" flags="F" />
    </fields>
  </type>
  
  <!-- Object instances -->
  <object type="type1" id="object1">
    <record>
      <field name="fieldName">
        <!-- field value -->
      </field>
    </record>
  </object>
</hktagfile>
```

### 5.2 Format Codes

The `format` attribute on `<type>` elements uses these numeric codes:

```
Code     Type              Notes
------   ---------------   ------------------------------------------
3        char* (string pointer)
6        Pointer           Has <subtype> and <parameters>
7        Record            Has <fields>
8        Array             Has <subtype>
131      hkStringPtr       String with internal flag
8196     uint8/char        LE byte
33284    int32             LE 32-bit signed integer
```

### 5.3 Type Element Attributes

```xml
<type id="typeN">
  <name value="TypeName"/>
  <parent id="typeM" />             <!-- optional: parent type for inheritance -->
  <format value="7"/>               <!-- required: format code -->
  <version value="N"/>              <!-- optional: type version number -->
  <subtype id="typeK" />            <!-- for Array/Pointer: element/target type -->
  <parameters count="N">            <!-- template parameters -->
    <typeparam id="typeP" />
  </parameters>
  <flags value="N"/>                <!-- optional: type flags -->
  <fields count="N">
    <field name="..." typeid="..." flags="..." />
  </fields>
</type>
```

### 5.4 Field Flags

```
Flag   Meaning
-----  -------------------------
32     Standard field (0x20)
34     Inline/embedded field (0x22)
36     Pointer/reference field (0x24)
```

### 5.5 Object Value Encoding

```xml
<!-- Integer -->
<int>42</int>

<!-- Float -->
<real>3.14159</real>

<!-- String -->
<string>Scene Data</string>

<!-- Boolean -->
<bool>true</bool>

<!-- Pointer/Reference -->
<ref>object5</ref>
<ref>null</ref>

<!-- Array -->
<array count="3">
  <int>1</int>
  <int>2</int>
  <int>3</int>
</array>

<!-- Record -->
<record>
  <field name="x"><real>1.0</real></field>
  <field name="y"><real>2.0</real></field>
</record>

<!-- Tuple (fixed-size vector, e.g., hkVector4) -->
<vec>(1.0 2.0 3.0 0.0)</vec>
```

### 5.6 Sample Type Hierarchy (from `33.xml`)

```
hkBaseObject (abstract, flags=144)
└── hkReferencedObject (version=3)
    ├── hkxScene (version=5)
    ├── hknpPhysicsSceneData
    ├── hknpShape
    │   └── hknpCompositeShape
    │       └── hknpCompressedMeshShape (version=1)
    └── hknpMaterial (version=1)

hkRootLevelContainer
└── namedVariants: hkArray<NamedVariant>
    ├── [0] name="Scene Data", className="hkxScene", variant→hkxScene
    └── [1] name="Physics Scene Data", className="hknpPhysicsSceneData", variant→hknpPhysicsSceneData
```

---

## 6. Reverse Engineering: hkCompatFormats.dll

### 6.1 Overview

`hkCompatFormats.dll` is a 47 MB, 64-bit PE DLL from Havok 2018 Content Tools. It provides format compatibility/conversion functionality.

**File location**: `C:\Program Files\Havok\HavokContentTools\hkCompatFormats.dll`

### 6.2 Exported Functions

```
Export              Address         Purpose
-----------------   -------------   ----------------------------------------
compatInit          0x180600140     Initialize Havok compatibility system
compatLoad          0x180600250     Load and convert a file
compatFree          0x1806003E0     Free loaded data
compatQuit          0x180600420     Shutdown compatibility system
```

### 6.3 compatLoad Analysis (0x180600250)

**Critical finding**: The `compatLoad` function internally uses `hkBinaryTagfileWriter` as its output writer. This is **hardcoded** — there is no parameter or configuration option to switch to XML output.

#### Call chain:
```
compatLoad_0(filename, output_buffer)
  → opens file
  → detects format (TAG0 or streaming)
  → deserializes to in-memory representation
  → serializes via hkBinaryTagfileWriter  ← HARDCODED
  → writes to output_buffer
```

#### Decompiled pseudocode (simplified):

```c
int64_t compatLoad_0(const char* filename, void** output) {
    // ... file reading ...
    
    // Format detection
    if (magic == TAG0_MAGIC) {
        // Use TAG0 chunk-based reader
    } else if (magic == 0xCAB00D1E) {
        // Use streaming binary tagfile reader
    }
    
    // Deserialization to hkResource
    hkResource* resource = deserialize(data, size);
    
    // Output — ALWAYS binary tagfile writer, no XML option
    hkBinaryTagfileWriter writer;
    writer.write(resource, output);
    
    return 0;
}
```

**Conclusion**: Direct FFI to `hkCompatFormats.dll` **cannot** produce XML output. This approach was eliminated.

### 6.4 Streaming Tagfile Reader (sub_18078C4A0)

Located at `0x18078C4A0`, this function implements the streaming binary tagfile deserialization:

```
sub_18078C4A0:
  - Validates magic: 0xCAB00D1E + 0xD011FACE
  - Reads signed LEB128 VarInt for command tags
  - Processes command loop (tags 1-7)
  - Builds in-memory object graph
```

### 6.5 Streaming Format Header Parser (sub_18078B190)

Located at `0x18078B190`:
- Reads and validates the two-part magic number
- Extracts format version
- Reads SDK version string
- NOT the TAG0 format — this is specifically the streaming binary format

---

## 7. Reverse Engineering: hctStandAloneFilterManager.exe

### 7.1 Overview

`hctStandAloneFilterManager.exe` is the **64-bit** Havok Content Tools filter manager application. While primarily a GUI application, it supports full **headless/CLI operation**.

**File location**: `C:\Program Files\Havok\HavokContentTools\hctStandAloneFilterManager.exe`  
**Architecture**: 64-bit (x86_64)

### 7.2 CLI Parameters

```
Parameter              Description
---------------------  --------------------------------------------------------
--settings=<path>      Path to .hko configuration file defining filter pipeline
--output=<path>        Output directory for processed files
--asset=<path>         Asset/working directory (prevents writing to source paths
                       embedded in HKT metadata)
--interactive=0        Headless mode — no GUI, exit after processing
--standard=1           Use standard filter processing mode
--verbose=0            Suppress verbose output
<input_file>           Positional argument: input .hkt/.hkx/.xml file
```

### 7.3 Key Behaviors

1. **Output file extension**: Always `.hkx` regardless of whether output is XML or binary
2. **Asset path redirection**: Without `--asset=<dir>`, the tool may attempt to write output to the original asset path embedded in the HKT file's metadata (e.g., `C:\nufw_proj\vsac\...`). Using `--asset=<tempdir>` redirects output to the temp directory.
3. **Working directory**: Must be set to the tool's installation directory for DLL resolution
4. **Exit behavior**: With `--interactive=0`, the process exits after completing the filter pipeline

### 7.4 FileConvert.exe — Eliminated

`FileConvert.exe` at `C:\Program Files\Havok\HavokContentTools\FileConvert\bin\windows\FileConvert.exe` is a **32-bit** executable. It cannot load the 64-bit `hkCompatFormats.dll` and other 64-bit Havok DLLs in the installation. Any attempt to use it fails with architecture mismatch errors.

---

## 8. Reverse Engineering: "Write to Platform" Filter

### 8.1 Filter Identification

Through IDA Pro reverse engineering of `hkCompatFormats.dll`:

```
Filter Name:     "Write to Platform"
Filter ID:       2876798309 (0xAB706965)
Registration:    sub_1805FB380 in hkCompatFormats.dll
Source file:     hctPlatformWriterFilter.cpp (from RTTI strings)
Options class:   hctPlatformWriterOptions
Version:         66049 (0x10201)
```

### 8.2 hctPlatformWriterOptions Fields

Found by tracing the options class structure from the filter registration function:

```
Field                       Type    Default    Description
--------------------------  ------  ---------  ----------------------------------------
filename                    string  ""         Output filename override (empty = auto)
tagfile                     bool    true       Use tagfile format (vs. packfile)
bytesInPointer              int     8          Pointer size (4 = 32-bit, 8 = 64-bit)
littleEndian                bool    true       Byte order (true = LE, false = BE)
reusePaddingOptimized       bool    false      Optimize padding reuse in packfile
emptyBaseClassOptimized     bool    false      Optimize empty base classes
removeMetadata              bool    false      Strip metadata from output
userTag                     int     0          User-defined tag value
saveEnvironmentData         bool    true       Include environment/scene data
xmlFormat                   bool    false      ★ KEY FIELD: true=XML, false=binary
```

### 8.3 The xmlFormat Field

**This is the critical discovery.** The `xmlFormat` boolean field at the end of `hctPlatformWriterOptions` controls the output format:

- `xmlFormat = true` → Output is **XML tagfile v3** (human-readable)
- `xmlFormat = false` → Output is **binary tagfile** (TAG0 format)

This field is persisted in the `.hko` configuration file and read by the filter when processing.

### 8.4 Filter Registration Trace

```
sub_1805FB380:                          ; filter registration
    lea     rax, "Write to Platform"    ; filter name
    mov     [rsp+...], 0xAB706965      ; filter ID = 2876798309
    lea     rcx, hctPlatformWriterOptions_vtable
    call    registerFilter
```

---

## 9. Eliminated Approaches

### 9.1 Direct FFI to hkCompatFormats.dll

**Status**: Eliminated  
**Reason**: `compatLoad` hardcodes `hkBinaryTagfileWriter`. No parameter controls output format. Would require patching the DLL binary or hooking the writer vtable — too fragile.

### 9.2 FileConvert.exe CLI

**Status**: Eliminated  
**Reason**: `FileConvert.exe` is 32-bit. The Havok Content Tools installation is 64-bit. Architecture mismatch prevents loading any Havok DLLs. The executable is essentially non-functional in this installation.

### 9.3 Pure Rust Binary Parser

**Status**: Deprioritized (not eliminated)  
**Reason**: Fully parsing the TAG0 format, type system, DATA section, and then generating valid XML (and vice versa) is a substantial effort (~9 implementation tasks). While feasible and documented in `.claude/plans/havok-hkt-xml-converter.plan.md`, the CLI approach achieves the same result with minimal code. The native parser remains a viable future enhancement for environments where Havok Content Tools are not installed.

### 9.4 DAE → HKT Direct Conversion

**Status**: Impossible without DCC plugins  
**Reason**: Neither `FileConvert.exe` nor `hctStandAloneFilterManager.exe` can load COLLADA (`.dae`) files. They only accept Havok-native formats (`.hkt`, `.hkx`, XML tagfile). DAE→HKT requires the Havok exporter plugin for 3ds Max or Maya, which is a DCC-specific integration, not a standalone tool.

---

## 10. Chosen Approach: CLI-Based Conversion

### 10.1 Architecture

```
┌─────────────────────────────────────────────────┐
│  Tauri Frontend (TypeScript)                     │
│  convertHktToXml(input, output)                  │
│  convertXmlToHkt(input, output)                  │
└──────────────────────┬──────────────────────────┘
                       │ invoke (IPC)
┌──────────────────────▼──────────────────────────┐
│  Tauri Backend (Rust)                            │
│  havok_cli.rs                                    │
│  ┌─────────────────────────────────────────────┐ │
│  │ run_filter_manager()                        │ │
│  │  1. Create temp directory                   │ │
│  │  2. Write .hko config (HKO_WRITE_XML or     │ │
│  │     HKO_WRITE_HKT constant)                 │ │
│  │  3. Spawn hctStandAloneFilterManager.exe    │ │
│  │     --settings=<hko> --output=<tempdir>     │ │
│  │     --asset=<tempdir> --interactive=0       │ │
│  │     --standard=1 --verbose=0 <input_file>   │ │
│  │  4. Find .hkx output in temp directory      │ │
│  │  5. Copy to target output path              │ │
│  │  6. Clean up temp directory                 │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────┘
                       │ std::process::Command
┌──────────────────────▼──────────────────────────┐
│  hctStandAloneFilterManager.exe (64-bit)         │
│  Havok Content Tools installation                │
│  "Write to Platform" filter (ID: 2876798309)     │
│  xmlFormat = true/false                          │
└─────────────────────────────────────────────────┘
```

### 10.2 Why This Approach

1. **Zero binary parsing** — Havok's own tool handles all format complexity
2. **Proven correctness** — Output is generated by official Havok SDK code
3. **Bidirectional** — Same filter handles both directions via `xmlFormat` toggle
4. **Minimal code** — ~120 lines of Rust (one function + two thin wrappers)
5. **SDK version handling** — The tool automatically handles version differences

### 10.3 Limitations

1. **Requires Havok Content Tools installed** — Not available on machines without the SDK
2. **Process spawning overhead** — Each conversion spawns an external process (~1-2 seconds)
3. **SDK version bump** — Round-tripping (HKT→XML→HKT) may bump the SDK version from `20160200` to `20180100` since the tool writes with its own SDK version
4. **No Linux/macOS support** — `hctStandAloneFilterManager.exe` is Windows-only

---

## 11. HKO Configuration Format

### 11.1 Overview

`.hko` files are XML configuration files that define filter pipelines for `hctStandAloneFilterManager.exe`. They use Havok's `hkobject` serialization format.

### 11.2 Structure

```xml
<?xml version="1.0" encoding="utf-8"?>
<hkoptions>
  <!-- Configuration set metadata -->
  <hkobject class="hctConfigurationSetData">
    <hkparam name="filterManagerVersion">65537</hkparam>
    <hkparam name="activeConfiguration">0</hkparam>
  </hkobject>
  
  <!-- Configuration entry -->
  <hkobject class="hctConfigurationData">
    <hkparam name="configurationName">ConfigName</hkparam>
    <hkparam name="numFilters">1</hkparam>
  </hkobject>
  
  <!-- Filter declaration -->
  <hkobject name="FilterName" class="hctFilterData">
    <hkparam name="id">FILTER_ID</hkparam>
    <hkparam name="ver">VERSION</hkparam>
    <hkparam name="hasOptions">true</hkparam>
  </hkobject>
  
  <!-- Filter options -->
  <hkobject name="FilterName" class="OptionsClassName">
    <hkparam name="option1">value1</hkparam>
    <hkparam name="option2">value2</hkparam>
  </hkobject>
</hkoptions>
```

### 11.3 HKT → XML Configuration

```xml
<?xml version="1.0" encoding="utf-8"?>
<hkoptions>
    <hkobject class="hctConfigurationSetData">
        <hkparam name="filterManagerVersion">65537</hkparam>
        <hkparam name="activeConfiguration">0</hkparam>
    </hkobject>
    <hkobject class="hctConfigurationData">
        <hkparam name="configurationName">HKT2XML</hkparam>
        <hkparam name="numFilters">1</hkparam>
    </hkobject>
    <hkobject name="Write to Platform" class="hctFilterData">
        <hkparam name="id">2876798309</hkparam>
        <hkparam name="ver">66049</hkparam>
        <hkparam name="hasOptions">true</hkparam>
    </hkobject>
    <hkobject name="Write to Platform" class="hctPlatformWriterOptions">
        <hkparam name="filename"></hkparam>
        <hkparam name="tagfile">true</hkparam>
        <hkparam name="bytesInPointer">8</hkparam>
        <hkparam name="littleEndian">true</hkparam>
        <hkparam name="reusePaddingOptimized">false</hkparam>
        <hkparam name="emptyBaseClassOptimized">false</hkparam>
        <hkparam name="removeMetadata">false</hkparam>
        <hkparam name="userTag">0</hkparam>
        <hkparam name="saveEnvironmentData">true</hkparam>
        <hkparam name="xmlFormat">true</hkparam>          <!-- ★ XML output -->
    </hkobject>
</hkoptions>
```

### 11.4 XML → HKT Configuration

Identical to above except:
```xml
<hkparam name="xmlFormat">false</hkparam>                 <!-- ★ Binary output -->
```

And configuration name:
```xml
<hkparam name="configurationName">XML2HKT</hkparam>
```

### 11.5 Key Configuration Values

```
Field                   Value     Rationale
---------------------   --------  ------------------------------------------------
filterManagerVersion    65537     Version 1.0.1 (0x10001), matches installation
activeConfiguration     0         Use first (only) configuration
filter id               2876798309  "Write to Platform" filter identifier
filter ver              66049     Version 1.2.1 (0x10201)
tagfile                 true      Use tagfile format (not packfile)
bytesInPointer          8         64-bit pointer size
littleEndian            true      x86/x64 byte order
saveEnvironmentData     true      Preserve scene metadata
```

---

## 12. Implementation Details

### 12.1 Rust Backend (`src-tauri/src/havok_cli.rs`)

#### Core Conversion Function

```rust
fn run_filter_manager(
    filter_manager_exe: &str,
    hko_content: &str,           // HKO_WRITE_XML or HKO_WRITE_HKT constant
    input_path: &Path,
    output_path: &Path,
) -> Result<(), String>
```

**Flow**:
1. Create temp directory: `%TEMP%\havok_convert_{pid}`
2. Write `.hko` config to `settings.hko` in temp dir
3. Execute `hctStandAloneFilterManager.exe` with CLI args
4. Scan temp directory for `.hkx` output files
5. Copy first `.hkx` to target `output_path`
6. Remove temp directory

**CLI invocation**:
```
hctStandAloneFilterManager.exe \
    --settings=<tempdir>\settings.hko \
    --output=<tempdir> \
    --asset=<tempdir> \
    --interactive=0 \
    --standard=1 \
    --verbose=0 \
    <input_file>
```

**Working directory** is set to the filter manager's parent directory to ensure Havok DLLs are resolved.

#### Tauri Commands

```rust
#[tauri::command]
pub async fn convert_hkt_to_xml(input_path: String, output_path: String) -> Result<String, String>

#[tauri::command]
pub async fn convert_xml_to_hkt(input_path: String, output_path: String) -> Result<String, String>
```

Both use `tauri::async_runtime::spawn_blocking` to run the synchronous `run_filter_manager` on a blocking thread pool, preventing main thread starvation.

#### Embedded Configuration Constants

The `.hko` XML configs are embedded as `const &str` values:
- `HKO_WRITE_XML` — `xmlFormat=true`, config name "HKT2XML"
- `HKO_WRITE_HKT` — `xmlFormat=false`, config name "XML2HKT"

This eliminates the need for external resource files.

### 12.2 Frontend Service (`src/page/SceneEdit/utils/sceneSessionService.ts`)

```typescript
export function convertHktToXml(inputPath: string, outputPath: string): Promise<string> {
  return invoke<string>("convert_hkt_to_xml", { inputPath, outputPath });
}

export function convertXmlToHkt(inputPath: string, outputPath: string): Promise<string> {
  return invoke<string>("convert_xml_to_hkt", { inputPath, outputPath });
}
```

### 12.3 Command Registration (`src-tauri/src/lib.rs`)

```rust
havok_cli::detect_havok_installation,
havok_cli::convert_hkt_to_xml,
havok_cli::convert_xml_to_hkt
```

---

## 13. Verified Test Results

### 13.1 HKT → XML Conversion

```
Input:   border_hit.hkt (19,760 bytes, SDK version 20160200)
Output:  303,477 bytes
Format:  Valid XML tagfile v3
Root:    <hktagfile version="3">
Content: Full type definitions + object instances
         hkRootLevelContainer with namedVariants:
           [0] "Scene Data" → hkxScene
           [1] "Physics Scene Data" → hknpPhysicsSceneData
```

### 13.2 XML → HKT Round-Trip

```
Input:   XML from step 13.1 (303,477 bytes)
Output:  22,560 bytes (binary TAG0 format)
SDK ver: 20180100 (bumped from 20160200 by Havok 2018 writer)
Magic:   TAG0 ✓
Valid:   File opens correctly in Havok Content Tools ✓
```

### 13.3 Size Comparison

```
Format    Size        Notes
--------  ----------  -----------------------------------------
HKT       19,760 B   Original binary tagfile (SDK 20160200)
XML      303,477 B   ~15x expansion (type defs + XML overhead)
HKT RT    22,560 B   Round-tripped binary (SDK 20180100)
                      Slightly larger due to SDK version metadata
```

---

## 14. Future Work: Native Rust Parser

A detailed plan for a pure Rust HKT binary parser exists at `.claude/plans/havok-hkt-xml-converter.plan.md`. This would enable HKT↔XML conversion on machines **without** Havok Content Tools installed.

### 14.1 Planned Module Structure

```
src-tauri/src/havok_tagfile/
├── mod.rs           Module root, re-exports
├── chunk.rs         TAG0/SDKV/DATA/TYPE/INDX chunk parsing
├── varint.rs        VarInt (packed integer) encode/decode
├── types.rs         TSTR/TNA1/FSTR/TBDY type system
├── items.rs         ITEM table parsing
├── data.rs          DATA section object deserialization
├── reader.rs        HKT binary → HavokDocument
├── writer.rs        HavokDocument → HKT binary
├── xml_reader.rs    XML tagfile → HavokDocument
└── xml_writer.rs    HavokDocument → XML tagfile
```

### 14.2 Core Data Model

```rust
pub struct HavokDocument {
    pub sdk_version: String,
    pub types: Vec<HavokType>,
    pub objects: Vec<HavokObject>,
    pub root_object_index: usize,
}

pub enum HavokValue {
    Null,
    Bool(bool),
    Int(i64),
    Float(f32),
    String(String),
    Pointer(usize),
    Array(Vec<HavokValue>),
    Record(Vec<(String, HavokValue)>),
    Tuple(Vec<HavokValue>),
    RawBytes(Vec<u8>),
}
```

### 14.3 Known Risks

| Risk | Likelihood | Impact |
|------|-----------|--------|
| Unknown TBDY flag combinations | Medium | Parser error on exotic types |
| Special DATA encoding for types like `hkQsTransformf` | Medium | Incorrect deserialization |
| Padding/alignment differences in writer output | High | Non-bit-exact round-trip |
| XML format differences across Havok SDK versions | Low | Version-specific handling |

---

## 15. Reference Materials

### 15.1 Open-Source References

- **TagTools** (Python, Havok 2016 binary tagfile tools): https://github.com/blueskythlikesclouds/TagTools
- **Havok middleware format documentation**: https://lukascone.wordpress.com/2024/03/12/havok-middleware/
- **Havok SDK source headers (2009 era)**: https://github.com/nitaigao/engine-showcase/tree/master/etc/vendor/havok/Source/Common/Serialize/Tagfile/Binary

### 15.2 Local Artifacts

| Path | Description |
|------|-------------|
| `src-tauri/src/havok_cli.rs` | Rust implementation with embedded .hko configs |
| `.claude/plans/havok-hkt-xml-converter.plan.md` | Detailed 9-task native parser plan |
| `src/utils/havokXmlParser.ts` | Frontend XML collision mesh parser |
| `src/utils/havokXmlParser-fixed.ts` | Improved parser with vertex decompression |
| `src/utils/havokMeshGenerator.ts` | XML mesh data → Three.js geometry |
| `src/page/SceneEdit/components/havok/` | Havok visualization components |
| `33.xml`, `326.xml`, `39.xml` | Reference Havok XML tagfile v3 samples |

### 15.3 IDA Pro Analysis Addresses (hkCompatFormats.dll)

| Address | Symbol/Function | Purpose |
|---------|----------------|---------|
| `0x180600140` | `compatInit` | DLL initialization |
| `0x180600250` | `compatLoad_0` | File load + convert (hardcodes binary writer) |
| `0x1806003E0` | `compatFree` | Memory cleanup |
| `0x180600420` | `compatQuit` | DLL shutdown |
| `0x18078C4A0` | `sub_18078C4A0` | Streaming binary tagfile reader |
| `0x18078B190` | `sub_18078B190` | Streaming format header parser |
| `0x1805FB380` | `sub_1805FB380` | "Write to Platform" filter registration |

### 15.4 Test Sample

```
File:     E:\XB\解包\vs2\bak\001stage\201stage201\info\border_hit.hkt
Size:     19,760 bytes
SDK:      20160200 (Havok 2016.2)
Format:   TAG0 binary tagfile
Content:  Stage collision mesh (border_hit)
Sections: SDKV + DATA + TYPE (TSTR/TNA1/FSTR/TBDY/TPAD) + INDX (ITEM/PTCH)
```
