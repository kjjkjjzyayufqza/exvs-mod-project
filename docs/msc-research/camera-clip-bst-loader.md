# Camera clip BST loader (battle path)

**Date:** 2026-09-05  
**Status:** E2 OB IDA (`vsac27_Release.exe`) + disk tables; L3 playback untested  
**Kind:** native camera loader (not MSC `X.c`, not a Three.js preview)  
**Do not unpack FHM2D.** Named OB camera pack already exists.  
**IDA:** `ida-47280` / `E:\OBHK0.3_v27\vsac27_Release.exe.i64` (in-scope OB only).

Victory-camera *selection* stays in [wing-zero-rebellion-victory-camera.md](./wing-zero-rebellion-victory-camera.md). This note is the **payload / BST** question: what `sys_53(0x4, hash)` actually binds.

---

## 1. Two playback paths (do not mix)

| Path | Entry | Disk source | Runtime |
|---|---|---|---|
| **Menu / god** | `sub_140987F20(this, resourceHandle, …)` → `sub_140677410` → `sub_140677450` | loose `*.nuanmb` + `camera_motion.nusktb` (`camera1` / `cameraShape1`) | `VDK::GAM::CCameraMotion` |
| **Battle / winlose / waza** | `sys_53(0x4)` → `sub_140682BF0` case 4 → `sub_14063F270(controller, 3)` → `sub_140646AD0(player, clip_hash, strength, 0)` | four `camera/parameters/*.vgsht2` **only** | clip BST at `qword_1421155D0+0x268D28` |

