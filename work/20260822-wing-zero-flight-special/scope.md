# Case Scope

## meta
- case_id: 20260822-wing-zero-flight-special
- created: 2026-08-22T00:00:00+08:00
- operator: local
- primary_skill: reverse-engineering
- lead_role: lead
- specialist_roles: [cre]

## auth
- status: granted
- basis: own_system
- evidence_of_auth: user explicitly requested edits to the named local MSC source

## in_scope
- assets:
  - E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\0.c
  - E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c
  - E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.dscex
  - the task-specific Markdown specification in the same unit workspace
- surfaces: [msc_source]
- activities: [static_reverse, source_edit, static_validation, binary_repack]

## out_of_scope
- assets: []
- activities: [network_access, release_build, in_game_test]

## network_profile
- mode: offline
- notes: Local source and documentation analysis only.

## deliverables
- report: true
- field_journal: false
- diagrams: false
- timeline: false

## constraints
- timebox: {}
- stealth: low
- data_handling: no_user_pii
- preserve_original_assets: true
- compile_only_when_explicitly_authorized: true

## signoff
- ready_for_act: true
- checklist:
  - [x] auth.status = granted
  - [x] offline sample path set
  - [x] network_profile.mode chosen
  - [x] out_of_scope reviewed

## 2026-08-29 flight-special projectile pair revision

H: Replacing only the two `SPECIAL_SHOT_FLIGHT` SHOOT emissions with the
current-target paired rows makes flight special use the requested right/left
beam pair without changing action timing or flight ownership.

P: `0xd94d608f` still enters the same quartet; SHOOT emits
`sys_4F(0, global681, 0xCDA9F565)` followed by
`sys_4F(0, 0x5, 0xCDA9F566)` once; START, no-ammo, END, form preservation,
continuous-flight tick, interrupt teardown, and respawn behavior stay unchanged.

F: Seeing the old `CDA9F55A/B` pair, only one beam, an incorrect muzzle, or any
new flight/timing/recovery regression falsifies the hypothesis.

Lifecycle audit: ENTER selector/registry and START are preserved; ACTIVE changes
only the guarded SHOOT emission pair; natural EXIT, no-ammo, INTERRUPT, and
RESPAWN/REINITIALIZE paths are preserved. State ownership remains with the
existing quartet, `global681 = 0x2`, `func_593(); func_167(0x1004000);` tick,
keep-form allowlist, and FORCED_RECOVERY teardown. Both bulletparam rows exist
in the current target. Rollback boundary is the pre-repack `2.dscex` backup plus
the two source emission lines.
