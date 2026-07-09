# MSC Stable Resolve Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TestEditor Resolve Overlay generate stable `2.resolved.md` sidecars for current MSC layouts without rewriting raw `2.c` or failing when legacy `func_143` aliases are unavailable.

**Architecture:** Keep legacy action-mask aliases as optional display hints, but build overlay identity from stable action, slot, weapon, and resource registries. A pure overlay builder returns `resolved`, `partial`, or `skipped`; the Tauri I/O wrapper writes only the sidecar, and both single-folder and batch UI use that wrapper.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri v2 filesystem/path plugins.

---

### Task 1: Define Stable Overlay Behavior

**Files:**
- Modify: `src/page/TestEditor/utils/mscResolvedOverlay.test.ts`
- Modify: `src/page/TestEditor/utils/mscResolvedOverlay.ts`

- [ ] Add a failing test where `0.c` contains `int func_143()` plus stable `sys_1(0x10000, ...)` evidence and `2.c` contains a two-argument `func_241` binding.
- [ ] Assert that legacy alias extraction failure does not throw, the status is `resolved`, and Markdown contains the stable action hash.
- [ ] Add a failing test where action bindings are absent but slot registry evidence exists; assert status `partial`.
- [ ] Add a failing test with no stable evidence; assert status `skipped` and no Markdown output.
- [ ] Run `pnpm test -- src/page/TestEditor/utils/mscResolvedOverlay.test.ts` and confirm the new API is missing.
- [ ] Implement the pure builder using `collectLegacyActionAliases`, `buildStableMscEvidence`, and `renderResolvedOverlayMarkdown`.
- [ ] Run the focused test and confirm it passes.

### Task 2: Write Sidecars Without Mutating Raw C

**Files:**
- Create: `src/page/TestEditor/components/msc-editor/mscWorkspaceActions.test.ts`
- Modify: `src/page/TestEditor/components/msc-editor/mscWorkspaceActions.ts`

- [ ] Add a failing Tauri-mocked test that reads `0.c` and `2.c`, writes `2.resolved.md`, and never writes `2.c`.
- [ ] Add a test that a `skipped` result performs no write.
- [ ] Run `pnpm test -- src/page/TestEditor/components/msc-editor/mscWorkspaceActions.test.ts` and confirm the old implementation writes `2.c`.
- [ ] Replace the legacy renamer call with the stable overlay builder and `getMscResolvedOverlayPath`.
- [ ] Return sidecar path, status, and evidence counts to callers.
- [ ] Run the focused test and confirm it passes.

### Task 3: Remove Raw Mutation Compatibility Code

**Files:**
- Modify: `src/page/TestEditor/utils/mscActionRename.ts`
- Modify: `src/page/TestEditor/utils/mscActionRename.test.ts`
- Modify: `src/page/TestEditor/utils/mscResolvedOverlay.ts`
- Modify: `src/page/TestEditor/utils/mscResolvedOverlay.test.ts`

- [ ] Delete `MscActionRenameResult` and `renameScript2CallbacksByActionMask`.
- [ ] Delete `applyResolvedOverlayToScript2`.
- [ ] Remove tests and mocks that assert raw `2.c` mutation.
- [ ] Keep `collectLegacyActionAliases` only as a best-effort hint provider.
- [ ] Run the three utility test files and confirm all pass.

### Task 4: Update Single And Batch UI Status

**Files:**
- Modify: `src/page/TestEditor/components/msc-editor/MscWorkspaceView.tsx`
- Modify: `src/page/TestEditor/components/msc-editor/MscWorkspaceView.test.tsx`
- Modify: `src/page/TestEditor/components/character-id-table/MscSourceBatchDecompileView.tsx`
- Modify: `src/page/TestEditor/components/msc-editor/mscBatchDecompile.ts`
- Modify: `src/page/TestEditor/components/msc-editor/mscBatchDecompile.test.ts`

- [ ] Change the single-folder success message to report sidecar generation and stable evidence counts.
- [ ] Update its test to expect `2.resolved.md` and unchanged raw `2.c`.
- [ ] Add `partialOverlays` to batch statistics.
- [ ] Count `resolved`, `partial`, and `skipped` separately; reserve errors for I/O or parser failures.
- [ ] Update batch summary metrics and completion toasts.
- [ ] Run focused workspace and batch tests.

### Task 5: Record The Migration Decision

**Files:**
- Modify: `docs/msc-research/msc-auto-rename-mapping.md`

- [ ] Record the 2026-07-09 batch failure counts and the two legacy parser assumptions that caused them.
- [ ] Explain why raw `2.c` mutation was removed.
- [ ] Document stable identity sources and status semantics.

### Task 6: Verify

- [ ] Run all focused MSC frontend tests.
- [ ] Run `pnpm exec tsc --noEmit`.
- [ ] Run the pure builder against representative real samples for `int func_143`, variable `func_95`, and four-argument `func_241`.
- [ ] Inspect `git diff` and confirm no unrelated user changes were reverted.
