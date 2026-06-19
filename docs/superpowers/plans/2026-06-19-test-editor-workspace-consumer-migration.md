# TestEditor Workspace Consumer Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove remaining fixed workspace-root hash joins from TestEditor lists, icons, cost, stage, param, and MSC surfaces by routing them through the workspace layout service.

**Architecture:** A content catalog describes known fixed FHM2D packages by logical content ID, route ID, hash, and internal file path. Editors resolve configured/legacy locations through one service and treat legacy packages as read-only. Param and MSC file pickers receive route-root defaults without duplicating prefix literals.

**Tech Stack:** React 19, TypeScript 6, Vitest 4, Tauri v2 path/fs plugins

---

## File Map

**Create**

- `src/services/testEditorWorkspace/contentCatalog.ts` - fixed package descriptors and file resolution.
- `src/services/testEditorWorkspace/contentCatalog.test.ts` - descriptor and configured/legacy resolution tests.
- `src/services/testEditorWorkspace/noFlatWorkspacePaths.test.ts` - source policy against unscoped root/hash joins.
- `src/page/TestEditor/components/workspace-layout/LegacyWorkspaceNotice.tsx` - shared read-only legacy warning.
- `src/page/TestEditor/components/workspace-layout/LegacyWorkspaceNotice.test.tsx` - warning behavior tests.
- `src/page/TestEditor/components/workspaceContentConsumers.test.tsx` - fixed list consumer path tests.
- `src/page/TestEditor/components/CharacterCostView.test.tsx` - configured and legacy cost tests.
- `src/page/TestEditor/components/NutexbIconListView.test.tsx` - primary/secondary icon route tests.
- `src/page/TestEditor/components/stage-list/stageFileNameRef.test.ts` - dynamic stage model route tests.
- `src/page/TestEditor/components/param-editor/workspacePickerDefaults.test.tsx` - param and MSC picker defaults.

**Modify**

- `src/services/testEditorWorkspace/defaults.ts` - list, GUI, for-outgame param, and MSC route defaults.
- `src/hooks/useTestEditorWorkspace.ts` - expose resolved route roots.
- `src/page/TestEditor/components/MainView.tsx` - pass workspace document and route roots to consumers.
- `src/page/TestEditor/components/CharacterIdTableView.tsx` - load the fixed table from the catalog.
- `src/page/TestEditor/components/CharacterListView.tsx` - catalog-based character/list/icon locations.
- `src/page/TestEditor/components/SeriesListView.tsx` - catalog-based series/list/icon locations.
- `src/page/TestEditor/components/CharacterCostView.tsx` - catalog-based for-outgame package.
- `src/page/TestEditor/components/NutexbIconListView.tsx` - route-aware generic icon pack resolver.
- `src/page/TestEditor/components/CardIconListView.tsx` - `gui.card-icons` route.
- `src/page/TestEditor/components/StageIconListView.tsx` - `gui.stage-icons` routes.
- `src/page/TestEditor/components/StageListView.tsx` - list and icon catalog entries.
- `src/page/TestEditor/components/character-list/CharacterEditor.tsx` - propagate writable state.
- `src/page/TestEditor/components/series-list/SeriesEditor.tsx` - propagate writable state.
- `src/page/TestEditor/components/stage-list/StageEditor.tsx` - propagate writable state.
- `src/page/TestEditor/components/series-list/SeriesImageReplaceDialog.tsx` - receive resolved structure path.
- `src/page/TestEditor/components/card-icon-list/CardIconAddDialog.tsx` - receive resolved pack paths.
- `src/page/TestEditor/components/card-icon-list/CardIconReplaceDialog.tsx` - receive resolved pack root.
- `src/page/TestEditor/components/card-icon-list/CardIconBatchReplaceDialog.tsx` - receive resolved pack root.
- `src/page/TestEditor/components/param-editor/ParamEditorView.tsx` - route-root picker default.
- `src/page/TestEditor/components/param-editors/*/*EditorView.tsx` - route-root picker defaults.
- `src/page/TestEditor/components/msc-editor/MscWorkspaceView.tsx` - `040msc` picker default.
- `src/page/TestEditor/components/stage-list/stageFileNameRef.ts` - configured `stage.model` workspace path.
- `src/page/TestEditor/components/stage-list/StageFileNameStatusIcons.tsx` - pass workspace document.

