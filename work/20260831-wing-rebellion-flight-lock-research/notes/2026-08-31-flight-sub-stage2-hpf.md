# Flight sub repair stage 2 — TV moving-shot profile

**Status:** E3- runtime falsified (2026-08-31). The user reported no
observable change: rear-facing START still reaches the current lock, but holding
back during sustained SHOOT still pulls heading off target. Profile 1 did not
separate translation from yaw on Rebellion.

## Build identity

- Source `2.c` MD5: `3C83645514BF5EE4EAF639ADB81C587A`
- Installed `2.dscex` MD5: `4E25DE9666EEB642F901C9CAFA1B1413`
- Previous stage-1 `2.dscex` MD5: `A0138650275632F0131FAFEA0C54CBC2`
- Backup: `tmp/msc-repack/20260831-flight-sub-profile-stage2/2.stage1-before.dscex`
- Compiler: legacy `tools/msclang.py -i`
- Source guards: AI blocks pass; opaque function pointers pass with 0 warnings.

## Scope

- Change one ownership variable: enter TV Wing Zero flight-sub profile
  `func_351(0x1, 0x4)` on roll START and SHOOT entry.
- Both mirrored hashes share these phase bodies, so one implementation covers
  L and R.
- Keep `0.c`, `global689=0xA`, tick, movement mix, timers, ammo, resources,
  allowlists and phase shape unchanged.

## H/P/F

H  hypothesis: profile 1 is the TV flight-sub moving-shot adapter that lets
   stick input translate the unit during SHOOT without stealing the lock-facing
   yaw established during START.

P  prediction: from a rear heading the first shot still faces the lock; holding
   back during SHOOT moves the unit but the body/projectiles stay facing the
   current target; both roll sides retain bird form and return to flight.

F  falsifier: held back still pulls yaw off target, movement is disabled,
   START no longer reaches the lock, or natural EXIT enters air idle/fake bird.

## Lifecycle ownership

| Phase | Policy |
|---|---|
| ENTER | START switches to profile 1 once; no form/motor/bit changes. |
| ACTIVE | SHOOT reasserts profile 1 once per native 677 entry. |
| EXIT | Inherit profile 1 through END, matching TV flight-sub shape; no profile-0 state is introduced. |
| INTERRUPT | Existing Rebellion FORCED_RECOVERY and mirrored allowlists remain unchanged. |
| RESPAWN/REINIT | No new state is introduced. |
