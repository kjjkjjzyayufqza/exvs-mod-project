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

## 2026-08-29T07:30:00+08:00 | cre | tv-same-hash-start-yaw
- action: combine Messala lifecycle, Rebellion clamp, and TV Zero same-hash target yaw
- command_or_ref: TV 028gunwtv 2.c 0xd94d608f func_1042
- result_summary: START tail now uses validated global39 target index and sys_0(0x40000,0x3,global39) through the exact TV 0x1f4/mode-2 writer; SHOOT/679 untouched
- artifacts: [report/report.md]
- evidence_ids: [E-011]
- next: user runtime H/P/F; no checker, compile, or repack per standing instruction

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

## 2026-08-29T16:10:00+08:00 | cre | footstop-prerequisite-restored
- action: diagnose the remaining START/cancel heading drift and implement the full foot-stop adapter
- command_or_ref: msc-falsified-negatives-registry D9; wing-zero-rebellion-flight-special-footstop-handbook-audit.md
- result_summary: the clamp only cleared translation, so global24 0x4000 (re-armed by the tick) and the flight motor (re-enabled by func_594) owned heading for the whole action and 679 had no clamp at all; clamp now drops 0x4000 and the motor, runs on an ownership latch through 679, and releases flight bit/motor/analog profile on the frame 679 resolves; func_41 covers abnormal exits
- artifacts: [E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c, docs/msc-research/messala-flight-sub-shot-flow.md, tools/tests/test_rebellion_flight_special_messala_flow.py]
- evidence_ids: [E-011]
- next: user runtime H/P/F; no repack requested this turn

## 2026-08-29T17:05:00+08:00 | cre | separate-motor-from-flight-bit
- action: split the two foot-stop clears after the runtime report "can move while beam-aiming"
- command_or_ref: registered failure I1; runtime E3 on the previous build
- result_summary: func_296(0x3e8, 0) is the correct owner and is kept (aim ownership now works); func_169(0x4000) is removed because the translation clears are calibrated against the flight movement model and dropping the bit makes the whole clamp a no-op
- artifacts: [E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c, docs/msc-research/messala-flight-sub-shot-flow.md, tools/tests/test_rebellion_flight_special_messala_flow.py]
- evidence_ids: [E-011]
- next: user runtime H/P/F on stop plus heading together

## 2026-08-29T18:20:00+08:00 | cre | restore-phase-gate-and-full-stop
- action: fix the clamp gate regression and widen both the stop set and the yaw window
- command_or_ref: runtime report "can move and re-aim through the whole beam"; func_44/func_56/func_73 stop primitives
- result_summary: symptom widened from entry/cancel to the whole action, which means the clamp stopped running; single owner_released latch replaced by phase gate plus end_hold; clamp now runs the engine's own stop set (sys_46(0x8), func_113, channels 1/2/3/4); lock-facing writer moved from START-only to every clamped frame; func_41 restore gated on motor_stopped so it cannot fire before the clamp
- artifacts: [E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c, docs/msc-research/messala-flight-sub-shot-flow.md, tools/tests/test_rebellion_flight_special_messala_flow.py]
- evidence_ids: [E-011]
- next: user runtime H/P/F on stop plus stick-inert heading through the whole beam

## 2026-08-29T19:00:00+08:00 | cre | pacing-25f-windup-and-follow-through
- action: retime the lifecycle for readable weapon pacing
- command_or_ref: user runtime feel report "too fast, needs a charge tell and a follow-through"
- result_summary: START 0xa -> 0x19 (25f visible group-7 muzzle charge before any emission), SHOOT unchanged at 0x28 (40f), END 0x5 -> 0x19 (25f held follow-through); global689 stays 0xa so turn-to-lock speed is unchanged and simply finishes early inside the longer START; foot-stop and per-frame lock writer stay live across all three phases
- artifacts: [E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c, tools/tests/test_rebellion_flight_special_messala_flow.py]
- evidence_ids: [E-011]
- next: user runtime feel check on the 25/40/25 split

## 2026-08-29T20:05:00+08:00 | cre | split-motor-lifetime-from-clamp-lifetime
- action: fix the fake-bird EXIT regression introduced by the motor drop
- command_or_ref: runtime report "falls under gravity after the shot, keeps bird visuals, cannot fly"; 2026-08-27 EXIT bug record
- result_summary: single-variable attribution to func_296(0x3e8, 0) held until the resolving frame; native resolver read a motor-down flight state and picked air idle 0xf5f21169 over flight loop 0x77b100ff (native class index 0x18); motor drop split out of the clamp into rebellion_flight_special_stop_flight_motor and now runs on windup/beam only, while the 679 hold runs restore_flight_motor + clamp + lock writer every frame and restores the analog profile once on its first frame
- artifacts: [E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c, docs/msc-research/messala-flight-sub-shot-flow.md, tools/tests/test_rebellion_flight_special_messala_flow.py]
- evidence_ids: [E-011]
- next: user runtime H/P/F - stop and lock unchanged, and flight continues after the shot