## Task 1: Add Fixed Content Descriptors

**Files:**
- Modify: `src/services/testEditorWorkspace/defaults.ts`
- Create: `src/services/testEditorWorkspace/contentCatalog.ts`
- Test: `src/services/testEditorWorkspace/contentCatalog.test.ts`

- [ ] **Step 1: Write failing descriptor tests**

```typescript
it.each([
  ["character-id-table", "list.character", "0x036B9E67", "character_id_table.bin"],
  ["character-list", "list.character", "0xDFD38C70", "character_list.bin"],
  ["series-list", "list.series", "0xB7367090", "series_list.bin"],
  ["character-cost", "param.for-outgame", "0xFF832E7F", null],
  ["card-icons", "gui.card-icons", "0x49235031", null],
  ["series-icons", "gui.series-icons", "0xA0253AA0", null],
  ["stage-list", "list.stage", "0xCE74091E", "stage_list.bin"],
  ["stage-icons-primary", "gui.stage-icons", "0x3CC8B10B", null],
  ["stage-icons-secondary", "gui.stage-icons", "0x0CEE3991", null],
])("defines %s", (id, routeId, hashHex, relativeFilePath) => {
  expect(getWorkspaceContentDescriptor(id)).toMatchObject({
    routeId,
    hashHex,
    relativeFilePath,
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

```powershell
npm test -- src/services/testEditorWorkspace/contentCatalog.test.ts
```

Expected: FAIL because the catalog does not exist.

- [ ] **Step 3: Implement route defaults and descriptors**

Add these top-level route defaults:

```typescript
"list.character": { prefix: "012list", kind: "fhm2d-pack", label: "Character Lists" },
"list.series": { prefix: "012list", kind: "fhm2d-pack", label: "Series Lists" },
"list.stage": { prefix: "012list", kind: "fhm2d-pack", label: "Stage Lists" },
"gui.card-icons": { prefix: "009gui", kind: "fhm2d-pack", label: "Card Icons" },
"gui.series-icons": { prefix: "009gui", kind: "fhm2d-pack", label: "Series Icons" },
"gui.stage-icons": { prefix: "009gui", kind: "fhm2d-pack", label: "Stage Icons" },
"param.for-outgame": { prefix: "041cpm", kind: "fhm2d-pack", label: "For Outgame Param" },
"msc.workspace": { prefix: "040msc", kind: "fhm2d-pack", label: "MSC Workspace" },
```

Define `WorkspaceContentId`, `WorkspaceContentDescriptor`, `WORKSPACE_CONTENT_CATALOG`, and `getWorkspaceContentDescriptor()`.

- [ ] **Step 4: Add failing configured and legacy file resolution tests**

```typescript
it("resolves Character ID table under 012list", async () => {
  const result = await resolveWorkspaceContent(
    "E:/workspace",
    DEFAULT_TEST_EDITOR_WORKSPACE,
    "character-id-table",
  );
  expect(result.configured.filePath).toBe(
    "E:/workspace/012list/0x036B9E67/character_id_table.bin",
  );
});
```

- [ ] **Step 5: Implement content resolution**

Export:

```typescript
export interface ResolvedWorkspaceContentLocation {
  descriptor: WorkspaceContentDescriptor;
  configured: ResolvedFhm2dPackPaths & { filePath: string | null };
  existing: (ResolvedFhm2dPackPaths & { filePath: string | null }) | null;
  sourceLayout: "configured" | "legacy" | "missing";
  writable: boolean;
}

