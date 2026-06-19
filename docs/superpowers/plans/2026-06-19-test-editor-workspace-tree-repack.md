# TestEditor Nested Workspace Tree And Repack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TestEditor file-tree dirty tracking, folder/structure pairing, reveal, context-menu repack, and batch repack work for packs nested under configured route prefixes.

**Architecture:** A pure pack-identity module classifies watcher and tree paths against the effective workspace route prefixes using longest-prefix matching. Dirty state is keyed by `prefix/hash`, and repack surfaces exchange complete folder/structure paths instead of rebuilding root-level paths. Legacy direct-child packs remain supported when fallback is enabled.

**Tech Stack:** React 19, TypeScript 6, Vitest 4, react-arborist, Tauri v2 path/fs plugins

---

## File Map

**Create**

- `src/services/testEditorWorkspace/packIdentity.ts` - pure configured/legacy path classification.
- `src/services/testEditorWorkspace/packIdentity.test.ts` - nested, duplicate-hash, longest-prefix, and legacy tests.
- `src/page/TestEditor/components/fileTreeNodeRowUtils.test.ts` - nested folder and structure repack target tests.

**Modify**

- `src/services/testEditorWorkspace/types.ts` - dirty pack and repack target contracts.
- `src/page/TestEditor/utils/testEditorTreeOps.ts` - return pack identities instead of top-level folder names.
- `src/page/TestEditor/utils/testEditorTreeOps.test.ts` - nested reveal and dirty classification coverage.
- `src/page/TestEditor/page.tsx` - store dirty packs by `packKey` and pass the effective document.
- `src/page/TestEditor/components/TestEditorWorkspaceArea.tsx` - pass dirty pack records and workspace document.
- `src/page/TestEditor/components/FileTreePane.tsx` - nested structure index and full-path repack target creation.
- `src/page/TestEditor/components/FileTreeNodeRow.tsx` - route-aware dirty/repack display.
- `src/page/TestEditor/components/fileTreeNodeRowUtils.ts` - replace root-only helpers.
- `src/page/TestEditor/components/ListeningRepackDialog.tsx` - consume complete dirty pack targets.
- `src/page/TestEditor/components/ListeningRepackDialog.test.tsx` - duplicate hashes and full-path repack behavior.

## Task 1: Define Pack Identity Contracts

**Files:**
- Modify: `src/services/testEditorWorkspace/types.ts`
- Create: `src/services/testEditorWorkspace/packIdentity.ts`
- Test: `src/services/testEditorWorkspace/packIdentity.test.ts`

- [ ] **Step 1: Write the first failing configured-route test**

```typescript
it("classifies a nested Character Model file as 002chara/0xBDBE6FEA", () => {
  const identity = classifyWorkspacePackPath({
    workspaceRoot: "E:/workspace",
    nodePath: "E:/workspace/002chara/0xBDBE6FEA/0.numdlb",
    nodeIsDirectory: false,
    document: DEFAULT_TEST_EDITOR_WORKSPACE,
  });

  expect(identity).toEqual({
    packKey: "002chara/0xBDBE6FEA",
    routeId: "unit.model",
    prefix: "002chara",
    hashFolderName: "0xBDBE6FEA",
    folderPath: "E:/workspace/002chara/0xBDBE6FEA",
    structureJsonPath: "E:/workspace/002chara/0xBDBE6FEA_structure.json",
    sourceLayout: "configured",
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
npm test -- src/services/testEditorWorkspace/packIdentity.test.ts
```

Expected: FAIL because `classifyWorkspacePackPath` does not exist.

- [ ] **Step 3: Implement the minimal configured classifier**

Add:

```typescript
export interface WorkspacePackIdentity {
  packKey: string;
  routeId: string | null;
  prefix: string;
  hashFolderName: string;
  folderPath: string;
  structureJsonPath: string;
  sourceLayout: "configured" | "legacy";
}

export function classifyWorkspacePackPath(params: {
  workspaceRoot: string;
  nodePath: string;
  nodeIsDirectory?: boolean;
  document: TestEditorWorkspaceDocument;
}): WorkspacePackIdentity | null;
```

