# Timeline (append-only)

## 2026-08-31T21:37:11.5922310+08:00 | lead | init
- action: case-init
- command_or_ref: skills/scripts/case-init.ps1
- result_summary: case directory created; scope pending auth
- artifacts: [scope.md, workitems.md]
- evidence_ids: []
- next: fill scope auth + in_scope; set ready_for_act

## 2026-08-31T21:40:00+08:00 | lead | scope-ready
- action: route and authorize offline static reverse
- command_or_ref: reverse-skill R0 + msc-research-index/unit-messala
- result_summary: scope ready; target sources remain read-only
- artifacts: [scope.md]
- evidence_ids: []
- next: pin artifact identity and trace action families

## 2026-08-31T22:00:00+08:00 | cre | static-analysis
- action: compare current Rebellion and Messala selectors, action quartets, shared lock driver, flight owner, exit and interrupt paths
- command_or_ref: rtk rg; Compare-Object; certutil hashes
- result_summary: shared lock algorithm identified; new Rebellion roll sub is a hybrid and has no E3 runtime evidence
- artifacts: [evidence/E-001.md, evidence/E-002.md, evidence/E-003.md]
- evidence_ids: [E-001, E-002, E-003]
- next: write Evidence/Finding/Path report and hand off H/P/F runtime matrix

## 2026-08-31T22:15:00+08:00 | doc | report
- action: generate reverse engineering report
- command_or_ref: docs-generator reverse report template
- result_summary: report records complete callflow, lifecycle/state ownership, evidence grades, comparison and runtime falsifiers
- artifacts: [report/2026-08-31_reverse-msc-flight-sub-lock-report.md]
- evidence_ids: [E-001, E-002, E-003]
- next: user may run the scoped E3 matrix; no source edit or repack performed

## 2026-08-31T22:25:00+08:00 | cre | 0.c-control-audit
- action: trace 0.c input sampling, shared-field publication, selector, candidate submission, handoff gate and hit fallback
- command_or_ref: current 0.c func_2/4/6/8/9/10/15/79/92/95/143 plus cross-file field 0x7/0x16 reads and writes
- result_summary: 0.c owns entry/input/handoff/fallback; current-lock yaw convergence remains in 2.c func_595/626
- artifacts: [evidence/E-004.md, report/2026-08-31_reverse-msc-flight-sub-lock-report.md]
- evidence_ids: [E-002, E-004]
- next: verify artifact identity remains stable, then hand off E1 findings and E3 matrix

## 2026-08-31T22:30:00+08:00 | cre | concurrent-source-refresh
- action: re-pin and re-read target after user modified both 0.c and 2.c during analysis
- command_or_ref: new MD5/SHA256; selector/action/shared-driver focused reread
- result_summary: all bird 0x80 directions now reach roll actions with metadata (0,0x1,0); 678 now reuses END; shared lock driver remains identical to Messala
- artifacts: [evidence/E-001.md, evidence/E-003.md, evidence/E-004.md, report/2026-08-31_reverse-msc-flight-sub-lock-report.md]
- evidence_ids: [E-001, E-002, E-003, E-004]
- next: final stable-hash check; current selector behavior remains E1 pending in-game

## 2026-08-31T22:35:00+08:00 | cre | second-source-refresh
- action: re-pin 2.c after another concurrent edit and reread only the roll-sub family
- command_or_ref: MD5/SHA256 plus lines around SUB_SHOT_FLIGHT_ROLL_L/R and phase bodies
- result_summary: roll-sub code is unchanged; concurrent edit was outside this family; report identity updated
- artifacts: [evidence/E-001.md, report/2026-08-31_reverse-msc-flight-sub-lock-report.md]
- evidence_ids: [E-001, E-003]
- next: stable-hash gate and handoff

## 2026-08-31T23:25:00+08:00 | cre | repair-stage-1
- action: extend both mirrored roll-sub START aim windows from 0x6 to 0xA
- command_or_ref: 2.c global689 only; legacy tools/msclang.py -i
- result_summary: AI-block and opaque-pointer guards passed; candidate compiled and installed as 2.dscex
- artifacts: [notes/2026-08-31-flight-sub-stage1-hpf.md, ../../tmp/msc-repack/20260831-flight-sub-aim-stage1/2.before.dscex, ../../tmp/msc-repack/20260831-flight-sub-aim-stage1/2.stage1.dscex]
- evidence_ids: [E-001, E-002, E-003, E-004]
- next: user runs the pre-registered rear/side-heading matrix; do not add movement profile until result

