# TestEditor Workspace Layout Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted, validated TestEditor workspace route configuration and migrate all six Character ID asset operations to prefix-aware paths.

**Architecture:** A new `testEditorWorkspace` service owns schema validation, default route merging, persistence, and path resolution. TestEditor loads one workspace controller at the page boundary and passes the effective layout to Character ID consumers. Frontend operations resolve category roots before invoking prefix-agnostic Rust copy/remove commands.

**Tech Stack:** React 19, TypeScript 6, Vitest 4, Tauri v2 path/fs plugins, Rust/Tauri commands

---

## File Map

**Create**

- `src/services/testEditorWorkspace/types.ts` - schema, route IDs, validation issue types.
- `src/services/testEditorWorkspace/defaults.ts` - immutable default document and field-to-route mapping.
- `src/services/testEditorWorkspace/validation.ts` - parse, validate, normalize, and merge persisted overrides.
- `src/services/testEditorWorkspace/paths.ts` - configured/legacy pack path resolution.
- `src/services/testEditorWorkspace/persistence.ts` - Tauri fs load/save for `test_editor_workspace.json`.
- `src/services/testEditorWorkspace/validation.test.ts` - schema and prefix validation tests.
- `src/services/testEditorWorkspace/paths.test.ts` - route path and legacy fallback tests.
- `src/services/testEditorWorkspace/persistence.test.ts` - missing, valid, corrupt, and save persistence tests.
- `src/hooks/useTestEditorWorkspace.ts` - workspace-scoped loading and save controller.
- `src/page/TestEditor/components/workspace-layout/WorkspaceLayoutDialog.tsx` - route prefix editor.
- `src/page/TestEditor/components/workspace-layout/WorkspaceRouteTable.tsx` - focused route row rendering.
- `src/page/TestEditor/components/workspace-layout/WorkspaceLayoutDialog.test.tsx` - layout editing behavior tests.
- `src/page/TestEditor/components/character-id-table/assetRoute.test.ts` - six-field route contract tests.
- `src/page/TestEditor/components/character-id-table/extractFhm2d.test.ts` - prefixed extraction target tests.
- `src/services/resourceRegistry/probeResourcePaths.test.ts` - route-aware collision probe tests.

**Modify**

- `src/page/TestEditor/page.tsx` - instantiate controller and open layout dialog.
- `src/page/TestEditor/components/TestEditorToolbar.tsx` - add workspace layout icon command.
- `src/page/TestEditor/components/TestEditorWorkspaceArea.tsx` - pass workspace layout to `MainView`.
- `src/page/TestEditor/components/MainView.tsx` - forward layout to Character ID Table.
- `src/page/TestEditor/components/CharacterIdTableView.tsx` - resolve six asset routes and extract-all targets.
- `src/page/TestEditor/components/character-id-table/assetRef.ts` - route-aware workspace paths and legacy state.
- `src/page/TestEditor/components/character-id-table/extractFhm2d.ts` - accept resolved output pack paths.
- `src/page/TestEditor/components/character-id-table/CharacterAssetField.tsx` - use configured roots for extract/copy/remove/reveal.
- `src/page/TestEditor/components/character-id-table/copyAssetAsNew.ts` - pass separate source and destination asset roots.
- `src/page/TestEditor/components/character-id-table/removeAssetWorkspace.ts` - pass resolved asset roots.
- `src/services/resourceRegistry/probeResourcePaths.ts` - probe configured workspace pack paths.
- `src/services/resourceRegistry/suggestUniqueSeed.ts` - carry route-aware probe context.
- `src/page/TestEditor/components/resource-registry/ResourceSeedField.tsx` - supply effective routes to unit probes.
- `src-tauri/src/commands.rs` - make copy/remove commands operate on asset roots.

## Task 1: Define And Validate Workspace Documents