## 2026-08-29T20:40:00+08:00 | cre | close-the-idle-landing-trap
- action: remove the remaining dependency on the native resolver picking flight
- command_or_ref: func_412 / func_390 decompiled bodies; 0.c:606 native class index 0x18
- result_summary: both idle hashes wipe global24 0x4000/0x1000000 and the motor, and both the 0.c bird input branch and the native flight loop are selected from that same state, so the old "keep the latch until analog commits" was an unrecoverable trap rather than a wait; func_41 now re-arms flight bit and motor while the keep-form latch is set and the current hash is 0xf5f21169 or 0x6d00aeaa, state only, self-terminating when 0x77b100ff commits
- artifacts: [E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c, docs/msc-research/messala-flight-sub-shot-flow.md, tools/tests/test_rebellion_flight_special_messala_flow.py]
- evidence_ids: [E-011]
- next: user runtime H/P/F; this is the last source-side gap I can close without a run

## 2026-08-29T21:15:00+08:00 | cre | align-exit-quartet-with-the-working-bird-action
- action: replace the Messala EXIT parameters with ACTION_A_SHOT_BIRD's
- command_or_ref: 2.c:2842 sys_1(0x10000,0,0x16,global65) vs 0.c:279 global33 = sys_0(0x10000,0,0x16); 0.c selector gate
- result_summary: rebellion_bird_main_shot_tick is only func_593() yet keeps flying, which disproves per-tick func_167 as the reason flight resumes; the real difference is global698 0 vs 0x14, which becomes engine field 0x16 and is read back by 0.c as global33 - while >= 0x64 the selector refuses to commit, so Messala's 0 gave the native flight loop no window and control returned on the resolving frame; global698 now 0x14 and global452/453/454 now 0/0/0 to match, which also stops the native func_300 ramp fighting the clamp
- artifacts: [E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c, docs/msc-research/messala-flight-sub-shot-flow.md, tools/tests/test_rebellion_flight_special_messala_flow.py]
- evidence_ids: [E-011]
- next: user runtime H/P/F; global698 0x14 is the tuning lever if the post-shot lock feels long

## 2026-08-29T22:00:00+08:00 | cre | rule-out-two-candidates-and-close-the-state-machine
- action: exclude the remaining EXIT candidates by source and verify the handoff frame and flag lifecycles
- command_or_ref: func_66/func_97/func_25 ordering; func_145 body; end_hold/motor_stopped enumeration
- result_summary: func_93 does not enter the next action in the same tick (func_66 only sets global13, func_97 is a motion blend-out, global13 is cleared in the next frame's func_25), so the tick's func_167(0x1004000) cannot stomp a new action and is excluded; func_145 only walks shell slots via func_318 so global689/func_595 is excluded; the resolving tick was traced to carry flight bit set, motor on, profile 2 and no clamp, matching ACTION_A_SHOT_BIRD's handoff state; func_41 now clears end_hold unconditionally so an interrupt during the recovery hold cannot strand it
- artifacts: [E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c, work/20260829-rebellion-flight-special-ux/report/report.md, tools/tests/test_rebellion_flight_special_messala_flow.py]
- evidence_ids: [E-011]
- next: user runtime; only remaining unknown is whether the engine requires the motor to have been continuously on

## 2026-08-29T22:45:00+08:00 | cre | remove-the-motor-drop-entirely
- action: re-read all four runtime reports and drop the motor manipulation rather than merely restoring it early
- command_or_ref: 2026-08-28 build (no motor touch) stopped AND exited correctly; the motor-drop build with a disabled clamp still allowed movement
- result_summary: sys_1(0x30001) was never shown to contribute to stop or heading in any run - the clamp and the per-frame lock writer are what fixed both - and it was the only remaining difference from ACTION_A_SHOT_BIRD, so it is removed; stop_flight_motor/restore_flight_motor deleted, motor_stopped replaced by profile_swapped which now guards only the analog-profile restore, tick collapses back to one gate, idle re-arm in func_41 inlined as state-only func_167 + func_296(0x3e8,0x1)
- artifacts: [E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c, tools/tests/test_rebellion_flight_special_messala_flow.py]
- evidence_ids: [E-011]
- next: user runtime; if heading regresses during the beam the motor drop is vindicated and goes back in windup/beam only
