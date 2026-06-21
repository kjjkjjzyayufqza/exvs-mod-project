# Unit Model Editor — Batch DAE/FBX Export Parity

> **For agentic workers:** Use superpowers:executing-plans or implement directly. Checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `UnitModelEdit` model export match `SceneEdit` DAE/FBX behavior for **all currently loaded** `preview.previewInstances` (not active-only, not visible-only, no new multi-select UI).

**Architecture:** Extract pure export-target building into `unitModelExport.ts` (tested). Expose Three.js instance groups from `SsbhModelCanvas` via a small imperative handle on `SsbhModelPreviewViewport`. Wire `UnitModelEdit.page.tsx` to open `DaeExportDialog` with batch targets and run DAE + FBX branches like `SceneEdit.handleDaeExportConfirm`.

**Tech Stack:** React + TypeScript, Tauri, vitest, existing `daeExportImport.ts` (`exportStageDaeBatchToDirectory`, `exportObjectsAsFBXToDirectory`).

**Reference:** `SceneEdit/page.tsx` (`handleDaeExportConfirm`), `SceneEdit/utils/daeExportDialogState.ts`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/page/UnitModelEdit/utils/unitModelExport.ts` | Create | Build export targets, dedupe names, filter non-exportable instances |
| `src/page/UnitModelEdit/utils/unitModelExport.test.ts` | Create | Tests for target building / dedupe / skip logic |
| `src/components/ssbh-model-preview/SsbhModelCanvas.tsx` | Modify | Expose `getExportObjectsByInstanceId()` via `exportHandleRef` |
| `src/components/ssbh-model-preview/SsbhModelPreviewViewport.tsx` | Modify | `forwardRef` bridge to canvas export handle |
| `src/page/UnitModelEdit/page.tsx` | Modify | Batch dialog open + DAE/FBX confirm handler |

---

## Task 1: Pure export target builder

**Files:** `unitModelExport.ts`, `unitModelExport.test.ts`

- [ ] **Step 1:** Add `isUnitModelInstanceDaeExportable`, `buildUnitModelExportDialogState`
  - Input: all `previewInstances` (no hidden filter)
  - DAE-eligible: `bundle.sourceKind === "disk"` and non-empty `rootFolder`
  - FBX-eligible: entry in `exportObjectsByInstanceId` map
  - Include target when DAE-eligible; attach `threeObjects` entry (`name` = instance id) when FBX object exists
  - Dedupe output filenames via `nextUniqueExportName`
  - Return `skipped` with reasons for instances neither DAE nor FBX eligible
- [ ] **Step 2:** Vitest cases — all loaded, name dedupe, memory skip, hidden-without-viewport skip for FBX
- [ ] **Step 3:** Run `npx vitest run src/page/UnitModelEdit/utils/unitModelExport.test.ts`

---

## Task 2: Canvas export handle

**Files:** `SsbhModelCanvas.tsx`, `SsbhModelPreviewViewport.tsx`

- [ ] **Step 1:** Add optional `exportHandleRef` on canvas; Scene assigns `getExportObjectsByInstanceId` reading `instanceGroupRefs`
- [ ] **Step 2:** `forwardRef` on viewport; `useImperativeHandle` delegates to canvas ref
- [ ] **Step 3:** No behavior change for other consumers (ref optional)

---

## Task 3: UnitModelEdit wiring

**Files:** `UnitModelEdit/page.tsx`

- [ ] **Step 1:** Store `threeObjects` in `daeExportDialog` state (like SceneEdit)
- [ ] **Step 2:** `openDaeExportDialog` — build from all `preview.previewInstances` + viewport handle; toast on empty/skipped
- [ ] **Step 3:** `handleDaeExport` — mirror SceneEdit:
  - `wantsDae` → `exportStageDaeBatchToDirectory` for ssbh targets with `rootPath`
  - `wantsFbx` → map `threeObjects` by `nodeId`, `exportObjectsAsFBXToDirectory`; warn if none
  - Both formats when both checked; try/catch + toast on error
- [ ] **Step 4:** `canExportDae` toolbar gate: any loaded exportable instance (not active-only root)

---

## Task 4: Verification

- [ ] `npx vitest run src/page/UnitModelEdit/utils/unitModelExport.test.ts`
- [ ] `npx tsc --noEmit` (or project typecheck script) on touched paths
- [ ] `ReadLints` on modified files

**Manual smoke (user):** Load unit with multiple `.numdlb`, export DAE only / FBX only / both; confirm batch count matches loaded models; FBX-only no longer silent no-op.
