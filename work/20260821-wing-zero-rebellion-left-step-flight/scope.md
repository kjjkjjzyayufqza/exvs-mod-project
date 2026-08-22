# Case Scope

## meta
- case_id: 20260821-wing-zero-rebellion-left-step-flight
- created: 2026-08-21T00:00:00+08:00
- operator: local
- primary_skill: reverse-engineering
- lead_role: lead
- specialist_roles: [cre]

## auth
- status: granted
- basis: own_system
- evidence_of_auth: user-provided local mod workspace

## in_scope
- assets:
  - E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\0.c
  - E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c
  - E:\XB\解包\com\file\040msc\0x04AD9F33\0.c
  - E:\XB\解包\com\file\040msc\0x04AD9F33\2.c
- surfaces: [msc-source]
- activities: [reverse, patch, report]

## out_of_scope
- assets: [FHM2D resources, network targets]
- activities: [binary execution, compile, repack, deploy]

## network_profile
- mode: offline
- notes: Static local-source analysis only.

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
