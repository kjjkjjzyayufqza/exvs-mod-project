# Unit Model Motion CascadeurBridge UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Rust CascadeurBridge export/import inside Unit Model Editor Motion while keeping frontend conversion-free.

**Architecture:** A shared `CascadeurBridgePanel` owns native dialog flow and invokes existing Rust commands through a thin typed service. `SsbhModelPreviewMotionPanel` supplies selected motion and active skeleton. The context registers generated NUANMB paths so existing preview loading remains source of truth.

**Tech Stack:** React 19, TypeScript, shadcn UI, Tauri dialog/core APIs, Vitest, Testing Library.

---

### Task 1: Typed bridge service and component test

**Files:**
- Create: `src/components/ssbh-model-preview/cascadeurBridgeService.ts`
- Create: `src/components/ssbh-model-preview/components/CascadeurBridgePanel.test.tsx`

- [ ] Write failing tests for export request and import request. Mock native dialogs and `invoke`; assert exact Rust command names and camelCase request payloads. Import test must assert callback receives saved NUANMB path only after command success.
- [ ] Run: `npm test -- src/components/ssbh-model-preview/components/CascadeurBridgePanel.test.tsx`. Expected: fail because component/service do not exist.
- [ ] Implement typed `exportNuanmbToCascadeurBridge` and `importCascadeurBridgeToNuanmb` thin wrappers. Keep no conversion logic in TypeScript.

### Task 2: Shared CascadeurBridge panel

**Files:**
- Create: `src/components/ssbh-model-preview/components/CascadeurBridgePanel.tsx`
- Modify: `src/utils/dialogLastPath.ts`

- [ ] Implement panel with Tabler icons, existing `MayaSection`, `open`/`save` dialogs, explicit `busy`, inline error, report summary, and native-dialog cancellation no-op.
- [ ] Export request uses selected NUANMB, supplied NUSKTB, selected directory, `actionName: null`.
- [ ] Import request uses selected FBX, selected bridge JSON, supplied NUSKTB, save target, selected NUANMB as optional template, `animationStackName: null`, `rigBindingPolicy: "exactHierarchy"`.
- [ ] Run the focused test again. Expected: pass.

### Task 3: Motion context registration and panel integration

**Files:**
- Modify: `src/components/ssbh-model-preview/SsbhModelPreviewContext.tsx`
- Modify: `src/components/ssbh-model-preview/SsbhModelPreviewMotionPanel.tsx`

- [ ] Add `registerMotionNuanmbPath(path)` to context. It deduplicates, selects, resets clip/sample state, and uses the existing loader path.
- [ ] Mount `CascadeurBridgePanel` inside Motion panel using active instance `bundle.skelPath`, selected NUANMB, workspace root, preview busy flag, and registration callback.
- [ ] Preserve current Motion source and metadata behavior.

### Task 4: Verification

- [ ] Run focused Vitest component test.
- [ ] Run `npm run build` without dev server.
- [ ] Run `cargo test --test ssbh_motion_interchange_test --no-fail-fast` and real Gyan ignored regression when local assets exist.
- [ ] Run `cargo build` and `git diff --check`.
