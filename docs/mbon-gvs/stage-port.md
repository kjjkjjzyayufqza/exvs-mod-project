# Porting MBON stages to Over Boost

Research report and tool guide for moving PS4 **MBON** (Maxi Boost ON,
CUSA15006) stage data into **Over Boost** (OB) stage packs. MBON is an earlier
revision than OB, inside the scope of `ACCEPTABLE_USE.md`.

* Tool: `mbon_stage_port` (`src-tauri/src/bin/mbon_stage_port.rs`, library
  `src-tauri/src/mbon/stage_port/`).
* MBON readers: `exvs_mbon::stage`, `exvs_mbon::vcl` (new), `exvs_mbon::nud`,
  `exvs_mbon::ntp3` (fixed / extended).
* Tests: `cargo test -p exvs_mbon`, `cargo test --test mbon_stage_port_test`.
* Credits: FHM, NUD, NTP3, VBN layouts follow descatal's
  [BoostStudio](https://github.com/descatal/BoostStudio) as the rest of the
  MBON workspace does. The stage list cipher reuses this project's GVS
  findings. The stage package, manifest, VCL, placement, `STPP`, `STGP` and
  object layouts below are this project's own reverse engineering of the MBON
  eboot (`CUSA15006_eboot_ida.bin`), backed by data over all 42 stages.
* Process log, scripts and raw evidence stay local in `local-note/mbon-stage/`
  (excluded through `.git/info/exclude`).

## 1. Result

| MBON part | Over Boost result | State |
| --- | --- | --- |
| Stage models (`sky`, `far`, `mdl`, `near`, `bf`, `transp_*` NUD) | `base/<name>_base` and `sky/0/<name>_sky` SSBH models | converted |
| NTP3 textures used as color maps | `textures/<name>_<gidx>.nutexb`, DXT blocks copied losslessly | converted |
| `hit_vcl` ground / wall collision | `base/map_hit.hkt` (Havok, multi-body when needed) | converted |
| `wall_vcl` arena boundary | `info/border_hit.hkt` | converted |
| Object kinds + `obj` placements | `<name>_object_NNN/` models + `map_hit.hkt`, OBJECT rows | converted static (intact pose, unbreakable) |
| `STPP` spawn plan | `info/plan_param.spbin` | converted (marker word, see 5.8) |
| `STGP` lighting / fog | `info/graphic_param.csv` | template copy; field map documented, not applied |
| Cube maps (`005`/`006` NTP3) | `info/light` IBL | template copy |
| Object motions (VBN + OMO), breakable states | — | not converted |
| Stage effects (`eff` lines, `EIDX`, `OELA`) | — | not converted |
| `vssd` | — | not converted (41 of 42 stages carry a 48-byte stub) |

Every one of the 42 stage archives converts (section 8.3). The in-game test
of the ported packs is the user's step (section 9).

## 2. Where MBON keeps its stages

### 2.1 Stage list

Archive `archives/CE/CE74091E.bin` holds one member: a record table with the
GVS table header (`A9 B8 AB CE`, 43 rows, 0x34-byte records, ascending ids,
string pool). Its strings use the 14-phase byte cipher of
`crates/gvs/src/obf.rs`. Columns (GVS schema `stage_list`, confirmed on MBON):

| Offset | Field |
| --- | --- |
| 0x00 | stage id |
| 0x04 | **stage archive** hash (`archives/XX/<hash>.bin`) |
| 0x08 | label (`STAGE_4xx_01`, obfuscated text) |
| 0x10 / 0x14 | listed in stage select (default / alternate mode) |
| 0x18 | select icon index |
| 0x1C / 0x20 / 0x24 / 0x28 | icon archives (`stg_grd`, `stg_full`, `stg_vs_2`, base icon) |
| 0x2C | stage name (obfuscated text) |

| Label | Stage id | Archive | Name | MiB |
| --- | --- | --- | --- | --- |
| STAGE_000_01 | `0x67BB27EA` | `BE17DDE2` | ランダム | 23.3 |
| STAGE_401_01 | `0xF7F72A50` | `BE17DDE2` | サイド７ | 23.3 |
| STAGE_402_01 | `0xE54285BE` | `ACA2720C` | トーチカ基地 | 15.4 |
| STAGE_403_01 | `0x5DFEE2DB` | `141E1569` | アフリカタワー | 28.7 |
| STAGE_404_01 | `0xC029DA62` | `89C92DD0` | ロンデニオン | 44.2 |
| STAGE_405_01 | `0x7895BD07` | `31754AB5` | アフリカ砂漠 | 29.6 |
| STAGE_406_01 | `0x6A2012E9` | `23C0E55B` | ブリュッセル | 30.4 |
| STAGE_407_01 | `0xD29C758C` | `9B7C823E` | ギアナ高地 | 27.5 |
| STAGE_408_01 | `0x8AFF65DA` | `C31F9268` | ニュータイプ研究所 | 21.2 |
| STAGE_409_01 | `0x324302BF` | `7BA3F50D` | コロニーレーザー | 16.9 |
| STAGE_411_01 | `0xCA9703E0` | `8377F452` | マニューピチ | 28.0 |
| STAGE_412_01 | `0xD822AC0E` | `91C25BBC` | ムーン・ムーン | 28.8 |
| STAGE_413_01 | `0x609ECB6B` | `297E3CD9` | エンジェル・ハイロゥ | 34.6 |
| STAGE_414_01 | `0xFD49F3D2` | `B4A90460` | メサイア | 28.6 |
| STAGE_415_01 | `0x45F594B7` | `0C156305` | 衛星イオ | 27.3 |
| STAGE_416_01 | `0x57403B59` | `1EA0CCEB` | REBIRTH | 43.0 |
| STAGE_417_01 | `0xEFFC5C3C` | `A61CAB8E` | インダストリアル７ | 21.8 |
| STAGE_418_01 | `0xB79F4C6A` | `FE7FBBD8` | EXTREME UNIVERSE | 15.1 |
| STAGE_419_01 | `0x0F232B0F` | `46C3DCBD` | ヘリオポリス | 16.2 |
| STAGE_420_01 | `0x358B1E55` | `7C6BE9E7` | サンクキングダム | 18.8 |
| STAGE_421_01 | `0x8D377930` | `C4D78E82` | フロンティアⅠ | 30.5 |
| STAGE_422_01 | `0x9F82D6DE` | `D662216C` | サイド6 | 23.4 |
| STAGE_423_01 | `0x273EB1BB` | `6EDE4609` | ア・バオア・クー宙域 | 32.2 |
| STAGE_424_01 | `0xBAE98902` | `F3097EB0` | トリントン基地周辺 | 26.0 |
| STAGE_425_01 | `0x0255EE67` | `4BB519D5` | ニューホンコン | 18.3 |
| STAGE_426_01 | `0x10E04189` | `5900B63B` | ギガフロート | 23.6 |
| STAGE_427_01 | `0xA85C26EC` | `E1BCD15E` | トロヤステーション | 20.7 |
| STAGE_428_01 | `0xF03F36BA` | `B9DFC108` | ランタオ島 | 25.6 |
| STAGE_429_01 | `0x488351DF` | `0163A66D` | EXTREME EVOLUTION | 24.8 |
| STAGE_430_01 | `0x08EB37E5` | `410BC057` | 廃棄コロニー（地球周辺） | 16.7 |
| STAGE_431_01 | `0xB0575080` | `F9B7A732` | マスドライバー基地 | 30.2 |
| STAGE_432_01 | `0xA2E2FF6E` | `EB0208DC` | 廃棄コロニー（月軌道上） | 16.6 |
| STAGE_433_01 | `0x1A5E980B` | `53BE6FB9` | 廃棄コロニー（ジオン軍） | 19.1 |
| STAGE_434_01 | `0x8789A0B2` | `CE695700` | ミンスリー | 36.3 |
| STAGE_435_01 | `0x3F35C7D7` | `76D53065` | アーモリーワン | 23.9 |
| STAGE_436_01 | `0x2D806839` | `64609F8B` | アイランド・イーズ | 25.2 |
| STAGE_437_01 | `0x953C0F5C` | `DCDCF8EE` | 絶対防衛ライン | 22.8 |
| STAGE_438_01 | `0xCD5F1F0A` | `84BFE8B8` | EXTREME TRANSCEND | 22.3 |
| STAGE_439_01 | `0x75E3786F` | `3C038FDD` | EXTREME FATALITY | 25.1 |
| STAGE_440_01 | `0xBACBEBF5` | `F32B1C47` | キャピタル・テリトリィ | 22.1 |
| STAGE_441_01 | `0x02778C90` | `4B977B22` | ラ・グラミス | 23.1 |
| STAGE_442_01 | `0x10C2237E` | `5922D4CC` | EXTREME EXTERMINATION | 21.2 |
| STAGE_460_01 | `0xC00BB895` | `89EB4F27` | プラクティスステージ | 8.2 |

The random row points at the Side 7 archive. 42 distinct archives remain.

### 2.2 Stage archive

Each archive is the PS4 container (`99 92 CD 90`) with exactly one member, a
big-endian `FHM ` pack with 10 root entries. The indices are fixed by the
eboot loader `sub_6E80D0`:

| Entry | Content | Magic / kind |
| --- | --- | --- |
| 0 | model pack (alias of entry 1, size word 0) | `FHM ` |
| 1 | model pack: manifest, NUD models, VCL collision | `FHM ` |
| 2 | object definitions, one nested pack per object kind | `FHM ` |
| 3 | placement text (`obj` / `eff` lines) | text |
| 4 | model textures | `NTP3` |
| 5 | environment cube maps | `NTP3` (caps2 0xFE00) |
| 6 | graphic parameters | `STGP` |
| 7 | spawn plan | `STPP` |
| 8 | stage effects | `FHM ` (`EIDX` + `OELA` effects) |
| 9 | `vssd` | `vssd` (little-endian) |

Magic survey over all extracted stages (files): NDP3 9,076; VCL 1,473;
`nud,` part text 1,202; `cns,` object text 953; VBN 581; OMO 581; NTP3 161;
OELA 104; STGP / STPP / vssd / model manifest 42 each; EIDX 40; `obj` text 38;
`eff` text 4.

## 3. Over Boost stage layout (target)

Editing layout used by the Scene Editor (`docs/scene-stage-disk-layout.md`):

```
<name>/0/0/
  base/<name>_base/{.numdlb, __maya__.numshb, __maya__.nusktb, __maya__.numatb, __nust__.numatb, .jnttbl}
  base/map_hit.hkt
  info/{border_hit.hkt, placement.csv, graphic_param.csv, plan_param.spbin, fog/, light/, post_effect/}
  <name>_object_NNN/0/{same six files}, <name>_object_NNN/map_hit.hkt (optional)
  sky/0/{same six files}
  textures/*.nutexb            (shared, structure folder unk3 = 64)
<name>_structure.json          (Name, HashName, Magic 20, UnkCount 5)
```

Facts the port relies on:

* Item role tags in `SubFileStructure.unk2`: `10` nusktb, `21` numatb (maya and
  nust), `30` numshb, `40` numdlb, `50` jnttbl; texture containers are folders
  with `unk3 = 32` placed before each numatb. The game binds textures by the
  nutexb **footer name** found in the model's own containers
  (`ModelDataSet::SetupNewFormat`, see the Paris migration notes).
* OBJECT numbering: model folders other than `base`, `info`, `textures`,
  `sky`, sorted by name, numbered from 0; the SKY row takes the count
  (`load_stage_skeleton_impl`; verified on `stage252`: 4 objects, SKY 4, and
  `201stage201`: SKY 63).
* `placement.csv` keys (OB parser `sub_1405CB930`): `VDK_TYPE` OBJECT 2,
  SKY 1, PROP 3, EFFECT 4; rotations are degrees (converted to radians);
  `VDK_SCALE_*` are parsed for every type but shipped OBJECT rows never carry
  them; `VDK_HITPOINT` SOFT 1, MEDIUM 500, HARD 1000, UNBREAKABLE 0, or a
  number. Shipped rows use CRLF.
* Info file order (`border_hit.hkt`, `placement.csv`, `graphic_param.csv`,
  `plan_param.spbin`, then the light cube maps in their shipped order) is
  inherited by seeding the new structure JSON with the template's info rows.

## 4. Conversion map

| MBON | Over Boost |
| --- | --- |
| `sky_nud` models | `sky/0/<name>_sky` |
| `gnd`, `far`, `mdl`, `near`, `bf`, `transp_far`, `transp_near` models | `base/<name>_base`, one mesh object per NUD polygon |
| `hit_vcl` | `base/map_hit.hkt` |
| `wall_vcl` | `info/border_hit.hkt` |
| object kind | `<name>_object_NNN`, model and collision in object space |
| `obj` line | OBJECT row: position, rotation (degrees), shadow flag, UNBREAKABLE; the `obj` scale is dropped (MBON ignores it, 5.6) |
| `eff` line | not ported (MBON effect ids do not exist in OB) |
| `STPP` | `plan_param.spbin` |
| NTP3 DXT1 / DXT5 / ARGB8 | nutexb BC1 sRGB / BC3 sRGB / RGBA8 sRGB, blocks copied; opaque materials get an `_o` copy with alpha 255 (6) |
| NTP3 DXT3 | decoded and re-encoded as BC3 sRGB (no OB stage uses BC2) |
| `STGP`, cube maps, fog | `graphic_param.csv`, `light/`, `fog/`, `post_effect/` copied from a template OB stage |

## 5. MBON format reference

### 5.1 Model manifest (model pack entry 0)

One `key,start,count` line per role; `start` / `count` select model pack
entries. Parsed by `sub_70E210` into a 20-word struct (starts, then counts):

| Word | Key | Engine alias |
| --- | --- | --- |
| 0 / 10 | `gnd_nud` | `nud` |
| 1 / 11 | `sky_nud` | |
| 2 / 12 | `far_nud` | |
| 3 / 13 | `mdl_nud` | |
| 4 / 14 | `near_nud` | |
| 5 / 15 | `bf_nud` | |
| 6 / 16 | `hit_vcl` | `vcl` |
| 7 / 17 | `wall_vcl` | |
| 8 / 18 | `transp_far_nud` | |
| 9 / 19 | `transp_near_nud` | |

`sub_6E80D0` registers every `wall_vcl`, then every `hit_vcl` entry through
`sub_6EB260`. Practice stage example: `sky_nud,5,9`, `far_nud,2,3`,
`bf_nud,1,1`, `transp_far_nud,14,2`, `hit_vcl,16,1`, `wall_vcl,17,1`.

### 5.2 NUD (NDP3)

Layout per BoostStudio (`crates/mbon/src/nud.rs`). Stage specifics measured
over every stage model and object part (28,841 polygons):

* No skinned polygon at all (bone type 0 everywhere); animated objects bind
  whole polysets to a VBN bone (`single_bind`).
* Vertex layouts: geometry 6 (half-float normals) 10,826 polygons, geometry 0
  (no normals) 3,814, geometry 7 1,746; color type 2 (u8 RGBA, 0x7F = 1.0,
  range 0..2.008) or none; one UV set, half floats.
* Materials: first texture is the color map; a second texture on the same UV
  is a bump / detail map (practice stage: 0x1754940A color, 0x17549408 bump).
  Blend factors follow the Smash 4 NUD convention (destination 0 Zero, 1
  OneMinusSrcAlpha, 2 One); alpha test 2 with function 4 / 6 and a reference;
  cull 0x405 back faces, 0 double sided.

**Fix made here:** polygon word +0x04 is the vertex-clump (section 1)
offset and word +0x08 the vertex-add-clump (section 2) offset. The reader took
unskinned vertices from word +0x08 and skinned color / UV data from section 0.
Every polygon after the first of a stage NUD decoded as garbage (positions
like 3.4e38, NaN UVs). Skinned unit models confirm the rule: on `2A261DDA`
section 1 gives plausible UVs, section 0 NaN. Regression test
`unskinned_polygons_read_their_own_vertex_clump_offset`.

### 5.3 NTP3

Model textures (161 NTP3 files in stage packs): DXT5 1,933, DXT1 1,019,
DXT3 461, ARGB8 7, format 17 7 (4 bytes per pixel ramps, 128x1 / 8x8 / 1x1,
first byte always 0xFF; not referenced as color maps). Small block-compressed
mips are padded (a 16x16 DXT1 chain with 5 mips is 208 bytes, a DDS needs
184); the converter cuts every level with the NTP3 mip table.

**Cube maps** (entry 5, 84 in stages, 88 in the whole game): caps2 at texture
header +0x1C is `0xFE00`, the texture header grows by a 16-byte table
`u32 face size, u32 face size, 0, 0` between the mip table and `eXt`; every
observed cube map has one mip and six equal faces. `exvs_mbon::ntp3` now
parses and rebuilds them byte for byte (`cube_maps_keep_their_face_table`).

### 5.4 VCL collision

Big-endian; layout taken from the eboot in-place byte swapper `sub_6EB260`
and validated on all 1,473 VCL files (`exvs_mbon::vcl`):

```
0x00 "VCL " | u32 0x00010001
0x08 u32 group count | u32 node count | u32 cell count
0x14 f32 grid min x | f32 grid min z | f32 cell size
0x20 u32 cells x | u32 cells z | 8 zero bytes
0x30 i32 cell[cell count] (node index or -1), padded to 4 cells
     node[node count]: f32 center x, y, z, radius | i32 link[4]   (broad phase)
     group[group count]:
       u32 triangle count | u32 vertex count | u32 surface kind | u32 0
       triangle: u32 index[3] (group-local) | u8 attribute[4] | f32 normal[3] | f32 1.0
       vertex:   f32 x, y, z | f32 1.0
```

Notes: some files carry trailing bytes after the last group that the game
never reads; attribute bytes 0..2 look like an authoring color, byte 3 a
sub-id; surface kinds 0..7 occur (triangles over all `hit_vcl`: 0 67,044,
1 76,902, 2 438, 3 46,560, 4 8,630, 5 27,623, 6 55,797, 7 8,187); OB HKT
shape tags have no mapping yet, so every triangle becomes plain ground. The
practice stage `hit_vcl` is the ±900 floor, its `wall_vcl` the ±500 walls.

### 5.5 Objects (root entry 2)

One nested pack per object kind. Child 0 is `cns` key text:

```
cns,0,-1          dur,UNBREAKABLE | <number>
prt_iniVel{X,Y,Z,YRot}, prt_brkEff   (break particles)
sub_grv, sub_iniVelY, sub_iniVelXZ, sub_iniAngVel, sub_szAff, sub_refVel, sub_refAng
chain_break,0     anim_type,0|1
parts,<start>,<count>   vbn,<start>,<count>   omo,<start>,<count>   bind,..
```

Ranges index the object pack. A part is a nested pack: text
(`nud,s,c`, `vcl,s,c`, `omo,s,c`, `sub,<nud index>,v<intact><broken>`), NUDs and a
VCL. `v10` NUDs are drawn while intact, `v01` after breaking, `v11` always.
Animated kinds (`anim_type,1`) add a VBN skeleton and OMO motions; their
polysets bind to VBN bones (`single_bind`), so the converter places them with
the VBN bind matrix (first matrix block, row-vector world transform).

### 5.6 Placement text (root entry 3)

```
obj,<object kind>,x,y,z,rx,ry,rz,sx,sy,sz,<name>,sdw,<0|1>,pid,<id>,ppm,<int> x24,pps,<text> x8
eff,<EFFECT_ID>,x,y,z,rx,ry,rz,sx,sy,sz,<name>,dly,<delay>,int,<interval>,pid,<id>,ppm..,pps..
```

Rotations are degrees (90.0, 196.2 ... occur); scales up to 200 occur. The
eboot parser is `sub_714640` (`sdw`, `pid`, `pps`, `cns` immediates). It
keeps each line in a 0x2E8-byte record: +0x04 kind (1 `obj`, 2 `eff`), +0x08
object index (or the CRC-32 of the effect id), +0x0C position, +0x18 rotation
(times π/180), +0x24 scale.

How the record is used:

* `eff`: a full matrix with the scale folded into the rows (0x7150C0).
* `obj`: the instance matrix written at 0x716BA7..0x716C64 holds rotation and
  position only; the scale words are never read. The rotation is
  R = Rz·Ry·Rx (column vectors, X applied first), the translation is the
  position. So `obj` scales (20 in Heliopolis, 10 in the EXTREME stages,
  2.5/1/2.5 in the Colony Laser stage ...) have no effect in MBON, and the port
  drops them (`ignoredPlacementScales` counts them per stage).
* Object geometry and object VCL share one object space that is not always
  centred: Heliopolis object 5 (and its roof piece, object 7) sits around
  (119, 26, −230), so the drawn building lands 260 units from its placement
  position, in MBON and in the port alike.
* OB composes `VDK_ROTATION_*` in an order that is not traced yet; the Scene
  Editor uses three.js XYZ (Rx·Ry·Rz). Y-only rotations (Heliopolis and most
  stages) are the same in both orders. Multi-axis `obj` rotations exist in
  stages 404, 405, 414, 423 and 427 and stay unverified.

### 5.7 STGP (root entry 6)

`"STGP"`, u32 hash, then 81 big-endian floats (`sub_6E80D0` swaps 0x144
bytes plus two words). Field roles inferred from the spread over 42 stages
(no consumer traced yet):

| Offset | Range | Reading |
| --- | --- | --- |
| 0x14..0x1C | 0.29..0.67 | ambient color RGB |
| 0x20..0x28 | 0.56..1.30 | directional light color RGB |
| 0x2C..0x34 | unit vector, y −0.92..−0.40 | directional light direction (points down) |
| 0x38, 0x3C | ~1.0, 1.2 | intensities |
| 0x5C..0x64, 0x6C..0x74 | 0..1.3 | fog colors |
| 0x7C / 0x80 | 0..8,000 / 0..70,000 | fog start / end |
| 0x9C..0xBC | | character ambient, light color, light direction |
| 0xC0..0xD4 | ±1.0..1.8 | rim / specular terms |
| 0xD8..0xE0 | 0.10..0.50 | shadow color |
| 0x110..0x144 | ±2,000 / 3,000 | shadow volume bounds |

OB expresses lighting as `directional_lighting_rot_x/y/z` plus IBL; the
Euler convention of those keys is not proven, so the port keeps the template
`graphic_param.csv` and leaves this map for a lighting pass.

### 5.8 STPP spawn plan (root entry 7) and OB `plan_param.spbin`

`STPP` (big-endian, swapped by `sub_6E80D0`) and the OB file hold the same
four tables:

| Table | MBON `STPP` | OB `plan_param.spbin` |
| --- | --- | --- |
| header | `"STPP"`, u32 hash, 0, 0 | `A9 B8 AC AF`, u32 pairs, u32 markers, u32 respawn, 4 x u64 section offsets |
| limit | trailing `u32 count` + words (one f32: 1,000 or 3,000) | section 0: f32 limit, f32 0 (1,000 in every shipped stage) |
| spawn pairs | `u32 N`, N x (x, y, z, 1, x, y, z, 1) | section 1: same 32-byte records |
| markers | `u32 K`, K x (x, y, z, u32 n) | section 2: K x (x, y, z, f32 angle) |
| respawn points | `u32 M`, M x (x, y, z) | section 3: M x (x, y, z, 0) |

Shipped OB stages and MBON stages both use 4 spawn records (2 for the
practice stages), 2 markers and 16..21 respawn points around ±250, at heights
200..440 — the same design. The marker's fourth word is a small integer in
MBON (1..7) and a float in OB (0.0 in most stages, 0.14 or π in others); its
meaning is unresolved, so the port writes 0.0.

### 5.9 Effects and vssd

* Entry 8: `EIDX` (version 2, effect package names such as `stg_419stage419`,
  `common`) plus little-endian `OELA` effect emitter files; consumed by
  `sub_6A9F20`. OB stage effects are EFFECT placement rows with OB effect ids,
  so MBON effects need a separate effect port.
* Entry 9: `vssd`, little-endian, version 2. 41 stages hold a 48-byte stub;
  only the practice stage carries 209 KB of data.

## 6. Design decisions

* **Materials** are code-defined recipes copied from shipped OB entries
  (`stage_port/material.rs`): opaque → `vstgStandard_VertexColor` with
  `BaseColorMap` + `UseBaseColorMap` + `DiffuseSampler` (the recipe of
  `docs/exvs-stage-numatb-simple-color.md`, verified in game); sky →
  `vsngSkydome`; blended sky → `vsngSkyTransparent`; blended, additive and
  alpha-tested field geometry → `vsngTransparent_BeforeEffect` (the stage
  shaders expose no alpha-test switch; shipped OB foliage such as
  `203stage203` `m_tree07_a` is alpha blended too). Every material gets the
  `__maya__` mirror (empty shader, `DiffuseMap`, sampler, blend, rasterizer
  with the NUD cull mode). Texture references are `../../textures/<stem>`; the
  stem is the nutexb footer name.
* **Texture alpha of opaque field materials**: many opaque MBON materials (no blend,
  no alpha test) sample textures whose alpha is a mask, not coverage
  (Heliopolis flags `0x114x` / `0x115x`).
  MBON never reads it as coverage, but the Scene Editor discards alpha 0
  texels and an OB shader may read it, so opaque materials reference an `_o`
  copy with alpha 255 (DXT5: alpha blocks rewritten, color blocks copied;
  ARGB8: alpha byte set; DXT1 punch-through stays as is). Textures shared by
  opaque and blended materials exist in both forms.
* **Sky alpha is HDR intensity, not coverage.** The shipped OB v27
  `vsngSkydomePS` and `vsngSkydomeFogPS` multiply sampled RGB by
  `(1 + 2 * alpha)^3` and replace output alpha with 1 before applying scene
  brightness. Forcing sky alpha to 255 therefore introduces a 27x multiplier.
  Opaque source sky shader nibble 0 uses a separate `_skyhdr` texture with its
  original alpha. RGB-only BC1 skies and other opaque sky shader families use
  gain-one alpha 0, under `_skyhdr` / `_sky0`; decoded RGB from every authored
  mip is preserved in RGBA8 sRGB. DXT3 HDR skies also retain every authored mip
  in RGBA8 rather than regenerating mips. Field `_o` variants remain separate.
* **Sky vertex opacity.** Shipped `vsngSkyTransparentVS/PS` have no vertex color
  input; writing `HalfFloat2_0.w` alone cannot fade that shader. Sky meshes with
  varying source vertex opacity, including the invisible compatibility mesh,
  use `vsngTransparent_BeforeEffect`, whose shaders sample color times vertex
  RGBA. Native stage 203 uses that recipe for sky fog at biases 610..640 with
  depth test disabled. The port retains that layout.
* **Vertex color**: `HalfFloat2_0` is not a plain color in OB stage shaders
  (shipped `vstgStandard_VertexColor` meshes hold a constant
  (0.5, 0.5, 0, 1), Blend2VC meshes keep a blend weight in G, only
  `FeConstant` meshes hold real colors). The port writes white (the Scene
  Editor importer value, verified in game); `--source-vertex-colors` writes
  the NUD colors as an experiment.

The 2026-10-11 visual pass replaces all 105 delivered baseline packs while
preserving all field and collision bytes. Three isolated ground-color probes
are supplied for three representative stages: explicit zero metallic map,
linear UNORM color sampling, and disabled background 3D grading. These are
experimental list entries, not a proven replacement for native sRGB sampling
or source STGP/IBL conversion. Native OB sky and field color textures use sRGB;
uniformly applying gamma changes without gameplay evidence is not justified.
Local evidence and rollback data are in
`local-note/stage-batch-20261011/visual-audit/`.
* **UVs** pass through unchanged: NTP3 and nutexb both store the top row
  first and both games sample raw UVs, so the mapping is preserved (checked by
  rendering the converted practice floor: 12 x 12 panel grid, see
  `local-note`).
* **Tangents** are computed from UV derivatives and orthogonalized against
  the normal; polygons without normals get area-weighted face normals.
* **Collision** retains every original VCL triangle without simplification,
  welding or quad conversion. The VCL path uses 21/21/22-bit shared vertices,
  f32 domain coordinates, conservative bounds containing decoded vertices,
  and the declared domain as the mesh BVH root parent. Multi-body splitting
  keeps shape keys in range; Havok Content Tools writes the tagfile. Face orientation
  matters: Havok mesh collision is one-sided, and `wall_vcl` faces point into
  the arena like the shipped OB `border_hit` files.
* **Objects**: one OB object model per object kind, in object space; every
  `obj` line becomes an OBJECT row (position, rotation). Only intact-state
  NUDs (`v1x`) are drawn;
  every placement is UNBREAKABLE; objects whose parts have no triangles keep no
  `map_hit.hkt` (shipped object folders without collision exist).
* **Names**: folder and prefix `mbon<label number>` by default, all lower case
  (the Scene Editor names the pack from `HashName`); the pack hash defaults to
  CRC-32 of `<name>__fileName`, the resource registry seed convention.

## 7. Tool usage

From `src-tauri/` (debug builds only):

```powershell
cargo build --bin mbon_stage_port
$tool = ".\target\debug\mbon_stage_port.exe"
# summary of one MBON stage
& $tool inspect E:\shadps4\PKG\CUSA15006\archives\4B\4B977B22.bin
# convert into a mod 001stage folder, info/ from an OB stage pack root
& $tool port E:\shadps4\PKG\CUSA15006\archives\4B\4B977B22.bin `
  --output-root E:\XB\mod\001stage --name mbon441 --template E:\XB\mod\001stage\0x16F73C97
# Scene Editor repack path in a temp workspace (validation self-check)
& $tool rehearse E:\XB\mod\001stage\mbon441 --output ..\tmp\mbon-stage-port\check.fhm2d
# stage select row (clone an existing row) and resource registry entry
& $tool stage-list-add E:\XB\mod\012list\stage_list\stage_list.bin `
  --display-name "MBON ラ・グラミス" --slug mbon441 --file-name 0x........ --template-entry 2111950098
& $tool registry-add E:\XB\mod\resource_registry.json --slug mbon441 --display-name "MBON ラ・グラミス" --entry-id <id>
```

`port` refuses an existing output folder or structure JSON. It needs Havok
Content Tools (`C:\Program Files\Havok\HavokContentTools`). Pack the stage
with the Scene Editor "Repack → .fhm2d" (the packer the game accepts); the
`rehearse` output is only a structural check.

## 8. Verification

### 8.1 Unit and integration tests

* `cargo test -p exvs_mbon`: VCL layout, manifest, placement lines (`obj` and
  `eff`), STPP tables, NTP3 cube maps, the NUD vertex-clump fix. The one
  failing test, `package::named_extraction_tracks_changes_until_the_next_repack`,
  fails before this work too (Windows path separators in a `String`).
* `cargo test --test mbon_stage_port_test` (15 tests): material recipes, NUD
  blend mapping, lossless DXT copy, ARGB reorder, opaque `_o` variants (DXT5
  alpha blocks, ARGB alpha byte), padded mips, cube-map rejection,
  `plan_param.spbin` byte layout against the shipped practice file size
  (456 bytes), placement column order, stage-list row insertion, row-matrix
  translation, model write / read back (Modl 1.7, attribute set, orthonormal
  tangents).
* `meshFromSsbh.test.ts`: the Scene Editor treats `vsngTransparent_*` /
  `vsngSkyTransparent` as blended and `vstgStandard_Blend2VC_*` as opaque.

### 8.2 Practice stage (`89EB4F27`)

`port` output: 8 base meshes, 9 sky meshes, 8 textures, map_hit 288
triangles, border_hit 22 triangles, 1 object kind (4 placements, 12-triangle
collision), 2 spawn pairs, 9 respawn points. `rehearse`: validation valid, 3
models redistributed, 18 texture copies, 36 packed files; the pack extracts
back with `fhm2d_extract` (36 files). Software renders of the converted base,
sky and object models show the expected battlefield grid, sky dome and blocks.

### 8.3 All stages

`port` over all 42 archives into a scratch workspace, one process per stage
(`local-note/mbon-stage/batch2/`, after the 9.2 fixes): 42 of 42 exit 0,
549 s in total. No stage reported a warning, a skipped object or a skipped
effect placement. Totals: 15,785 base meshes, 601 sky meshes, 3,121 textures
(including `_o` opaque copies), 288,744 `map_hit` triangles, 946 object kinds
(1,353 placements, 866 kinds with collision); 593 `obj` lines carry a scale
other than 1 that MBON ignores (520 of them in the EXTREME stages, whose
94-wide hex panels sit on a 150-unit grid: unscaled they leave gaps, at the
written scale 10 they would overlap into one sheet). No stage places one
object kind at two different scales, so dropping the scale changed no object
count. Earlier batches used a simplifier whose counts could move between runs.
The current VCL path preserves source triangle topology; the full MB/MBON
audit in `local-note/stage-batch-20261011/DEEP_AUDIT.md` supersedes those
older collision counts and validates all section, mesh and SIMD trees.

Two earlier batch runs failed and drove fixes now in the tool:

* `ddsfile` sizes small block-compressed mips without 4x4 block rounding
  (64x16 BC1 with 5 mips: the data holds the block-rounded 696 bytes,
  `ddsfile` expects 688), and NTP3 pads the smallest levels further (16x16
  DXT1 with 5 mips: 208 bytes stored, 184 needed). `texture.rs` now cuts each
  level to its block-rounded length with the NTP3 mip table and builds the
  nutexb from a surface, not through a DDS.
* Some object parts carry a VCL with zero triangles: no object HKT is written
  for them (`collision` is `null` in the report).

| Label | Archive | Name | Base meshes | Sky meshes | Textures | map_hit tris (bodies) | border_hit tris | Object kinds / placements / with HKT | Spawn pairs / respawns | Seconds |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| STAGE_401_01 | `BE17DDE2` | サイド７ | 502 | 39 | 113 | 11000 (2) | 94 | 14 / 56 / 4 | 4 / 16 | 4 |
| STAGE_402_01 | `ACA2720C` | トーチカ基地 | 297 | 9 | 39 | 10007 (2) | 94 | 4 / 29 / 4 | 4 / 16 | 4 |
| STAGE_403_01 | `141E1569` | アフリカタワー | 657 | 18 | 107 | 7940 (2) | 94 | 15 / 20 / 12 | 4 / 16 | 8 |
| STAGE_404_01 | `89C92DD0` | ロンデニオン | 214 | 16 | 40 | 14288 (3) | 94 | 27 / 30 / 27 | 4 / 16 | 16 |
| STAGE_405_01 | `31754AB5` | アフリカ砂漠 | 167 | 24 | 50 | 8798 (2) | 94 | 25 / 32 / 13 | 4 / 16 | 8 |
| STAGE_406_01 | `23C0E55B` | ブリュッセル | 645 | 23 | 108 | 11469 (2) | 110 | 21 / 21 / 19 | 4 / 16 | 12 |
| STAGE_407_01 | `9B7C823E` | ギアナ高地 | 219 | 9 | 32 | 11446 (2) | 110 | 10 / 10 / 10 | 4 / 16 | 7 |
| STAGE_408_01 | `C31F9268` | ニュータイプ研究所 | 588 | 10 | 91 | 10673 (2) | 109 | 11 / 11 / 10 | 4 / 16 | 7 |
| STAGE_409_01 | `7BA3F50D` | コロニーレーザー | 558 | 10 | 64 | 417 (1) | 109 | 9 / 21 / 9 | 4 / 16 | 6 |
| STAGE_411_01 | `8377F452` | マニューピチ | 224 | 13 | 44 | 11876 (2) | 110 | 18 / 59 / 16 | 4 / 16 | 11 |
| STAGE_412_01 | `91C25BBC` | ムーン・ムーン | 219 | 13 | 68 | 9902 (2) | 66 | 22 / 33 / 15 | 4 / 16 | 10 |
| STAGE_413_01 | `297E3CD9` | エンジェル・ハイロゥ | 318 | 22 | 42 | 2977 (1) | 94 | 11 / 18 / 10 | 4 / 16 | 7 |
| STAGE_414_01 | `B4A90460` | メサイア | 248 | 9 | 44 | 9040 (2) | 94 | 9 / 10 / 6 | 4 / 16 | 5 |
| STAGE_415_01 | `0C156305` | 衛星イオ | 141 | 20 | 45 | 9391 (2) | 110 | 16 / 17 / 16 | 4 / 16 | 11 |
| STAGE_416_01 | `1EA0CCEB` | REBIRTH | 162 | 16 | 50 | 10702 (2) | 110 | 14 / 14 / 14 | 4 / 16 | 10 |
| STAGE_417_01 | `A61CAB8E` | インダストリアル７ | 345 | 4 | 83 | 3492 (1) | 110 | 3 / 15 / 3 | 4 / 16 | 4 |
| STAGE_418_01 | `FE7FBBD8` | EXTREME UNIVERSE | 74 | 9 | 11 | 1759 (1) | 94 | 104 / 104 / 104 | 1 / 16 | 54 |
| STAGE_419_01 | `46C3DCBD` | ヘリオポリス | 726 | 25 | 139 | 13508 (3) | 66 | 11 / 14 / 11 | 4 / 16 | 9 |
| STAGE_420_01 | `7C6BE9E7` | サンクキングダム | 675 | 10 | 156 | 3370 (1) | 38 | 29 / 29 / 10 | 4 / 16 | 7 |
| STAGE_421_01 | `C4D78E82` | フロンティアⅠ | 593 | 4 | 155 | 7322 (2) | 22 | 15 / 21 / 15 | 4 / 16 | 10 |
| STAGE_422_01 | `D662216C` | サイド6 | 847 | 16 | 134 | 2037 (1) | 22 | 8 / 8 / 8 | 4 / 16 | 6 |
| STAGE_423_01 | `6EDE4609` | ア・バオア・クー宙域 | 259 | 10 | 57 | 14616 (3) | 110 | 10 / 18 / 6 | 4 / 16 | 6 |
| STAGE_424_01 | `F3097EB0` | トリントン基地周辺 | 562 | 9 | 121 | 985 (1) | 66 | 14 / 23 / 14 | 4 / 16 | 9 |
| STAGE_425_01 | `4BB519D5` | ニューホンコン | 1153 | 9 | 168 | 2577 (1) | 66 | 9 / 12 / 9 | 4 / 16 | 6 |
| STAGE_426_01 | `5900B63B` | ギガフロート | 275 | 21 | 135 | 4851 (1) | 38 | 14 / 28 / 10 | 4 / 16 | 7 |
| STAGE_427_01 | `E1BCD15E` | トロヤステーション | 183 | 31 | 64 | 5211 (1) | 94 | 5 / 16 / 5 | 4 / 16 | 4 |
| STAGE_428_01 | `B9DFC108` | ランタオ島 | 680 | 9 | 139 | 2977 (1) | 22 | 3 / 9 / 3 | 4 / 16 | 4 |
| STAGE_429_01 | `0163A66D` | EXTREME EVOLUTION | 166 | 9 | 21 | 1759 (1) | 94 | 104 / 104 / 104 | 1 / 16 | 53 |
| STAGE_430_01 | `410BC057` | 廃棄コロニー（地球周辺） | 148 | 18 | 41 | 6430 (2) | 22 | 2 / 6 / 2 | 4 / 16 | 3 |
| STAGE_431_01 | `F9B7A732` | マスドライバー基地 | 501 | 12 | 101 | 18597 (4) | 38 | 7 / 36 / 7 | 4 / 16 | 10 |
| STAGE_432_01 | `EB0208DC` | 廃棄コロニー（月軌道上） | 147 | 9 | 37 | 6725 (2) | 22 | 3 / 7 / 3 | 4 / 16 | 3 |
| STAGE_433_01 | `53BE6FB9` | 廃棄コロニー（ジオン軍） | 157 | 9 | 43 | 6725 (2) | 22 | 4 / 7 / 4 | 4 / 16 | 6 |
| STAGE_434_01 | `CE695700` | ミンスリー | 307 | 10 | 81 | 4245 (1) | 92 | 4 / 6 / 2 | 4 / 16 | 3 |
| STAGE_435_01 | `76D53065` | アーモリーワン | 747 | 26 | 120 | 12068 (3) | 94 | 13 / 30 / 9 | 4 / 16 | 12 |
| STAGE_436_01 | `64609F8B` | アイランド・イーズ | 639 | 22 | 126 | 10471 (2) | 94 | 11 / 35 / 10 | 4 / 16 | 11 |
| STAGE_437_01 | `DCDCF8EE` | 絶対防衛ライン | 400 | 16 | 79 | 5982 (1) | 94 | 9 / 10 / 9 | 4 / 16 | 7 |
| STAGE_438_01 | `84BFE8B8` | EXTREME TRANSCEND | 214 | 9 | 26 | 341 (1) | 94 | 104 / 104 / 104 | 1 / 16 | 57 |
| STAGE_439_01 | `3C038FDD` | EXTREME FATALITY | 143 | 9 | 12 | 6548 (2) | 94 | 104 / 104 / 104 | 1 / 16 | 58 |
| STAGE_440_01 | `F32B1C47` | キャピタル・テリトリィ | 329 | 10 | 54 | 1856 (1) | 94 | 15 / 101 / 11 | 4 / 16 | 8 |
| STAGE_441_01 | `4B977B22` | ラ・グラミス | 267 | 16 | 57 | 3738 (1) | 92 | 10 / 17 / 9 | 4 / 16 | 7 |
| STAGE_442_01 | `5922D4CC` | EXTREME EXTERMINATION | 81 | 9 | 15 | 340 (1) | 94 | 104 / 104 / 104 | 1 / 16 | 57 |
| STAGE_460_01 | `89EB4F27` | プラクティスステージ | 8 | 9 | 9 | 288 (1) | 22 | 1 / 4 / 1 | 2 / 9 | 2 |

The five EXTREME stages are the outliers: 104 single-placement object kinds
each (one Havok run per kind, hence 53–58 s) and a `STPP` with one spawn pair.
Their in-game behavior is the least certain of the set; port a regular stage
first.

## 9. In-game test plan

### 9.1 Delivered to the mod

Backups of every edited file are in `local-note/mbon-stage/backup/20261010/`;
the first delivery of both folders (placement scale baked, before the opaque
texture variants) is in `local-note/mbon-stage/backup/20261010-before-refix/`.

| Item | Practice stage | Heliopolis |
| --- | --- | --- |
| MBON archive | `89EB4F27` (STAGE_460_01) | `46C3DCBD` (STAGE_419_01) |
| Folder | `001stage/mbon_practice/` | `001stage/mbon_heliopolis/` |
| Structure JSON | `001stage/mbon_practice_structure.json` | `001stage/mbon_heliopolis_structure.json` |
| Pack name (`hashName`) | `0x230207D2.fhm2d` | `0xA5071A4F.fhm2d` |
| `stage_list` row | entry `2111950099`, "MBON プラクティスステージ" | entry `2111950100`, "MBON ヘリオポリス" |
| `rehearse` | valid, 3 models, 37 files | valid, 13 models, 237 files |

* Both rows clone the `パリ` row (`2111950098`) and continue the owner's
  custom id run; `fileName` is the pack hash. The other 121 rows parse
  unchanged; the string pool is rebuilt in row order, so later strings shift.
* `resource_registry.json` gains two `stage` / `fileName` entries
  (`mbon_practice__fileName`, `mbon_heliopolis__fileName`); nothing else
  changes. Neither pack hash exists in the game cache or the mod.
* The `rehearse` packs extract back with `fhm2d_extract`, and every source
  file's content is present in the pack (content-hash set comparison).
* Pack both folders with the Scene Editor "Repack → .fhm2d" before the test.

### 9.2 Scene Editor review of the first delivery

The owner's Scene Editor review of the first Heliopolis delivery found
scattered objects, white surfaces and missing translucency. Causes:

| Symptom | Cause | Fix |
| --- | --- | --- |
| Objects scattered, huge | the `obj` scale (20) was baked into object models and collision; MBON never applies it (5.6) | scale dropped; one folder per object kind |
| White planes | translucent haze / light cards (e.g. `0x180cf53a`: grey 0.71, alpha mean 0.05) drawn opaque: the Scene Editor matched `"trans"` case-sensitively, so `vsngTransparent_BeforeEffect` and `vsngSkyTransparent` never counted as blended | case-insensitive `trans` in `meshFromSsbh.ts` (`Blend2VC` stays opaque) |
| No translucency | same check | same fix |
| Holes in opaque walls (editor) | alpha masks in opaque textures meet the editor's alpha-0 discard | `_o` opaque texture copies (6) |

The converted textures themselves match the NTP3 source pixel for pixel
(139 of 139 compared after decoding both).

### 9.2a First in-game test (owner)

| Symptom | Cause | Fix |
| --- | --- | --- |
| Holes in the arena box: units leave through some walls | `collision_mesh::simplify::retriangulate_region` re-triangulated each coplanar region along a boundary loop walked from unordered edges, so about half the regions came out flipped (practice `border_hit`: 7 of 8 walls facing out after encoding although every `wall_vcl` triangle faces in). Havok mesh collision is one-sided. Shared Scene Editor HKT path, not MBON specific | new triangles keep the region normal; boundary edges sorted, so HKT output is identical between runs. Checked by decoding the HKTs: practice 8 walls in, Heliopolis 36 walls in, ceilings face down; OB `0x16F73C97` / `201stage201` borders also face in |
| Blue grid dome over the practice stage | most likely the OB border effect (`graphic_param.csv` `border_able`, `border_grid_num_*`) drawn from the flipped `border_hit` | same collision fix; re-test |
| No shadows on the map | shipped base / object materials carry `ReceiveShadow = true` (FeStandard 157 of 202, every `vstgStandard_Blend2VC_*`); the port's `vstgStandard_VertexColor` recipe had none | `ReceiveShadow = true` on opaque field and object materials |
| Outer models translucent (practice outer floor rings `transp_far1`, solid teal grid in the MBON shadPS4 screenshot) | blend factors follow Smash Forge `NudEnums` (src 1 / 5 = SrcAlpha, dst 1 = OneMinusSrcAlpha), but the flags nibble `0x00F0_0000` decides what the texture alpha is: nibbles 1..3 coverage (cutouts, decals), 0 and 4..A masks (over 42 stages none of their textures is mostly opaque in alpha; blended nibble-4/5 textures have median alpha 0.02..0.05). The port used every alpha as coverage and dropped the vertex alpha | masked materials use the `_o` (alpha 255) texture; blended and alpha-tested meshes write the NUD vertex alpha into `HalfFloat2_0.w` (shipped `vsngTransparent_BeforeEffect` meshes carry a varying `w`, mean 0.73), so the outer floor fades towards the horizon as in MBON |
| Sky too bright and blue (in game only) | `vsngSkydomeFog` adds the template's stage fog; shipped sky domes (`stage252`, `201stage201`, `210stage210`, `0x16F73C97`) use `vsngSkydome`. Texture formats match the shipped ones (sRGB BC3 / BC7) | sky domes use `vsngSkydome` |
| Some Heliopolis objects misplaced | not identified yet (known: objects 0 / 1 animated, frozen in bind pose near x −1800; object 5 off-centre by design) | waiting for the object folders |

### 9.2b Second in-game test (owner, 2026-10-10)

Collision, shadows (objects cast on the floor) and the outer floor are fixed.
Open:

| # | Stage | Symptom | Cause | Fix |
| --- | --- | --- | --- | --- |
| 1 | practice | the whole sky is one flat light cyan (about RGB 112 / 216 / 255) | the sky meshes were written as field geometry (sort bias 0, depth test on). Every shipped sky mesh has `disable_depth_test = true` and a layer sort bias: `SKY_OPQ_FIRST..FIFTH` = 510..550, `SKY_TRNSP_FIRST..FIFTH` = 610..650 (203, 201, 210, 252; 310 / 420 in the two older stages). The 20,000-unit practice dome did not draw as sky, so the background shows. Ruled out first: fog (the template `rampfog` is grey blue 0.6 / 0.69 / 0.74), texture format (sRGB BC3 / BC7 like shipped skies), winding (all faces inward like 252), far plane (203 draws a sky shape at 20,685) | sky meshes: depth test off, sort bias 510 (opaque) / 610 (blended) |
| 2 | Heliopolis | sky too bright | the same sky-layer flags missing (the ±7,500 dome draws as lit field geometry) | same |

The mesh names (`SKY_OPQ_*`) are an authoring convention only: neither the
strings nor their CRC-32 occur in `vsac27_Release.exe`; the flags in the
numshb carry the behaviour.

### 9.3 Checks

H: the ported pack loads as a stage, renders the MBON geometry with its
textures, collides on the floor and walls, and spawns units inside the arena.

| Check | Expected | Falsifier |
| --- | --- | --- |
| Stage select | the new row shows (cloned icons) and starts a battle | missing row → `stage_list.bin` not repacked / not loaded |
| Load | no crash on load | crash → pack (use the Scene Editor repack), structure or material |
| Floor | units stand on the MBON floor | falling through → `map_hit.hkt` |
| Walls | units stop at the arena edge | leaving the arena → `border_hit.hkt` |
| Spawn | both teams spawn in the arena, facing sensibly | spawning in geometry / outside → `plan_param.spbin` mapping |
| Look | textures on the right faces, sky visible | stretched / mirrored textures → UV convention; white blowout → material |
| Objects | blocks stand at the MBON positions with collision | missing / offset → object numbering or transform |

## 10. Known gaps and next steps

1. Lighting: apply `STGP` (light direction / colors, fog) once the
   `directional_lighting_rot_*` convention is proven in game.
2. Animated objects: convert VBN + OMO to `nusktb` + `nuanmb` and use
   `VDK_ANIM_*` rows; today they are frozen in the bind pose.
3. Breakables: map `dur` to `VDK_HITPOINT` numbers and the `v01` debris NUDs
   to OB after/break models (`*_before` / `*_after` / `*_break` folders).
4. Effects: map `eff` lines and `EIDX` / `OELA` to OB EFFECT rows and effect
   packs.
5. VCL surface kinds → HKT shape tags (water, no-landing surfaces).
6. STPP marker word (MBON integer 1..7) → OB float.
6a. OB `VDK_ROTATION_*` composition order: trace the consumer of the
   placement record (+0x20) behind `sub_1405CB050` before porting stages with
   multi-axis `obj` rotations (404, 405, 414, 423, 427); MBON is Rz·Ry·Rx.
7. Cube maps: convert entry 5 to OB IBL (`light/*_ibl_*.nutexb`, cube nutexb
   format 0xD7).
8. Second NUD texture (bump / detail) → OB normal or detail slots.

## 11. Renaming delivered stage assets

`mbon_stage_port clone-visual --profile identity` copies an existing editing
stage under `--name`, updating paths and model, mesh, material and texture
names. `--hash` must match the source structure's existing `HashName`.
It rejects an existing destination and verifies every parsed model, mesh and
material field after the name substitution, all texture data and mip metadata,
and the exact bytes of every other resource. `audit-rename <source> <stage-dir>`
repeats this comparison against a retained source copy.

`stage-list-rename <stage-list> <names-json> --output <output>` accepts an array
of `{ "entryId": ..., "name": ... }` objects. It changes display names only,
rejects duplicate or missing ids, then rebuilds and reads back every list row.
Entry ids, resource hashes, selection order and weights remain stable.

An asset folder name and a registry seed are distinct identities after a
rename. Retain the original registry seed and hash; changing the seed while
keeping its previous CRC-32 would make the registry inconsistent. Current
delivery manifests record `registry_seed` and `provenance_slug`. Historical
conversion, collision and sky reports retain their source names. Repack the
renamed stage through `rehearse`, compare every packed payload to the editing
files, and archive the old editing tree outside the loader's active groups.

The 2026-10-11 local batch records 40 renames within the complete 42-stage MBON
set, preserving Heliopolis, Practice, all 63 MB stages and nine visual test
variants. Current paths, hashes and test ids are in the delivery manifest and
`TEST_CATALOG.csv`; `MBON_NAME_MAPPING.csv` links the old and new names.
