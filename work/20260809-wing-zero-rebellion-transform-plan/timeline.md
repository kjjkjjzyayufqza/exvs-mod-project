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
