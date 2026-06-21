# numdlb material_label Combobox + Auto Apply + Unified Floating-Window Manager — Design Spec

- Date: 2026-06-21
- Status: APPROVED (design), pending implementation plan
- Area: `src/components/ssbh-model-preview` (numdlb editor), `src/page/SceneEdit/components` (Rnd shell), new global `src/store/floatingWindowStore.ts`
- Driver: UX improvement for the Unit Model Editor's numdlb editor (material label was a free-text input; users mis-typed labels that must match numatb `material_label`). Plus a Windows-style focus-to-front behavior for every floating window in the app.

---

## 1. Problem Statement

Three coupled deliverables:

1. **material_label is free-text.** In `NumdlbMaterialMappingEditor.tsx` every mapping row's material label is an `<Input>` backed only by a `<datalist>` whose options come from labels already present in the rows. Users have no authoritative list to pick from and silently produce labels that do not exist in the model's numatb material table, which the game then cannot resolve.

2. **No fast "mesh name == material label" action.** The project's own DAE/FBX→SSBH pipeline splits meshes and appends a `__part<N>` suffix to mesh object names (`src-tauri/src/ssbh_dae/dae_to_ssbh.rs`). Under the working assumption that a model's numatb `material_label` equals the source mesh name, fixing up every row by hand is tedious.

3. **Cross-window stacking is broken.** Each SSBH editor kind owns an independent z-index counter (`numdlbZIndexRef`, `numatbZIndexRef`, `nuhlpbZIndexRef`, `jnttblZIndexRef`, `shlZIndexRef`, `vernierZIndexRef` in `useSsbhFileEditorSessions.ts`). `skipActivate` is computed against the per-kind top only. Result: a numatb window and a numdlb window cannot be ordered relative to each other by focus order — clicking the lower one does not raise it above a window of a different kind. The user wants Windows-style behavior across the **entire UI**: clicking anywhere on any floating window raises it above all others.

---

## 2. Confirmed Decisions (from user)

| Topic | Decision |
|---|---|
| Combobox option source | Union of **maya numatb** `material_label` + **nust numatb** `material_label` + **labels currently used in the numdlb rows**; new values always creatable. |
| `__part` suffix stripping | Strip any `__part<N>` suffix (regex `/__part\d+$/i`), covering multi-part splits (`body__part0`, `body__part2` → `body`). |
| Auto apply scope | Operate on **all rows**, overwrite all values unconditionally (closest to a "snap to mesh name" one-shot). |
| Window focus-to-front scope | **Unify all floating windows** under one shared z-order; clicking anywhere on a window body (not just the titlebar) raises it to the top. |

---

## 3. Architecture Overview

```
A. Material Label Combobox
   ├─ data: useNumdlbMaterialLabelOptions(numdlbFilePath, materialFileNames, rowLabels) -> string[]
   │     └─ resolves referenced numatb (maya+nust pair) via numatbEditorUtils, reads material_labels,
   │        unions with row labels. Loaded at session-open in useSsbhFileEditorSessions; refreshed on numatb save.
   ├─ ui: MaterialLabelCombobox (new, modeled on SceneTextureSelectPicker)
   │     └─ replaces row <Input> + "Replace all" <Input>; removes the old <datalist>.
   └─ plumbing: NumdlbEditorWindowSession.materialLabelOptions -> NumdlbEditorModalWindow
                -> NumdlbMappingEditorBody -> NumdlbMaterialMappingEditor (new prop availableMaterialLabels)

B. Auto Apply
   ├─ pure: stripPartSuffix(name), applyMeshNameAsMaterialLabel(entries) in numdlbEditorUtils.ts (+ unit tests)
   └─ ui: "Auto apply" button in NumdlbMaterialMappingEditor header -> onAutoApply() -> body onChange (immutable)

C. Unified Floating-Window Manager
   ├─ store: src/store/floatingWindowStore.ts (Zustand): bringToFront(id)->z, topId, release(id)
   ├─ shell: SceneEditRndModalShell consumes store; onPointerDownCapture root -> bringToFront; global-top skipActivate;
   │         active/inactive visual state (design-taste-frontend)
   ├─ sessions: useSsbhFileEditorSessions per-kind *ZIndexRef collapse into the shared store
   └─ other windows: SceneDetailViewWindow, EffectDetailViewWindow, AppRndModalShell adopt the same store
```

---

## 4. Detailed Design

### 4.A Material Label Combobox

#### 4.A.1 Data source

