# Striker research — step log

Chronological record of what was run and what came back. Paths are literal.

Reference roots used:

| Root | What it is |
|---|---|
| `E:\XB\解包\vs2\x64` | EXVS2 (arcade VS2) unpacked tree, folder names intact |
| `E:\XB\解包\vs2\meta` | `0xHASH_meta.bin` — original build paths per package |
| `E:\OBHK0.3_v27\data\x64\dplcache_release` | OB v27 live package store (19119 `.fhm2d`) |
| `E:\OBHK0.3_v27\data\x64\mod` | OB v27 mod override store (3734 files) |
| `E:\XB\解包\com\file` | OB modding workspace (already-extracted packages) |
| `E:\XB\mod\040msc` | OB MSC workspace, decompiled `0.c` / `2.c` per unit |
| `E:\ob_unit\ob_v27_unit.json` | unitId -> 6 package hashes (derived; verify before use) |

---

## L-01 — `strikertable.vgsht1` is a plain vgsht1 table

Input: `E:\XB\解包\vs2\x64\041cpm\striker\strikertable.vgsht1` (968 B)

```
magic=0xCEABB8A9 size=968 count=78 stride=8
```

Layout matches `src-tauri/src/format/raw_path_id.rs` (`VGSHT1_MAGIC`,
count @0x10, stride @0x14, ascending u32 id array @0x20, records after it).
Here stride is 8 (two u32) instead of raw_path_id's 0x18.

`0x20 + 78*4 = 0x158` records start, `0x158 + 78*8 = 0x3C8 = 968` = file size.
**[PROVEN]** — the size equation closes exactly.

## L-02 — the id array is the unit id, the record is two striker ids

First id `0x000F4629` = 1001001 (RX-78-2). Row: `1001001 -> 501016001, 501015001`.
Every non-zero record value is `5xxxxxxxx`. **[PROVEN]** by the arithmetic
identity `striker_id == 500000000 + unit_id` holding for the aliased rows
(e.g. `28011001 -> 528001001`).

## L-03 — OB v27 has its own, larger strikertable

Package `0xFEEB79F0` = `x64/041cpm/striker/strikertable` (from the generated
name map, later confirmed against the vs2 meta path convention).

```
E:\OBHK0.3_v27\data\x64\dplcache_release\0xFEEB79F0.fhm2d   1339 B packed
-> 1844 B  magic=0xCEABB8A9 count=151 stride=8
```

VS2 = 78 rows, OB v27 = 151 rows.

`E:\XB\解包\com\file\0xFEEB79F0\0.bin` is a **modified** copy (152 rows:
`+66004001, +66005001, -21013001`). The dplcache one is the base truth.

## L-04 — striker package names are the unit name with the leading `0` -> `5`

On-disk proof, no hashing involved:

```
E:\XB\解包\vs2\x64\040msc\016gundmw_001wgzero_001\
E:\XB\解包\vs2\x64\040msc\516gundmw_001wgzero_001\
E:\XB\解包\vs2\x64\040msc\016gundmw_003talgs3_001\
E:\XB\解包\vs2\x64\040msc\516gundmw_003talgs3_001\
```

Build-path strings out of `E:\XB\解包\vs2\meta\0x8D69AA9A_meta.bin`:

```
c:\nufw_proj\vsac\mk_rom\product\exvs2\app\data\x64\040msc\516gundmw_003talgs3_001\516gundmw_003talgs3_001.bscex
```

**[PROVEN]**.

## L-05 — package hash of a striker = package hash of the unit XOR 0x9B2F4B47

Package names are CRC-family hashes of a fixed-length name string. For a
same-length name the CRC delta of a single-character substitution is constant,
so `hash(5xxx…) = hash(0xxx…) XOR K`.

Measured `K = 0x9B2F4B47`, then checked against every striker/base pair in
`ob_v27_unit.json` (208 pairs):

| Route | XOR K | identical | other |
|---|---:|---:|---:|
| `modelFileName` (002chara) | 208 | 0 | 0 |
| `mscFileName` (040msc) | 208 | 0 | 0 |
| `ammoFileName` (041cpm) | 208 | 0 | 0 |
| `animeFileName` (003motion) | 208 | 0 | 0 |
| `aleoFileName` (006effect) | 0 | 202 | 6 |
| `nu3bankFileName` (sound) | 0 | 205 | 3 |

