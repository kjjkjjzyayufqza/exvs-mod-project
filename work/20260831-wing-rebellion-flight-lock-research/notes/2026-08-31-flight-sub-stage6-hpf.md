# Flight sub repair stage 6 — per-tick SHOOT analog motor off

**Status:** E1 source edit + legacy repack installed; runtime unverified.

Stage 5 (I11) is E3-: ENTER-only `func_296(0x3e8, 0)` did not keep lock
facing. Held stick still turned the unit off the locked enemy. No straight
drop was reported, so that one-frame motor-off was either re-armed or never
owned heading.

## Build identity

- Source `2.c` MD5: `7564891FDBECABF80DAE855F9B03ECF1`
- Installed `2.dscex` MD5: `70594770CADC6DF9031247151D06E28F`
- Previous stage-5 `2.dscex` MD5: `E05A96EBB495F46B6FD0F064AB1AA659`
- Backup: `tmp/msc-repack/20260831-flight-sub-shoot-motor-stage6/2.stage5-before.dscex`
- Compiler: legacy `tools/msclang.py -i`
- Source guards: AI blocks pass; opaque pointers 0 warnings; action shape 0 errors.

## Scope

- One judgement variable: the same `func_296(0x3e8, 0)` now runs on every
  677 tick, not only `global240==0`.
- 679 ENTER still restores `func_296(0x3e8, 1)`.
- Do not clear `0x4000` (I1). Do not yaw. Do not SE. Do not `func_167`.

## H/P/F

H  hypothesis: native analog re-arms `sys_1(0x30001, 1)` after the 677 ENTER
   frame, so ENTER-only motor-off cannot hold heading.

P  prediction: holding a direction during SHOOT keeps body/beams on the
   current lock for the whole burst; END still flies.

F  falsifier: held stick still yaws off lock, OR the unit drops for the
   whole SHOOT, OR END cannot fly.

## Action-only matrix

| Saw | Means |
|---|---|
| Lock facing holds while stick is held | motor was the heading owner; I11 was duration |
| Straight drop through SHOOT | motor also owned lift; too coarse |
| Still turns off the enemy | `0x4000` / another analog path ignores `0x30001` |
| END then no flight | 679 restore missed |

## Lifecycle

| Phase | Policy |
|---|---|
| ENTER | START unchanged. |
| ACTIVE | every 677 tick writes `func_296(0x3e8, 0)`. |
| EXIT | 679 ENTER restores `func_296(0x3e8, 1)`. |
| INTERRUPT | next analog/hit ENTER owns the motor. |
| RESPAWN/REINIT | no new state. |