Normalize path separators and casing for comparisons while preserving configured prefix and on-disk hash casing in returned display paths.

- [ ] **Step 4: Run the first test and verify GREEN**

```powershell
npm test -- src/services/testEditorWorkspace/packIdentity.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add failing edge-case tests one at a time**

Cover:

```typescript
it("keeps equal hashes under different prefixes distinct", () => {
  const model = classify("E:/workspace/002chara/0x12345678/a.bin");
  const effect = classify("E:/workspace/006effect/0x12345678/b.bin");
  expect(model?.packKey).toBe("002chara/0x12345678");
  expect(effect?.packKey).toBe("006effect/0x12345678");
});

it("uses the longest configured prefix", () => {
  // The test document adds a custom fhm2d route with prefix 041cpm/arms_param.
  const identity = classify("E:/workspace/041cpm/arms_param/0x12345678/a.bin");
  expect(identity?.prefix).toBe("041cpm/arms_param");
});

it("classifies root-level packs only when legacy fallback is enabled", () => {
  expect(classify("E:/workspace/0x12345678/a.bin")?.sourceLayout).toBe("legacy");
});

it("returns null for route directories and unrelated files", () => {
  expect(classify("E:/workspace/002chara")).toBeNull();
  expect(classify("E:/workspace/test_editor_workspace.json")).toBeNull();
});
```

For a prefix shared by multiple `fhm2d-pack` routes, return `routeId: null`; the physical `packKey` remains unambiguous.

- [ ] **Step 6: Run tests after each minimal implementation and refactor when green**

```powershell
npm test -- src/services/testEditorWorkspace/packIdentity.test.ts
```

Expected: PASS after every cycle.

- [ ] **Step 7: Commit pack classification**

```powershell
git add src/services/testEditorWorkspace/types.ts src/services/testEditorWorkspace/packIdentity.ts src/services/testEditorWorkspace/packIdentity.test.ts
git commit -m "feat(test-editor): classify nested workspace packs"
```

## Task 2: Replace Top-Level Dirty Folder Tracking

**Files:**
- Modify: `src/page/TestEditor/utils/testEditorTreeOps.ts`
- Modify: `src/page/TestEditor/utils/testEditorTreeOps.test.ts`
- Modify: `src/page/TestEditor/page.tsx`

- [ ] **Step 1: Write a failing dirty-pack test**

```typescript
it("returns a nested dirty pack for watcher file events", () => {
  const identity = getDirtyPackFromPath(
    "E:/workspace/002chara/0xBDBE6FEA/0.numdlb",
    "E:/workspace",
    false,
    DEFAULT_TEST_EDITOR_WORKSPACE,
  );
  expect(identity?.packKey).toBe("002chara/0xBDBE6FEA");
});
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
npm test -- src/page/TestEditor/utils/testEditorTreeOps.test.ts
```

Expected: FAIL because `getDirtyPackFromPath` is missing.

- [ ] **Step 3: Replace the old helper**

Remove `getTopLevelFolderName()` and `getDirtyFolderNameFromPath()` from runtime use. Export:

```typescript
export function getDirtyPackFromPath(
  nodePath: string,
  workspaceRoot: string,
  nodeIsDirectory: boolean | undefined,
  document: TestEditorWorkspaceDocument,
): WorkspacePackIdentity | null {
  return classifyWorkspacePackPath({
    workspaceRoot,
    nodePath,
    nodeIsDirectory,
    document,
  });
}
```

- [ ] **Step 4: Change page dirty state**

Use:

```typescript
const [dirtyPacks, setDirtyPacks] = useState<Map<string, WorkspacePackIdentity>>(
  () => new Map(),
);
```

During watcher queue flush, classify each operation with the current workspace document and merge by `packKey`. Store the effective document in a ref so the flush callback does not resubscribe the watcher for each layout object identity change.

- [ ] **Step 5: Update success and clear handlers**

`handleRepackSuccess(packKey)` deletes exactly one key. Clearing dirty state creates a new empty map. Route changes clear stale dirty identities after explicit confirmation in the layout dialog.

- [ ] **Step 6: Run tree tests and build**

```powershell
npm test -- src/page/TestEditor/utils/testEditorTreeOps.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit dirty state migration**

