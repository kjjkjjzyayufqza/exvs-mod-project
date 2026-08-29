# Case Scope

## meta
- case_id: 20260829-ew-zero-normal-sub-shot
- created: 2026-08-29T12:13:40.5986516+08:00
- operator: local
- project_root: E:\TAURI_PROJECT
- primary_skill: reverse-engineering/SKILL.md
- primary_id: R0
- lead_role: lead
- specialist_roles: [cre]
- hint: Compare vanilla EW Zero 2.c normal front/back sub-shot and port to Rebellion

## auth
- status: granted
- basis: own_system
- evidence_of_auth: User supplied local target path
- MUST NOT proceed if status != granted

## in_scope
- assets:
  - E:/XB (read-only vanilla 2.c discovery; OB or earlier only)
  - E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c (scoped edit)
- surfaces: [msc_decompiled_source]
- activities: [offline_reverse, source_compare, scoped_edit, static_verify]

## out_of_scope
- assets: []
- activities: [network_access, later_than_ob_research, modify_vanilla_source, unrelated_asset_changes, dos, phishing_real_users, unrestricted_exfil]

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