**[PROVEN]** 100% for the four own-package routes; effect and sound are
**shared with the host unit** in 97–99% of cases.

`K` is only valid for the standard 23-character unit name
(`SSSxxxxxx_NNNxxxxxx_001`). General rule, verified on 11 real cases:

```
hash(new_name) = hash(ref_name) XOR crc32(ref_name) XOR crc32(new_name)
                 # requires len(new_name) == len(ref_name)
```

Caveat: this only reproduces *existing* vanilla names. It is not needed to
create new content — see L-09.

## L-06 — an "independent" striker is a complete unit

`516001001` (= Wing Gundam Zero EW as a striker) in the live OB store:

| Route | Hash | Size |
|---|---|---:|
| 002chara model | `0x1976812D` | 7 255 457 |
| 040msc | `0x971D263C` | 86 740 |
| 041cpm param | `0xC6E61C24` | 4 847 |
| 003motion | `0x37B0A9AE` | 1 580 909 |
| 006effect | `0x79025FAD` | 161 333 (shared with 16001001) |
| sound bank | `0x421D77F3` | 452 240 (shared with 16001001) |

Its 041cpm package contains the **same nine tables** as a playable unit:
`armsparam, bulletparam, characterparam, chrsysparam, grapparam,
hitgroupiddef, interactionid, projectile_depiction_table, speedparam`.

Its MSC package contains a full `.bscex` / `.cscex` / `.dscex` trio; the
decompiled workspace copy at `E:\XB\mod\040msc\516gundmw_001wgzero_001`
carries `0.c` 66.9 KB and `2.c` 533.2 KB (host: 63.0 KB / 612.2 KB).
**[PROVEN]** — same file set, comparable size.

## L-07 — do not trust `ob_v27_unit.json` existence flags

`ob_v27_unit.json` marks `501705001` as `constModelExists: false`, but
`E:\OBHK0.3_v27\data\x64\dplcache_release\0x00BC54B9.fhm2d` exists and is
6 775 657 bytes. Re-checked every referenced striker directly against the
directory instead: of the 154 strikers referenced by the vanilla OB table,
**153 have all four own packages present**; only `520005001` is missing
everything, and it is referenced only by the custom unit `999027001`.

## L-08 — `foroutgamearmsparam_striker` gates the selection UI

Package `0xA8FCC349` = `x64/041cpm/for_outgame/foroutgamearmsparam_striker`.

```
magic=0xCDABB8A9 entries=353 fields=1 entrySize=4
field hash 0x4961274C  offset 0  kind 2 (u32)
value distribution: {1:2, 2:33, 3:258, 4:41, 5:19}
```

Entry ids are striker ids (plus a `0` row). Every striker referenced by the
vanilla strikertable is present here. **[PROVEN]** for the structure and the
membership check; the meaning of `0x4961274C` (1–5) is **[INFERRED]** —
most likely the number of uses per match.

## L-09 — new content does not need the vanilla hash formula

`E:\XB\解包\gundamv_All\crc32File.js` (the working mod pipeline) builds new
package names as:

```js
const id = 1000000000 + unitId;
CRC32.str(`${id}_MODEL`)   // -> 0xXXXXXXXX.fhm2d file name
CRC32.str(`${id}_ALEO`)
CRC32.str(`${id}_AMMO`)
CRC32.str(`${id}_MSC`)
CRC32.str(`${id}_ANIME`)
```

and `createUnitIndex.js` writes those names into the unit-index binary. The
engine resolves a unit's packages **by the name stored in the index**, not by
re-deriving it, so any unused 8-hex name works. **[EVIDENCE]** — read from the
working toolchain, consistent with the on-disk `0xHASH.fhm2d` naming.

## L-10 — `character_id_table` is the unit index, and it is a vgsht1

Package `0x036B9E67` (project code already calls it that:
`src/services/testEditorWorkspace/contentCatalog.test.ts`,
`src/page/TestEditor/components/CharacterIdTableView.tsx`).

Vanilla OB v27, extracted from `dplcache_release`:

