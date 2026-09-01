# Flight sub analog Stage 10 — 2026-08-28 channel clamp, motor on

**Status:** E1 source edit + legacy repack installed; runtime unverified (E3 pending).

Stage 8 `func_296(0x3e9)` copied kind-0x35 `global854`, not the roll hook.
Stage 9 `sys_4C(0x8, 0x3)` is a magnitude reseed companion, not a reverse
gate. Neither was E3-proven to stop hold-back reverse. This pack removes
the 0x3e9 writes that re-entered 677/679 and applies the 2026-08-28
flight-special result: **channel clears after `func_167(0x1004000)` stop
translation with `sys_1(0x30001)` left on.**

## Build identity

- Source `2.c` MD5: `0EF33D30C7EFAF80F8676E0785276E15`
- Installed `2.dscex` MD5: `68C073FE661055C80378D66116976227`
- Backup: `tmp/msc-repack/20260901-flight-sub-clamp-stage10/2.before.dscex`
- Compiler: legacy `tools/msclang.py -i`
- Source guards: AI blocks pass; opaque pointers 0 warnings; action shape 0 errors.

Do not retry I9-I13. Do not `func_296(0x3e8, 0)` (I12). Do not
`func_169(0x4000)`. Do not `sys_46(0xF)` (EXIT interpolator). Do not
`sys_46(0x5)`.

## Scope

- One recipe: after `func_593`, while `global184` is START (1) or SHOOT (2):
  `func_167(0x1004000)`, clear ch1/ch2, `sys_46(0x4, 0x4, 0)`, `func_300(0)`.
- SHOOT (`global184 == 2`) then re-writes the Hambrabi lateral
  `sys_46(0x1, 0x2, roll_push, 0, 0xb4)` so clamp does not eat 側転 travel.
- 679 (`global184 == 4`) is not clamped (I1 EXIT).
- Motor stays on.

## Lifecycle / ownership

| State | START | SHOOT | 679 | INTERRUPT |
|---|---|---|---|---|
| `sys_1(0x30001)` | preserve | preserve | preserve | preserve |
| `global24 & 0x4000` | preserve (reassert via `func_167`) | same | preserve | preserve |
| analog mag ch1/2 | clear each tick | clear then lateral push | inherit | native |
| ch4 / `func_300` | 0 | 0 | inherit | native |

## H/P/F

H  hypothesis: held-back reverse is native `0x4000` analog translation.
   2026-08-28 E3 on flight special: channel clamp after `func_167` stops
   it with the motor on. I12 fall was motor-off without that clamp.

P  prediction: holding back during START/SHOOT does not reverse-fly or
   pull the camera; SHOOT still side-travels; no free-fall; END still flies.

F  falsifier: still reverse-flies, **or** I12-class fall / fake bird,
   **or** no side travel, **or** EXIT cannot fly.

## Action-only matrix

| Saw | Means |
|---|---|
| Hold back, side travel only | clamp owns analog reverse |
| Hold back, still full reverse | analog still writes after MSC (I10 class) |
| Fall / fake bird | `func_167` + clamp reproduced I12 |
| No side travel | lateral rewrite lost to clamp/`func_300` |
| END cannot fly | 679 was clamped or `0x4000` stuck wrong |
