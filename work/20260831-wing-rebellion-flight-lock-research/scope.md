# Case Scope

## meta
- case_id: 20260831-wing-rebellion-flight-lock-research
- created: 2026-08-31T21:37:11.5922310+08:00
- operator: local
- project_root: E:\TAURI_PROJECT
- primary_skill: reverse-engineering/SKILL.md
- primary_id: R0
- lead_role: lead
- specialist_roles: [cre]
- hint: local game MSC bytecode static reverse engineering: Wing Zero Rebellion flight lock-on versus Messala flight SUB_SHOT

## auth
- status: granted
- basis: own_system
- evidence_of_auth: User explicitly requested analysis of local mod source files
- MUST NOT proceed if status != granted

## in_scope
- assets:
  - E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c
  - E:\XB\mod\040msc (Messala candidate filename lookup and matched 2.c only)
- surfaces: [decompiled_msc_source]
- activities: [static_reverse, source_comparison, report]

## out_of_scope
- assets: [post_OB_revisions, unrelated_units, game_executables]
- activities: [binary_patching, repack, runtime_execution, network_access, dos, phishing_real_users, unrestricted_exfil]

## network_profile
- mode: offline
- notes: |
    offline | lab_only | authorized_target_only | unrestricted_lab
    Change mode only after auth.status = granted.

## deliverables
- report: true
- field_journal: true
- diagrams: true
- timeline: true

## constraints
- timebox: {}
- stealth: low
- data_handling: anonymize

## signoff
- ready_for_act: true
- checklist:
  - [x] auth.status = granted
  - [x] in_scope.assets non-empty OR offline sample path set
  - [x] network_profile.mode chosen
  - [x] out_of_scope reviewed
  - [x] roles assigned (see skills/ops/role-map.md)

## ops_refs
- skills/ops/scope-contract.md
- skills/ops/evidence-finding-path.md
- skills/ops/role-map.md
- skills/ops/timeline-workitem.md
- skills/ops/IDENTITY.md
