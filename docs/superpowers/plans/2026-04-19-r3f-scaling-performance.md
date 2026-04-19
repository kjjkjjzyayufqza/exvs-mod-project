# R3F Scaling Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the official React Three Fiber scaling-performance guidance to the SSBH preview so heavy scenes degrade more gracefully during interaction while preserving current visual quality when idle.

**Architecture:** Keep the existing `frameloop="demand"` / `"always"` split, but add official R3F adaptive performance on top of it. Centralize the policy in `ssbhCanvasPerformance.ts`, then let `SsbhModelCanvas` consume that policy for `Canvas.performance`, adaptive DPR, movement regression, and temporary anime post-processing suspension.

**Tech Stack:** React 19, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, Vitest

---

### Task 1: Lock adaptive performance policy in tests

**Files:**
- Modify: `src/page/TestEditor/components/ssbh-model-preview/ssbhCanvasPerformance.test.ts`
- Modify: `src/page/TestEditor/components/ssbh-model-preview/ssbhCanvasPerformance.ts`
- Test: `src/page/TestEditor/components/ssbh-model-preview/ssbhCanvasPerformance.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run `pnpm vitest run src/page/TestEditor/components/ssbh-model-preview/ssbhCanvasPerformance.test.ts` and verify the new expectations fail for missing adaptive-performance policy**
- [ ] **Step 3: Add the minimal exported policy helpers for canvas performance config, adaptive DPR limits, regression state, and post-processing gating**
- [ ] **Step 4: Re-run `pnpm vitest run src/page/TestEditor/components/ssbh-model-preview/ssbhCanvasPerformance.test.ts` and verify it passes**

### Task 2: Wire adaptive performance into the canvas

**Files:**
- Modify: `src/page/TestEditor/components/ssbh-model-preview/SsbhModelCanvas.tsx`
- Modify: `src/page/TestEditor/components/ssbh-model-preview/AnimePreviewPostFx.tsx`
- Test: `src/page/TestEditor/components/ssbh-model-preview/ssbhCanvasPerformance.test.ts`

- [ ] **Step 1: Use the new policy helpers to feed `Canvas.performance`, dynamic DPR, and regression-aware monitor settings**
- [ ] **Step 2: Add a small internal helper component that reads `state.performance.current`, calls `setDpr`, and reports whether the scene is currently regressed**
- [ ] **Step 3: Gate anime bloom/postprocessing off while the preview is in regression**
- [ ] **Step 4: Re-run `pnpm vitest run src/page/TestEditor/components/ssbh-model-preview/ssbhCanvasPerformance.test.ts` and verify it stays green**

### Task 3: Trigger movement regression from real interactions

**Files:**
- Modify: `src/page/TestEditor/components/ssbh-model-preview/SsbhModelCanvas.tsx`
- Modify: `src/page/TestEditor/components/ssbh-model-preview/SsbhModelPreviewViewport.tsx`
- Test: `src/page/TestEditor/components/ssbh-model-preview/ssbhCanvasPerformance.test.ts`

- [ ] **Step 1: Hook `OrbitControls` change/start interaction paths into `performance.regress()` and `invalidate()` where needed**
- [ ] **Step 2: Trigger regression during motion scrubbing and other high-frequency preview interactions already tracked by the viewport**
- [ ] **Step 3: Keep the current idle behavior intact so static scenes still settle back to on-demand rendering**
- [ ] **Step 4: Re-run `pnpm vitest run src/page/TestEditor/components/ssbh-model-preview/ssbhCanvasPerformance.test.ts` and verify it stays green**

### Task 4: Verify the integrated build

**Files:**
- Modify: `src/page/TestEditor/components/ssbh-model-preview/SsbhModelCanvas.tsx`
- Modify: `src/page/TestEditor/components/ssbh-model-preview/AnimePreviewPostFx.tsx`
- Modify: `src/page/TestEditor/components/ssbh-model-preview/ssbhCanvasPerformance.ts`
- Test: `src/page/TestEditor/components/ssbh-model-preview/ssbhCanvasPerformance.test.ts`

- [ ] **Step 1: Run `pnpm vitest run src/page/TestEditor/components/ssbh-model-preview/ssbhCanvasPerformance.test.ts`**
- [ ] **Step 2: Run `pnpm build`**
- [ ] **Step 3: Review touched files for redundant props, dead branches, and naming drift**

