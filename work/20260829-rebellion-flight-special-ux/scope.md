# Case Scope

## meta
- case_id: 20260829-rebellion-flight-special-ux
- created: 2026-08-29T14:28:24.4383743+08:00
- operator: local
- project_root: E:\TAURI_PROJECT
- primary_skill: reverse-engineering/SKILL.md
- primary_id: R0
- lead_role: lead
- specialist_roles: [cre]
- hint: Analyze Rebellion flight special turn speed exit latency and missing CS charge effect

## auth
- status: granted
- basis: own_system
- evidence_of_auth: User supplied local target and runtime observations
- MUST NOT proceed if status != granted

## in_scope
- assets:
  - E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c
  - E:/XB/mod/040msc/002zgundm_003mesala_001/2.c
  - E:/XB/mod/003motion/wing_gundam_zero_rebellion_motion
  - E:/XB/mod/006effect (read-only target effect evidence)
- surfaces: [msc_decompiled_source, motion_structure, effect_structure]
- activities: [offline_reverse, lifecycle_compare, runtime_evidence_grade, report]

## out_of_scope
- assets: []
- activities: [source_edit, compile, repack, network_access, later_than_ob_research, dos, phishing_real_users, unrestricted_exfil]

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