```powershell
git add src/page/TestEditor/utils/testEditorTreeOps.ts src/page/TestEditor/utils/testEditorTreeOps.test.ts src/page/TestEditor/page.tsx
git commit -m "refactor(test-editor): key dirty packs by workspace prefix"
```

## Task 3: Resolve Nested Folder And Structure Targets

**Files:**
- Modify: `src/page/TestEditor/components/fileTreeNodeRowUtils.ts`
- Create: `src/page/TestEditor/components/fileTreeNodeRowUtils.test.ts`

- [ ] **Step 1: Write failing folder and structure tests**

```typescript
it("resolves a configured nested hash folder", () => {
  const target = parseWorkspacePackNodeTarget(
    dirNode("E:/workspace/002chara/0xBDBE6FEA"),
    "E:/workspace",
    DEFAULT_TEST_EDITOR_WORKSPACE,
  );
  expect(target?.packKey).toBe("002chara/0xBDBE6FEA");
  expect(target?.structureJsonPath).toBe(
    "E:/workspace/002chara/0xBDBE6FEA_structure.json",
  );
});

it("resolves the sibling structure JSON to the same pack", () => {
  const target = parseWorkspacePackNodeTarget(
    fileNode("E:/workspace/002chara/0xBDBE6FEA_structure.json"),
    "E:/workspace",
    DEFAULT_TEST_EDITOR_WORKSPACE,
  );
  expect(target?.folderPath).toBe("E:/workspace/002chara/0xBDBE6FEA");
});
```

- [ ] **Step 2: Run the tests and verify RED**

```powershell
npm test -- src/page/TestEditor/components/fileTreeNodeRowUtils.test.ts
```

Expected: FAIL because the root-only helpers are still present.

- [ ] **Step 3: Implement one route-aware helper**

Replace `isWorkspaceDirectChildFolder()` and `parseRootStructureJsonRepackTarget()` with:

```typescript
export function parseWorkspacePackNodeTarget(
  node: TestTreeNode,
  workspaceRoot: string | undefined,
  document: TestEditorWorkspaceDocument,
): WorkspacePackIdentity | null;
```

For a structure JSON, strip `_structure.json` and classify a synthetic folder path in the same parent. Reject non-pack route folders and unrelated JSON files.

- [ ] **Step 4: Run tests and verify GREEN**

