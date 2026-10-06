# MSC unit decompile: unsorted offset table re-points action pointers

## Symptom

OB Justice (`020gnseed_013justic_001`, pack `0xE7C8511B`): decompile
`2.dscex` to `2.c`, repack through the app without edits, and the unit can
no longer Boost Dash or melee. Header `0x1C` was ruled out in game.

## Root cause

`a7462cf` (2026-09-19, mission script support) made `binary::parse_msc`
name every function after its offset-table slot so mission tables can be
restored. It assumed unit tables are address-sorted. They are not: the OB
Justice `2.dscex` has 627 of 1196 slots out of layout order.

The decompile log (`[func_name: func_N, pointer: P]`) still used the layout
index. `postprocess.rs` turns raw pointers back into names through that log
in three places, so all three named the wrong body:

| Place | Effect in OB Justice |
|---|---|
| group resolver `return 0x...` (chrsysparam field `0x0A`) | group `0xc` ENTER bound to a different function |
| phase dispatcher `var1 = 0x...` (`sys_1(0x10001, 0x10..0x12)`) | `0x4561f34b`, `0x12953861` bound to neighbours |
| `func_241(hash, 0x...)` | same mapping risk |

The `func_241` literal in `postprocess.rs` is also a layout-index name, so
slot naming broke it for any unsorted unit file.

## Fix

`binary.rs`: only mission scripts are named by slot; unit scripts use the
layout index again (Python `mscdec.py` parity). The log always uses the same
names as the scripts.

## Verification (2026-10-06)

- OB Justice `2.dscex` decompile then `msclang -i` (same path as the app's
  `compile_msc`): 1195/1196 scripts identical. The dispatcher is re-shaped
  (binary search to switch) but all 141 phase hashes and the default case
  resolve to the same body. The group resolver is identical.
- The rebuilt log equals the committed Python-era `2.txt` byte for byte.
- `cargo check --lib --bins`: no crate warnings.
- Scan of 1839 `X.c` under `E:\XB\mod\040msc`: only the Justice `2.c`
  decompiled on 2026-10-06 had non-monotonic function names.
- In game: pending.

## Remaining

- `cargo test --lib` does not compile because of old test code in
  `format/effect_folder.rs` and `format/fhm2d.rs`. The new
  `binary.rs` tests cannot run until that is fixed.
- `tests/msc_toolchain_tdd_test.rs` `include_str!`s `src/bin/mscdec.rs`,
  which moved to `legacy-bin/`.
- The 1249-function Justice `2.c` that was in the mod folder did not come
  from OB stock (1196 scripts, identical to the mod repo's git HEAD) and is
  not in git. Backup: `tmp/exvs2-json/justice-dispatch/backup-working-tree-20261006/`.
