---
name: gpt-fast-verify
description: Enforce one shortest high-signal semantic verification path before completion. Use for GPT/Codex code, config, rule, documentation, or skill changes, especially with GPT-5.6 Sol, or whenever the user asks to minimize tests, validation time, tool calls, or tokens while retaining fresh evidence.
---

# GPT Fast Verify

Fresh evidence stays mandatory. One smallest semantic proof is sufficient by default.

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