OB pack: `E:\XB\mod\002chara\000common_000common_001\camera\`.  
POC hook: `\game\cameraDebug.cpp`.  
POC compile walk: `xDocs\command_system_research\camera_command_tracker_20260419.md` (`sub_1405B83C0` / `sub_1405DC540`).

`big.nuanmb` strings are `camera1`, `FarClip`, `FieldOfView`, `NearClip`, `Rotate`, `Translate`. That is the **menu** skeleton, not a winlose clip.

---

## 2. Disk scan (E1, OB files)

Script: `tmp/camera-bst/scan_bst_payload.py`. Report: `tmp/camera-bst/bst_payload_scan.txt`.

| Family | rows | unique clip hashes | trailing bytes after 220×N |
|---|---|---|---|
| `00system` | 106 | 35 | **0** |
| `01waza` | 2489 | 2259 | **0** |
| `02winlose` | 4046 | 1166 | **0** |
| `03cpubattle` | 124 | 27 | **0** |

Family clip-hash sets are still disjoint (`system∩winlose=0`, `waza∩winlose=0`).

Anchor hashes (`0x8CA6CC45`, `0xFD5FD16A`, `0x1351B046`, `0x8028252F`, `0x7EB6FE0E`) appear **only** inside the four tables. Zero hits in `camera_motion.nusktb`, `battle/big.nuanmb`, `menu/*.nuanmb`, or `stage_intro_camera_group.bin`.

`stage_intro_camera_group.bin` is 362 bytes, magic `89 8C 96 9C`. VS2 `menu_god_camera_group.bin` is 120 bytes, magic `89 92 9C 98`. Neither stores winlose clip hashes.

**Settled from this scan:** the 1166 winlose packs are not extra NUANMB blobs hiding beside the tables. POC `CameraSystem_全面分析报告.md` §1 drawing “word25 → nuanmb / clip BST” overstates the disk side: word25 is a **runtime BST key**. The on-disk animation for battle clips is the grouped 220-byte rows themselves.

---

## 3. Compile + insert (E2, this IDA session)

`sub_1405AA720` allocates the `0x268D80` singleton at `qword_1421155D0`.  
`sub_1405B97E0` is the resource-type thunk (`a1+8`, `*a3`, `*a4`) that calls `sub_1405B83C0`. Data xref `0x141339808`.

`sub_1405B83C0` unwraps the pack with `sub_1400C4110(*a4)` (`handle+32`) then `sub_1401142E0` (`GetEntry`: base + `56 * index`). Root `GetEntry(v5, 0..0xE)` is the common pack’s 15-child folder. Child 0 (`interactionid`) is parked on the hash-table holder at `global+2526432`. **Child 1 is the camera folder** (`folderCount 6` in `000common_000common_001_structure.json`).

From that camera folder `v7`:

| `GetEntry(v7, n)` | Name | Loader |
|---|---|---|
| 0 | `00system.vgsht2` | `5DC4C0` → clip BST |
| 1 | `01waza.vgsht2` | `5DC4C0` → clip BST |
| 2 | `02winlose.vgsht2` | `5DC4C0` → clip BST |
| 3 | `camera_motion` | holder at `global+3136` (menu `CCameraMotion` hashmap; `646090` if `0xC488848F != 0`) |
| 4 | nested `battle/big` folder | loop `5B1AB0`, **not** clip BST |
| 5 | `03cpubattle.vgsht2` | `5DC4C0` → clip BST |

FileIndex 30/31/32/35 are pack slots, not these child indices. `GetEntry(v7, 0/1/2/5)` is the family map.

`sub_1405DC540(a1, raw_table)` with `a1 = global+3232`:

- Linear pool of 0x134 rows starts at `a1+0`; count at `a1+0x268000`; cap **8192** total compiled rows.
- One 0x134 row per table id. NaN kind-5 becomes 0 via `_fdtest == 2`.
- After the loop, asm (`0x1405DD7C7`):

```text
lea  rcx, [r13+0x268008]          ; tree = a1+2523144
imul r8,  [r13+0x268000], 0x134   ; end = a1 + count*0x134
mov  rdx, first_compiled_row
call sub_1405DD890                ; rcx=tree, rdx=begin, r8=end
```

`(global+3232)+0x268008 = global+2526376 = +0x268D28`. That is **the same pointer** `sub_140646AD0` reads after `sub_1405AA780()`.

`sub_1405DD890` is MSVC `std::map<uint32, Vec<0x134*>>` insert:

- node layout matches lookup: `+25` null flag, `+32` key, `entryBase = node+40`
- key compared against `*(DWORD*)compiled_row` (`0x980ABFA6`)
- `entryBase[i] = compiled_row*`; `entryBase[20]` = count; **throws `bad_alloc` if count >= 20**
- destructor `sub_1405A87D0` tears down `a1+2526376` (same offset on the singleton)

So: one BST node per clip hash, one segment pointer per compiled shot, max **20** shots per hash. OB `02winlose` max pack length 13 sits under that cap. POC `ValidateAnimEntry`’s “count > 8192” is the **linear pool** limit, not the per-key cap.

`sub_140646AD0` stores `entryBase` at `player+5952`, then scans `*(row+8)` (compiled firstShot `0x4AF79689`) into `player+184`.

### 0x134 layout (from `sub_1405DC540`, not the earlier tracker excerpt)

| Off | Source command | Notes |
|---|---|---|
| +0 | `0x980ABFA6` | clip hash / BST key / `sys_53` arg |
| +4 | `0xE52F114D` | sort key |
| +8 | `0x4AF79689` | firstShot; `646AD0` reads this |
| +12 | `0x8ED5B1E3` | f32; NaN→0 |
| +16 | `0xCF73B129` | 7-way remap (`5DDA50` table) |
| +20 | `0xC27FA594` | f32; NaN→0 |
| +24 | `0x0C779808` | 7-way remap |
| +28 | `0x42ACFE7D` | **segment duration**; `647290` compares segment clock to this |
| +32 | `0xC488848F` | `646C20` `elem+32`; **OB all four families are 0** |
| +36 | `0x9C5FA5E6` | `647290`: `== 10` picks an alternate look-at path |
| +40 | `0x796CB7B3` | |
| +44 | `0xE4DE8A17` | `646C20` compares `== 1` / `== 2` |
| +48 | `0xDC16B398` | |
| +52 | `0x2413B463` | |
| +56 | `0xF8C4D496` | OR’d into `644D70`’s flag (`a3`) |
| +60 | `0x671E95AA` | int; inner radius for `644D70` |
| +64 | `0x577FE40F` | int; outer radius² test in `644D70` |
| +68 | `0xF7CB1B33` | `== 1` → distance / scale in `646C20` reconstruct |
| +72 | five `5DC150` | dest `+0x48 / +0x64 / +0x80 / +0x9C / +0xB8` (see §4.1) |
| +216 | `0xA50831E5` | `5DBF70`; inherit `0xE62932A7`; packed into `a1[28]` |
| +244 | `0xD20F0173` | offset; inherit `0x912E0231`; packed into `a1[28]` |
| +272 | `0x4B0650C9` | `5DBF70`; inherit `0x0827538B`; packed into `a1[28]` |
| +300 | `0x41436715` | |
| +304 | `0x99533970` | `647290`: nonzero gates a flip path |

`0x40B88DD7` (on-disk `+0x20` / word8) and `0xC52DEBE5` (word37): **zero** `find_bytes` hits in `vsac27_Release.exe`, and neither is an immediate in `5DC540`. Treat as unused by this image, not as `elem+32`.

The old “21 leftover commands” list was leftover vs a **partial** tracker dump / `dump_compile_map.py`, not vs this decompile. That script also **mislabels** `5DC150` a5..a9 (it treated the last stack hash as mode). Overlay firstShot and offset **are** compiled (`+8` and `+244`). Duration **is** compiled (`+28`).

---

## 4. Playback (E2 IDA, no hook)

`sub_140646AD0(player, clip_hash, strength, a4)` walks `global+0x268D28`, stores `entryBase` at `player+5952`, scans compiled `+8` (`0x4AF79689`) into `player+184`, writes `strength` at `player+576` (`a1[36].f32[0]`), and sets state `player+580 = 3` unless it was already `2`. `sys_53(0x4)` default strength is `-1.0f` when the third arg is omitted; `647290` only uses strength as a clip-clock cutoff when that float is `> 0`.

`sub_140647220` (reset) copies pose snapshots and calls `646C20(player, 0)` when `entryBase[20]` (count at `+160`) is nonzero.

### 4.1 `5DC150` block (28 bytes)

`5DC060` returns true iff the command is kind-5 and `_fdtest == 2` (NaN).

| Off | Field | Rule |
|---|---|---|
| +0 | DWORD | `1` if **v1 is not NaN** (`5DC060(a7) == 0`) |
| +4 | f32 v0 | `a6`; deg→rad if `a10` |
| +8 | f32 v1 | `a7`; if NaN copy v0; maybe deg→rad |
| +12 | f32 v2 | `a8`; maybe deg→rad |
| +16 | f32 v3 | `a9`; if NaN copy v2; maybe deg→rad |
| +20 | DWORD | easing remap of **a5** (same table as `5DDA50`: `0,0,1,2,6,7,8` else `0`). Feeds `30B900` |
| +24 | BYTE | `1` if **v0 is NaN** |

Call sites in `5DC540` (stack a5..a9, then `a10` radian). Call order is 1,2,3,4,5; dest `+0x80` (FOV) is the **fourth** call, third live channel:

| Dest | Call | `a10` | a5 mode | a6 v0 | a7 v1 | a8 v2 | a9 v3 | Live slot |
|---|---|---|---|---|---|---|---|---|
| +0x48 / row+72 | 1 | 1 | `0xFD0C46C8` | `0x215E1F85` | `0xEC55CE76` | `0x9DABE9FF` | `0x90CAE2FB` | `player+464` pitch; clamp `dword_141FB0638/063C` = **±1.48353 rad (~±85°)** |
| +0x64 / row+100 | 2 | 1 | `0xC06C6F78` | `0x1C3E3635` | `0xD135E7C6` | `0xA0CBC04F` | `0xADAACB4B` | `player+468` yaw |
| +0x80 / row+128 | 4 | 0 | `0xF0CF0D20` | **`0x749B8F0E`** | `0xA84CEFFB` | `0xE7EEEFBF` | `0xEB8FD535` | `player+472`; floor `1e-4` |
| +0x9C / row+156 | 3 | 1 | `0x87CC15A8` | `0x5B9E4CE5` | `0x96959D16` | `0xE76BBA9F` | `0xEA0AB19B` | `player+476` |
| +0xB8 / row+184 | 5 | 0 | `0xEA409385` | `0x00836396` | `0x01EE59B8` | `0x7C1C4F1B` | `0xAB3DFDD0` | `player+480` |

Editor overlay FOV `0x749B8F0E` is this block’s **v0** (copied by `646C20` from `row+132`), not v2. `tmp/camera-bst/compile_map_fd5fd16a.txt` swapped a5..a9 labels; do not reuse those “mode/v0/v2” names.

### 4.2 `646C20` segment switch

```text
entryBase = player+5952
row = entryBase[segmentIndex]
edx = *(row + 0x20)                     ; 0xC488848F
if edx != 0:
    motion = sub_140646090(this, edx)   ; camera_motion hashmap
    player+5960 = motion
    sub_1406783B0(motion, 0.0)
else:
    player+5960 = 0
player+536 = 0                          ; segment clock only; does not write dt at +540
pack row+216 / +272 / +244 into a1[28]  ; A50831E5, 4B0650C9, offset
; per-block v0 copy if segment==0 OR block+24==0 (v0 was authored):
row+76  → a1[29].f32[0]  (+464) pitch, clamped
row+104 → a1[29].f32[1]  (+468)
row+132 → a1[29].f32[2]  (+472) FOV v0
row+160 → a1[29].f32[3]  (+476)
row+188 → a1[30].f32[0]  (+480)
```

Later segments with NaN v0 (`block+24 == 1`) keep the previous live value.

If **any** of pitch/yaw/FOV `+24` is set, `646C20` rebuilds a basis via `644930` + `atan2`. If the FOV block’s v0 was NaN (`row+152`), that path **overwrites** `+472` with look-at **distance** (optionally scaled when `row+68 == 1`). Authored FOV (Rebellion first shot = 11) does not take that overwrite.

OB disk: `0xC488848F` is **0 on every row** of all four families. Shipped battle clips never start `CCameraMotion` here. Menu/god stays `sub_140987F20`.

`646C20` snapshots `a1[29/30]` into `a1[32/33].i32[0]` (`+512..+528`) for the mode-1 interpolators.

### 4.3 `647290` ticker (vtable; xrefs are data-only)

Skip if `player+580 == 2` (done).

Each tick:

1. `player+536 += dt` (segment clock) and `player+532 += dt` (clip clock). `dt` is `player+540` (`a1[33].f32[3]`). **Not written by `646C20` / `646AD0`.** Same addend is used for duration, so duration is in dt-units. OB table integers (60 / 25 / 430) look like frame counts **if** the outer tick stores `~1` per call; that store is still L2. Do not ship “seconds”.
2. If `player+5960` (CCameraMotion*) is set, `6783B0(motion, segment_clock)` — dead on shipped tables.
3. `row = entryBase[currentIndex]`; `647590(player, row)` updates the five channels.
4. Optional early-out `644D70`: if compiled `+64 > 0` (and inner `+60` missing or smaller), end the clip when world distance² exceeds `(int)(+64)²`. Flag byte includes `*(row+56) | controller`.
5. If `strength > 0` and clip clock `>= strength`, state = 2.
6. **Segment advance:** `dur = *(float*)(row+28)` (`0x42ACFE7D`). If `dur == 0` **or** `segment_clock < dur`, stay. Else if `index+1 >= entryBase[20]`, state = 2; else `646C20(player, index+1)` (zeros segment clock).
7. `*(row+304)` (`0x99533970`) gates a facing-flip path. Failures in `645240` / `643370` / `6434F0` also force state = 2.

POC calling word40 “duration” is still wrong.

Rebellion `0xFD5FD16A`: five `0x42ACFE7D` values 60, 25, 25, 60, 430. First-shot editor FOV 11 is authored `0x749B8F0E` v0.

### 4.4 `647590` per-tick channels (trust asm, not Hex-Rays)

Hex-Rays drops `646780`’s return and mis-assigns registers. Asm:

`646780(from, to, easing, clock, duration)` → `30B900` lerp. If `|from-to| < 1e-6`, returns `from`.

For each 28-byte block, `*(block+0)` (v1-authored flag):

- **0** (v1 NaN): `xmm0 = 646780(v2, v3, easing, segment_clock, duration)`; `live += xmm0 * dt`. When v2/v3 are NaN→0 this holds the `646C20` v0 (FOV 11 stays 11).
- **1** (v1 finite): pitch/yaw/third-radian use `6431B0` (angle wrap ±π) from the **segment snapshot** at `+512/+516/+524` toward v1. FOV and block4 use `646780(snapshot, v1, …)` and **store xmm0 directly** (no `* dt`).

`+20` is the easing id, not the 0/1 branch.

### 4.5 `644D70` / `30B900`

`30B900` is the shared easing kernel also used by `sys_53` 0x1/0x2/0x3. Case 0 is `t = clock/duration`.

`644D70` is an optional radius/exit test on compiled `+60/+64`, not a FOV consumer.

---

## 5. Load timing (reuse POC §5; do not re-litigate)

| Family | When the compiled rows are expected in the clip map |
|---|---|
| `00system` | process lifetime |
| `02winlose` | per match |
| `01waza` | per loaded unit |
| `03cpubattle` | CPU mode only |

A miss still null-derefs `entryBase[20]`. Stay inside a family that is loaded. Victory work stays in `02winlose` word25. Family ↔ child index is §3 (`GetEntry(v7, 0/1/2/5)`), not fileIndex.

POC default hook hash `0x7EB6FE0E` is an `00system` clip (3 shots), not a winlose pack.

---

## 6. What is still unproven

1. Who **writes** `player+540` (dt). Duration and both clocks share that addend; the unit is therefore one value, but “frame vs second” is L2 without that store. No hook in this pass.
2. Semantic names for pitch/yaw/third-radian/block4 beyond: pitch is the clamped ±85° slot; FOV overlay is dest `+128` v0; block4 v0 is a linear channel (Rebellion first shot = 30) whose gameplay name is not pinned.
3. Exact `644930` basis vs homemade `CENTER_RT` Y≈10 (why FOV 11 still frames a ground-height unit).
4. L3: in-match `entryBase[20]` for `0xFD5FD16A` should be **5**; `player+5960` should stay 0.
5. Whether a **modded** nonzero `0xC488848F` can attach a real `CCameraMotion` / nuanmb. Shipped OB rows never do.

---

## 7. Three.js / editor implication

Do **not** attach a FOV+offset-only proxy (already rejected).

Shipped OB battle clips are compiled 0x134 parameter playback. `646C20` does not start `CCameraMotion` when `0xC488848F == 0`, and every OB row is 0. A later preview would have to reimplement `646C20` copies + `647590` (v0 hold vs v1 lerp vs v2/v3*`dt`, duration at `+28`), not sample `big.nuanmb`. Channel eval is E2 from asm; dt units are still L2. Keep the table editor as the shipped surface until an in-game H/P/F on framing.

Do **not**: invent clip hashes; pass row ids to `sys_53`; treat menu nuanmb as winlose clips; flip common-pack `read_only`; unpack `0xCB665375` again.

```text
H  in-match BST node 0xFD5FD16A has entryBase[20]==5 and CCameraMotion slot 0
P  G-hook / CE dump matches the 02winlose pack length; no nu::Instance at elem+0
F  count != 5, or 1748h holds a CCameraMotion*, or apply reads camera_motion.nusktb
```
