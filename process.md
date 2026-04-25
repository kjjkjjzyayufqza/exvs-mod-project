# EXVS2 Command Param Editor - Process Log

## 2026-04-25: Project Initialization

### Context
EXVS2 Over Boost uses a unified "command table" serialization format across all game resources.
This format (magic `0xCDABB8A9`) is used by:
- Character params (041cpm/character_param)
- Arms params (041cpm/arms_param)
- Bullet params (041cpm/bullet_param)
- Speed params (041cpm/speed_param)
- Grap params (041cpm/grap_param)
- Interaction params (041cpm/interaction)
- Effect project (006effect/effect_project)
- Vernier table (006effect/vernier_table)
- Projectile depiction (006effect/projectile_depiction)
- And many more (camera, list, system, etc.)

### Unified File Header (0x20 bytes)
```
offset  type   field
0x00    u32    magic = 0xCDABB8A9
0x04    u32    unk_04 = 0
0x08    u32    file_size
0x0C    u32    unk_0C = 0
0x10    u32    entry_count
0x14    u32    commands_count
0x18    u32    entry_size
0x1C    u32    unk_1C = 0
```

### Unified Body Layout
```
0x20:
  command_hashes[commands_count]     ; 4 bytes each (u32)
  command_descs[commands_count]      ; 12 bytes each
  entry_ids[entry_count]             ; 4 bytes each (u32)
  entries[entry_count]               ; entry_size bytes each
  trailing string/blob area (for kind=7 fields)
```

### Command Descriptor (12 bytes)
```
u32 entry_offset   ; byte offset into entry where this command's value sits
u32 flags          ; usually 0
u32 kind           ; data type tag
```

### Kind Values
- `1` = generic u32 (raw hash, bitfield, resource id, etc.)
- `2` = integer / enum / id / index
- `5` = float (f32)
- `7` = string offset (points to trailing string area)

### Known Param Layouts (from vs2/x64 scan)
| Family | cmd_count | entry_size | kind distribution |
|--------|-----------|------------|-------------------|
| arms_param | 48 | 200 | {1:13, 2:23, 5:10, 7:2} |
| bullet_param | 80 | 320 | {1:24, 2:7, 5:49} |
| character_param | 197 | 796 | {1:4, 2:61, 5:130, 7:2} |
| speed_param | 69 | 284 | {2:67, 7:2} |
| grap_param | 16 | 64 | {2:16} |
| interaction | 27 | 108 | mixed 1/2/5 |
| effect_project | 240 | 960 | {1:240} or {1:72, 5:168} |
| vernier_table | 36 | 144 | {1:31, 5:5} |
| projectile_depiction | 15 | 60 | {1:11, 2:1, 5:3} |

### Steps Taken
1. Explored TAURI_PROJECT structure - identified existing format parsers (fhm2d.rs with binrw)
2. Explored  xDocs - read command_system_research documents
3. Identified the unified command table format used across all param types
4. Created todo.md, process.md, command_mapping.md
5. Starting Phase 1: Binary file analysis