## 2026-08-31T23:35:00+08:00 | cre | repair-stage-2
- action: apply TV Wing Zero profile 1 on shared roll START and SHOOT entry
- command_or_ref: func_351(0x1,0x4) only; legacy tools/msclang.py -i
- result_summary: initial nested AI markers were corrected; AI-block guard passed, opaque pointers remained 0 warnings, candidate compiled and installed
- artifacts: [notes/2026-08-31-flight-sub-stage2-hpf.md, ../../tmp/msc-repack/20260831-flight-sub-profile-stage2/2.stage1-before.dscex, ../../tmp/msc-repack/20260831-flight-sub-profile-stage2/2.stage2.dscex]
- evidence_ids: [E-002, E-003, E-004]
- next: user tests held-back translation versus yaw during SHOOT and verifies natural EXIT

## 2026-08-31T23:40:00+08:00 | cre | repair-stage-3
- action: register stage-2 E3- and add SHOOT-only current-target yaw after the bare func_593 tick
- command_or_ref: global184==2 -> func_102(func_626(),0x1f4,2) -> sys_46(0,step); legacy tools/msclang.py -i
- result_summary: registry I9 and catalog updated; AI-block/opaque-pointer/doc/catalog gates passed; candidate compiled and installed
- artifacts: [notes/2026-08-31-flight-sub-stage3-hpf.md, ../../tmp/msc-repack/20260831-flight-sub-shoot-yaw-stage3/2.stage2-before.dscex, ../../tmp/msc-repack/20260831-flight-sub-shoot-yaw-stage3/2.stage3.dscex]
- evidence_ids: [E-002, E-003, E-004]
- next: user holds back through SHOOT and checks translation, target-facing yaw, and END release

## 2026-08-31T23:45:00+08:00 | cre | diagnostic-stage-4
- action: register stage-3 E3- and add one-shot SE probe to first SHOOT tick
- command_or_ref: global184==2 probe latch -> sys_58(0,0x46a7a8a6); legacy tools/msclang.py -i
- result_summary: registry I10/catalog/owner note updated; source/doc/catalog guards passed; diagnostic candidate compiled and installed
- artifacts: [notes/2026-08-31-flight-sub-stage4-hpf.md, ../../tmp/msc-repack/20260831-flight-sub-shoot-probe-stage4/2.stage3-before.dscex, ../../tmp/msc-repack/20260831-flight-sub-shoot-probe-stage4/2.stage4.dscex]
- evidence_ids: [E-002, E-003, E-004]
- next: user reports whether SE 0x46A7A8A6 is audible once per activation

## 2026-08-31T23:50:00+08:00 | cre | i10-reinterpret
- action: continue analysis after Codex usage-limit stop; do not pack another build
- command_or_ref: hambrabi §4.10 reread vs D9/I7, TV ACTION_AB_SUB_ALT_2/3, Hambrabi func_1083, current 2.c/2.dscex MD5
- result_summary: installed artifact is still stage-4 (2.c 4EE55F49..., 2.dscex 21D61945...); I10 is D9-class unless the SE is silent; Hambrabi and Messala also do not live-lock during SHOOT
- artifacts: [docs/msc-research/hambrabi-flight-sub-side-roll-shot.md]
- evidence_ids: [E-002, E-003]
- next: user runs WI-007; audible = analog heading owner; silent = phase/artifact

## 2026-08-31T23:55:00+08:00 | cre | repair-stage-5
- action: user rejected SE; drop probe and I10 yaw; SHOOT-only func_296(0x3e8,0) with END restore
- command_or_ref: 677 sys_1(0x30001,0); 679 sys_1(0x30001,1); legacy tools/msclang.py -i
- result_summary: AI-block/opaque-pointer/action-shape passed; candidate compiled and installed as 2.dscex E05A96EB...
- artifacts: [notes/2026-08-31-flight-sub-stage5-hpf.md]
- evidence_ids: [E-002, E-003, E-004]
- next: user holds stick during SHOOT and reports lock facing, drop, END flight

## 2026-09-01T00:06:00+08:00 | cre | repair-stage-6
- action: register I11; move func_296(0x3e8,0) from 677 ENTER to every 677 tick
- command_or_ref: same motor-off, longer duration; 679 restore unchanged; legacy msclang.py -i
- result_summary: I11 registered; candidate compiled and installed as 2.dscex 70594770...
- artifacts: [notes/2026-08-31-flight-sub-stage6-hpf.md]
- evidence_ids: [E-002, E-003, E-004]
- next: user holds stick through SHOOT; lock facing vs drop vs END flight
