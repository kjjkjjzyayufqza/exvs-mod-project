# Flight sub repair stage 5 — SHOOT analog motor off

**Status:** E1 source edit + legacy repack installed; runtime unverified.

User rejected the Stage 4 SE probe. Discriminators are action-only:
held stick during SHOOT currently drops lock facing (I9/I10). I10 yaw had
no visible effect, which matches D9/I7: `sys_1(0x30001, 1)` leftover analog
writes heading after MSC.

## Build identity

- Source `2.c` MD5: `2924EFBDEBC24583AFCE4CDD00322A59`
- Installed `2.dscex` MD5: `E05A96EBB495F46B6FD0F064AB1AA659`
- Previous stage-4 `2.dscex` MD5: `21D619458912FA4A5208B2295237C9AE`
- Backup: `tmp/msc-repack/20260831-flight-sub-shoot-motor-stage5/2.stage4-before.dscex`
- Compiler: legacy `tools/msclang.py -i`
- Source guards: AI blocks pass; opaque function pointers pass with 0 warnings; action shape 0 errors.

## Scope

- One judgement variable: `func_296(0x3e8, 0)` (`sys_1(0x30001, 0)`) on
  each 677 ENTER; restore `func_296(0x3e8, 1)` on 679 ENTER.
- Remove the rejected SE probe and the I10 yaw writer (E3- no-op).
- Keep `0.c`, profile 1, `global689=0xA`, mix, lateral push, allowlists.

## H/P/F

H  hypothesis: held stick drops lock because START left the flight motor on,
   so analog leftover writes heading for the whole SHOOT.

P  prediction: holding a direction during SHOOT keeps body/beams on the
   current lock; the scripted lateral push still runs; START still aims;
   END returns to flyable analog.

F  falsifier: held stick still yaws off lock, OR the unit drops straight,
   OR END cannot fly.

## Action-only matrix

| Saw | Means |
|---|---|
| Beams stay on the locked enemy while stick is held | motor was the heading owner |
| Straight drop during SHOOT | motor also owned lift; too coarse |
| Slow drift, heading holds | mag scaled, motor maybe still on |
| Heading still stolen | `0x4000` native heading ignores motor |
| END then no flight | 679 did not restore `0x30001` |

## Lifecycle ownership

| Phase | Policy |
|---|---|
| ENTER | START unchanged; motor stays on for the `func_595` aim window. |
| ACTIVE | 677 ENTER writes `func_296(0x3e8, 0)` once per burst. |
| EXIT | 679 ENTER restores `func_296(0x3e8, 1)` before `func_598`. |
| INTERRUPT | No extra restore; next analog/hit ENTER owns the motor. |
| RESPAWN/REINIT | No new persistent state. |