**Files:**
- Create: `src/services/testEditorWorkspace/types.ts`
- Create: `src/services/testEditorWorkspace/defaults.ts`
- Create: `src/services/testEditorWorkspace/validation.ts`
- Test: `src/services/testEditorWorkspace/validation.test.ts`

- [ ] **Step 1: Write failing validation tests**

Cover default merging, preserved unknown route IDs, nested prefixes, traversal rejection, absolute path rejection, empty prefix rejection, incompatible duplicate prefixes, and unsupported versions.

```typescript
import { describe, expect, it } from "vitest";
import { parseWorkspaceDocument } from "./validation";

describe("parseWorkspaceDocument", () => {
  it("merges persisted route overrides over defaults", () => {
    const result = parseWorkspaceDocument({
      version: 1,
      legacyReadFallback: false,
      assetRoutes: {
        "unit.model": { prefix: "custom/chara", kind: "fhm2d-pack", label: "Models" },
      },
    });

    expect(result.document.assetRoutes["unit.model"].prefix).toBe("custom/chara");
    expect(result.document.assetRoutes["unit.effect"].prefix).toBe("006effect");
    expect(result.document.legacyReadFallback).toBe(false);
    expect(result.issues).toEqual([]);
  });

  it.each(["", "../outside", "C:/absolute", "//server/share", "/rooted"])(
    "rejects unsafe prefix %s",
    (prefix) => {
      const result = parseWorkspaceDocument({
        version: 1,
        legacyReadFallback: true,
        assetRoutes: {
          "unit.model": { prefix, kind: "fhm2d-pack", label: "Models" },
        },
      });
      expect(result.issues.some((issue) => issue.routeId === "unit.model")).toBe(true);
    },
  );
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
npm test -- src/services/testEditorWorkspace/validation.test.ts
```

Expected: FAIL because the workspace modules do not exist.

- [ ] **Step 3: Implement schema, defaults, and parser**

Define these public contracts:

```typescript
export const TEST_EDITOR_WORKSPACE_VERSION = 1 as const;
export const TEST_EDITOR_WORKSPACE_FILENAME = "test_editor_workspace.json";

export type WorkspaceRouteKind = "fhm2d-pack" | "directory";
export type WorkspaceAssetRouteId = string;

export interface WorkspaceAssetRouteConfig {
  prefix: string;
  kind: WorkspaceRouteKind;
  label: string;
}

export interface TestEditorWorkspaceDocument {
  version: typeof TEST_EDITOR_WORKSPACE_VERSION;
  legacyReadFallback: boolean;
  assetRoutes: Record<WorkspaceAssetRouteId, WorkspaceAssetRouteConfig>;
}

export interface WorkspaceValidationIssue {
  code: "invalid_document" | "unsupported_version" | "invalid_prefix" | "duplicate_prefix";
  message: string;
  routeId?: string;
}

export interface ParsedWorkspaceDocument {
  document: TestEditorWorkspaceDocument;
  issues: WorkspaceValidationIssue[];
  source: "defaults" | "workspace";
}
```

Export `DEFAULT_TEST_EDITOR_WORKSPACE`, `CHARACTER_ASSET_ROUTE_BY_FIELD`, `normalizeWorkspacePrefix()`, and `parseWorkspaceDocument()`. Clone defaults before merging so callers cannot mutate the catalog.

- [ ] **Step 4: Run validation tests and verify GREEN**

Run:

```powershell
npm test -- src/services/testEditorWorkspace/validation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the schema slice**

```powershell
git add src/services/testEditorWorkspace/types.ts src/services/testEditorWorkspace/defaults.ts src/services/testEditorWorkspace/validation.ts src/services/testEditorWorkspace/validation.test.ts
git commit -m "feat(test-editor): define workspace layout schema"
```

## Task 2: Resolve Configured And Legacy Pack Paths

**Files:**
- Create: `src/services/testEditorWorkspace/paths.ts`
- Test: `src/services/testEditorWorkspace/paths.test.ts`

- [ ] **Step 1: Write failing path tests**

Mock `@tauri-apps/api/path` and `@tauri-apps/plugin-fs` only at their public boundaries. Verify configured writes, configured reads, legacy fallback, missing packs, and configured-over-legacy precedence.

```typescript
it("builds the Character Model pack under 002chara", async () => {
  const paths = await resolveFhm2dPackPaths(
    "E:/XB/unpack/com/file",
    DEFAULT_TEST_EDITOR_WORKSPACE,
    "unit.model",
    "0xBDBE6FEA",
  );

  expect(paths.routeRootPath).toBe("E:/XB/unpack/com/file/002chara");
  expect(paths.folderPath).toBe("E:/XB/unpack/com/file/002chara/0xBDBE6FEA");
  expect(paths.structureJsonPath).toBe(
    "E:/XB/unpack/com/file/002chara/0xBDBE6FEA_structure.json",
  );
  expect(paths.packKey).toBe("002chara/0xBDBE6FEA");
});
```

- [ ] **Step 2: Run the tests and verify RED**

```powershell
npm test -- src/services/testEditorWorkspace/paths.test.ts
```

Expected: FAIL because `paths.ts` does not exist.

- [ ] **Step 3: Implement route and pack resolvers**

Export:

```typescript
export interface ResolvedFhm2dPackPaths {
  routeId: string;
  prefix: string;
  routeRootPath: string;
  hashHex: string;
  folderPath: string;
  structureJsonPath: string;
  packKey: string;
}

export interface ExistingFhm2dPackResolution {
  configured: ResolvedFhm2dPackPaths;
  existing: ResolvedFhm2dPackPaths | null;
  sourceLayout: "configured" | "legacy" | "missing";
  folderExists: boolean;
  structureJsonExists: boolean;
  duplicateLayout: boolean;
}

export async function resolveWorkspaceRouteRoot(...): Promise<string>;
export async function resolveFhm2dPackPaths(...): Promise<ResolvedFhm2dPackPaths>;
export async function resolveExistingFhm2dPack(...): Promise<ExistingFhm2dPackResolution>;
```

Use Tauri `join()`. `resolveExistingFhm2dPack()` must not mix a configured folder with a legacy structure file.

- [ ] **Step 4: Run the path tests and verify GREEN**

```powershell
npm test -- src/services/testEditorWorkspace/paths.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the resolver slice**

```powershell
git add src/services/testEditorWorkspace/paths.ts src/services/testEditorWorkspace/paths.test.ts
git commit -m "feat(test-editor): resolve prefixed workspace asset paths"
```

## Task 3: Persist And Load Workspace Layout

**Files:**
- Create: `src/services/testEditorWorkspace/persistence.ts`
- Create: `src/hooks/useTestEditorWorkspace.ts`
- Test: `src/services/testEditorWorkspace/persistence.test.ts`

- [ ] **Step 1: Write failing persistence tests**

Verify missing file defaults, valid file load, corrupt file preservation, and save formatting.

```typescript
it("uses defaults when test_editor_workspace.json is missing", async () => {
  mockedExists.mockResolvedValue(false);
  const loaded = await loadTestEditorWorkspace("E:/workspace");
  expect(loaded.source).toBe("defaults");
  expect(loaded.document.assetRoutes["unit.model"].prefix).toBe("002chara");
});
```

- [ ] **Step 2: Run the persistence test and verify RED**

```powershell
npm test -- src/services/testEditorWorkspace/persistence.test.ts
```

Expected: FAIL because persistence is not implemented.

- [ ] **Step 3: Implement persistence**

Export:

```typescript
export async function workspaceDocumentPath(workspaceRoot: string): Promise<string>;
export async function loadTestEditorWorkspace(workspaceRoot: string): Promise<ParsedWorkspaceDocument>;
export async function saveTestEditorWorkspace(
  workspaceRoot: string,
  document: TestEditorWorkspaceDocument,
): Promise<void>;
```

