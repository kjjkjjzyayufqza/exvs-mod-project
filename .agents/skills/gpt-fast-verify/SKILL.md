---
name: gpt-fast-verify
description: Use when verifying non-MSC GPT/Codex code, config, rules, docs, or skills under a requested shortest-path or low-token workflow.
---

# GPT Fast Verify

Fresh evidence stays mandatory. One smallest semantic proof is sufficient by default.

## Hard exclusion

Do not use this skill for MSC research, MSC `X.c` edits, unit script ports, or
MSC-coupled motion/model/Param/HUD work. MSC completion requires all applicable
domain gates, not one shortest command: lifecycle/state audit, resource
existence, reverse-transition symmetry, static MSC checks, authorized compile/
repack, and scoped in-game verification.

## Gate

1. Name the changed behavior or invariant.
2. Select exactly one verifier, first available:
   - Exact existing regression test or test node.
   - Nearest affected module/test file with a filter.
   - Narrow package, binary, type, or syntax check when no behavioral test exists.
   - Schema/skill validator for config, rules, docs, or skills; do not run app tests for docs-only changes.
3. Run it once. Pass -> stop.
4. Fail -> diagnose only that failure, fix, rerun the same verifier once. Do not fan out into other suites.
5. Report command and result. Label unrun checks as unrun, not failed.

## Hard Limits

- Default budget: one verifier command, expected runtime at most 60 seconds.
- Never stack build + typecheck + lint + tests when one semantic test proves the change.
- Never run coverage, full workspace/repo suites, release builds, dependency audits, or E2E by default.
- Do not rerun tests after formatting or metadata-only edits when behavior did not change.
- For a mandatory domain gate, use one narrow end-to-end command that covers the required invariants; it replaces generic checks.
- Expand only for explicit user request, release work, or material security/data-loss risk. Ask before a full suite when practical.

