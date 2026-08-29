# Timeline (append-only)

## 2026-08-29T14:28:24.4383743+08:00 | lead | init
- action: case-init
- command_or_ref: skills/scripts/case-init.ps1
- result_summary: case directory created; scope pending auth
- artifacts: [scope.md, workitems.md]
- evidence_ids: []
- next: run MSC catalog match before reading target source

## 2026-08-29T02:00:00+08:00 | lead | scope-signoff
- action: review offline analysis scope
- command_or_ref: scope.md
- result_summary: auth granted; cre assigned; source edits, compile, repack, network, and later-than-OB research excluded; ready_for_act=true
- artifacts: [scope.md, workitems.md]
- evidence_ids: []
- next: route MSC owner notes and record runtime observations

## 2026-08-29T02:35:00+08:00 | cre | static-analysis-complete
- action: trace current target, Messala reference, and target bird-CS effect lifecycle
- command_or_ref: report/report.md
- result_summary: turn latency is the 10f native aim window; exit latency is the ~60f SHOOT timer rather than immediate 679; existing target CS effect helper is reusable with complete cleanup
- artifacts: [evidence/E-001.md, evidence/E-002.md, evidence/E-003.md, report/report.md]
- evidence_ids: [E-001, E-002, E-003, E-004]
- next: user chooses whether to implement staged aim, timing, and effect builds

## 2026-08-29T02:50:00+08:00 | cre | source-edit-authorized
- action: implement the three approved flight-special UX changes
- command_or_ref: E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c
- result_summary: global689=3; START=10f; SHOOT=40f; existing bird-CS charge FX starts after prop/body mount and clears on shoot/no-ammo/end; continuous flight owner and immediate 679 preserved
- artifacts: [report/report.md]
- evidence_ids: [E-001, E-002, E-003]
- next: none in this turn; user explicitly requested no verification or repack

## 2026-08-29T03:10:00+08:00 | cre | runtime-e3-negative
- action: diagnose held-direction START yaw drift and implement the scoped tail writer
- command_or_ref: D11; messala-flight-sub-shot-flow.md runtime refinement
- result_summary: func_595 was not the last yaw writer; START now applies the TV lock step after func_167 and the target clamp, while SHOOT/679 remain untouched
- artifacts: [report/report.md]
- evidence_ids: [E-001, E-002, E-003]
- next: no checker, compile, or repack per the user's standing instruction

## 2026-08-29T07:05:00+08:00 | cre | rollback-literal-messala-tick
- action: restore target clamp after reproducing registered I1
- command_or_ref: E-011 and registry I1
- result_summary: Rebellion translation/pose clamp restored after func_167; 679 remains excluded; no other behavior changed
- artifacts: [evidence/E-011.md, report/report.md]
- evidence_ids: [E-011]
- next: stop aim experiments until visual/resource evidence separates the remaining transient

## 2026-08-29T06:45:00+08:00 | cre | literal-messala-control-tick
- action: replace mixed target tick with literal Messala func_970 body
- command_or_ref: E-010 and Messala 2.c func_970
- result_summary: tick is now only func_593 then func_167; target clamp and all experimental direction/yaw adapters are absent
- artifacts: [evidence/E-010.md, report/report.md]
- evidence_ids: [E-010]
- next: no checker, compile, or repack per the user's standing instruction

## 2026-08-29T06:15:00+08:00 | cre | align-aim-window-with-messala
- action: restore Messala global689 0xa and remove all experimental direction overrides
- command_or_ref: Messala ACTION_AB_SUB_LOCK_SWITCH versus target 10f START
- result_summary: native aim ownership now spans the complete START; target timing, FX, clamp, projectile, form, and EXIT remain unchanged
- artifacts: [evidence/E-009.md, report/report.md]
- evidence_ids: [E-009]
- next: no checker, compile, or repack per the user's standing instruction

## 2026-08-29T05:35:00+08:00 | cre | stop-blind-yaw-edits
- action: revert ineffective 0.c/2.c direction masks and require visual discrimination
- command_or_ref: D15; E-008
- result_summary: five source-side input/yaw hypotheses had no effect; only timing and charge-FX improvements remain; next edit requires a short capture
- artifacts: [evidence/E-008.md, report/report.md]
- evidence_ids: [E-004, E-005, E-006, E-007, E-008]
- next: user supplies a short video showing held input, entry transient, START, and SHOOT; no checker, compile, or repack

## 2026-08-29T05:55:00+08:00 | cre | force-neutral-shared-start-input
- action: neutralize shared field 0x7 and local global87 on every ENTER/START tick
- command_or_ref: explicit user request to cancel the direction-facing frame
- result_summary: 0x3c direction bits are removed continuously through 676 START; neutral 0x2 and all non-direction buttons remain; override stops at SHOOT
- artifacts: [report/report.md]
- evidence_ids: [E-008]
- next: no checker, compile, or repack per the user's standing instruction

## 2026-08-29T05:05:00+08:00 | cre | neutralize-upstream-commit-direction
- action: republish 0.c shared field 0x7 without direction before bird-special func_95
- command_or_ref: input-0c boundary and D14
- result_summary: commit frame now receives all held buttons with direction 0x3c cleared and neutral 0x2 set; 2.c START mask remains for later frames
- artifacts: [evidence/E-007.md, report/report.md]
- evidence_ids: [E-007]
- next: no checker, compile, or repack per the user's standing instruction

## 2026-08-29T04:05:00+08:00 | cre | third-runtime-e3-negative
- action: remove ineffective global47 candidate and stop source-side stacking
- command_or_ref: D13; messala-flight-sub-shot-flow.md runtime falsification
- result_summary: global47 0x40 had no observable effect; global73 has no action-local writer; next step is artifact identity through existing charge-FX and 10f/40f markers
- artifacts: [evidence/E-006.md, report/report.md]
- evidence_ids: [E-005, E-006]
- next: ask whether charge FX and shortened timing are visible in game; no checker, compile, or repack

## 2026-08-29T04:20:00+08:00 | cre | start-analog-bit-probe
- action: add one-shot SE and START-only global24 0x4000 isolation
- command_or_ref: messala-flight-sub-shot-flow.md diagnostic candidate
- result_summary: probe changes one state only; SHOOT reasserts flight through the existing continuous owner; motor/profile/679 untouched
- artifacts: [report/report.md]
- evidence_ids: [E-006]
- next: user repacks and reports whether SE fired and whether START drift remained; no local checker, compile, or repack

## 2026-08-29T04:45:00+08:00 | cre | cancel-start-direction-snapshot
- action: remove 0x4000 probe and mask the pinned global87 0x3c direction owner
- command_or_ref: target func_455 and engine-field-0x7 refresh chain
- result_summary: direction bits clear at ACTION ENTER and each 676 START tick before func_593; special/SHOOT bits and all lifecycle owners remain intact
- artifacts: [report/report.md]
- evidence_ids: [E-006]
- next: no checker, compile, or repack per the user's standing instruction

## 2026-08-29T03:40:00+08:00 | cre | second-runtime-e3-negative
- action: remove ineffective START-tail yaw and isolate Bird-CS input-lock candidate
- command_or_ref: D12; messala-flight-sub-shot-flow.md runtime falsification
- result_summary: direct yaw had no observable effect; special tick now mirrors Bird CS with global47 0x40 after movement ownership and contains no extra yaw helper
- artifacts: [evidence/E-005.md, report/report.md]
- evidence_ids: [E-004, E-005]
- next: no checker, compile, or repack per the user's standing instruction