### Data Source Directories
- OB param files: `E:\XB\解包\com\file\0x08248A8D\`
- OB effect files: `E:\XB\解包\com\file\0xa258a522\`
- VS2 reference: `E:\XB\解包\vs2\x64\041cpm\`, `E:\XB\解包\vs2\bak\`

## 2026-04-25: IDA Pro Analysis Progress

### Key Findings from IDA

#### Runtime Architecture
1. Global singleton at `qword_1421155D0` (accessed via `sub_1405AA780`)
2. Param files distributed to singleton offsets by `sub_1405B83C0`:
   - Takes 15 sub-entries from fhm2d container
   - Checks magic 0xCDABB8A9 before storing
   - Stores pointers at different singleton offsets (184, 176, 168, 160, 152, 144, ...)

3. Key functions:
   - `sub_1400C4110`: Skip resource header (a1 + 32)
   - `sub_1401142E0`: Get container entry by index (56-byte entries)
   - `sub_140987B50`: Hash-based command lookup (binary search)
   - `sub_1405AA780`: Return global singleton

#### RTTI / Class Names Found
| RTTI String | Full Class Name | Purpose |
|-------------|----------------|---------|
| CArmsParamAccessor@GAM@VDK | GAM::VDK::CArmsParamAccessor | Arms/weapon param accessor |
| BulletParam@GAM@VDK | GAM::VDK::BulletParam | Bullet/projectile params |
| ProjectileDepictionTableDataHolder@GAM@VDK | GAM::VDK::ProjectileDepictionTableDataHolder | Projectile visual data |
| VernierTableAccessor@GAM@VDK | GAM::VDK::VernierTableAccessor | Thruster/vernier accessor |
| EffectProjectController@GAM@VDK | GAM::VDK::EffectProjectController | Effect project controller |
| EffectProjectAccessor@GAM@VDK | GAM::VDK::EffectProjectAccessor | Effect project accessor |
| Grap@GAM@VDK | GAM::VDK::Grap | Grapple/grab system |
| Interaction@GAM@VDK | GAM::VDK::Interaction | Interaction system |
| Character@GAM@VDK | GAM::VDK::Character | Character system |
| CharacterData@Exvs2ResourceInstance | Exvs2ResourceInstance::CharacterData | Character resource |
| AcSeqPcbTrainingCommandTable@SEQ | SEQ::AcSeqPcbTrainingCommandTable | Training command table |

#### RegisterCommand Strings (from commandlist data)
These are embedded in the commandlist.bin data section as Japanese description strings:
- `RegisterCommandAction_LaunchScrew` → 射出シーケンス (Launch sequence)
- `RegisterCommandAction_Micchaku` → Close combat action
- `RegisterCommandUtility_GrapOnMotionFrame` → モーションに合わせた攻撃切り替え (Switch attack by motion)
- `RegisterCommandUtility_ShotContinuousOnAimingBody` → Continuous shot on aiming body
- `RegisterCommandUtility_ShotMachinegunOnAimingBody` → Machinegun shot on aiming body
- `RegisterCommandUtility_ShotSimpleOnAimingBody` → Simple shot on aiming body

#### Cross-Version Hash Consistency
All param types share identical command hashes between OB and VS2:
- arms_param: 48 hashes = 100% match
- bullet_param: 80 hashes expected match
- character_param: 197 hashes expected match
- etc.

OB versions have some additional commands (e.g., speedparam OB=74 vs VS2=69, interactionid OB=31 vs VS2=27)

#### Command Hash Access Pattern
Command hashes are NOT hardcoded as immediates in the code. They exist only in data files.
Runtime access is through generic field-offset-based reads:
```
entry_base + command_descriptor.entry_offset → field value
```
The kind value determines interpretation: 1=u32, 2=int, 5=float, 7=string_offset

#### ChrSysParam Format (magic 0xB4ACACAF)
Completely different from standard command table format:
- Magic: 0xB4ACACAF (offset 0)
- Version: 0x00010000 (offset 4)
- Entry count at offset 0x10
- Each entry: 20 bytes (hash + 4x u32 values)
- Runtime validation: sub_14066C890 (magic) + sub_14066C880 (version)
- Loaded alongside character data in sub_140635B30

#### Runtime Class Hierarchy (VDK::GAM namespace)
Key velocity/physics classes found in character initialization:
- VDK::GAM::CVelocityWorld
- VDK::GAM::CVelocityFriction
- VDK::GAM::CVelocityGround
- VDK::GAM::CShell (projectile/bullet system)

#### Character Data Initialization (sub_140635B30)
This function initializes a character's game state from the fhm2d resource pack:
- a2+128: standard command table (0xCDABB8A9) → character balance data
- a2+136: standard command table → additional param
- a2+160: standard command table → yet another param
- a2+168: chrsysparam (0xB4ACACAF) → character system param
- a2+176/184/192: additional resource pointers

#### VS2 commandlist.bin Strings
Successfully decrypted using obfString.ts transform (index-based rotation + XOR).
Contains character/weapon command entries like "CHR_001GUNDAM_001GUNDAM_00101".
These are action command labels, NOT field names.

#### Analysis Status - COMPLETE
- Full value distribution for 692 fields across 8 families complete (param_field_analysis.md, 897 lines)
- 500+ CCmdAction_ RTTI classes confirmed in binary
- LookupCommandDescriptorByHash at 0x1401A8BD0 with 68 call sites identified
- Field-index-to-hash dispatch functions (sub_1405F9010, sub_1405F9180) documented
- 4 cross-family shared hashes identified
- Hash function not CRC32 (custom compile-time hash)

## 2026-04-25: Phase 4 - Code Implementation

### Rust Backend Files Created/Modified
- `src-tauri/src/format/command_table.rs` - Generic parser for magic=0xCDABB8A9 format
  - `parse_command_table()` - raw parse
  - `parse_command_table_with_fields()` - parse with kind-typed field values
  - `build_command_table()` - rebuild binary from modified data
  - `update_entry_field()` - in-place field update
- `src-tauri/src/format/chrsysparam.rs` - Parser for magic=0xB4ACACAF format
- `src-tauri/src/format/mod.rs` - Module registration
- `src-tauri/src/commands.rs` - 6 new Tauri commands registered
- `src-tauri/src/lib.rs` - Command handler registration

### TypeScript Frontend Files Created
- `src/models/commandTable.ts` - Model with 15+ utility functions
- `src/page/TestEditor/components/command-param/CommandParamView.tsx` - Full UI editor (530+ lines)

### Integration
- `src/page/TestEditor/components/MainView.tsx` - Added "Command Param" tab with isActive/unsaved tracking
