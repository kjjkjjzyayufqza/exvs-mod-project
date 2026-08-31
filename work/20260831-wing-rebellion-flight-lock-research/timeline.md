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
