# Case Scope

## meta
- case_id: 20260828-wing-zero-rebellion-flight-cs
- created: 2026-08-28T00:00:00+08:00
- operator: local
- primary_skill: reverse-engineering
- lead_role: lead
- specialist_roles: [cre]

## auth
- status: granted
- basis: own_system
- evidence_of_auth: user supplied the local target path in this conversation

## in_scope
- assets:
  - E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c
  - E:/TAURI_PROJECT/docs/msc-research
  - E:/TAURI_PROJECT/docs/agent-sessions
- surfaces: [msc-source, local-documentation]
- activities: [static-reverse, evidence-correlation, report]

## out_of_scope
- assets: [game-process, packaged-msc, unrelated-unit-assets]
- activities: [source-modification, compile, repack, runtime-injection, in-game-test]

## network_profile
- mode: offline
- notes: Local static analysis only.

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
  - [x] offline sample path set
  - [x] network_profile.mode chosen
  - [x] out_of_scope reviewed
