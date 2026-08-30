# Case Scope

## meta
- case_id: 20260830-wing-zero-rebellion-2c-fixes
- created: 2026-08-30T00:00:00+08:00
- operator: local
- primary_skill: reverse-engineering
- lead_role: lead
- specialist_roles: [cre]

## auth
- status: granted
- basis: owner-operated
- evidence_of_auth: user explicitly named the local MSC target and requested analysis and repair

## in_scope
- assets:
  - E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c
  - E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/0.c
- surfaces: [msc-decompiled-source]
- activities: [static-analysis, scoped-source-edit, legacy-compile-verification]

## out_of_scope
- assets: [post-OB game revisions]
- activities: [network-access, native-binary-research, release-build]

## network_profile
- mode: offline
- notes: Local source and repository documentation only.

## deliverables
- report: true
- field_journal: false
- diagrams: false
- timeline: false

## constraints
- timebox: {}
- stealth: low
- data_handling: no_user_pii

## signoff
- ready_for_act: true
- checklist:
  - [x] auth.status = granted
  - [x] in_scope.assets non-empty OR offline sample path set
  - [x] network_profile.mode chosen
  - [x] out_of_scope reviewed

## pre-edit MSC audit

- Intended behavior: preserve charge slot 0 during custom sub-shot; stop flight-special loop SE on every exit; make side-combo recovery bounded and its final slash chase harder; require a fresh melee input for the N-combo final slash; fire bird CS projectiles through non-consuming slot 5; map normal back-special to the normal-special hash.
- Unchanged behavior: bird/normal form ownership, slot-3 FLYING lifecycle, action hashes, projectile hashes, motions, Param rows, model dependencies, and all other input branches.
- Lifecycle: ENTER/ACTIVE/EXIT/INTERRUPT/RESPAWN were inspected for `SUB_SHOT_CUSTOM`, `SPECIAL_SHOT_FLIGHT`, `ACTION_B_MELEE`, `ACTION_B_MELEE_DIR_2`, bird CS, and `0.c func_143`.
- State ownership: charge slot 0 remains owned by native CSA; sub-shot ammo remains slot 1; bird-CS projectile ammo changes to slot 5 while CSA charge consumption remains `sys_4F(0xA,0)`; `sys_58(0x3)` gains natural and action-change cleanup; melee channel 1 is explicitly stopped before the hit window and `func_44` remains the interrupt clear; normal back-special no longer selects `0x8D3A4411`.
- Resource proof: no new resource IDs are introduced. Slot 5 is already used by the second bird-CS projectile and both flight-special projectiles; all touched action/projectile hashes already exist in the current target.
- Rollback boundary: only the named `0.c` and `2.c`; pre-edit MD5 values are `8a0566a9db00540c51c9ca5e7ed00d80` and `b263e74b5a80c160fc2e01565e290bac`.
- Evidence limit: source/compile results are E1. Player-visible behavior remains unverified until the in-game predicates below are run.

## pre-registered in-game predicates

1. H: custom N/left/right sub-shot consumes slot 1 without touching charge slot 0. P: an in-progress CSA bar keeps its accumulated value. F: any visible CSA reset refutes H.
2. H: flight-special loop SE is stopped on natural end and interruption. P: silence begins at SHOOT completion or immediately after cancel/hit. F: audible continuation after action ownership changes refutes H.
3. H: side melee third no longer waits past its bounded recovery and the final slash gets a stronger planar rush. P: no-input exits normally; melee input reaches the target across the previously failing terrain. F: a stationary post-third state or in-range whiff refutes H.
4. H: the N-combo final slash is submitted only by a fresh melee input. P: no-input stops after the preceding slash; input produces the final slash with the same stronger chase. F: an automatic final slash or pressed final slash with no forward pursuit refutes H.
5. H: bird CS consumes native charge readiness but not a numbered weapon ammo shot. P: charge must be rebuilt after firing while the flight weapon's first ammo count is unchanged. F: retained full charge or lost weapon ammo refutes H.
6. H: normal back-special selects `0x20923FB6`, never multi-lock `0x8D3A4411`. P: N/back special share the ordinary action. F: Multi indicator or the multi-lock action refutes H.

## result

- `2.c` and `0.c` were updated for all six requested paths.
- Single-variable legacy compile artifacts were generated under `tmp/msc/20260830-wing-zero-rebellion-2c-fixes/`; the final source states are represented by `step-5-bird-cs-slot5.dscex` and `step-6-normal-back-special.bscex`.
- Source guards passed for both files: AI blocks, symbolic function pointers, reading-contract banner; `2.c` action shape reported zero errors.
- Focused source contracts passed: 6/6 repair-batch tests, 10/10 N-melee tests, and 13/13 flight-special tests.
- `test_rebellion_bird_cs_stage.py` remains a pre-existing stale three-stage contract: before this task the source already had CS1 registration disabled, single-level selector logic, `CDA9F565/566`, and no tick-time `sys_4F(0xA,0)`. The new repair-batch test covers the requested slot-5 behavior without reviving that rejected design.
- Runtime status: E1 only. The six player-visible predicates above still require an in-game OB run.

## 2026-08-30 runtime restart

- User report: none of the six behaviors changed.
- Artifact boundary evidence: target `2.dscex` SHA256 equals the final step-5 output, and target `0.bscex` SHA256 equals the final step-6 output. Redecompilation proves the bytecode contains slot-1 custom sub-shot emission, slot-5 flight emission, `sys_58(0x4)` cleanup, and no active `0x8D3A4411` submission in `0.c`.
- Grade: not six E3- results yet. Six unrelated paths showing zero change while the bytecode differs is an unresolved load/package boundary, so behavior hypotheses cannot be evaluated until loaded-artifact identity is proven.
- H: the game is executing the current target `2.dscex`.
- P: entering N/left/right custom sub-shot plays the temporary one-shot `0x46A7A8A6` SE from `sub_shot_custom_start`.
- F: no added SE means the game is loading another MSC/package; stop changing action logic and locate the installed pack.