Use `exists`, `readTextFile`, and `writeTextFile` from `@tauri-apps/plugin-fs`. Validate before save. Write `JSON.stringify(document, null, 2) + "\n"`.

- [ ] **Step 4: Implement the workspace hook**

The hook exposes:

```typescript
export interface UseTestEditorWorkspaceResult {
  workspaceRoot: string;
  document: TestEditorWorkspaceDocument;
  source: "defaults" | "workspace";
  issues: WorkspaceValidationIssue[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  reload(): Promise<void>;
  save(document: TestEditorWorkspaceDocument): Promise<void>;
}
```

Use explicit loading states for I/O. Ignore stale loads after the workspace root changes.

- [ ] **Step 5: Run persistence tests and TypeScript build**

```powershell
npm test -- src/services/testEditorWorkspace/persistence.test.ts
npm run build
```

Expected: tests PASS; build PASS.

- [ ] **Step 6: Commit persistence and hook**

```powershell
git add src/services/testEditorWorkspace/persistence.ts src/services/testEditorWorkspace/persistence.test.ts src/hooks/useTestEditorWorkspace.ts
git commit -m "feat(test-editor): persist workspace layout settings"
```

## Task 4: Add Workspace Layout Settings UI

**Files:**
- Create: `src/page/TestEditor/components/workspace-layout/WorkspaceLayoutDialog.tsx`
- Create: `src/page/TestEditor/components/workspace-layout/WorkspaceRouteTable.tsx`
- Modify: `src/page/TestEditor/components/TestEditorToolbar.tsx`
- Modify: `src/page/TestEditor/page.tsx`
- Test: `src/page/TestEditor/components/workspace-layout/WorkspaceLayoutDialog.test.tsx`

- [ ] **Step 1: Write the failing component test**

Verify route rows render, invalid traversal blocks save, reset restores the default, and save emits a complete v1 document.

```tsx
render(
  <WorkspaceLayoutDialog
    open
    controller={controllerFixture}
    onOpenChange={onOpenChange}
  />,
);

await user.clear(screen.getByLabelText("Character Model prefix"));
await user.type(screen.getByLabelText("Character Model prefix"), "../outside");
expect(screen.getByRole("button", { name: "Save layout" })).toBeDisabled();
```

- [ ] **Step 2: Run the component test and verify RED**

```powershell
npm test -- src/page/TestEditor/components/workspace-layout/WorkspaceLayoutDialog.test.tsx
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the route table and dialog**

Use `AppRndModalShell`, `Input`, `Switch`, and icon buttons with Lucide `RotateCcw`, `Save`, and `RefreshCw`. Show route label, route ID, and relative prefix. Do not nest cards.

- [ ] **Step 4: Wire the toolbar command**

Add a `Settings2` icon button with tooltip/title `Workspace layout`. Disable it when no workspace is selected. `TestEditorPage` owns dialog open state and calls `useTestEditorWorkspace(currentDir)` once.

- [ ] **Step 5: Run UI tests and build**

```powershell
npm test -- src/page/TestEditor/components/workspace-layout/WorkspaceLayoutDialog.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit the settings UI**

```powershell
git add src/page/TestEditor/components/workspace-layout src/page/TestEditor/components/TestEditorToolbar.tsx src/page/TestEditor/page.tsx
git commit -m "feat(test-editor): add workspace layout settings"
```

## Task 5: Map Character Fields To Routes

**Files:**
- Modify: `src/page/TestEditor/components/TestEditorWorkspaceArea.tsx`
- Modify: `src/page/TestEditor/components/MainView.tsx`
- Modify: `src/page/TestEditor/components/CharacterIdTableView.tsx`
- Modify: `src/page/TestEditor/components/character-id-table/assetRef.ts`
- Test: `src/page/TestEditor/components/character-id-table/assetRoute.test.ts`

