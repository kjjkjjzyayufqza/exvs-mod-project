# Flight sub analog Stage 11 — motor-on clamp after func_593

**Status:** E1 source + legacy pack installed; runtime unverified (not E3).

User 2026-09-01: previous packs had no in-game change. Stage 10 was
claimed installed as `68C073FE` but the loaded `2.dscex` was not that
binary. I10 already showed `global184==2` after `func_593` can be a
no-op site. Body-only clamp is weaker than tick-after-`func_593` (I1):
`func_595`/`func_596`/`func_300` can run after a 677-body write.

This pack last-writes the 2026-08-28 motor-on clamp **after** `func_593`
on the roll tick. 676/677 set `clamp_live` every tick; 679 clears it.
No `global184` gate. SHOOT rewrites Hambrabi `sys_46(0x1, 0x2)` after
the clear. Motor stays on (I12). No `sys_46(0xF)`, no `0x4000` clear.

## Build identity

- Source `2.c` MD5: `A8862D987D1DE8F87F0F62820EE56C6E`
- Installed `2.dscex` MD5: `616D3F4307D19C059FC6564B917BA189` (304208 B)
- Snapshot: `tmp/msc-repack/20260901-flight-sub-analog-stage11/`
- Compiler: legacy `tools/msclang.py -i`
- Source guards: AI blocks pass; opaque pointers 0 warnings; action shape 0 errors.

If the loaded file is not `616D3F43...`, this pack is not what the game ran.

The same tick also last-writes Hambrabi START yaw when `global184==1`.
That must not run in SHOOT. Analog judgement is still hold-back during SHOOT.

## Bytecode proof (E1, not E3)

`mscdec` of installed `2.stage11.dscex` / workspace `2.dscex`:

- `func_946` is the clamp: `func_167(0x1004000)` then ch1/ch2 clear,
  `sys_46(0x4,0x4,0)`, `func_300(0)`, optional `sys_46(0x1,0x2,global822,0,0xb4)`.
- `func_947` tick: `func_593(); func_948(); if (global825) func_946(global826);`
  then START-only `global184==1` yaw.
- `func_949` START sets `global825=1`, `global826=0`.
- `func_950` SHOOT sets `global825=1`, `global826=1`.
- `func_951` END clears both.
- Hashes `0x5346534c` / `0x53465352` still register `func_944` / `func_945`.

This proves the packed file contains the clamp. It does **not** prove
hold-back reverse is gone. That remains E3.

## H/P/F

H  hold-back reverse is native `0x4000` analog after the MSC tick; I1
   clamp after `func_167` stops it with motor on; I10 means do not gate
   on `global184`.

P  hold back during SHOOT: no reverse-fly / camera pull; side travel
   remains; no I12 fall; END still flies.

F  still reverse, fall, no side travel, or EXIT cannot fly.
