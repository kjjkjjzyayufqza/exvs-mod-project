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
  - the task-specific Markdown specification in the same unit workspace
- surfaces: [msc_source]
- activities: [static_reverse, source_edit, static_validation]

## out_of_scope
- assets: []
- activities: [network_access, binary_repack, release_build, in_game_test]

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
