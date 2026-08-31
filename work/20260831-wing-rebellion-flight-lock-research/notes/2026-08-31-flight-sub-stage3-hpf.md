# Flight sub repair stage 3 — SHOOT-only last-writer yaw

**Status:** E3- runtime falsified (2026-08-31). The user reported the
SHOOT-only post-`func_593` yaw writer had no observable effect.

## Build identity

- Source `2.c` MD5: `55E7667D408916461181AF9A6D03BCF0`
- Installed `2.dscex` MD5: `3DA74328EB18C757EE002133191FF351`
- Previous stage-2 `2.dscex` MD5: `4E25DE9666EEB642F901C9CAFA1B1413`
- Backup: `tmp/msc-repack/20260831-flight-sub-shoot-yaw-stage3/2.stage2-before.dscex`
- Compiler: legacy `tools/msclang.py -i`
- Source guards: AI blocks pass; opaque function pointers pass with 0 warnings.
- Documentation gates: MSC evidence checker clean; catalog 35 clusters / 95 files.

## Scope

- Change one ownership variable: after `func_593()`, while `global184==0x2`
  only, write a bounded current-target yaw step.
- Keep `0.c`, profile 1, `global689=0xA`, translation channels, movement mix,
  timers, ammo, resources, allowlists and EXIT unchanged.
- Do not write yaw during START or END; START stays owned by `func_595` and END
  stays owned by the native handoff.

## H/P/F

H  hypothesis: the remaining drift exists because `func_596` has no yaw writer;
   a SHOOT-only writer after the ranged driver can be last within this action
   tick while leaving translation live.

P  prediction: rear-facing START still reaches the lock; holding back during
   SHOOT moves the unit but each frame corrects body/projectile yaw toward the
   current target; END and natural flight recovery remain unchanged.

F  falsifier: held back still pulls yaw away, movement stops or jitters,
   SHOOT over-tracks after the target leaves, or END/EXIT remains target-locked.

## Lifecycle ownership

| Phase | Policy |
|---|---|
| ENTER | No new write; shared `func_595` remains the START owner. |
| ACTIVE | Only `global184==2` writes `sys_46(0, func_102(func_626(),0x1F4,2))` after `func_593`. |
| EXIT | `global184==4` skips the writer; current resolver/profile policy is preserved. |
| INTERRUPT | Replacing the action stops its tick automatically; no latch or cleanup is added. |
| RESPAWN/REINIT | No new state is introduced. |
