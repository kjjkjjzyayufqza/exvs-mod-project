# Timeline (append-only)

## 2026-08-09T00:00:00+08:00 | lead | init
- action: initialize offline planning case
- command_or_ref: reverse-skill scope contract
- result_summary: scope restricted to read-only inventory and Markdown planning; FHM2D extraction excluded
- artifacts: [scope.md, workitems.md]
- evidence_ids: []
- next: inventory project documentation and existing local resources

## 2026-08-09T00:30:00+08:00 | cre | inventory
- action: identify target, compare current resource trees, and resolve 28001001 package hashes
- command_or_ref: local read-only rg, SHA-256, byte comparison, and ob_unit.json lookup
- result_summary: target is 900000004 built from 16001001 no-transform baseline; common flight code exists but is disconnected; 28001001 extracted packages are absent
- artifacts: [evidence/E-001.md, evidence/E-002.md, evidence/E-003.md]
- evidence_ids: [E-001, E-002, E-003]
- next: author complete dependency-closed migration plan

## 2026-08-09T01:00:00+08:00 | doc | report
- action: write Chinese implementation plan with resource request, Evidence/Finding/Path, phases, risks, and completion gates
- command_or_ref: docs/msc-research/2026-08-09-wing-zero-rebellion-transform-port-plan.md
- result_summary: requested planning deliverable written; no FHM2D extraction or asset mutation performed
- artifacts: [docs/msc-research/2026-08-09-wing-zero-rebellion-transform-port-plan.md]
- evidence_ids: [E-001, E-002, E-003]
- next: wait for user-provided 28001001 unpacked resources before implementation

## 2026-08-09T03:00:00+08:00 | cre | deep-audit
- action: correct source availability, identify exact 28001001 MSC, compare common controllers, and inspect speedparam schemas
- command_or_ref: exact local hash/path inventory, function-level normalized comparison, and exvs2-json inspect
- result_summary: all six source FHM2D archives exist; five resource classes have all manifest files, model is missing 85 assets; target input and func_450..466 already match source semantics; speedparam needs a 69-to-74-field row merge
- artifacts: [evidence/E-004.md, evidence/E-005.md, evidence/E-006.md]
- evidence_ids: [E-004, E-005, E-006]
- next: replace the generic plan with an execution-grade function/resource specification

## 2026-08-09T04:00:00+08:00 | doc | deep-report
- action: rewrite the plan around the proven minimal MSC graft, state machine, cross-schema Param merge, resource ownership, diagnostics, and diff budget
- command_or_ref: docs/msc-research/2026-08-09-wing-zero-rebellion-transform-port-plan.md
- result_summary: v2 deep execution plan written; no FHM2D extraction or game-asset mutation performed
- artifacts: [docs/msc-research/2026-08-09-wing-zero-rebellion-transform-port-plan.md]
- evidence_ids: [E-001, E-002, E-004, E-005, E-006]
- next: user supplies same-build modern FHM2D extraction, especially model and structure trees

## 2026-08-09T05:00:00+08:00 | cre | canonical-name-correction
- action: discard legacy hash-path availability inference and inventory the already-unpacked source by canonical resource names
- command_or_ref: exact-name search for 028gunwtv_001gunwtv_001 and se_chr_028gunwtv_001gunwtv_001, modern structure parsing, SHL LE record parsing, and NUSKTB inspection
- result_summary: all six source resource classes are present; model has 94 files and 8 groups, motion has 474 direct files, effect has 39 files; transform slots resolve to three direct named body_tf NUANMB items; Bird model closure is body_tf plus brifle00a/brifle00b/shield, not the standalone wing
- artifacts: [evidence/E-007.md, evidence/E-008.md, docs/msc-research/2026-08-09-wing-zero-rebellion-transform-port-plan.md]
- evidence_ids: [E-007, E-008]
- next: implementation can begin from the named source paths after target before-manifest capture; no unpacking prerequisite remains

## 2026-08-22T00:00:00+08:00 | lead | scope-expansion
- action: authorize the requested main-shot charge inheritance, single-ammo double shot, and bird-origin melee pursuit implementation
- command_or_ref: explicit user request to continue full implementation
- result_summary: target 2.c edits and local tmp compile are in scope; 0.c input mapping, Param bytes, game installation, and in-game testing remain unchanged or out of scope
- artifacts: [scope.md, workitems.md]
- evidence_ids: []
- next: capture before evidence and run failing static behavior tests

## 2026-08-22T15:10:00+08:00 | cre | shared-charge-and-melee-implementation
- action: implement paired main-shot state adapters, single-ammo bird double shot, and bird-origin air pursuit
- command_or_ref: TV func_1077/1078, Delta Plus func_1012, target func_933/935/937, MSC staged gates
- result_summary: source behavior tests pass; AI blocks and opaque pointers pass; target 2.c compiles to a 250640-byte mscsb; current Param rows and action registry are valid
- artifacts: [evidence/E-009.md, tmp/msc/20260822-wing-rebellion-shared-charge-melee/2.mscsb]
- evidence_ids: [E-009]
- next: install/repack only under user workflow, then run the scoped in-game transition matrix

