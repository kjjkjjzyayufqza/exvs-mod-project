# Case Scope

## meta
- case_id: 20260822-wing-rebellion-flight-armsparam
- created: 2026-08-22T00:00:00+08:00
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
  - E:\XB\mod\041cpm\wing_gundam_zero_rebellion_param\armsparam.bin
  - E:\XB\mod\041cpm\wing_gundam_zero_rebellion_param\armsparam - 副本.bin
  - E:\XB\mod\041cpm\028gunwtv_001gunwtv_001\armsparam.bin
  - E:\XB\解包\com\file\041cpm\0x5556A52B\armsparam.bin
  - https://w.atwiki.jp/exvs2ob/
- surfaces: [param-binary, local-source, public-wiki]
- activities: [inspect, backup, reverse, patch, report]

## out_of_scope
- assets: [other Param files, MSC files, FHM2D resources]
- activities: [compile, repack, deploy, binary unpack]

## network_profile
- mode: authorized_target_only
- notes: Read-only wiki lookup; all binary work is local.

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
