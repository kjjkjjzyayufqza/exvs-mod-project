# Flight sub repair stage 8 — sys_46(0x6) analog-input gate

**Status:** E1 source edit + legacy repack installed; runtime unverified (E3 pending).

User correction 2026-09-01: no back input is fine; held back reverse-flies
and the camera offsets. I9-I13 are closed. This pack does not retry mix,
motor-off, yaw, SE, `func_167`, `0x4000` clear, or the flight-special clamp.

## Build identity

- Source `2.c` MD5: `258D870EFC0B76315F6BBEB24B552D9D`
- Installed `2.dscex` MD5: `9DB851C90E0294BAD13AD77B3993A9C2`
- Previous I13-restore `2.dscex` MD5: `E1AD6A4AB6A2B08FD476098F47E5BC7E`
- Backup: `tmp/msc-repack/20260901-flight-sub-move-flag-stage8/2.i13-before.dscex`
- Compiler: legacy `tools/msclang.py -i`
- Source guards: AI blocks pass; opaque pointers 0 warnings; action shape 0 errors.

## Scope

- One judgement variable: `func_296(0x3e9, 0)` → `sys_46(0x6, 0)` every
  677 tick and every 679 tick until `global252`.
- Restore `func_296(0x3e9, 1)` on the 679 `global252` frame so analog
  EXIT is not left gated.
- Keep motor `sys_1(0x30001)` on. Do not `sys_46(0x5)` (atlas rush seed).
- Do not change mix `0x32/0x60/0x62`, profile 1, clips, lateral push,
  or the bare `func_593` tick.

`func_296(0x3e8)` is `sys_1(0x30001)` (I12). `func_296(0x3e9)` is a
different syscall. Hambrabi kind-0x35 START writes `0x3e9=0` when
`global854==1` (then seeds `sys_46(0x5)`). Handbook: `0x3e9` alone does
not zero leftover ch1/ch2 mag; this pack tests whether it gates *live*
`0x4000` analog input. `func_73` also restores `0x3e9=1` on some
teardowns; 679 still pairs the write.

## Lifecycle / ownership

| State | ENTER START | ACTIVE SHOOT | EXIT 679 | INTERRUPT |
|---|---|---|---|---|
| `sys_1(0x30001)` | preserve on (`func_594`) | preserve | preserve | preserve |
| `global24 & 0x4000` | preserve | preserve | preserve | preserve |
| `sys_46(0x6)` | inherit (usually 1) | **0 every tick** | **0 until `global252`, then 1** | residual: stays 0 until `func_73` / next analog path writes 1 |
| ch1/2 scripted push | START kick if side change | SHOOT ENTER lateral | inherit | native |

## H/P/F

H  hypothesis: held-back reverse is live `0x4000` analog translation gated
   by `sys_46(0x6)` / `func_296(0x3e9)`, not the flight motor.

P  prediction: holding back during SHOOT no longer reverse-flies and the
   camera does not pull; the unit still flies (no I12 drop); lateral push
   and END flight remain.

F  falsifier: still reverse-flies, **or** I12-class fall / fake bird,
   **or** side roll / EXIT broken, **or** after END the unit cannot fly
   (restore missed).

## Action-only matrix

| Saw | Means |
|---|---|
| Hold back, no reverse (side push only) | `sys_46(0x6)` gated analog input |
| Hold back, still full reverse | flag does not gate `0x4000` analog (handbook leftover-mag class) |
| Fall / fake bird | `0x3e9` was not independent of the motor |
| END cannot fly | 679 restore missing or too late |
| No side travel | flag also ate the Hambrabi `sys_46(0x1,0x2)` push |
