# Flight sub repair stage 1 — native START aim window

**Status:** E3 runtime observed (2026-08-31): rear-facing START reaches the
current lock, but the user reports no observable delta from the previous build;
holding back during sustained SHOOT still pulls heading off target. Stage 1
only changed START ownership and was not expected to add SHOOT tracking.

## Build identity

- Source `2.c` MD5: `CCFF2A8DDF79516EAC0402554763A85D`
- Installed `2.dscex` MD5: `A0138650275632F0131FAFEA0C54CBC2`
- Previous `2.dscex` MD5: `7C5475313425267B8FFDFCFF329A81AF`
- Backup: `tmp/msc-repack/20260831-flight-sub-aim-stage1/2.before.dscex`
- Compiler: legacy `tools/msclang.py -i`
- Source guards: AI blocks pass; opaque function pointers pass with 0 warnings.

## Scope

- Change one judgement-affecting variable only: both mirrored roll actions use
  `global689 = 0xA` instead of `0x6`.
- Keep `0.c` selector hashes and `(0, 0x1, 0)` metadata unchanged.
- Keep tick, movement profile, movement mix, phase timers, ammo, resources,
  form allowlists, interrupt handling and EXIT unchanged.

## H/P/F

H  hypothesis: the shared `func_595` START owner needs the TV flight-sub
   10-tick aim window to finish facing the current lock before SHOOT.

P  prediction: from a rear or side heading, both L and R roll-sub variants
   finish turning toward the current lock before the first projectile; bird
   form, weapon bar, movement during SHOOT and natural EXIT remain exactly as
   the current build.

F  falsifier: either side fires before facing the lock, held direction still
   wins during START, the action drops form/HUD, or SHOOT/EXIT behavior changes.

## Lifecycle ownership

| Phase | Policy |
|---|---|
| ENTER | Only `global689` changes; selector/action hash unchanged. |
| ACTIVE | `func_593 -> func_595` owns START yaw; SHOOT remains unchanged. |
| EXIT | Existing `global698=0x14`, end body and native resolver remain unchanged. |
| INTERRUPT | Existing `func_41` and `func_882` mirrored allowlists remain unchanged. |
| RESPAWN/REINIT | No new state is introduced. |