- [ ] **Step 1: Write the failing field route tests**

```typescript
it.each([
  ["Model", "unit.model", "002chara"],
  ["Effect", "unit.effect", "006effect"],
  ["Sound", "unit.sound", "090sound"],
  ["Param", "unit.param", "041cpm"],
  ["Msc", "unit.msc", "040msc"],
  ["Motion", "unit.motion", "003motion"],
])("maps %s to %s", async (fieldKey, routeId, prefix) => {
  expect(getCharacterAssetRouteId(fieldKey)).toBe(routeId);
  const ref = await getAssetRefInfo({
    fieldKey,
    value: -1111597078,
    obDplCachePath: "E:/OB/dplcache",
    obModPath: "E:/OB/mod",
    workspaceRoot: "E:/workspace",
    workspaceDocument: DEFAULT_TEST_EDITOR_WORKSPACE,
  });
  expect(ref.workspacePack.configured.prefix).toBe(prefix);
});
```

- [ ] **Step 2: Run the route tests and verify RED**

```powershell
npm test -- src/page/TestEditor/components/character-id-table/assetRoute.test.ts
```

Expected: FAIL because `getAssetRefInfo` still assumes a flat workspace.

- [ ] **Step 3: Refactor `AssetRefInfo`**

Use this shape:

```typescript
export interface AssetRefInfo {
  fieldKey: string;
  routeId: string;
  rawValue: number;
  hashHex: string;
  sourceFilePath: string;
  modFilePath: string;
  workspacePack: ExistingFhm2dPackResolution;
  isModel: boolean;
  isEffectAsset: boolean;
  isParamAsset: boolean;
  isMscAsset: boolean;
  isMotionAsset: boolean;
  isSoundAsset: boolean;
}
```

Replace the positional `getAssetRefInfo()` arguments with one typed object. Resolve source/mod FHM2D paths as before and workspace paths through `resolveExistingFhm2dPack()`.

- [ ] **Step 4: Pass the effective document through the page hierarchy**

Add a `workspaceDocument` prop from `TestEditorPage` to `TestEditorWorkspaceArea`, `MainView`, and `CharacterIdTableView`. Include it in asset resolution dependencies.

- [ ] **Step 5: Run route tests and build**

```powershell
npm test -- src/page/TestEditor/components/character-id-table/assetRoute.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit field routing**

```powershell
git add src/page/TestEditor/components/TestEditorWorkspaceArea.tsx src/page/TestEditor/components/MainView.tsx src/page/TestEditor/components/CharacterIdTableView.tsx src/page/TestEditor/components/character-id-table/assetRef.ts src/page/TestEditor/components/character-id-table/assetRoute.test.ts
git commit -m "refactor(test-editor): route character assets by workspace layout"
```

## Task 6: Route Extraction And Collision Detection

**Files:**
- Modify: `src/page/TestEditor/components/character-id-table/extractFhm2d.ts`
- Modify: `src/page/TestEditor/components/character-id-table/CharacterAssetField.tsx`
- Modify: `src/page/TestEditor/components/CharacterIdTableView.tsx`
- Test: `src/page/TestEditor/components/character-id-table/extractFhm2d.test.ts`

- [ ] **Step 1: Write failing extraction target tests**

```typescript
it("extracts Model to the configured 002chara pack folder", async () => {
  mockedExtractFHMData.mockResolvedValue({ namingError: undefined });
  const target = await resolveFhm2dPackPaths(
    "E:/output",
    DEFAULT_TEST_EDITOR_WORKSPACE,
    "unit.model",
    "0xBDBE6FEA",
  );

  const result = await extractAsset(assetFixture, target);

  expect(mockedExtractFHMData).toHaveBeenCalledWith(
    assetFixture.sourceFilePath,
    "E:/output/002chara/0xBDBE6FEA",
    expect.anything(),
    expect.anything(),
    undefined,
    false,
  );
  expect(result.path).toBe("E:/output/002chara/0xBDBE6FEA");
});
```

- [ ] **Step 2: Run extraction tests and verify RED**

```powershell
npm test -- src/page/TestEditor/components/character-id-table/extractFhm2d.test.ts
```

Expected: FAIL because `extractAsset` still joins a raw output root and hash.

- [ ] **Step 3: Change extraction contracts**

Use:

```typescript
export async function getExtractOutputFolderCollisionInfo(
  target: ResolvedFhm2dPackPaths,
): Promise<{ targetDir: string; folderExists: boolean }>;

