# Wing Zero Rebellion：胜利镜头（camera pack / 02winlose 表层）

**Date:** 2026-09-05  
**Status:** E2 table-pinned on OB `02winlose.vgsht2`; L3 in-game framing untested  
**Kind:** camera parameter catalog (not MSC mining, not 01waza)  
**Do not unpack FHM2D.** Named OB camera pack already exists.

**OB camera pack (this is the “camera.bin” layer):**

```text
E:\XB\mod\002chara\000common_000common_001\camera\
  parameters\00system.vgsht2
  parameters\01waza.vgsht2
  parameters\02winlose.vgsht2     <- result cameras
  parameters\03cpubattle.vgsht2
  camera_motion.nusktb            <- bones: camera_group1 / camera1
  battle\big.nuanmb               <- menu/test, not winlose clips
  menu\stgintro*.nuanmb
  stage_intro\stage_intro_camera_group.bin
```

VS2 sibling: `E:\XB\解包\vs2\x64\011camera\parameter\02winlose.vgsht2`  
Extract twin of OB table: `E:\XB\extract_tools\0xCB665375\0\0\30.bin` (same 907216 bytes).

There is **no** file named `camera.bin`. The packed 011camera resource is this folder.

---

## 1. Two hashes, do not mix them

Each 220-byte row has:

| Field | Offset | Command hash | Meaning |
|---|---|---|---|
| row id | id table, not in the 220 bytes | — | per-shot parameter row. **Not** `sys_53` |
| word25 | `+0x64` | `0x980ABFA6` | **clip hash**. This is what `sys_53(0x4, hash)` looks up |
| word43 | `+0xAC` | `0xE52F114D` | sort_key. Unique 1..4046 in OB. Packs are consecutive |

Checked on all 1166 OB packs: clip hash **never** equals any row id in that pack.

Native (POC, OB): `sys_53(0x4)` → `sub_140646AD0(player, clip_hash)`. BST miss on a hash that is not loaded (`01waza` while that unit is not in the match) can crash. **Stay inside `02winlose` word25.**

---

## 2. What a “camera id” actually is

OB `02winlose`: **4046 rows, 1166 packs**. Every pack’s rows occupy **consecutive** sort_keys. Histogram: 1-shot 352, 5-shot 199, max 13.

One pack = one `sys_53` clip hash = a short shot sequence.

Typical first shot: `w11=3` and a real FOV (`word16`). Later shots often `w11=0` and FOV NaN (inherit). `word40` is a signed offset around the unit (not proven duration; ENTER rows sit at 0, orbit rows swing ±).

Families do not share clip hashes: `00system ∩ 02winlose = 0`, `01waza ∩ 02winlose = 0`.

Loose `*.nuanmb` in this pack are intro/menu only (`camera1` skeleton). Win/lose clip *payload* is the compiled 0x134 BST (OB IDA: `sub_1405DD890` → `global+0x268D28`). You pick cameras from **word25**, not by renaming nuanmb. Loader: [camera-clip-bst-loader.md](./camera-clip-bst-loader.md).

---

## 3. Rebellion’s current pair (table, not MSC guess)

| Role | Clip (word25) | Pack | First FOV | word40 |
|---|---|---|---|---|
| Shared ENTER win | `0x8ca6cc45` | 2 shots, sort 2–3 | **65** | 0 |
| Default win tick | `0xfd5fd16a` | 5 shots, sort 1412–1416 | **11** | −5.5 .. 5.6 |
| Awakening win tick | `0x1351b046` | 4 shots, sort 1420–1423 | 17.8 | 1.9 .. **11** |
| Lose tick | `0x8028252f` | 1 shot, sort 1424 | 30 | 0 |

`func_870` overwrites ENTER on the first tick, so the pose you see is the **11°** orbit, not the 65° establishing shot. That 11 is authored FOV command `0x749B8F0E` (compiled dest `+128` **v0**, copied by `646C20`); it is not a per-tick rate. That orbit is built for a ground-height unit. Homemade `CENTER_RT` Y≈10 sits outside it.

Same serial neighborhood (sort 1400–1424) also contains wide packs that are still `02winlose` clips:

| Clip | Shots | FOV | word40 | Note |
|---|---|---|---|---|
| `0x17df41d1` | 6 | **100** | −0.2 .. 2.8 | immediately before EW win |
| `0xf988ca61` | 2 | 65 | 0 | |
| `0x60819bdb` | 2 | 65 | 0 | |
| `0x645680d0` | 3 | 9.3 | 0.7 .. 5 | between default and awakening |

TV Wing Zero packs also exist in **this same OB file** (sort 2568–2578):

| Clip | Shots | FOV | word40 |
|---|---|---|---|
| `0x52726ef0` | 4 | 13 | −1.5 .. 9.5 |
| `0xcb7b3f4a` | 2 | 10 | 1.5 .. **12.6** |
| `0xbc7c0fdc` | 4 | 7 | 0.5 .. 7 |

Catalog dump: `tmp/camera-winlose/ob_winlose_pack_catalog.txt` and `ob_winlose_packs.tsv` (1166 rows). Generator: `tmp/camera-winlose/catalog_winlose_packs.py`.

Clip **payload / BST loader** (no per-clip nuanmb on disk; `sub_1405DC540` compiles 220-byte rows to 0x134): [camera-clip-bst-loader.md](./camera-clip-bst-loader.md).

---

## 4. How to pick a replacement (one variable)

Change **only** `func_870`’s `sys_53(0x4, 0xfd5fd16a, …)` to another **02winlose word25**. Leave ENTER `0x8ca6cc45` until that is proven.

Suggested first tests for an elevated homemade pose (still E2, need E3):

1. `0x1351b046` — already on this unit’s awakening row; word40 goes to 11  
2. `0x17df41d1` — same neighborhood, FOV 100  
3. `0xcb7b3f4a` — TV pack already in OB table; word40 to 12.6  

Do **not**: invent a hash; pass a row id (`0x43e2cf6e` etc.); pull `01waza` / `00system` clips; list cameras by grepping `2.c`.

```text
H  swapping func_870 clip to 0x1351b046 / 0x17df41d1 frames the Y=10 pose
P  unit stays in shot, not a ground close-up of the feet
F  still cropped / still facing-player lock / crash (hash not in BST)
```
