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
| +216 | `0xA50831E5` | look-at offset **X (right)** start; end `0xE62932A7` (+220) |
| +244 | `0xD20F0173` | look-at offset **Y (up)** start; end `0x912E0231` (+248) |
| +272 | `0x4B0650C9` | look-at offset **Z (front)** start; end `0x0827538B` (+276) |

The three "inherit" words are the **end** values: `5DBF70` turns a NaN start into 0 and a NaN end into the start, and `647590` eases start -> end with the remapped `0x37FC285F` (+296). `646C20` packs `unpacklo(unpacklo(+216, +272), unpacklo(+244, 0))` = **(+216, +244, +272)**, so X / Y / Z follow the shot offsets, not the argument order. A clip that wrote its forward offset into `0xD20F0173` put the look-at 300 under the unit in game (2026-10-02).
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

`30B900` is the shared easing kernel also used by `sys_53` 0x1/0x2/0x3. With `u = clock/duration` (IDA asm and constants, 2026-10-02):

| Kernel | Authored | Weight | Function |
|---|---|---|---|
| 0 | 0, 1 | `u` | inline |
| 1 | 2 | `1 - cos(u pi/2)`: slow start, fastest at the end | `30BDB0` |
| 2 | 3 | `sin(u pi/2)`: fastest at the start, slow end | inline |
| 3 | - | `1 - u` | inline |
| 4 | - | `cos(u pi/2)` | `30BD60` |
| 5 | - | `1 - sin(u pi/2)` | `30BD10` |
| 6 | 4 | `cosEase(Bezier(0, 0, 1, 1))`: cosine of smoothstep | `30BC60` |
| 7 | 5 | `cosEase(Bezier(0, 0, 0.2, 1))`: holds, then rushes late | `30BBA0` |
| 8 | 6 | `cosEase(Bezier(0, 0.8, 1, 1))`: 90% at half the span, 99% at 70% | `30BAF0` |

`cosEase(b) = 0.5 + 0.5 sin(pi b - pi/2)`; the Bezier control values are `dword_141B4E94C` (0.8) and `dword_141B4E8A4` (0.2). Kernels 3-5 run backwards and are not reachable from the remap. Kernel 8 is why an authored-6 shot sits still for its last third in game: a 460-frame shot moved for about 300 frames, then held for about 2.5 s before the next shot (user 2026-10-02).

`644D70` is an optional radius/exit test on compiled `+60/+64`, not a FOV consumer.

---

## 5. Load timing

All four families compile **once per process** into one clip map (IDA 2026-10-02): the common pack handler `sub_1405B83C0` hands camera children 0 / 1 / 2 / 5 to `sub_1405DC4C0`, which refuses a table once its count at singleton+0x268CD8 reaches 4. Only the `qword_1421155D0` singleton's constructor and destructor reset that count, and the pack `0xCB665375` loads once at boot. The family is organisational only: a clip works the same in any of the four, and every edit needs a game restart.

A miss still null-derefs `entryBase[20]`. Family ↔ child index is §3 (`GetEntry(v7, 0/1/2/5)`), not fileIndex.

### 5.1 Pose (IDA 2026-10-02, confirmed in game)

- Look-at = origin (`0x9C5FA5E6`, `sub_140643640`: 1 unit / target midpoint, 2 unit, 3 target) + the offset turned by the frame (`0x796CB7B3`, `sub_1406441B0`: 1 / 2 toward the target, 3 / 4 the unit's facing yaw).
- Eye = look-at + (sin yaw cos pitch, −sin pitch, cos yaw cos pitch) × `player+472` × scale (`sub_140645240`). Yaw 0 puts the eye in front of the look-at, a negative pitch above it, a positive yaw on the unit's **right**.
- `player+472` (the `0x749B8F0E` block, the old editor "FOV") is the eye **distance**. The field of view is the fifth block (`0x00836396`, `player+480`). The fourth block (`0x5B9E4CE5`) is a roll.
- Scale is 1, or `sub_140643D60`'s framing distance when `0xF7CB1B33 == 1`: (4/3 × 7 × characterparam `0xFEADD5BE`) / tan(FOV / 2) for the unit alone.
- A NaN pitch / yaw / distance start is measured from the eye (`player+16`; on the first shot the hand-over eye `player+256`) against the new shot's starting look-at, so the camera does not jump at the cut.
- Clip kind (`0x4AF79689`, first nonzero, `sub_140646AD0`): kinds 1 / 2 set `player+600 = 0x18`, which turns on the stage ray checks `6434F0` / `643370` (a hit ends the clip), and leave `player+608` set, which runs the stage resolver. Kind 3 (every winlose clip) does neither.
- Durations are game frames.

POC default hook hash `0x7EB6FE0E` is an `00system` clip (3 shots), not a winlose pack.

---

## 6. What is still unproven

1. Who **writes** `player+540` (dt). Duration and both clocks share that addend; the unit is therefore one value, but “frame vs second” is L2 without that store. No hook in this pass.
2. Resolved in §5.1: dest `+128` (the "FOV" overlay) is the eye distance, the third-radian block is a roll, block4 is the field of view.
3. Resolved in §5.1: the look-at is origin + offset (Y up is `0xD20F0173`); "FOV 11" was a distance of 11.
4. L3: in-match `entryBase[20]` for `0xFD5FD16A` should be **5**; `player+5960` should stay 0.
5. Whether a **modded** nonzero `0xC488848F` can attach a real `CCameraMotion` / nuanmb. Shipped OB rows never do.

---

## 7. Three.js / editor implication

The table editor's viewport follows §5.1 (`evalCameraClip.ts`):

- Game units and axes: the unit stands at the origin facing +Z, its target 150 ahead. Every supported frame (1-4) is then yaw 0 / pitch 0. The canvas flips X into three.js, because the game's +X is the unit's right.
- Unsupported origins (other than 1-3), frames (other than 1-4) and `0xDC16B398 != 0` show an error banner instead of a guessed pose.
- First-shot NaN starts begin from the constructor hand-over pose (eye (50, 20, 50), FOV 45) with a notice; in game that is the battle camera.
- Roll is evaluated, not applied. The characterparam position query offset of a real unit is not applied.
- Editor **view zoom** (`cameraTablePreviewViewZoom`) narrows the rendered field of view only; it never changes authored data.
- The legacy key names `fov*` / `ch3*` / `ch4*` / `offset` in `CAM_CMD` stay because they are exported JSON field names; their meaning is distance / roll / field of view / offset Y start.

Shipped OB battle clips are compiled 0x134 parameter playback. `646C20` does not start `CCameraMotion` when `0xC488848F == 0`, and every OB row is 0. Channel eval (`646C20` copies + `647590`) is E2 from asm; dt units are still L2. Keep the table editor as the shipped surface until an in-game H/P/F on framing.

Do **not**: invent clip hashes; pass row ids to `sys_53`; treat menu nuanmb as winlose clips; flip common-pack `read_only`; unpack `0xCB665375` again.

```text
H  in-match BST node 0xFD5FD16A has entryBase[20]==5 and CCameraMotion slot 0
P  G-hook / CE dump matches the 02winlose pack length; no nu::Instance at elem+0
F  count != 5, or 1748h holds a CCameraMotion*, or apply reads camera_motion.nusktb
```