New hook `useNumdlbMaterialLabelOptions` (file: `src/components/ssbh-model-preview/hooks/useNumdlbMaterialLabelOptions.ts`) is the conceptual contract, but the **actual file IO must live in `useSsbhFileEditorSessions.ts`** (that file's header declares itself the single canonical owner of SSBH editor session IO; a standalone hook doing `invoke` would duplicate that ownership). Therefore:

- At numdlb session open (`openNumdlbEditor` path in `useSsbhFileEditorSessions.ts`), after `ssbhReadNumdlbMapping` succeeds:
  - Derive the referenced numatb path: `dir = dirname(filePath)`; `numatbName = draftData.materialFileNames[0]`; `numatbPath = join(dir, numatbName)`.
  - Resolve maya+nust pair using existing `numatbEditorUtils` helpers (`detectNumatbProfileFromPath` + `deriveNumatbSisterPathCandidates`, the same logic `loadNumatbProfileBundle` uses). Read each with `ssbhTemplateReadNumatb`; a missing sister/primary is treated as empty (Scene Editor precedent in `loadNumatbProfileBundle` — `try/catch` → empty).
  - Collect `material_label` from every `Matl.V16.entries[*]` of both profiles.
  - Store the de-duplicated, sorted result on the session: `session.materialLabelOptions: string[]`.
- The combobox itself unions `session.materialLabelOptions` with the **current** row labels at render time (so user-typed-but-not-yet-in-numatb values never vanish from the dropdown).

**Missing-numatb policy (explicit, not a silent fallback):** the combobox is an additive affordance, not core data. If the referenced numatb cannot be read, `materialLabelOptions` is `[]`; the combobox still shows in-use row labels and still allows creating new values. This matches the Scene Editor's existing "missing sister profile = empty profile" behavior and does NOT violate the no-fallback rule, because no core save/parse path degrades — only the suggestion list shrinks. The numdlb save validation (`assertNumdlbValidForSave`, requires non-empty label per row) is unchanged.

**Refresh:** `useSsbhFileEditorSessions` already exposes `onSaved(savedPath)`. When a `.numatb` save fires for the numatb referenced by an open numdlb session, recompute that session's `materialLabelOptions`. (Match by normalized path of the derived numatb path.)

#### 4.A.2 Type changes

- `NumdlbEditorWindowSession` (in `NumdlbEditorModalWindow.tsx`): add `materialLabelOptions: string[]`.
- `NumdlbMaterialMappingEditorProps`: add `availableMaterialLabels: string[]` and `onAutoApply: () => void`.
- `NumdlbMappingEditorBodyProps`: add `availableMaterialLabels: string[]` (passed straight through) and `onAutoApply: () => void`.
- `NumdlbEditorModalWindowProps`: add `onAutoApply: () => void` (wired from host) — auto apply mutates draft via the same `onDraftChange` path; see 4.B.

#### 4.A.3 UI component `MaterialLabelCombobox`

File: `src/components/ssbh-model-preview/components/MaterialLabelCombobox.tsx`. Model on `SceneTextureSelectPicker.tsx` (portal-rendered menu, `ChevronsUpDown` toggle, `measureMenuPosition` up/down flip, `onMouseDown preventDefault` to keep focus, keyboard: Escape closes, Enter commits, ArrowDown opens, `Use custom: "<value>"` create-new row). Differences:

- Generic options, not texture-store-bound. Props: `value: string`, `options: string[]`, `onChange: (label: string) => void`, `disabled?: boolean`, `className?: string`, plus optional `optionGroups?` for source labeling.
- No nutexb extension stripping. Trim only.
- Optional grouped headers: `maya`, `nust`, `in use` (only if cheaply derivable; otherwise a flat de-duplicated list is acceptable for v1 — grouping is a nice-to-have, not a blocker).
- Reuse the same portal `z-[var(--z-popover)]` + outside-click overlay pattern so the menu renders above the Rnd window correctly.

Replace in `NumdlbMaterialMappingEditor.tsx`:
- Per-row `<Input ... list={datalistId}>` → `<MaterialLabelCombobox value={row.materialLabel} options={availableMaterialLabels} onChange={(next) => onChangeMaterialLabel(rowIndex, next)} />`.
- "Replace all material labels" `<Input ... list={datalistId}>` → `<MaterialLabelCombobox>` bound to `replaceAllValue`.
- Delete the `<datalist id={datalistId}>` block and the `datalistId`/`datalistLabels`/`MAX_DATALIST_OPTIONS` machinery; `materialLabels` (the in-row set) stays for the "Materials: N" badge and can be merged into the options the parent passes.

### 4.B Auto Apply

#### 4.B.1 Pure functions (in `numdlbEditorUtils.ts`, unit-tested)

```ts
const PART_SUFFIX_RE = /__part\d+$/i;

export function stripPartSuffix(meshObjectName: string): string {
  return meshObjectName.replace(PART_SUFFIX_RE, "");
}

/** Set every row's materialLabel to its mesh name with the generated __part<N> suffix removed. */
export function applyMeshNameAsMaterialLabel(entries: NumdlbMappingRow[]): NumdlbMappingRow[] {
  return entries.map((row) => {
    const next = stripPartSuffix(row.meshObjectName);
    return row.materialLabel === next ? row : { ...row, materialLabel: next };
  });
}
```

- Immutable (returns new array; unchanged rows returned by reference so React skips re-render).
- Edge cases to test: `body__part0` → `body`; `body__part12` → `body`; `body` → `body` (no-op); `wing__part0__part1` → `wing__part0` (regex anchored `$`, strips only the trailing run — documented behavior, matches "any `__part<N>` suffix"); empty mesh name → empty (the save validator will then reject the empty label, which is correct — auto apply does not invent labels for unnamed meshes).

#### 4.B.2 Wiring

- `NumdlbMappingEditorBody` gains `onAutoApply`. Implement it locally as `onChange({ ...data, entries: applyMeshNameAsMaterialLabel(data.entries) })` OR receive `onAutoApply` from the window. Chosen: implement inside the body (keeps the pure call next to the existing `onReplaceAll` immutable update; the window only needs to pass nothing new for this path). Re-evaluate during planning whether window-level wiring is cleaner for the Ctrl+S/dirty interplay — but functionally the body `onChange` already flows to draft + dirty.
- Button: in `NumdlbMaterialMappingEditor` header, sibling to the "Replace all" Apply button. Label "Auto apply", icon `WandSparkles` (already imported) or `Sparkles`; `size="sm"`, uppercase tracking style matching the existing Apply button. Tooltip/subtext: "Set every material label to its mesh name (drops __partN)". Disabled when `rows.length === 0`.
- No confirmation dialog for v1 (the action is reversible via the existing Reset button, and dirty state is tracked). Note as a possible follow-up if destructive-overwrite feedback is requested.

### 4.C Unified Floating-Window Manager

#### 4.C.1 Store `src/store/floatingWindowStore.ts` (Zustand)

```ts
interface FloatingWindowState {
  // monotonically increasing z; never resets while app is alive
  counter: number;
  // windowId -> assigned z
  zById: Record<string, number>;
  topId: string | null;
  bringToFront: (id: string) => number; // returns the new z
  release: (id: string) => void;        // on window unmount
}
```

- `bringToFront(id)`: `counter += 1`; `zById[id] = counter`; `topId = id`; returns `counter`. Idempotent-safe to call on pointer down repeatedly.
- Base z floor: assigned z values are added to the existing CSS layer `--z-modal-nested` as an inline `zIndex` offset (the host wrapper keeps `z-[var(--z-modal-nested)]`; individual windows get `zIndex: baseFloor + assignedZ`). Keep numbers comfortably below `--z-popover`/`--z-toast` so dropdowns and toasts still render above windows. Confirm the token scale in `App.css` during planning and pick `baseFloor` accordingly.
- `release(id)`: delete `zById[id]`; if `topId === id`, recompute `topId` as the max-z remaining entry (or `null`).

#### 4.C.2 Shell `SceneEditRndModalShell.tsx`

- Accept a stable `windowId: string` prop (each session/window passes its id; SSBH editors pass `session.id`).
- Subscribe to `zById[windowId]` and `topId` from the store.
- Root wrapper `<div style={{ zIndex }}>`: `zIndex` now comes from the store (fallback to the prop `zIndex` only during the first paint before registration).
- Add `onPointerDownCapture` on the Rnd root (or the outer wrapper) → `bringToFront(windowId)`. This is the Windows behavior: pressing anywhere in the window (header, body, inputs) raises it BEFORE the interaction proceeds. Keep the existing `deferActivate`/`onActivate` calls for backward compat during migration, but they now delegate to `bringToFront`.
- `skipActivate` becomes `topId === windowId` (global), replacing the per-kind `session.zIndex >= topZIndex` computation in the hosts.
- Active/inactive visual state (design-taste-frontend): when `topId === windowId`, header uses the stronger gradient + `shadow-2xl`; when not, header desaturates (e.g. `from-muted/40 to-muted/20`) and shadow drops to `shadow-lg`, optionally a faint `opacity`/`brightness` on the card. Must stay on compositor-friendly props (opacity/filter/box-shadow), respect reduced-motion, and not animate layout.
- `release(windowId)` on unmount (`useEffect` cleanup).

#### 4.C.3 `useSsbhFileEditorSessions.ts`

- Remove the six per-kind `*ZIndexRef` counters and all `++ref.current` z assignments. Sessions no longer store an authoritative `zIndex`; instead each `activate*Session` calls `floatingWindowStore.bringToFront(sessionId)`. The shell reads z from the store keyed by session id.
- Existing `onActivateSession` callbacks remain (hosts still call them on activate) but now just delegate to `bringToFront`. Hosts stop sorting by `session.zIndex` (DOM order no longer determines stacking; the store-provided inline z does). Keep render order stable (e.g. by insertion/id) to avoid remount churn.
- `JnttblEditorModalHost.onRegisterZLayer` (existing bespoke mechanism) is superseded by the store and removed/relinked.
- Newly opened windows call `bringToFront(id)` on mount so they appear on top.

#### 4.C.4 Other floating windows

- `SceneDetailViewWindow` / `EffectDetailViewWindow` / `AppRndModalShell`: route their z through the same store with a unique `windowId`. If any currently manages its own z, migrate it. Verify each renders within a host whose CSS layer is compatible with the SSBH editors' `--z-modal-nested` so the unified order is meaningful (windows that are intentionally on a higher base layer, e.g. true modal dialogs/alert dialogs, stay above and are out of scope).

---

## 5. Files Touched (anticipated)

New:
- `src/store/floatingWindowStore.ts`
- `src/components/ssbh-model-preview/components/MaterialLabelCombobox.tsx`
- tests: `numdlbEditorUtils.test.ts` (auto apply), `MaterialLabelCombobox.test.tsx`, `floatingWindowStore.test.ts`

Modified:
- `src/components/ssbh-model-preview/numdlbEditorUtils.ts` — add `stripPartSuffix`, `applyMeshNameAsMaterialLabel`
- `src/components/ssbh-model-preview/components/NumdlbMaterialMappingEditor.tsx` — combobox + Auto apply button; drop datalist
- `src/components/ssbh-model-preview/NumdlbMappingEditorBody.tsx` — thread `availableMaterialLabels`, `onAutoApply`
- `src/components/ssbh-model-preview/NumdlbEditorModalWindow.tsx` — `materialLabelOptions` on session; pass-through props
- `src/components/ssbh-model-preview/NumdlbEditorModalHost.tsx` — pass options/auto-apply
- `src/components/ssbh-model-preview/useSsbhFileEditorSessions.ts` — compute `materialLabelOptions` at open + refresh on numatb save; collapse z counters into store
- `src/page/SceneEdit/components/SceneEditRndModalShell.tsx` — store-driven z, pointer-down-capture bring-to-front, active/inactive visuals
- `src/components/ssbh-model-preview/SsbhEditorModalWindowShell.tsx` — pass `windowId`
- per-kind hosts (`Numdlb/Numatb/Nuhlpb/Jnttbl/Shl/Vernier EditorModalHost.tsx`) — stop per-kind z sort/skipActivate; pass `windowId`
- `src/page/SceneEdit/components/detail-view/SceneDetailViewWindow.tsx`, `EffectDetailViewWindow.tsx`, `src/components/AppRndModalShell.tsx` — adopt store

---

## 6. Testing

- **Unit:** `stripPartSuffix` / `applyMeshNameAsMaterialLabel` table cases (§4.B.1). `floatingWindowStore` bring-to-front monotonicity, topId tracking, release recompute.
- **Component:** `MaterialLabelCombobox` — shows union options, creates new value, keyboard nav, commits on blur/enter. `NumdlbMaterialMappingEditor` — Auto apply rewrites all rows and strips `__partN`; combobox replaces inputs.
- **Integration/manual (Tauri MCP):** open numdlb + numatb windows, click each → focus-to-front works cross-kind; click window body (not just titlebar) raises it; active window has distinct chrome; numdlb combobox lists maya+nust labels.
- 80% coverage target on new/changed logic per project rules.

## 7. Out of Scope

- Full-app visual redesign. "Whole UI" = all floating windows share the focus-to-front manager + active/inactive chrome + the new combobox/auto-apply polish.
- Changing numdlb/numatb on-disk formats or the save validator semantics.
- Multi-numatb-per-numdlb fan-out: v1 reads the first referenced numatb (`materialFileNames[0]`). If a numdlb references several numatb files, extend the union in a follow-up.

## 8. Risks / Open Items for Planning

- Confirm `--z-modal-nested` vs `--z-popover`/`--z-toast` numeric scale in `App.css` to set `baseFloor` so dropdowns/toasts stay above windows.
- Confirm the numatb path derivation (`dirname(numdlb)` + `materialFileNames[0]`) holds in the Unit Model Editor per-model folder layout; cross-check against `unitModelModelService.numatbPaths`.
- `JnttblEditorModalHost.onRegisterZLayer` removal must not break jnttbl open/save.
- Reduced-motion + compositor-only constraint on the active/inactive transition.