export async function resolveWorkspaceContent(...): Promise<ResolvedWorkspaceContentLocation>;
```

`writable` is true only for configured content. Resolve optional internal file paths beneath the selected pack folder.

- [ ] **Step 6: Run tests and commit**

```powershell
npm test -- src/services/testEditorWorkspace/contentCatalog.test.ts
git add src/services/testEditorWorkspace/defaults.ts src/services/testEditorWorkspace/contentCatalog.ts src/services/testEditorWorkspace/contentCatalog.test.ts
git commit -m "feat(test-editor): catalog fixed workspace packages"
```

Expected: PASS, then commit succeeds.

## Task 2: Add A Shared Legacy Read-Only Notice

**Files:**
- Create: `src/page/TestEditor/components/workspace-layout/LegacyWorkspaceNotice.tsx`
- Test: `src/page/TestEditor/components/workspace-layout/LegacyWorkspaceNotice.test.tsx`

- [ ] **Step 1: Write the failing notice test**

```tsx
render(
  <LegacyWorkspaceNotice
    sourceLayout="legacy"
    configuredPath="E:/workspace/012list/0x036B9E67"
  />,
);
expect(screen.getByText(/legacy flat workspace/i)).toBeInTheDocument();
expect(screen.getByText(/read-only/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm test -- src/page/TestEditor/components/workspace-layout/LegacyWorkspaceNotice.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the notice**

Render a compact unframed warning band only for `legacy` or duplicate layouts. Include the configured destination path and an `Open layout settings` command callback. Do not perform migration from this component.

- [ ] **Step 4: Run and verify GREEN**

```powershell
npm test -- src/page/TestEditor/components/workspace-layout/LegacyWorkspaceNotice.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the notice**

```powershell
git add src/page/TestEditor/components/workspace-layout/LegacyWorkspaceNotice.tsx src/page/TestEditor/components/workspace-layout/LegacyWorkspaceNotice.test.tsx
git commit -m "feat(test-editor): show legacy workspace read-only state"
```

## Task 3: Migrate Character ID, Character List, And Series List

**Files:**
- Modify: `src/page/TestEditor/components/MainView.tsx`
- Modify: `src/page/TestEditor/components/CharacterIdTableView.tsx`
- Modify: `src/page/TestEditor/components/CharacterListView.tsx`
- Modify: `src/page/TestEditor/components/SeriesListView.tsx`
- Modify: `src/page/TestEditor/components/character-list/CharacterEditor.tsx`
- Modify: `src/page/TestEditor/components/series-list/SeriesEditor.tsx`
- Modify: `src/page/TestEditor/components/series-list/SeriesImageReplaceDialog.tsx`
- Test: `src/page/TestEditor/components/workspaceContentConsumers.test.tsx`

- [ ] **Step 1: Write failing resolver-consumer tests**

Test the public view boundary with mocked content resolution. Assert Character ID reads `configured.filePath`, Character List requests all four required content IDs, and Series List receives the resolved series icon structure path.

- [ ] **Step 2: Run and verify RED**

```powershell
npm test -- src/page/TestEditor/components/workspaceContentConsumers.test.tsx
```

Expected: FAIL because views still join hashes under `folderPath`.

- [ ] **Step 3: Replace direct joins**

Each view resolves its content locations when workspace root or document changes. Preserve explicit loading and stale-request cancellation. Use the selected existing path for reads.

- [ ] **Step 4: Enforce legacy read-only state**

Pass `writable` into child editors. Disable save, add, delete, import-apply, image replacement, and structure mutation commands when false. Render `LegacyWorkspaceNotice` with the configured destination.

- [ ] **Step 5: Remove structure reconstruction in dialogs**

`SeriesImageReplaceDialog` receives `packRootPath` and `structureJsonPath` as props. It must not join `projectRootDir` with `0xA0253AA0_structure.json`.

- [ ] **Step 6: Run tests and build**

```powershell
npm test -- src/page/TestEditor/components/workspaceContentConsumers.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit list migrations**

```powershell
git add src/page/TestEditor/components/MainView.tsx src/page/TestEditor/components/CharacterIdTableView.tsx src/page/TestEditor/components/CharacterListView.tsx src/page/TestEditor/components/SeriesListView.tsx src/page/TestEditor/components/character-list/CharacterEditor.tsx src/page/TestEditor/components/series-list/SeriesEditor.tsx src/page/TestEditor/components/series-list/SeriesImageReplaceDialog.tsx src/page/TestEditor/components/workspaceContentConsumers.test.tsx
git commit -m "refactor(test-editor): route character and series lists"
```

## Task 4: Migrate Character Cost

**Files:**
- Modify: `src/page/TestEditor/components/CharacterCostView.tsx`
- Test: `src/page/TestEditor/components/CharacterCostView.test.tsx`

- [ ] **Step 1: Write a failing configured-path test**

```tsx
it("loads playable cost from the configured 041cpm package", async () => {
  render(<CharacterCostView {...configuredWorkspaceProps} isActive />);
  await waitFor(() => {
    expect(readFileMock).toHaveBeenCalledWith(
      "E:/workspace/041cpm/0xFF832E7F/foroutgamecharacterparam_playable.bin",
    );
  });
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm test -- src/page/TestEditor/components/CharacterCostView.test.tsx
```

Expected: FAIL because `COST_PACK_FOLDER` is joined directly under the workspace.

- [ ] **Step 3: Resolve the cost package once**

Resolve `character-cost`, then append the selected `COST_FILES[tab]` beneath its selected existing pack folder. Prevent writes and imports when the package is legacy.

- [ ] **Step 4: Run tests and build**

```powershell
npm test -- src/page/TestEditor/components/CharacterCostView.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit cost migration**

```powershell
git add src/page/TestEditor/components/CharacterCostView.tsx src/page/TestEditor/components/CharacterCostView.test.tsx
git commit -m "refactor(test-editor): route character cost package"
```

## Task 5: Migrate Generic Icon Packs

**Files:**
- Modify: `src/page/TestEditor/components/NutexbIconListView.tsx`
- Modify: `src/page/TestEditor/components/CardIconListView.tsx`
- Modify: `src/page/TestEditor/components/StageIconListView.tsx`
- Modify: `src/page/TestEditor/components/card-icon-list/CardIconAddDialog.tsx`
- Modify: `src/page/TestEditor/components/card-icon-list/CardIconReplaceDialog.tsx`
- Modify: `src/page/TestEditor/components/card-icon-list/CardIconBatchReplaceDialog.tsx`
- Test: `src/page/TestEditor/components/NutexbIconListView.test.tsx`

- [ ] **Step 1: Write a failing primary/secondary route test**

Render the generic view with content IDs instead of raw hashes and verify primary and secondary structures resolve under `009gui`.

```tsx
render(
  <NutexbIconListView
    workspaceRoot="E:/workspace"
    workspaceDocument={DEFAULT_TEST_EDITOR_WORKSPACE}
    primaryContentId="stage-icons-primary"
    secondaryContentId="stage-icons-secondary"
    layout="dual"
  />,
);
expect(resolveContentMock).toHaveBeenCalledWith(
  "E:/workspace",
  expect.anything(),
  "stage-icons-primary",
);
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm test -- src/page/TestEditor/components/NutexbIconListView.test.tsx
```

Expected: FAIL because the view accepts raw hash props and joins the workspace root.

- [ ] **Step 3: Change the generic view contract**

Replace `folderPath`, `hash`, and `secondaryHash` with workspace root/document and content IDs. Resolve complete pack locations once. Pass resolved folder and structure paths to child dialogs.

- [ ] **Step 4: Update Card and Stage wrappers**

Use `card-icons`, `stage-icons-primary`, and `stage-icons-secondary`. Keep labels and existing editor behavior.

- [ ] **Step 5: Enforce writable state in mutation dialogs**

Disable add/replace/batch replace when a selected pack is legacy. Do not reconstruct paths from hashes inside child dialogs.

- [ ] **Step 6: Run tests and build**

```powershell
npm test -- src/page/TestEditor/components/NutexbIconListView.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit icon migrations**

```powershell
git add src/page/TestEditor/components/NutexbIconListView.tsx src/page/TestEditor/components/NutexbIconListView.test.tsx src/page/TestEditor/components/CardIconListView.tsx src/page/TestEditor/components/StageIconListView.tsx src/page/TestEditor/components/card-icon-list
git commit -m "refactor(test-editor): route GUI icon packages"
```

## Task 6: Migrate Stage List And Stage Asset Probes

**Files:**
- Modify: `src/page/TestEditor/components/StageListView.tsx`
- Modify: `src/page/TestEditor/components/stage-list/StageEditor.tsx`
- Modify: `src/page/TestEditor/components/stage-list/StageForm.tsx`
- Modify: `src/page/TestEditor/components/stage-list/stageFileNameRef.ts`
- Modify: `src/page/TestEditor/components/stage-list/StageFileNameStatusIcons.tsx`
- Test: `src/page/TestEditor/components/stage-list/stageFileNameRef.test.ts`

- [ ] **Step 1: Write failing stage path tests**

```typescript
it("places extracted stage models under 001stage", async () => {
  const paths = await getStageFileNamePaths({
    value: 0x12345678,
    obDplCachePath: "E:/ob",
    obModPath: "E:/mod",
    workspaceRoot: "E:/workspace",
    workspaceDocument: DEFAULT_TEST_EDITOR_WORKSPACE,
  });
  expect(paths.workspaceFolderPath).toBe("E:/workspace/001stage/0x12345678");
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm test -- src/page/TestEditor/components/stage-list/stageFileNameRef.test.ts
```

Expected: FAIL because stage workspace paths are flat.

- [ ] **Step 3: Route stage list and icon packages**

`StageListView` resolves `stage-list`, `stage-icons-primary`, and `stage-icons-secondary` through the catalog. Pass writable state through `StageEditor` and `StageForm`.

- [ ] **Step 4: Route dynamic stage model hashes**

Change `getStageFileNamePaths()` to accept an options object with the workspace document and resolve route `stage.model`. Preserve OB/MOD paths.

- [ ] **Step 5: Run tests and build**

```powershell
npm test -- src/page/TestEditor/components/stage-list
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit stage migration**

```powershell
git add src/page/TestEditor/components/StageListView.tsx src/page/TestEditor/components/stage-list
git commit -m "refactor(test-editor): route stage workspace assets"
```

## Task 7: Provide Param And MSC Route Defaults To Pickers

**Files:**
- Modify: `src/hooks/useTestEditorWorkspace.ts`
- Modify: `src/page/TestEditor/components/MainView.tsx`
- Modify: `src/page/TestEditor/components/param-editor/ParamEditorView.tsx`
- Modify: `src/page/TestEditor/components/param-editors/arms-editor/ArmsEditorView.tsx`
- Modify: `src/page/TestEditor/components/param-editors/bullet-editor/BulletEditorView.tsx`
- Modify: `src/page/TestEditor/components/param-editors/character-editor/CharacterEditorView.tsx`
- Modify: `src/page/TestEditor/components/param-editors/chrsys-editor/ChrSysEditorView.tsx`
- Modify: `src/page/TestEditor/components/param-editors/depiction-editor/DepictionEditorView.tsx`
- Modify: `src/page/TestEditor/components/param-editors/grap-editor/GrapEditorView.tsx`
- Modify: `src/page/TestEditor/components/param-editors/hitgroup-editor/HitGroupEditorView.tsx`
- Modify: `src/page/TestEditor/components/param-editors/interaction-editor/InteractionEditorView.tsx`
- Modify: `src/page/TestEditor/components/param-editors/speed-editor/SpeedEditorView.tsx`
- Modify: `src/page/TestEditor/components/msc-editor/MscWorkspaceView.tsx`
- Test: `src/page/TestEditor/components/param-editor/workspacePickerDefaults.test.tsx`

- [ ] **Step 1: Write failing picker-default tests**

Verify Param Editor and one visual editor pass the configured `unit.param` route root to `FilePathInput.picker.defaultPath`, and MSC passes `msc.workspace`.

- [ ] **Step 2: Run and verify RED**

```powershell
npm test -- src/page/TestEditor/components/param-editor/workspacePickerDefaults.test.tsx
```

Expected: FAIL because editors only use stored last paths.

- [ ] **Step 3: Expose route roots from the workspace hook**

Add:

```typescript
routeRoots: Record<string, string>;
```

Resolve all effective route roots after workspace/document changes with one `Promise.all`. Ignore stale results.

- [ ] **Step 4: Add optional default-root props**

`ParamEditorView` and visual param editors accept `workspaceDefaultPath?: string`. Their `FilePathInput` uses:

```tsx
picker={{
  kind: "file",
  filters: existingFilters,
  defaultPath: workspaceDefaultPath,
}}
```

Preserve stored file values and per-kind keys. The default affects only the dialog starting directory.

- [ ] **Step 5: Add the MSC default**

`MscWorkspaceView` accepts `workspaceDefaultPath?: string` and supplies it to the folder dialog. Existing tree selection remains authoritative when a valid MSC folder is selected.

- [ ] **Step 6: Run tests and build**

```powershell
npm test -- src/page/TestEditor/components/param-editor/workspacePickerDefaults.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit picker defaults**

```powershell
git add src/hooks/useTestEditorWorkspace.ts src/page/TestEditor/components/MainView.tsx src/page/TestEditor/components/param-editor src/page/TestEditor/components/param-editors src/page/TestEditor/components/msc-editor/MscWorkspaceView.tsx
git commit -m "feat(test-editor): default editors to workspace routes"
```

## Task 8: Remove Unscoped Workspace Hash Joins

**Files:**
- Modify only files containing remaining runtime violations.
- Test: `src/services/testEditorWorkspace/noFlatWorkspacePaths.test.ts`

- [ ] **Step 1: Add a source policy test**

The test scans TestEditor TypeScript source with Vite `import.meta.glob("/src/page/TestEditor/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true })` and fails on direct workspace-root hash joins outside approved resolver modules. Keep the allowlist explicit and small; do not use Node `fs`.

```typescript
expect(violations).toEqual([]);
```

Detect patterns including `join(folderPath, "0x`, `join(workspaceRoot, hash`, and root-level ``${hash}_structure.json`` reconstruction.

- [ ] **Step 2: Run and verify RED**

```powershell
npm test -- src/services/testEditorWorkspace/noFlatWorkspacePaths.test.ts
```

Expected: FAIL and list remaining direct joins.

- [ ] **Step 3: Migrate every reported runtime violation**

Use content descriptors for fixed packages and route resolvers for dynamic hashes. Do not expand the allowlist to silence genuine consumers.

- [ ] **Step 4: Run policy test and build**

```powershell
npm test -- src/services/testEditorWorkspace/noFlatWorkspacePaths.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit policy enforcement**

```powershell
git add src/services/testEditorWorkspace/noFlatWorkspacePaths.test.ts src/page/TestEditor
git commit -m "test(test-editor): prevent flat workspace path regressions"
```

## Task 9: Consumer Migration Verification

**Files:**
- Modify only files required by verification failures.

- [ ] **Step 1: Run workspace service and TestEditor tests**

```powershell
npm test -- src/services/testEditorWorkspace src/page/TestEditor
```

Expected: PASS.

- [ ] **Step 2: Run full frontend verification**

```powershell
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 3: Audit direct workspace joins**

```powershell
rg -n "join\((folderPath|workspaceRoot|currentDir|projectRootDir),\s*(hash|normalizedHash|\"0x)" src/page/TestEditor
```

Expected: no runtime consumer matches.

- [ ] **Step 4: Check diff and status**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and no unrelated files.

- [ ] **Step 5: Commit verification fixes if needed**

```powershell
git add -A
git commit -m "test(test-editor): verify workspace consumer migration"
```