export async function extractAsset(
  asset: AssetRefInfo,
  target: ResolvedFhm2dPackPaths,
  options?: ExtractAssetOptions,
): Promise<ExtractResult>;
```

`CharacterAssetField` resolves the output pack from `extractOutputPath`, `workspaceDocument`, `asset.routeId`, and `asset.hashHex`. `handleExtractAll` resolves each route independently before extraction.

- [ ] **Step 4: Correct existence refresh semantics**

After extraction, recompute workspace existence only when the returned folder path equals the configured workspace pack path. A separate output root must not set the workspace badge to true.

- [ ] **Step 5: Run extraction tests and build**

```powershell
npm test -- src/page/TestEditor/components/character-id-table/extractFhm2d.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit extraction routing**

```powershell
git add src/page/TestEditor/components/character-id-table/extractFhm2d.ts src/page/TestEditor/components/character-id-table/extractFhm2d.test.ts src/page/TestEditor/components/character-id-table/CharacterAssetField.tsx src/page/TestEditor/components/CharacterIdTableView.tsx
git commit -m "feat(test-editor): extract character assets under route prefixes"
```

## Task 7: Make Copy And Remove Commands Prefix-Agnostic

**Files:**
- Modify: `src/page/TestEditor/components/character-id-table/copyAssetAsNew.ts`
- Modify: `src/page/TestEditor/components/character-id-table/removeAssetWorkspace.ts`
- Modify: `src/page/TestEditor/components/character-id-table/CharacterAssetField.tsx`
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Add Rust regression tests**

Extract testable helpers so tests can use a temporary asset root:

```rust
#[test]
fn copy_asset_as_new_can_read_legacy_and_write_configured() {
    let legacy = tempfile::tempdir().unwrap();
    let configured = tempfile::tempdir().unwrap();
    seed_pack_pair(legacy.path(), "0xBDBE6FEA");
    let result = copy_asset_as_new_impl(
        legacy.path(),
        configured.path(),
        "0xBDBE6FEA",
        "custom_seed",
    ).unwrap();
    assert!(configured.path().join(&result.new_hash_hex).is_dir());
    assert!(configured.path().join(format!("{}_structure.json", result.new_hash_hex)).is_file());
}
```