```powershell
npm test -- src/page/TestEditor/components/fileTreeNodeRowUtils.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit target parsing**

```powershell
git add src/page/TestEditor/components/fileTreeNodeRowUtils.ts src/page/TestEditor/components/fileTreeNodeRowUtils.test.ts
git commit -m "feat(test-editor): pair nested pack folders and structures"
```

## Task 4: Build A Recursive Structure Path Index

**Files:**
- Modify: `src/page/TestEditor/components/FileTreePane.tsx`
- Modify: `src/page/TestEditor/components/FileTreeNodeRow.tsx`
- Test: `src/page/TestEditor/components/fileTreeNodeRowUtils.test.ts`

- [ ] **Step 1: Add a failing recursive index test**

```typescript
it("indexes nested structure JSON paths", () => {
  const paths = collectStructureJsonPathKeys([
    dirNode("E:/workspace/002chara", [
      fileNode("E:/workspace/002chara/0xBDBE6FEA_structure.json"),
    ]),
  ]);
  expect(paths.has("e:/workspace/002chara/0xbdbe6fea_structure.json")).toBe(true);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm test -- src/page/TestEditor/components/fileTreeNodeRowUtils.test.ts
```

Expected: FAIL because the recursive index helper is missing.

- [ ] **Step 3: Implement recursive indexing**

Export `collectStructureJsonPathKeys(nodes)` from `fileTreeNodeRowUtils.ts`. Traverse the already-loaded tree once and normalize matching `_structure.json` paths. Do not call `exists()` per row.

- [ ] **Step 4: Replace root-level scan props**

Remove `workspaceTopLevelFolderNames`, `workspaceRootStructureJsonNames`, and `fileTreeStructureScanKey` from `TestEditorPage`, `TestEditorWorkspaceArea`, and `FileTreePane`. `FileTreePane` derives the recursive index from its unfiltered tree data.

Because the displayed `data` may be filtered, add a separate `workspaceTreeData` prop containing the full tree for structure indexing.

- [ ] **Step 5: Update row context**

Replace `structureJsonExistsAtWorkspaceRoot`, `resolveTopLevelName`, and `dirtyTopLevelSet` with:

```typescript
dirtyPackKeys: ReadonlySet<string>;
workspaceDocument: TestEditorWorkspaceDocument;
structureJsonPathKeys: ReadonlySet<string>;
```

Rows parse their own pack target and check dirty/readiness by normalized full paths.

- [ ] **Step 6: Run tests and build**

```powershell
npm test -- src/page/TestEditor/components/fileTreeNodeRowUtils.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit recursive tree state**

```powershell
git add src/page/TestEditor/page.tsx src/page/TestEditor/components/TestEditorWorkspaceArea.tsx src/page/TestEditor/components/FileTreePane.tsx src/page/TestEditor/components/FileTreeNodeRow.tsx src/page/TestEditor/components/fileTreeNodeRowUtils.ts src/page/TestEditor/components/fileTreeNodeRowUtils.test.ts
git commit -m "refactor(test-editor): index nested pack structures"
```

## Task 5: Repack One Nested Pack By Full Paths

**Files:**
- Modify: `src/page/TestEditor/components/FileTreePane.tsx`
- Modify: `src/page/TestEditor/components/FileTreeNodeRow.tsx`

- [ ] **Step 1: Add a failing full-target test**

Extend `fileTreeNodeRowUtils.test.ts` to prove the repack target for `002chara/0xBDBE6FEA` retains its nested folder and structure paths.

```typescript
expect(target).toMatchObject({
  packKey: "002chara/0xBDBE6FEA",
  folderPath: "E:/workspace/002chara/0xBDBE6FEA",
  structureJsonPath: "E:/workspace/002chara/0xBDBE6FEA_structure.json",
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm test -- src/page/TestEditor/components/fileTreeNodeRowUtils.test.ts
```

Expected: FAIL until the full target is used by the repack flow.

- [ ] **Step 3: Simplify the context-menu flow**

Use one `openRepackDialogForNode(node)` callback. Parse the full target, verify `folderPath` and `structureJsonPath` exist, then call `beginRepackFlow(target)`. Do not join `currentDir` with a folder name.

- [ ] **Step 4: Repack with supplied full paths**

Pass `target.structureJsonPath` and `target.folderPath` directly to `repackFolderUsingStructureToModFolder()`. Call `onFolderRepacked(target.packKey)` on success. Use `hashFolderName` for output labels and `.vgsht2` removal.

- [ ] **Step 5: Run targeted tests and build**

```powershell
npm test -- src/page/TestEditor/components/fileTreeNodeRowUtils.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit single-pack repack**

```powershell
git add src/page/TestEditor/components/FileTreePane.tsx src/page/TestEditor/components/FileTreeNodeRow.tsx
git commit -m "feat(test-editor): repack nested packs from tree"
```

## Task 6: Repack Dirty Packs By Full Paths

**Files:**
- Modify: `src/page/TestEditor/components/ListeningRepackDialog.tsx`
- Modify: `src/page/TestEditor/components/ListeningRepackDialog.test.tsx`
- Modify: `src/page/TestEditor/components/TestEditorWorkspaceArea.tsx`
- Modify: `src/page/TestEditor/page.tsx`

- [ ] **Step 1: Replace the existing test with a failing full-path test**

```tsx
const dirtyPacks = [
  pack("002chara/0x12345678", "E:/workspace/002chara/0x12345678"),
  pack("006effect/0x12345678", "E:/workspace/006effect/0x12345678"),
];

render(
  <ListeningRepackDialog
    open
    dirtyPacks={dirtyPacks}
    modFolderPath="E:/mod"
    onOpenChange={() => {}}
    onPackRepacked={() => {}}
  />,
);

expect(await screen.findByText("002chara/0x12345678")).toBeInTheDocument();
expect(screen.getByText("006effect/0x12345678")).toBeInTheDocument();
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm test -- src/page/TestEditor/components/ListeningRepackDialog.test.tsx
```

Expected: FAIL because the dialog still accepts `rootDir` and `dirtyFolders`.

- [ ] **Step 3: Change the dialog contract**

```typescript
type ListeningRepackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dirtyPacks: WorkspacePackIdentity[];
  modFolderPath?: string;
  onPackRepacked: (packKey: string) => void;
  onComplete?: () => void;
};
```

Initialize entries directly from identities, then verify each supplied structure path with `exists()`. Key virtual rows and selection by `packKey`.

- [ ] **Step 4: Repack each selected full target**

Use the supplied folder and structure paths. Never reconstruct from a shared root. Display `packKey` as the primary label and the structure path as secondary text.

- [ ] **Step 5: Update page and workspace area props**

Pass `Array.from(dirtyPacks.values())`. Replace `onFolderRepacked` with `onPackRepacked` through the component boundary.

- [ ] **Step 6: Run dialog tests and build**

```powershell
npm test -- src/page/TestEditor/components/ListeningRepackDialog.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit batch repack migration**

```powershell
git add src/page/TestEditor/components/ListeningRepackDialog.tsx src/page/TestEditor/components/ListeningRepackDialog.test.tsx src/page/TestEditor/components/TestEditorWorkspaceArea.tsx src/page/TestEditor/page.tsx
git commit -m "feat(test-editor): batch repack nested dirty packs"
```

## Task 7: Verify Nested Reveal And Folder Selection

**Files:**
- Modify: `src/page/TestEditor/utils/testEditorTreeOps.test.ts`
- Modify: `src/page/TestEditor/page.tsx` only if tests expose a defect.

- [ ] **Step 1: Add a nested reveal regression test**

```typescript
it("finds a nested hash folder by its configured full path", () => {
  const tree = [
    dir("E:/workspace/002chara", "002chara", [
      dir("E:/workspace/002chara/0xBDBE6FEA", "0xBDBE6FEA"),
    ]),
  ];
  expect(
    findTreeNodeByPath(tree, "E:\\workspace\\002chara\\0xBDBE6FEA", "E:/workspace")?.name,
  ).toBe("0xBDBE6FEA");
});
```

- [ ] **Step 2: Run and inspect the result**

```powershell
npm test -- src/page/TestEditor/utils/testEditorTreeOps.test.ts
```

Expected: PASS with current recursive full-path matching. If it fails, fix only normalized ancestor traversal and rerun.

- [ ] **Step 3: Add sibling structure selection coverage**

Test the pure target helper to ensure selecting a nested hash folder resolves the sibling structure JSON in the same parent, never at workspace root.

- [ ] **Step 4: Run targeted tests and build**

```powershell
npm test -- src/page/TestEditor/utils/testEditorTreeOps.test.ts src/page/TestEditor/components/fileTreeNodeRowUtils.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit only if code changed**

```powershell
git add src/page/TestEditor/utils/testEditorTreeOps.test.ts src/page/TestEditor/page.tsx
git commit -m "test(test-editor): cover nested workspace reveal"
```

## Task 8: Tree And Repack Verification

**Files:**
- Modify only files required by verification failures.

- [ ] **Step 1: Run all relevant frontend tests**

```powershell
npm test -- src/services/testEditorWorkspace src/page/TestEditor/utils/testEditorTreeOps.test.ts src/page/TestEditor/components/fileTreeNodeRowUtils.test.ts src/page/TestEditor/components/ListeningRepackDialog.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run complete frontend verification**

```powershell
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 3: Verify no old root-only API remains**

```powershell
rg -n "dirtyFolders|dirtyTopLevelFolderNames|workspaceTopLevelFolderNames|workspaceRootStructureJsonNames|isWorkspaceDirectChildFolder|parseRootStructureJsonRepackTarget|getDirtyFolderNameFromPath" src/page/TestEditor
```

Expected: no runtime references; test migration notes may mention old names only when intentionally asserting removal.

- [ ] **Step 4: Review diff quality**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and no unrelated changes.

- [ ] **Step 5: Commit verification fixes if present**

```powershell
git add -A
git commit -m "test(test-editor): verify nested workspace repack"
```