## 2026-08-22T16:00:00+08:00 | cre | melee-regression-and-flight-charge
- action: replace the failed func_502 melee design and wire bird CSA/CSB
- command_or_ref: user runtime failure, target func_113/143, target grapparam, TV/Delta func_489, normal Zero System chain
- result_summary: melee restores func_489 with its original row; CSA aliases bird main under 0x2194F05D and preserves form; CSB submits normal 0x616971CE after forced teardown; all static/resource/compile gates pass
- artifacts: [evidence/E-010.md, tmp/msc/20260822-wing-rebellion-flight-charge-melee-fix/0.mscsb, tmp/msc/20260822-wing-rebellion-flight-charge-melee-fix/2.mscsb]
- evidence_ids: [E-010]
- next: run the scoped in-game matrix and record actual CSA/CSB/melee behavior

## 2026-08-22T16:30:00+08:00 | cre | bird-melee-no-fall-runtime-confirmed
- action: record final runtime result for the bird-origin 0x928CA34F gravity regression
- command_or_ref: user in-game confirmation after compile/repack
- result_summary: preserving air hold across teardown while restoring func_489 fixes the falling behavior; the earlier func_502 and one-shot sys_46(0x5) design remains explicitly superseded
- artifacts: [docs/msc-research/wing-zero-rebellion-bird-melee-n-followup.md, evidence/E-010.md]
- evidence_ids: [E-010]
- next: keep CSA/CSB and remaining interrupt/respawn cases as separate runtime gates

## 2026-08-22T17:00:00+08:00 | cre | git-failure-history-reconstruction
- action: reconstruct the complete bird-melee change/failure sequence from the MSC Git repository
- command_or_ref: git log --follow and commit/working-tree diffs for target 0.c/2.c
- result_summary: 760f14a complex hold-air attempt was fully reverted by 4a90ac1; e9239b5 handled a separate bird-special path; the later func_502 failure is preserved by an exact before snapshot; current working tree is the user-confirmed no-fall solution
- artifacts: [docs/msc-research/wing-zero-rebellion-bird-melee-n-followup.md, evidence/E-010.md]
- evidence_ids: [E-010]
- next: commit the successful MSC working tree only when the user explicitly requests it

## 2026-08-22T18:00:00+08:00 | cre | charge-ammo-csa-csb-correction
- action: separate normal/bird ammo inheritance, make bird CSA a complete bird-main selector clone, and reset body rotation before bird-origin Zero System
- command_or_ref: Delta Plus func_1037/1038 mode-4 adapter, TV 0.c 0x2194F05D selector, target func_104/107 rotation ownership
- result_summary: mode-4 replaces the raw-ammo-copying adapter; CSA uses `(0,1,0)`; only bird-to-0x616971CE clears both body rotation layers; staged static and compile gates pass
- artifacts: [evidence/E-011.md, tmp/msc/20260822-wing-rebellion-csb-csa-ammo-fix/0.mscsb, tmp/msc/20260822-wing-rebellion-csb-csa-ammo-fix/2.mscsb]
- evidence_ids: [E-011]
- next: user repacks under their workflow and runs the scoped normal↔bird ammo/charge plus CSA/CSB in-game matrix

## 2026-08-22T18:20:00+08:00 | cre | final-target-msc-repack
- action: compile with legacy msclang `-i`, compare both target binaries, replace only the stale 0.bscex, and decompile both final binaries
- command_or_ref: msc-repack-runnable-guide plus exact SHA-256/byte comparison
- result_summary: target 2.dscex already matched final compile; target 0.bscex was stale and is now synchronized after backup; binary decompile recovers all three intended fixes
- artifacts: [evidence/E-011.md, tmp/msc/20260822-wing-rebellion-csb-csa-ammo-fix/final-repack, tmp/msc/20260822-wing-rebellion-csb-csa-ammo-fix/before-repack]
- evidence_ids: [E-011]
- next: run the scoped in-game transition matrix; no game-package installation was performed

## 2026-08-22T18:40:00+08:00 | cre | cs-action-entry-consumption
- action: consume native charge state at every Rebellion CSA action entry and record the rule as reusable MSC research
- command_or_ref: user runtime report, sys_4F subcmd-0xA native evidence, normal/directional/bird CSA and CSB lifecycle audit
- result_summary: three CSA entries clear slot 0 exactly once before their continuation; shared uncharged bird main remains untouched; CSB keeps the existing func_1031 slot-4 consumption chain
- artifacts: [docs/msc-research/cs-action-charge-slot-consumption.md, evidence/E-012.md, tmp/msc/20260822-wing-rebellion-cs-consume]
- evidence_ids: [E-012]
- next: verify normal/directional/bird CSA each require a fresh charge after completion and startup interrupt