- [ ] **Step 2: Run the Rust tests and verify RED**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml copy_asset_as_new_can_read_legacy_and_write_configured -- --nocapture
```

Expected: FAIL because the implementation helper does not exist.

- [ ] **Step 3: Refactor Rust command arguments**

Change `copy_asset_as_new(project_root_dir, ...)` to `copy_asset_as_new(source_asset_root_dir, destination_asset_root_dir, ...)`. Change `RemoveAssetTargets` fields from workspace/output project roots to resolved asset roots while preserving camelCase serialization:

```rust
pub struct RemoveAssetTargets {
    pub workspace_asset_root: Option<String>,
    pub extract_output_asset_root: Option<String>,
    pub mod_directory: Option<String>,
}
```

Keep hash normalization and containment at `asset_root/hash`. Do not add route mappings to Rust.

- [ ] **Step 4: Update TypeScript wrappers and callers**

`CharacterAssetField` passes `asset.workspacePack.existing.routeRootPath` as the copy source and `asset.workspacePack.configured.routeRootPath` as the destination. It resolves the route root under the extract output directory for remove. Copy is disabled when `existing` is null.

- [ ] **Step 5: Run Rust tests, targeted frontend tests, and build**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml copy_asset_as_new -- --nocapture
npm test -- src/page/TestEditor/components/character-id-table
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit copy/remove routing**

```powershell
git add src-tauri/src/commands.rs src/page/TestEditor/components/character-id-table/copyAssetAsNew.ts src/page/TestEditor/components/character-id-table/removeAssetWorkspace.ts src/page/TestEditor/components/character-id-table/CharacterAssetField.tsx
git commit -m "refactor(test-editor): scope asset commands to resolved roots"
```

## Task 8: Keep Resource Registry Probes Route-Aware

**Files:**
- Modify: `src/services/resourceRegistry/probeResourcePaths.ts`
- Modify: `src/services/resourceRegistry/suggestUniqueSeed.ts`
- Modify: `src/page/TestEditor/components/resource-registry/ResourceSeedField.tsx`
- Modify: `src/page/TestEditor/components/CharacterIdTableView.tsx`
- Test: `src/services/resourceRegistry/probeResourcePaths.test.ts`

- [ ] **Step 1: Write failing unit probe tests**

Verify a `unit/model` seed probes `workspace/002chara/0xHASH`, not `workspace/0xHASH`, and a stage probe uses `001stage`.

- [ ] **Step 2: Run the probe test and verify RED**

```powershell
npm test -- src/services/resourceRegistry/probeResourcePaths.test.ts
```

Expected: FAIL with the current flat workspace path.

- [ ] **Step 3: Add workspace layout to probe inputs**

Extend `ProbeResourcePathsParams` and `SuggestUniqueSeedParams` with `workspaceDocument`. Map category/slot to route IDs through one exported helper. Preserve global registry persistence semantics.

- [ ] **Step 4: Run resource registry tests and build**

```powershell
npm test -- src/services/resourceRegistry
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit registry probe integration**

```powershell
git add src/services/resourceRegistry/probeResourcePaths.ts src/services/resourceRegistry/probeResourcePaths.test.ts src/services/resourceRegistry/suggestUniqueSeed.ts src/page/TestEditor/components/resource-registry/ResourceSeedField.tsx src/page/TestEditor/components/CharacterIdTableView.tsx
git commit -m "fix(resource-registry): probe configured workspace routes"
```

## Task 9: Foundation Verification

**Files:**
- Modify only files required by verification failures.

- [ ] **Step 1: Run all workspace and Character asset tests**

```powershell
npm test -- src/services/testEditorWorkspace src/page/TestEditor/components/character-id-table src/services/resourceRegistry
```

Expected: PASS.

- [ ] **Step 2: Run full frontend tests and build**

```powershell
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run Rust command tests**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml commands -- --nocapture
```

Expected: PASS.

- [ ] **Step 4: Review the diff**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only intended workspace layout files changed.

- [ ] **Step 5: Manual path audit**

Verify these computed destinations in the UI without starting a dev server:

```text
workspace/002chara/0xBDBE6FEA
output/002chara/0xBDBE6FEA
workspace/003motion/0xHASH
workspace/006effect/0xHASH
workspace/040msc/0xHASH
workspace/041cpm/0xHASH
workspace/090sound/0xHASH
```

- [ ] **Step 6: Commit any verification fixes**

```powershell
git add -A
git commit -m "test(test-editor): verify workspace layout foundation"
```

## Follow-On Plans

After this plan passes, write and execute:

1. `2026-06-19-test-editor-workspace-tree-repack.md` for nested pack dirty tracking and full-path repack.
2. `2026-06-19-test-editor-workspace-consumer-migration.md` for Character/List, Stage, icon, param, and MSC route adoption.
3. `2026-06-19-test-editor-workspace-legacy-migration.md` for explicit previewable flat-to-prefix moves.
