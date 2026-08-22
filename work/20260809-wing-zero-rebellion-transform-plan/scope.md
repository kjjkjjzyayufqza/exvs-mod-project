# Case Scope

## meta
- case_id: 20260809-wing-zero-rebellion-transform-plan
- created: 2026-08-09T00:00:00+08:00
- operator: local
- project_root: E:\TAURI_PROJECT
- primary_skill: reverse-engineering/SKILL.md
- primary_id: R0
- lead_role: lead
- specialist_roles: [cre, doc]
- hint: Plan an offline resource and MSC migration that gives Wing Gundam Zero Rebellion the complete 28001001 transformation feature set.

## auth
- status: granted
- basis: own_system
- evidence_of_auth: user-provided local mod paths and explicit request in this thread
- MUST NOT proceed if status != granted

## in_scope
- assets:
  - E:\XB\mod\002chara\wing_gundam_zero_rebellion_model
  - E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\0.c
  - E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\0.bscex
  - E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c
  - E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.dscex
  - E:\XB\mod\041cpm\wing_gundam_zero_rebellion_param\armsparam.bin
  - E:\TAURI_PROJECT
  - reference unit 28001001 resources already unpacked or later organized by the user
  - target unit tentatively identified by the user as 900000004, pending filename evidence
- surfaces: [local_files, decompiled_msc, unpacked_motion, unpacked_model_resources, documentation]
- activities: [read_only_inventory, static_text_analysis, resource_dependency_mapping, plan_authoring, msc_source_edit, local_msc_compile, target_msc_repack, local_static_verification]

## out_of_scope
- assets: [network_targets, third_party_services]
- activities: [fhm2d_unpacking, unrelated_source_asset_overwrite, binary_patch, game_installation, in_game_test, network_access]

## network_profile
- mode: offline
- notes: |
    Local inspection, the user-requested target MSC source edit, local compile
    output under E:\TAURI_PROJECT\tmp, and repacking the named target 0.bscex /
    2.dscex are authorized. No game installation or network access is authorized.

## deliverables
- report: true
- field_journal: false
- diagrams: true
- timeline: true

## constraints
- timebox: {}
- stealth: low
- data_handling: no_user_pii
- user_boundary: Do not unpack FHM2D or install generated MSC into the game; edit/repack only the named target MSC source/binaries and keep recovery/compile artifacts under tmp/.

## signoff
- ready_for_act: true
- checklist:
  - [x] auth.status = granted
  - [x] in_scope.assets non-empty OR offline sample path set
  - [x] network_profile.mode chosen
  - [x] out_of_scope reviewed
  - [x] roles assigned