```
magic=0xCEABB8A9  size=26940  count=961  entrySize=24
0x20 + 961*4 + 961*24 == 26940     (closes)
id array strictly ascending        (yes)
406 of the 961 ids are 5xxxxxxxx
```

Records are six `u32` package hashes. Slot order confirmed against
`ob_v27_unit.json` field order on three rows:

```
16001001   0x8259CA6A 0x79025FAD 0x421D77F3 0x5DC95763 0x0C326D7B 0xAC9FE2E9
516001001  0x1976812D 0x79025FAD 0x421D77F3 0xC6E61C24 0x971D263C 0x37B0A9AE
516003001  0x03020D8B 0x6376D30B 0x5869FB55 0xDC929082 0x8D69AA9A 0x2DC42508
             model      aleo       nu3bank    param      msc        anime
```

`ob_v27_unit.json` has exactly 961 entries — it is a JSON transcription of this
table. **[PROVEN]**

## L-11 — package sharing across character ids is a vanilla mechanism

Over all 1695 rows of the workspace `character_id_table`:

| slot | distinct hashes | hashes used by >1 id |
|---|---:|---:|
| model | 1452 | 241 |
| aleo | 1042 | 444 |
| nu3bank | 995 | 449 |
| param | 1452 | 241 |
| msc | 1452 | 241 |
| anime | 1452 | 241 |

**241 groups of ids share a byte-identical 6-hash row**, and one of them
contains a striker:

```
503703001  0xA97F96A6 0x52240361 0x693B2B3F 0x76EF0BAF 0x271431B7 0x87B9BE25
703003001  (identical)
703003005  (identical)
```

**[PROVEN]** — a new striker id may point at an existing unit's packages.
This is the real meaning of a "lightweight" striker.

## L-12 — no chara pack embeds a foreign unit's model

Scanned every `0x*_structure.json` at `E:\XB\解包\com\file` for `.numdlb`
basenames matching `SSSxxxxxx_NNNxxxxxx_001`. Only two packs contain more than
one distinct unit name, and both are `000common` + `021destny_001strkfr_001`.
Delta Plus's chara pack `0x8AC63822` holds 13 `numdlb`, all `deltpl`.

So the "striker packed inside the host's fhm2d" shape is **not** how vanilla
strikers work. What does live inside the host is the unit-task automata summon
layer (`CUnitTaskAutomata*`), which is a weapon, not a striker.
**[PROVEN]** for the scanned subset (~150 packs; not the full 19119 store).

## L-13 — a striker's motion pack uses the *host's* clip names

`516001001` anime pack `0x37B0A9AE` -> 364 `.nuanmb`:

* 156 `001hito_000common_000common_001_*` (shared hit/down reactions)
* 80 `001hito_016gundmw_001wgzero_001_*`  <- host name, not `516gundmw`
* prop groups `400stick_..._bsaber00_*`, `410wzerowing_..._wing00_*`
* 2 borrowed `001hito_014gndm00_003susano_001_kakb12a_*` + their saber props

Clip name shape:
`<group>_<series>_<unit>_001[_<prop>]_<verb>_<sht|stk>_<air|gnd>_<fr|bk|lf|rt|lw|up>`

Melee clips `kakun10a/11a/21a/31b/41b` and `kakb12a` exist and only in the
`stk` stance. **[PROVEN]** — a striker doing melee is vanilla behaviour.

The host `16001001` motion pack `0xAC9FE2E9` (534 clips) contains **no**
`striker_*` clip, while RX-78-2's `0xC992FAFF` does
(`001hito_001gundam_001gundam_001_striker_stk_air_fr`). So the summon animation
is per-unit optional. **[EVIDENCE]**

## L-14 — striker MSC is trimmed at the action registry, not the runtime

`2.resolved.md` action-registry counts:

| unit | registered actions | `0.c` funcs | `2.c` funcs |
|---|---:|---:|---:|
| `016gundmw_001wgzero_001` | 56 | 144 | 1025 |
| `516gundmw_001wgzero_001` | 13 | 156 | 915 |
| `016gundmw_003talgs3_001` | 51 | 146 | 1000 |
| `516gundmw_003talgs3_001` | 21 | 156 | 938 |

