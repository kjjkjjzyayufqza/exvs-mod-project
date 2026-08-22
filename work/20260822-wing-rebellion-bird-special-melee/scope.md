# Case Scope

## meta
- case_id: 20260822-wing-rebellion-bird-special-melee
- created: 2026-08-22T00:00:00+08:00
- operator: local
- primary_skill: reverse-engineering
- lead_role: lead
- specialist_roles: [cre]

## auth
- status: granted
- basis: own_system
- evidence_of_auth: owner-operated local EXVS2 mod workspace

## in_scope
- assets:
  - E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\0.c
  - E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c
  - E:\XB\mod\003motion\wing_gundam_zero_rebellion_motion_structure.json
  - E:\XB\mod\041cpm\wing_gundam_zero_rebellion_param\armsparam.bin
  - E:\TAURI_PROJECT\tmp\exvs2-json\20260822-wing-rebellion-flight-arms\armsparam.sorted-fixed.bin
- surfaces: [msc, motion]
- activities: [reverse, scoped_source_edit, scoped_binary_install, documentation]

## out_of_scope
- assets: [source TV Wing Zero assets, unrelated unit assets]
- activities: [network_access, fhm2d_unpack, binary_repack, game_runtime_test]

## network_profile
- mode: offline
- notes: Local static analysis and source editing only.

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
