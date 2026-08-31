# Flight sub repair stage 4 — SHOOT branch SE probe

**Status:** E1 diagnostic build installed; runtime unverified.

Post-I10 static reread (2026-08-31, still waiting on this probe):
the missing `func_167` does not make I10 a different class from D9/I7.
Bird-form `global24 0x4000` native analog already overwrites `sys_46(0)`
without an MSC republish. Hambrabi itself has no SHOOT lock-yaw writer.
Audible SE → analog heading owner next, not more yaw. Silent SE →
`global184`/artifact identity.

## Build identity

- Source `2.c` MD5: `4EE55F49624B70267BD9806D4ACA11D9`
- Installed `2.dscex` MD5: `21D619458912FA4A5208B2295237C9AE`
- Previous stage-3 `2.dscex` MD5: `3DA74328EB18C757EE002133191FF351`
- Backup: `tmp/msc-repack/20260831-flight-sub-shoot-probe-stage4/2.stage3-before.dscex`
- Compiler: legacy `tools/msclang.py -i`
- Source guards: AI blocks pass; opaque function pointers pass with 0 warnings.
- Documentation gates: MSC evidence checker clean; catalog 35 clusters / 95 files.

## Scope

- Add one diagnostic state only: a one-shot SE when the roll tick first enters
  `global184==0x2`.
- Keep stage-3 yaw, translation, profile, selector, phase shape and EXIT intact.
- Reset the probe latch at both mirrored action ENTERs.

## H/P/F

H  hypothesis: the SHOOT branch executes and the stage-3 yaw writer is being
   overwritten later by native flight analog.

P  prediction: SE `0x46A7A8A6` plays exactly once per roll-sub activation when
   SHOOT begins; visible yaw may remain unchanged.

F  falsifier: the SE is silent, which means the `global184==2` branch is not
   reached as assumed or the game is not running this artifact.

## Lifecycle ownership

| Phase | Policy |
|---|---|
| ENTER | Reset probe latch to 0. |
| ACTIVE | First SHOOT tick sets latch to 1 and plays one SE. |
| EXIT | No probe action. |
| INTERRUPT | No cleanup required; next ENTER resets the latch. |
| RESPAWN/REINIT | No persistent behavior; latch is action-local by reset policy. |