The `2.c` function count is nearly the same (shared runtime); the difference is
in how many `ACTION_*` are registered. The Wing Zero EW striker registers the
baseline set plus **one** own action (`0x2a253f72` -> `func_903`); the
Tallgeese III striker adds **eight** (`func_903 … func_930`). **[PROVEN]**

Baseline hashes cross-referenced against existing project notes:
`0x4cdc9902` slot `0x1` hit, `0xf5f21169` air idle, `0x14b0aea3` landing,
`0x1ad4e055` `0x21` stagger, `0xef809e66` `0x22` downed.

## L-15 — the striker's param pack has the same nine tables as a playable unit

| table | `16001001` | `516001001` | `516003001` |
|---|---:|---:|---:|
| armsparam | 2.9 K | 1.0 K | 1.0 K |
| bulletparam | 7.3 K | 1.3 K | 2.9 K |
| characterparam | 3.9 K | 3.9 K | 8.9 K |
| chrsysparam | 68 B | 68 B | 68 B |
| grapparam | 1.1 K | 356 B | 424 B |
| hitgroupiddef | 4.8 K | 912 B | 1.9 K |
| interactionid | 5.6 K | 1.0 K | 1.8 K |
| projectile_depiction_table | 400 B | 400 B | 464 B |
| speedparam | 1.5 K | 1.4 K | 1.4 K |

**[PROVEN]** — same set, fewer rows. `characterparam` / `speedparam` are not
reduced at all.

## L-16 — the striker UI assets do not exist as `5xx` GUI packs

Nine GUI image kinds under `x64/009gui/image/ms/` are named
`<kind>_<series3>_<unit3>_<variant3>`. Across 2280 VS2-meta packs the series
buckets are `001..068` with **no `5xx`**, and no `unit >= 700`. The OB
workspace `009gui/ms_ms_s_structure.json` (275 entries) agrees: series `016`
only has units `001..004`.

So strikers have no dedicated icon packs. **[PROVEN]** for what does *not*
exist; where the selection screen actually gets a striker's name/icon is still
open.

## L-17 — free striker ids for series 16

Checked against all three tables (vanilla `character_id_table`,
`foroutgamearmsparam_striker`, `strikertable`):

```
516001001 516002001 516003001 516004001   taken
516005001 516006001 516701001 516702001   free
```

## L-18 — the real MSC action registry is `func_241`, not `2.resolved.md`

`2.resolved.md` is a generated overlay and it is wrong here: it lists
`func_903 / 908 / 913 / 917 / 922 / 927` for `516gundmw_003talgs3_001`, and
`grep -n func_903 2.c` finds **nothing**. Only `func_930` exists.

Grepping the actual registration call gives:

```
grep -oh "func_241(0x[0-9a-f]*, *func_[0-9]*)" <unit>/2.c | sort -u
```

| unit | count |
|---|---:|
| `516gundmw_001wgzero_001` | 9 |
| `516gundmw_003talgs3_001` | 11 |
| `016gundmw_001wgzero_001` | 35 |

Striker baseline (both strikers, 9 entries):
`0x10abcd8e→func_863  0x14b0aea3→func_414  0x1ad4e055→func_650
 0x4ac375c7→func_856  0x4cdc9902→func_869  0x906cbad0→func_867
 0xc3e64564→func_858  0xef809e66→func_871  0xf5f21169→func_412`

`0x10abcd8e / 0x4ac375c7 / 0x906cbad0 / 0xc3e64564` do not appear in the
playable unit's `func_241` table at all — striker-only lifecycle actions.
Tallgeese III's striker adds `0x7c7d0136→func_865` and `0x3cc16f1f→func_930`.

The `0.c` slot table `sys_1(0x10000, 0x1, slot, hash)` is **line-for-line
identical** between striker and host (30 distinct rows). **[PROVEN]**

Call profiles of the striker-only functions (`516gundmw_001wgzero_001/2.c`):

```
func_856  422c  sys_46 sys_47 sys_1 func_69 sys_4A func_167 callFunc3
func_858  441c  sys_46 func_167 sys_1 func_69 sys_47 sys_4A func_150 func_175 sys_4E callFunc3
func_863  548c  sys_46 sys_0 func_69 func_296 func_167 func_331 func_332 func_351 callFunc3
func_867  188c  sys_46 func_167 sys_1 func_69 callFunc3
func_869   42c  func_48 callFunc3
func_871  145c  sys_0 sys_4A func_323 sys_4E callFunc3
```

