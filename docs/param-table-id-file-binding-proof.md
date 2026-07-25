# MSC `sys_0` table id → parameter file binding (mechanical proof)

Date: 2026-07-25
Method: hash-set intersection, no interpretation
Tools: `tools/param_msc_usage_scan.py`, `tools/param_evidence_crosscheck.py`

## Why this document exists

Existing project docs asserted table-id meanings from prose reasoning, e.g.
`docs/msc-research/system-control-surface-matrix.md` cites `command_mapping.md`
for `0x60006 = speedparam`. That is a citation, not a proof, and one such
assertion turned out to be wrong (see the `0x60002` row below).

This binding is now derived mechanically: every `sys_N(tableId, …, fieldHash)`
call site in the decompiled MSC corpus is extracted, the distinct `fieldHash`
set per `tableId` is computed, and that set is intersected with the hash array
read out of real `.bin` parameter files.

## Corpus and sample

| Input | Value |
|---|---|
| MSC corpus root | `E:\XB\mod\040msc` |
| MSC `.c` files scanned | 1827 |
| Unit directories | ~400 |
| Param file roots | `E:\XB\解包\com\file\041cpm`, `E:\XB\mod\041cpm` |
| Param `.bin` files parsed | 174 |
| Distinct field hashes seen in files | 487 |
| Files written | none — all reads are read-only |

Layout used for the `.bin` reader is taken verbatim from
`src-tauri/src/format/param_bin_format.rs` (header `0x20`, hash array `4×N`,
descriptor array `12×N`, entry ids `4×M`, rows `M×entrySize`, trailing).

## Proven bindings

A binding is accepted only at 100% overlap: every field hash the MSC corpus
reads through that table id must exist in that file type's hash array.

| MSC table id | Parameter file | MSC hashes | Overlap | Status |
|---|---|---:|---|---|
| `sys_0(0x60006)` | `speedparam.bin` | 64 | 64/64 = 100% | **proven** |
| `sys_0(0x60002)` | `grapparam.bin` | 16 | 16/16 = 100% | **proven** |
| `sys_0(0x60007)` | `interactionid.bin` | 15 | 15/15 = 100% | **proven** |

### The numbered files are the same tables without names

A magic-based rescan (`--any-magic`, 528 files carrying `0xCDABB8A9` under
`E:\XB\解包\com\file` and `E:\XB\mod`) found that the numbered `N.bin` files inside
the hashed container folders are the same table set in a fixed slot order. Each
reached 100% overlap independently:

| Slot | Table |
|---:|---|
| `0.bin` | grapparam |
| `3.bin` | characterparam |
| `4.bin` | interactionid |
| `7.bin` | speedparam |

That is a second, independent derivation of the three bindings above.

### Negative result: `0x6000E` and `0x70005` own no sampled file

Both carry 44 distinct field hashes. Against all 528 param-magic files the
intersection is **empty** — not merely below 100%, but zero candidates. So their
fields are not in a param-binary container under those two roots.

`chrsysparam.csyspm` is excluded: the sampled files are 68 bytes with two 1×1
empty tables, far too small for 44 fields.

Remaining possibilities, none yet tested: a container outside
`E:\XB\解包\com\file` / `E:\XB\mod`, a non-param-binary format, or a table
assembled at runtime rather than loaded from a file.

### Negative result: `sub_1405DC540`'s table is not in the sampled data

52 of the 74 still-unattributed native field hashes belong to `sub_1405DC540`.
None of them appear in any of the 528 param-magic files. The rest of the
unattributed set splits as `sub_14061E750` 7, `sub_1401A9A00` 4 (a BGM-table
neighbour, so a different table entirely), `sub_1408F7580` 4, `sub_14061E4B0` 4,
`sub_140918C20` 3, `sub_1405F9180` 1.

Until that table is identified, nothing read through `sub_1405DC540` may be named.

### Correction: `0x60002` is grapparam, not a movement/melee speed table

`docs/msc-research/2c-runtime-system-map-for-modding.md` states:

> `global379..393` | 移动 / 格斗参数 row 结果 | `func_219(row)` 从
> `sys_0(0x60002,row,key)` 载入

The table id is right, the file attribution was never proven. All 16 field
hashes read through `0x60002` are present in `grapparam.bin` and the binding is
exact. Treat `0x60002` as **grapparam** and re-read any conclusion that assumed
those rows were movement-speed data.

## Negative result: characterparam is never read from MSC

`characterparam.bin` contributes **197** distinct field hashes across the
sampled corpus. The intersection of that hash set with *every* `sys_N` table id
observed in 1827 MSC files is **empty**.

| Claim | Evidence |
|---|---|
| characterparam field hashes read by MSC | **0 of 197** |
| `sys_1(0x60008, hash)` | entry/row *selector* only — 4 distinct hashes, all characterparam **entry ids**, not field hashes |

Consequence, and this is the operative rule for all future work:

> **No characterparam field name can ever be justified from MSC evidence.**
> The only admissible primary evidence is a native consumer in the executable.

Any characterparam field name in this repo that is not backed by a native
consumer address is an assumption, regardless of how long it has been in the
docs. See `docs/characterparam-native-consumer-map-ob.md`.

## Table id inventory (context)

A 40-unit inventory pass found 396 distinct `(syscall, tableId)` pairs. The ones
carrying many field hashes, and therefore worth binding next:

| table id | syscall | field hashes | note |
|---|---|---:|---|
| `0x10001` | `sys_1` | 1902 | action/motion hash space, not a param table |
| `0x10001` | `sys_0` | 169 | same space |
| `0x10000` | `sys_1` | 96 | unbound |
| `0x60006` | `sys_0` | 62→64 | **speedparam (proven)** |
| `0xb0000` | `sys_1` | 56 | unbound |
| `0x6000e` | `sys_0` | 44 | unbound; boost-gate related per `func11-c000-boost-gate-map.md` |
| `0x70005` | `sys_0` | 44 | unbound |
| `0x60002` | `sys_0` | 16 | **grapparam (proven)** |
| `0x60007` | `sys_0` | 14→15 | **interactionid (proven)** |

`0x6000e` and `0x70005` are the highest-value remaining binding targets; neither
intersects any of the 11 param file types sampled so far, so the matching file
is one not yet in the sample set (candidates: `chrsysparam.csyspm`, files under
other `041cpm`-sibling directories).

## Reproduction

```powershell
python tools\param_msc_usage_scan.py --root E:\XB\mod\040msc ^
  --table 0x60006 --table 0x6000e --table 0x60002 --table 0x60007 ^
  --out tmp\param-evidence\full --window 40 --split-by-field --no-json
python tmp\param-evidence\run_crosscheck.py
```

Artifacts (not committed, regenerate on demand):

| Path | Content |
|---|---|
| `tmp/param-evidence/full/tables.tsv` | `(syscall, tableId)` inventory |
| `tmp/param-evidence/full/by_field.tsv` | per-hash MSC site/unit/function counts |
| `tmp/param-evidence/full/fields/t60006_*.txt` | per-hash call sites with consumer lines |
| `tmp/param-evidence/crosscheck/table_resolution.tsv` | the overlap table above |
| `tmp/param-evidence/crosscheck/file_fields.tsv` | per-file-type hash, kind, offset, value spread |