## L-19 — striker param packs use a reduced `speedparam` schema

Extracted 12 param packs straight out of `dplcache_release` and read the
`vgsht2` header:

```
play 1001001  74/304  arms=3   bullet=28      STRK 501016001  69/284  arms=1  bullet=23
play 2001001  74/304  arms=10  bullet=25      STRK 502012001  69/284  arms=1  bullet=10
play 20005001 74/304  arms=8   bullet=126     STRK 520012001  69/284  arms=1  bullet=4
play 33004001 74/304  arms=11  bullet=124     STRK 533008001  69/284  arms=1  bullet=5
play 42001001 74/304  arms=18  bullet=74      STRK 542005001  69/284  arms=1  bullet=4
play 49004001 74/304  arms=12  bullet=47      STRK 549002001  69/284  arms=1  bullet=14
                (speedparam fields/entrySize)
```

12/12 clean split: playable = 74 fields / 304 B, striker = 69 fields / 284 B.
`characterparam` is 197 fields / 796 B on both sides.
`armsparam` has **exactly one entry on every striker sampled**. **[PROVEN]**

Capability fingerprint:

| striker | arms | bullet | hitgroup | interaction | characterparam rows |
|---|---:|---:|---:|---:|---:|
| `516001001` Wing Zero EW | 1 | **0** | 10 | 4 | 1 |
| `516003001` Tallgeese III | 1 | **5** | 26 | 10 | 7 |

`516001001` has zero projectiles — it is a pure melee striker.
`516003001` carries both, so it is the correct clone base for a
"shoots and melees" striker.

## L-20 — correction: `dplcache_release` is NOT pristine arcade data

The OBHK 0.3 v27 base layer already carries modder content:

* `character_id_table` (961 rows) contains `999001001 … 999704001`.
* `strikertable` (151 rows) contains hosts `999022001`, `999027001`, `999047001`.

So "vanilla" in earlier entries means **OBHK 0.3 v27 base**, not arcade EXVS2.
The closest thing to pristine here is `E:\XB\解包\vs2\x64`. **[PROVEN]**

Side effect: `999027001 -> 520005001` is a modder row whose striker has no
packages at all — that is why L-07's sweep found exactly one broken reference.

## L-21 — how `mod\` overrides work

`E:\OBHK0.3_v27\data\x64\mod\` = 3734 files:

| kind | count | note |
|---|---:|---|
| `0xHASH.vgsht2` | 3725 | encrypted (first 4 bytes differ per file); produced by `E:\OBHK0.3_v27\data\x64\fhm2d_encrypt.js` |
| `0xHASH.fhm2d` | 9 | plaintext, header `B9 B7 B2 CD`, identical container to `dplcache_release` |

The 9 plaintext packages:

```
0x264D1CA7 26902   0x63D0251E 2815568  0x83D604C3 8973
0x8C428AF2 26750   0xCB665375 648311   0xD294EC94 1072683
0xDFD38C70 111149  0xE20A6BCB 108264   0xFF832E7F 3217
```

`0xDFD38C70` is `character_list` and exists in **both** stores:

```
mod\0xDFD38C70.fhm2d              -> 0.bin 433.6 KB
dplcache_release\0xDFD38C70.fhm2d -> 0.bin 216.7 KB
```

The running game shows the expanded roster, so `mod\` wins. **[EVIDENCE]**

None of `0x036B9E67` / `0xA8FCC349` / `0xFEEB79F0` is currently overridden in
`mod\` — those three slots are free for our edit.

(`0x264D1CA7` is a different `vgsht1`: 308 rows, entrySize 24, hash-like ids —
not a character table. Not investigated further.)

## L-22 — slot statistics over the 151-row table

```
filled striker slots      215
  same series as host     202
  cross series             13
rows with slot1 == slot2   22
rows with slot2 == 0       87      <- 16001001 is one of them
```

Cross-series examples: `3001001 -> 502001001/502002001`,
`24001001 -> 501701001`, `25002001 -> 501711001`,
`999022001 -> 521007001`.

⇒ A slot may hold a striker from any series. **[PROVEN]**
