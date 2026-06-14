# Unit Model Editor — Full SSBH File Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit `.numatb` / `.numdlb` / `.nuhlpb` / `.jnttbl` files from the Unit Model Editor's structure tree via right-click + double-click, reusing the existing SSBH editor modal hosts, plus four companion features (auto-preview-refresh on save, dirty/modified badges, Reveal/Copy-path, texture↔numatb cross-nav).

**Architecture:** Extract a shared session-management hook (`useSsbhFileEditorSessions`) + host component (`SsbhFileEditorHosts`) into `src/components/ssbh-model-preview/`, ported verbatim from the proven TestEditor logic and given a small new surface (`openEditorForPath`, `editingPaths`, `onSaved`). Wire them into the Unit Model Editor page and structure tree. TestEditor is left running on its inline copy with only a deprecation pointer comment.

**Tech Stack:** React + TypeScript, Tauri (`invoke`), Zustand, shadcn/ui (`ContextMenu`, `AlertDialog`), vitest. Reuses `ssbhDaeIoService`, `numatbEditorUtils`, `numdlbEditorUtils`, `nuhlpbEditorUtils`, `jnttblEditorUtils`, `jnttblIoService`, and the four `*EditorModalHost` components.

**Spec:** `docs/superpowers/specs/2026-06-14-unit-model-editor-ssbh-file-editing-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/page/UnitModelEdit/utils/unitModelNodePaths.ts` | Create | Pure path/editability helpers: `dirnameOf`, `normalizeComparePath`, `resolveUnitModelNodeAbsPath`, `unitModelEditableKind` |
| `src/page/UnitModelEdit/utils/unitModelNodePaths.test.ts` | Create | Tests for the helpers |
| `src/page/UnitModelEdit/utils/unitModelStructureTree.ts` | Modify | Add `fileUrl?` to `UnitModelTreeNode`; populate on item nodes |
| `src/page/UnitModelEdit/utils/unitModelStructureTree.test.ts` | Create | Test `fileUrl` attachment (file does not exist yet) |
| `src/components/ssbh-model-preview/useSsbhFileEditorSessions.ts` | Create | Canonical shared hook: 4-editor session mgmt + `openEditorForPath` + `editingPaths` + `onSaved` |
| `src/components/ssbh-model-preview/useSsbhFileEditorSessions.test.ts` | Create | Test the pure dispatch helper exposed by the module |
| `src/components/ssbh-model-preview/SsbhFileEditorHosts.tsx` | Create | Renders the 4 modal hosts + 4 dirty-guard dialogs |
| `src/page/UnitModelEdit/components/UnitModelStructureTreeView.tsx` | Modify | Right-click menu, double-click open, dirty/modified badges, new callback props |
| `src/page/UnitModelEdit/components/UnitModelHierarchyPanel.tsx` | Modify | Thread new props through to the tree view |
| `src/page/UnitModelEdit/components/UnitModelTexturePanel.tsx` | Modify | Accept `focusTextureFilename` + `onOpenNumatb`; "open referencing numatb" affordance |
| `src/page/UnitModelEdit/page.tsx` | Modify | Mount hook + hosts; `onSaved` (preview reload + structure remount + modifiedPaths); leftTab/focusTexture state; pass callbacks down |
| `src/page/TestEditor/page.tsx` | Modify | Add a deprecation pointer comment (no refactor) |

**Editor session source-of-truth to port from:** `src/page/TestEditor/page.tsx`
- numdlb session block: lines 394–589
- nuhlpb session block: lines 591–762
- jnttbl session block (incl. `registerJnttblZLayer`): lines 764–985
- numatb session block: lines 1255–1459
- host + guard-dialog JSX: lines 1583–1738 (numdlb/nuhlpb/numatb/jnttbl hosts only — NOT effectProject)

---

## Task 1: Pure path + editability helpers

**Files:**
- Create: `src/page/UnitModelEdit/utils/unitModelNodePaths.ts`
- Test: `src/page/UnitModelEdit/utils/unitModelNodePaths.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/page/UnitModelEdit/utils/unitModelNodePaths.test.ts
import { describe, it, expect } from "vitest";
import {
  dirnameOf,
  normalizeComparePath,
  resolveUnitModelNodeAbsPath,
  unitModelEditableKind,
} from "./unitModelNodePaths";

describe("dirnameOf", () => {
  it("returns the parent of a windows path", () => {
    expect(dirnameOf("E:\\out\\0xABE08869_structure.json")).toBe("E:\\out");
  });
  it("returns the parent of a posix path", () => {
    expect(dirnameOf("/tmp/out/x_structure.json")).toBe("/tmp/out");
  });
});

describe("normalizeComparePath", () => {
  it("lower-cases, forward-slashes, and trims a trailing slash", () => {
    expect(normalizeComparePath("E:\\Out\\Model\\M.Numatb")).toBe("e:/out/model/m.numatb");
    expect(normalizeComparePath("E:/out/dir/")).toBe("e:/out/dir");
  });
});

describe("resolveUnitModelNodeAbsPath", () => {
  it("joins the structure-json directory with the structure-relative fileUrl (windows output)", () => {
    expect(
      resolveUnitModelNodeAbsPath(
        "E:\\out\\0xABE08869_structure.json",
        "0xABE08869/textures/body.nutexb",
      ),
    ).toBe("E:\\out\\0xABE08869\\textures\\body.nutexb");
  });
  it("normalizes backslashes already present in fileUrl", () => {
    expect(
      resolveUnitModelNodeAbsPath(
        "E:\\out\\pkg_structure.json",
        "pkg\\model_a\\m.numatb",
      ),
    ).toBe("E:\\out\\pkg\\model_a\\m.numatb");
  });
});

describe("unitModelEditableKind", () => {
  it("maps editable extensions", () => {
    expect(unitModelEditableKind(".numatb")).toBe("numatb");
    expect(unitModelEditableKind("pkg/model/x.numdlb")).toBe("numdlb");
    expect(unitModelEditableKind("X.NUHLPB")).toBe("nuhlpb");
    expect(unitModelEditableKind("a.jnttbl")).toBe("jnttbl");
  });
  it("returns null for non-editable", () => {
    expect(unitModelEditableKind(".nutexb")).toBeNull();
    expect(unitModelEditableKind("control.bin")).toBeNull();
    expect(unitModelEditableKind("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/page/UnitModelEdit/utils/unitModelNodePaths.test.ts`
Expected: FAIL — `Cannot find module './unitModelNodePaths'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/page/UnitModelEdit/utils/unitModelNodePaths.ts
import { toWindowsPath } from "./unitModelRepackService";

export type UnitModelEditableKind = "numatb" | "numdlb" | "nuhlpb" | "jnttbl";

/** Pure parent-directory of a path, preserving the dominant separator. */
export function dirnameOf(path: string): string {
  const usesBackslash = path.includes("\\");
  const unified = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const idx = unified.lastIndexOf("/");
  const parent = idx <= 0 ? unified.slice(0, idx + 1) : unified.slice(0, idx);
  return usesBackslash ? parent.replace(/\//g, "\\") : parent;
}

/** Canonical key for path equality checks (lower-case, forward slash, no trailing slash). */
export function normalizeComparePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * Absolute on-disk path of a structure node, mirroring the Rust
 * `resolve_file_path(json_dir, file_url)` in `unit_model_textures.rs`:
 * `fileUrl` is relative to the directory holding `_structure.json`.
 * Returns a Windows-style path for consistency with the other unit-model commands.
 */
export function resolveUnitModelNodeAbsPath(structureJsonPath: string, fileUrl: string): string {
  const jsonDir = dirnameOf(structureJsonPath).replace(/\\/g, "/").replace(/\/+$/, "");
  const rel = fileUrl.replace(/\\/g, "/").replace(/^\/+/, "");
  return toWindowsPath(`${jsonDir}/${rel}`);
}

/** Editor kind for a file path/extension, or null when not directly editable. */
export function unitModelEditableKind(fileUrlOrExt: string): UnitModelEditableKind | null {
  const lower = fileUrlOrExt.toLowerCase();
  if (lower.endsWith(".numatb")) return "numatb";
  if (lower.endsWith(".numdlb")) return "numdlb";
  if (lower.endsWith(".nuhlpb")) return "nuhlpb";
  if (lower.endsWith(".jnttbl")) return "jnttbl";
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/page/UnitModelEdit/utils/unitModelNodePaths.test.ts`
Expected: PASS (all cases). If `dirnameOf` edge cases fail, confirm the trailing-slash trim runs before `lastIndexOf`.

- [ ] **Step 5: Commit**

```bash
git add src/page/UnitModelEdit/utils/unitModelNodePaths.ts src/page/UnitModelEdit/utils/unitModelNodePaths.test.ts
git commit -m "feat(unit-model): add node path + editability helpers"
```

---

## Task 2: Attach `fileUrl` to structure-tree item nodes

**Files:**
- Modify: `src/page/UnitModelEdit/utils/unitModelStructureTree.ts`
- Test: `src/page/UnitModelEdit/utils/unitModelStructureTree.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// src/page/UnitModelEdit/utils/unitModelStructureTree.test.ts
import { describe, it, expect } from "vitest";
import { buildUnitModelStructureTree, type UnitModelTreeNode } from "./unitModelStructureTree";

const STRUCTURE = {
  Magic: 10,
  SubFileData: [
    { fileIndex: 0, fileType: ".numdlb", fileBaseName: "body", fileUrl: "pkg/model_a/body.numdlb" },
    { fileIndex: 1, fileType: ".numatb", fileBaseName: "body__maya__", fileUrl: "pkg/model_a/body__maya__.numatb" },
  ],
  SubFileStructure: [
    { type: "Folder", unk2: "", unk3: 0, unk5: 0 },
    { type: "Folder", unk2: "", unk3: 0, unk5: 0 },
    { type: "Item", fileIndex: 0, unk2: "40000000", unk3: 0, Name: "body" },
    { type: "Item", fileIndex: 1, unk2: "21000000", unk3: 1, Name: "body__maya__" },
    { type: "EndMark", endMarkCount: 2 },
  ],
};

function findItem(node: UnitModelTreeNode, fileIndex: number): UnitModelTreeNode | null {
  if (node.kind === "item" && node.fileIndex === fileIndex) return node;
  for (const c of node.children ?? []) {
    const found = findItem(c, fileIndex);
    if (found) return found;
  }
  return null;
}

describe("buildUnitModelStructureTree fileUrl", () => {
  it("attaches the pool fileUrl onto item nodes", () => {
    const { root } = buildUnitModelStructureTree(STRUCTURE);
    expect(findItem(root, 0)?.fileUrl).toBe("pkg/model_a/body.numdlb");
    expect(findItem(root, 1)?.fileUrl).toBe("pkg/model_a/body__maya__.numatb");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/page/UnitModelEdit/utils/unitModelStructureTree.test.ts`
Expected: FAIL — `fileUrl` is `undefined` on the item nodes.

- [ ] **Step 3: Add `fileUrl` to the type**

In `unitModelStructureTree.ts`, add the field to `UnitModelTreeNode` (after `fileType?: string;` at line 28):

```ts
  fileType?: string;
  /** On-disk path relative to the `_structure.json` directory. Item nodes only. */
  fileUrl?: string;
```

- [ ] **Step 4: Build and thread a `fileUrlByIndex` map**

In `buildUnitModelStructureTree`, alongside `extByIndex`/`baseNameByIndex` (after the loop ending at line 270), add:

```ts
  const fileUrlByIndex = new Map<number, string>();
  for (const d of data) {
    if (d.fileUrl) fileUrlByIndex.set(d.fileIndex, d.fileUrl);
  }
```

Change the `toTreeNode` signature to accept the map. Update its declaration (line 195) from:

```ts
function toTreeNode(
  node: Mid,
  path: string,
  lookup: Map<number, string>,
  baseNames: Map<number, string>,
  isRoot: boolean,
): UnitModelTreeNode {
```

to:

```ts
function toTreeNode(
  node: Mid,
  path: string,
  lookup: Map<number, string>,
  baseNames: Map<number, string>,
  fileUrls: Map<number, string>,
  isRoot: boolean,
): UnitModelTreeNode {
```

In the `node.kind === "item"` branch (lines 202–212), add `fileUrl`:

```ts
  if (node.kind === "item") {
    const label = node.name ?? baseNames.get(node.fileIndex) ?? `#${node.fileIndex}`;
    return {
      id: `${path}/i${node.fileIndex}`,
      kind: "item",
      label,
      fileIndex: node.fileIndex,
      fileType: lookup.get(node.fileIndex) ?? "",
      fileUrl: fileUrls.get(node.fileIndex),
      unk2: node.unk2,
      unk3: node.unk3,
    };
  }
```

In the folder branch's recursive `children` map (line 219), pass the new map:

```ts
  const children = node.children.map((c, idx) =>
    toTreeNode(c, `${path}/${idx}`, lookup, baseNames, fileUrls, false),
  );
```

Update the root call (line 279) from:

```ts
  const root = toTreeNode(top[0], "root", extByIndex, baseNameByIndex, true);
```

to:

```ts
  const root = toTreeNode(top[0], "root", extByIndex, baseNameByIndex, fileUrlByIndex, true);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/page/UnitModelEdit/utils/unitModelStructureTree.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/page/UnitModelEdit/utils/unitModelStructureTree.ts src/page/UnitModelEdit/utils/unitModelStructureTree.test.ts
git commit -m "feat(unit-model): attach fileUrl to structure tree item nodes"
```

---

## Task 3: Shared editor-session hook — extension dispatch helper (TDD)

**Files:**
- Create: `src/components/ssbh-model-preview/useSsbhFileEditorSessions.ts`
- Test: `src/components/ssbh-model-preview/useSsbhFileEditorSessions.test.ts`

This task adds the file with ONLY the pure dispatch helper + types, test-first. Task 4 fills in the hook body (a verbatim port that is verified manually + by the existing editor-component tests).

- [ ] **Step 1: Write the failing test**

```ts
// src/components/ssbh-model-preview/useSsbhFileEditorSessions.test.ts
import { describe, it, expect } from "vitest";
import { ssbhEditorKindForPath } from "./useSsbhFileEditorSessions";

describe("ssbhEditorKindForPath", () => {
  it("dispatches by extension", () => {
    expect(ssbhEditorKindForPath("a/b.numdlb")).toBe("numdlb");
    expect(ssbhEditorKindForPath("a/b.numatb")).toBe("numatb");
    expect(ssbhEditorKindForPath("a/b.nuhlpb")).toBe("nuhlpb");
    expect(ssbhEditorKindForPath("a/b.jnttbl")).toBe("jnttbl");
  });
  it("is case-insensitive", () => {
    expect(ssbhEditorKindForPath("A/B.NUMATB")).toBe("numatb");
  });
  it("returns null for unsupported files", () => {
    expect(ssbhEditorKindForPath("a/b.nutexb")).toBeNull();
    expect(ssbhEditorKindForPath("a/b.bin")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/ssbh-model-preview/useSsbhFileEditorSessions.test.ts`
Expected: FAIL — module/​export not found.

- [ ] **Step 3: Create the file with the dispatch helper only**

```ts
// src/components/ssbh-model-preview/useSsbhFileEditorSessions.ts
//
// CANONICAL shared SSBH file-editor session manager.
//
// This hook is the single supported way to open the windowed numdlb / numatb /
// nuhlpb / jnttbl editors by file path with draft / save / reload / dirty-guard
// lifecycle. `src/page/TestEditor/page.tsx` still contains an older INLINE copy
// of this logic; that copy is LEGACY and is DEPRECATED for reuse (in particular
// for the Unit Model Editor flow). New consumers MUST use this hook and the
// matching `SsbhFileEditorHosts` component — do not copy the TestEditor inline
// version again.

export type SsbhEditorKind = "numdlb" | "numatb" | "nuhlpb" | "jnttbl";

/** Map a file path to its editor kind by extension, or null when unsupported. */
export function ssbhEditorKindForPath(filePath: string): SsbhEditorKind | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".numdlb")) return "numdlb";
  if (lower.endsWith(".numatb")) return "numatb";
  if (lower.endsWith(".nuhlpb")) return "nuhlpb";
  if (lower.endsWith(".jnttbl")) return "jnttbl";
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/ssbh-model-preview/useSsbhFileEditorSessions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ssbh-model-preview/useSsbhFileEditorSessions.ts src/components/ssbh-model-preview/useSsbhFileEditorSessions.test.ts
git commit -m "feat(ssbh): scaffold shared editor-session hook with path dispatch"
```

---

## Task 4: Shared editor-session hook — full body (port from TestEditor)

**Files:**
- Modify: `src/components/ssbh-model-preview/useSsbhFileEditorSessions.ts`

This is an extraction. Port the four session blocks from `TestEditor/page.tsx` (line ranges in the File Structure table) into the hook with three precise adaptations. No new test (the session logic is unchanged and is covered by the editor-component tests; verified manually in Task 8).

- [ ] **Step 1: Add imports + types at the top of the hook file** (below the existing dispatch helper)

```ts
import { useCallback, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { NumdlbEditorModalHost } from "./NumdlbEditorModalHost";
import type { NumdlbEditorWindowSession } from "./NumdlbEditorModalWindow";
import { cloneNumdlbReadResult, assertNumdlbValidForSave, isNumdlbDraftDirty } from "./numdlbEditorUtils";
import type { NuhlpbEditorWindowSession } from "./NuhlpbEditorModalWindow";
import { cloneNuhlpbReadResult, isNuhlpbDraftDirty } from "./nuhlpbEditorUtils";
import type { JnttblEditorWindowSession } from "./JnttblEditorModalWindow";
import {
  assertJnttblValidForSave,
  cloneJnttblEditorDocument,
  computeNextJnttblDirtyState,
  readResultToEditorDocument,
  resolveJnttblBoneCountForSave,
} from "./jnttblEditorUtils";
import { jnttblReadFile, jnttblWriteFile, type JnttblEditorDocument } from "./jnttblIoService";
import {
  ssbhReadNumdlbMapping,
  ssbhWriteNumdlbMapping,
  ssbhReadNuhlpb,
  ssbhWriteNuhlpb,
  ssbhTemplateReadNumatb,
  ssbhTemplateWriteNumatb,
  type NumdlbReadResult,
  type NuhlpbReadResult,
} from "./ssbhDaeIoService";
import { ensureMatlDataSerdeFields, type NumatbProfileKind } from "./daeSsbhTypes";
import type { NumatbEditorWindowSession } from "./NumatbEditorModalWindow";
import {
  buildNumatbModalBundleFromLoadedFile,
  cloneNumatbBundle,
  detectNumatbProfileFromPath,
  type NumatbModalBundle,
} from "./numatbEditorUtils";

export type SsbhFileEditorGuard = { sessionId: string; action: "close" | "reload" } | null;

export interface UseSsbhFileEditorSessionsOptions {
  /** Called after ANY editor saves successfully, with the saved file's path. */
  onSaved?: (savedPath: string) => void;
}
```

- [ ] **Step 2: Define the hook shell**

```ts
export function useSsbhFileEditorSessions(options: UseSsbhFileEditorSessionsOptions = {}) {
  const onSavedRef = useRef(options.onSaved);
  onSavedRef.current = options.onSaved;

  // ... ported session state + callbacks go here (Steps 3–6) ...

  return {
    /** Open the correct editor for a path by extension. Returns false if unsupported. */
    openEditorForPath,
    openNumdlb: openNumdlbSession,
    openNumatb: openNumatbSession,
    openNuhlpb: openNuhlpbSession,
    openJnttbl: openJnttblSession,
    /** Normalized-lowercase paths of editors with unsaved edits. */
    editingPaths,
    /** Props bundle consumed by <SsbhFileEditorHosts/>. */
    hostProps,
  };
}
```

- [ ] **Step 3: Port the four session blocks verbatim**

Copy these blocks from `src/page/TestEditor/page.tsx` into the hook body (between the shell comment and the `return`), unchanged except the adaptations in Step 4:
- numdlb: the `numdlbSessions` state + refs + `openNumdlbSession` … `saveAndFinishNumdlbGuard` (TestEditor lines 119–125 for state, 394–589 for callbacks).
- nuhlpb: `nuhlpbSessions` state + refs (lines 127–133) + `openNuhlpbSession` … `saveAndFinishNuhlpbGuard` (lines 591–762).
- jnttbl: `jnttblSessions` state + refs incl. `jnttblZLayerSettersRef` (lines 135–142) + `registerJnttblZLayer` … `saveAndFinishJnttblGuard` (lines 764–985).
- numatb: `numatbSessions` state + refs + `startNumatbTransition` (lines 144–153) + `openNumatbSession` … `saveAndFinishNumatbGuard` (lines 1255–1459).

Keep the guard `useState`s: `numdlbGuard`, `nuhlpbGuard`, `jnttblGuard`, `numatbGuard` (typed `SsbhFileEditorGuard`).

Do NOT port effectProject — it is out of scope.

- [ ] **Step 4: Apply the three adaptations during the port**

(a) In each `save*Session` success branch, after the existing `toast.success(...)`, call the onSaved hook with the file path. Concretely:

In `saveNumdlbSession` (after `toast.success("Saved NUMDLB");`):
```ts
      onSavedRef.current?.(path);
```
In `saveNuhlpbSession` (after `toast.success("Saved NUHLPB");`):
```ts
      onSavedRef.current?.(path);
```
In `saveJnttblSession` (after `toast.success("Saved JNTT");`):
```ts
      onSavedRef.current?.(path);
```
In `saveNumatbSession` (after `toast.success("Saved NUMATB");`):
```ts
      onSavedRef.current?.(path);
```
(`path` is already the local file-path variable in each of those functions.)

(b) Add `openEditorForPath` after the four `open*Session` callbacks:
```ts
  const openEditorForPath = useCallback(
    (filePath: string): boolean => {
      const kind = ssbhEditorKindForPath(filePath);
      if (kind === "numdlb") { openNumdlbSession(filePath); return true; }
      if (kind === "numatb") { openNumatbSession(filePath); return true; }
      if (kind === "nuhlpb") { openNuhlpbSession(filePath); return true; }
      if (kind === "jnttbl") { openJnttblSession(filePath); return true; }
      return false;
    },
    [openNumdlbSession, openNumatbSession, openNuhlpbSession, openJnttblSession],
  );
```

(c) Derive `editingPaths` (normalized lowercase set of paths whose draft differs from base):
```ts
  const editingPaths = useMemo(() => {
    const set = new Set<string>();
    const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    for (const s of numdlbSessions) {
      if (s.draftData && isNumdlbDraftDirty(s.baseData, s.draftData)) set.add(norm(s.filePath));
    }
    for (const s of nuhlpbSessions) {
      if (s.draftData && isNuhlpbDraftDirty(s.baseData, s.draftData)) set.add(norm(s.filePath));
    }
    for (const s of jnttblSessions) {
      if (s.isDirty) set.add(norm(s.filePath));
    }
    for (const s of numatbSessions) {
      if (s.isDirty) set.add(norm(s.filePath));
    }
    return set;
  }, [numdlbSessions, nuhlpbSessions, jnttblSessions, numatbSessions]);
```
Add `useMemo` to the React import.

- [ ] **Step 5: Assemble `hostProps`**

```ts
  const hostProps = {
    numdlb: {
      sessions: numdlbSessions,
      onActivateSession: activateNumdlbSession,
      onCloseRequest: requestCloseNumdlbSession,
      onReloadRequest: requestReloadNumdlbSession,
      onDraftChange: updateNumdlbDraft,
      onSave: saveNumdlbSession,
      onReset: resetNumdlbSession,
      guard: numdlbGuard,
      onGuardOpenChange: (open: boolean) => { if (!open) setNumdlbGuard(null); },
      onGuardCancel: dismissNumdlbGuard,
      onGuardDiscard: discardNumdlbGuard,
      onGuardSave: saveAndFinishNumdlbGuard,
    },
    nuhlpb: {
      sessions: nuhlpbSessions,
      onActivateSession: activateNuhlpbSession,
      onCloseRequest: requestCloseNuhlpbSession,
      onReloadRequest: requestReloadNuhlpbSession,
      onDraftChange: updateNuhlpbDraft,
      onSave: saveNuhlpbSession,
      onReset: resetNuhlpbSession,
      guard: nuhlpbGuard,
      onGuardOpenChange: (open: boolean) => { if (!open) setNuhlpbGuard(null); },
      onGuardCancel: dismissNuhlpbGuard,
      onGuardDiscard: discardNuhlpbGuard,
      onGuardSave: saveAndFinishNuhlpbGuard,
    },
    numatb: {
      sessions: numatbSessions,
      onActivateSession: activateNumatbSession,
      onCloseRequest: requestCloseNumatbSession,
      onReloadRequest: requestReloadNumatbSession,
      onDraftChange: updateNumatbDraft,
      onSave: saveNumatbSession,
      onReset: resetNumatbSession,
      guard: numatbGuard,
      onGuardOpenChange: (open: boolean) => { if (!open) setNumatbGuard(null); },
      onGuardCancel: dismissNumatbGuard,
      onGuardDiscard: discardNumatbGuard,
      onGuardSave: saveAndFinishNumatbGuard,
    },
    jnttbl: {
      sessions: jnttblSessions,
      onRegisterZLayer: registerJnttblZLayer,
      onActivateSession: activateJnttblSession,
      onCloseRequest: requestCloseJnttblSession,
      onReloadRequest: requestReloadJnttblSession,
      onDraftChange: updateJnttblDraft,
      onSave: saveJnttblSession,
      onReset: resetJnttblSession,
      guard: jnttblGuard,
      onGuardOpenChange: (open: boolean) => { if (!open) setJnttblGuard(null); },
      onGuardCancel: dismissJnttblGuard,
      onGuardDiscard: discardJnttblGuard,
      onGuardSave: saveAndFinishJnttblGuard,
    },
  };
```

Export the prop type for the host component:
```ts
export type SsbhFileEditorHostProps = ReturnType<typeof useSsbhFileEditorSessions>["hostProps"];
```

- [ ] **Step 6: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors in `useSsbhFileEditorSessions.ts`. Fix any unused-import or missing-symbol errors revealed by the port (e.g. ensure `useTransition` is used for `startNumatbTransition`).

- [ ] **Step 7: Commit**

```bash
git add src/components/ssbh-model-preview/useSsbhFileEditorSessions.ts
git commit -m "feat(ssbh): port 4-editor session manager into shared hook with onSaved + editingPaths"
```

---

## Task 5: Shared host component `SsbhFileEditorHosts`

**Files:**
- Create: `src/components/ssbh-model-preview/SsbhFileEditorHosts.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/ssbh-model-preview/SsbhFileEditorHosts.tsx
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NumdlbEditorModalHost } from "./NumdlbEditorModalHost";
import { NuhlpbEditorModalHost } from "./NuhlpbEditorModalHost";
import { NumatbEditorModalHost } from "./NumatbEditorModalHost";
import { JnttblEditorModalHost } from "./JnttblEditorModalHost";
import type { SsbhFileEditorHostProps } from "./useSsbhFileEditorSessions";

type GuardCommon = {
  guard: { action: "close" | "reload" } | null;
  onGuardOpenChange: (open: boolean) => void;
  onGuardCancel: () => void;
  onGuardDiscard: () => void;
  onGuardSave: () => void | Promise<void>;
};

function GuardDialog({ label, guard, onGuardOpenChange, onGuardCancel, onGuardDiscard, onGuardSave }: GuardCommon & { label: string }) {
  return (
    <AlertDialog open={guard !== null} onOpenChange={onGuardOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved {label} changes</AlertDialogTitle>
          <AlertDialogDescription>
            {guard?.action === "close"
              ? "Save before closing, discard edits, or cancel."
              : "Save before reloading from disk, discard edits, or cancel."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel type="button" onClick={onGuardCancel}>Cancel</AlertDialogCancel>
          <Button type="button" variant="outline" onClick={onGuardDiscard}>Discard</Button>
          <Button type="button" onClick={() => void onGuardSave()}>
            {guard?.action === "close" ? "Save and close" : "Save and reload"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Renders the four windowed SSBH editors + their dirty-guard dialogs. */
export function SsbhFileEditorHosts({ numdlb, nuhlpb, numatb, jnttbl }: SsbhFileEditorHostProps) {
  return (
    <>
      <NumdlbEditorModalHost
        sessions={numdlb.sessions}
        onActivateSession={numdlb.onActivateSession}
        onCloseRequest={numdlb.onCloseRequest}
        onReloadRequest={numdlb.onReloadRequest}
        onDraftChange={numdlb.onDraftChange}
        onSave={numdlb.onSave}
        onReset={numdlb.onReset}
      />
      <GuardDialog label="NUMDLB" guard={numdlb.guard} onGuardOpenChange={numdlb.onGuardOpenChange} onGuardCancel={numdlb.onGuardCancel} onGuardDiscard={numdlb.onGuardDiscard} onGuardSave={numdlb.onGuardSave} />

      <NuhlpbEditorModalHost
        sessions={nuhlpb.sessions}
        onActivateSession={nuhlpb.onActivateSession}
        onCloseRequest={nuhlpb.onCloseRequest}
        onReloadRequest={nuhlpb.onReloadRequest}
        onDraftChange={nuhlpb.onDraftChange}
        onSave={nuhlpb.onSave}
        onReset={nuhlpb.onReset}
      />
      <GuardDialog label="NUHLPB" guard={nuhlpb.guard} onGuardOpenChange={nuhlpb.onGuardOpenChange} onGuardCancel={nuhlpb.onGuardCancel} onGuardDiscard={nuhlpb.onGuardDiscard} onGuardSave={nuhlpb.onGuardSave} />

      <NumatbEditorModalHost
        sessions={numatb.sessions}
        onActivateSession={numatb.onActivateSession}
        onCloseRequest={numatb.onCloseRequest}
        onReloadRequest={numatb.onReloadRequest}
        onDraftChange={numatb.onDraftChange}
        onSave={numatb.onSave}
        onReset={numatb.onReset}
      />
      <GuardDialog label="NUMATB" guard={numatb.guard} onGuardOpenChange={numatb.onGuardOpenChange} onGuardCancel={numatb.onGuardCancel} onGuardDiscard={numatb.onGuardDiscard} onGuardSave={numatb.onGuardSave} />

      <JnttblEditorModalHost
        sessions={jnttbl.sessions}
        onRegisterZLayer={jnttbl.onRegisterZLayer}
        onActivateSession={jnttbl.onActivateSession}
        onCloseRequest={jnttbl.onCloseRequest}
        onReloadRequest={jnttbl.onReloadRequest}
        onDraftChange={jnttbl.onDraftChange}
        onSave={jnttbl.onSave}
        onReset={jnttbl.onReset}
      />
      <GuardDialog label="JNTT" guard={jnttbl.guard} onGuardOpenChange={jnttbl.onGuardOpenChange} onGuardCancel={jnttbl.onGuardCancel} onGuardDiscard={jnttbl.onGuardDiscard} onGuardSave={jnttbl.onGuardSave} />
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors. If `numatb.guard`/etc. type doesn't structurally satisfy `GuardDialog`'s `guard` prop, confirm the guard objects are `{ sessionId, action } | null` (they are) — `GuardDialog` only reads `.action`, so the wider type is assignable.

- [ ] **Step 3: Commit**

```bash
git add src/components/ssbh-model-preview/SsbhFileEditorHosts.tsx
git commit -m "feat(ssbh): add SsbhFileEditorHosts (4 modal hosts + guard dialogs)"
```

---

## Task 6: Structure tree — right-click, double-click, badges

**Files:**
- Modify: `src/page/UnitModelEdit/components/UnitModelStructureTreeView.tsx`

- [ ] **Step 1: Extend the props + imports**

Add imports at the top:
```tsx
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Pencil, FolderOpen as FolderOpenIcon, ClipboardCopy } from "lucide-react";
import { unitModelEditableKind } from "../utils/unitModelNodePaths";
```
(Note: `FolderOpen` is already imported for the folder icon; import the explorer-reveal icon under an alias `FolderOpenIcon` to avoid the name clash. If you prefer, reuse a distinct icon such as `ExternalLink`.)

Extend `UnitModelStructureTreeViewProps`:
```tsx
interface UnitModelStructureTreeViewProps {
  structureJson: unknown | null;
  structureJsonPath?: string | null;
  selectedFileIndex?: number | null;
  onSelectNode?: (node: UnitModelTreeNode) => void;
  /** Open the editor for an editable item node (double-click / context menu). */
  onOpenEditor?: (node: UnitModelTreeNode) => void;
  /** Reveal a node's file in the OS file explorer. */
  onRevealNode?: (node: UnitModelTreeNode) => void;
  /** Copy a node's absolute path to the clipboard. */
  onCopyNodePath?: (node: UnitModelTreeNode) => void;
  /** Jump a nutexb node to the Textures tab. */
  onShowTextureInPanel?: (node: UnitModelTreeNode) => void;
  /** Normalized-lowercase paths with unsaved editor edits. */
  editingPaths?: ReadonlySet<string>;
  /** Normalized-lowercase paths saved during this workspace session. */
  modifiedPaths?: ReadonlySet<string>;
  className?: string;
}
```

- [ ] **Step 2: Thread the new props through `TreeRow`**

Update `TreeRowProps` to add the same optional callbacks + `editingPaths` + `modifiedPaths`, and pass them in both the top-level `<TreeRow>` (in the render, ~line 227) and the recursive child `<TreeRow>` (~line 143). Add to `TreeRowProps`:
```tsx
  onOpenEditor?: (node: UnitModelTreeNode) => void;
  onRevealNode?: (node: UnitModelTreeNode) => void;
  onCopyNodePath?: (node: UnitModelTreeNode) => void;
  onShowTextureInPanel?: (node: UnitModelTreeNode) => void;
  editingPaths?: ReadonlySet<string>;
  modifiedPaths?: ReadonlySet<string>;
```

- [ ] **Step 3: Compute per-row edit state + wrap the row in a context menu**

Inside `TreeRow`, after the existing `const Icon = ...` line, add:
```tsx
  const editableKind = node.kind === "item" ? unitModelEditableKind(node.fileUrl ?? node.fileType ?? "") : null;
  const isNutexb = node.kind === "item" && (node.fileUrl ?? node.fileType ?? "").toLowerCase().endsWith(".nutexb");
  const compareKey = node.fileUrl ? node.fileUrl.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase() : null;
  const hasUnsaved = Boolean(compareKey && editingPaths?.has(compareKey));
  const wasModified = Boolean(compareKey && modifiedPaths?.has(compareKey));
```

> Note: `editingPaths` holds **absolute** normalized paths, while `compareKey` here is the **relative** `fileUrl`. To compare correctly, the page must store `editingPaths`/`modifiedPaths` keyed by the SAME value. Task 9 keys them by relative `fileUrl` (see Step 4 there). Keep both sides relative-`fileUrl`-keyed.

Replace the row's outer `<div className={cn("group flex items-center ...")}>...</div>` (lines 86–139) by wrapping it in a `ContextMenu`. The row content is unchanged except: add a double-click handler to the inner `<button>` and add the badges. Structure:

```tsx
  const rowInner = (
    <div
      className={cn(
        "group flex items-center gap-1.5 rounded-md py-1 pr-1.5 transition-colors",
        "hover:bg-muted/60",
        isSelected && "bg-primary/10 text-primary",
      )}
      style={{ paddingLeft: `${depth * 14 + 4}px` }}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        onClick={() => {
          if (isFolder) toggle(node.id);
          onSelectNode?.(node);
        }}
        onDoubleClick={() => {
          if (editableKind) onOpenEditor?.(node);
        }}
      >
        {isFolder ? (
          isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )
        ) : (
          <span className="w-3.5 shrink-0" aria-hidden />
        )}
        <Icon
          className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")}
          aria-hidden
        />
        <span className="truncate text-[13px] leading-5">{node.label}</span>
        {hasUnsaved ? <span className="shrink-0 text-amber-500" title="Unsaved edits">●</span> : null}
        {!hasUnsaved && wasModified ? <span className="shrink-0 text-sky-500" title="Modified this session">▲</span> : null}
        {node.kind === "item" && node.fileType ? (
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
            {node.fileType}
          </span>
        ) : null}
        {isFolder && (node.children?.length ?? 0) > 0 ? (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
            {node.children?.length}
          </span>
        ) : null}
      </button>
      <CopyInfoToAiButton
        size="icon"
        variant="ghost"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        label={`Copy ${isFolder ? node.role ?? "folder" : node.label} info to AI`}
        buildPayload={() => ({
          kind: "unit-model-structure-node",
          scope: isFolder ? `folder:${node.role ?? "unknown"}` : `item:${node.fileIndex}`,
          note: structureJsonPath ? `from ${structureJsonPath}` : undefined,
          data: node,
        })}
      />
    </div>
  );

  const hasMenu = node.kind === "item" && (editableKind || isNutexb || onRevealNode || onCopyNodePath);
```

Then render:
```tsx
  return (
    <li>
      {hasMenu ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{rowInner}</ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            {editableKind ? (
              <ContextMenuItem onSelect={() => onOpenEditor?.(node)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit {editableKind.toUpperCase()}…
              </ContextMenuItem>
            ) : null}
            {isNutexb ? (
              <ContextMenuItem onSelect={() => onShowTextureInPanel?.(node)}>
                <ImageIcon className="mr-2 h-3.5 w-3.5" />
                Show in Textures
              </ContextMenuItem>
            ) : null}
            {(editableKind || isNutexb) ? <ContextMenuSeparator /> : null}
            <ContextMenuItem onSelect={() => onRevealNode?.(node)}>
              <FolderOpenIcon className="mr-2 h-3.5 w-3.5" />
              Reveal in Explorer
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onCopyNodePath?.(node)}>
              <ClipboardCopy className="mr-2 h-3.5 w-3.5" />
              Copy path
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        rowInner
      )}
      {isFolder && isOpen && (node.children?.length ?? 0) > 0 ? (
        <ul>
          {node.children?.map((child) => (
            <TreeRow
              key={nodeChildKey(child)}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              selectedFileIndex={selectedFileIndex}
              onSelectNode={onSelectNode}
              onOpenEditor={onOpenEditor}
              onRevealNode={onRevealNode}
              onCopyNodePath={onCopyNodePath}
              onShowTextureInPanel={onShowTextureInPanel}
              editingPaths={editingPaths}
              modifiedPaths={modifiedPaths}
              structureJsonPath={structureJsonPath}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
```

- [ ] **Step 4: Pass new props from `UnitModelStructureTreeView` into the top-level `TreeRow`**

In the component body, destructure the new props and forward them to the root `<TreeRow>` (the one rendered in the `parsed.tree` branch).

- [ ] **Step 5: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors. Ensure `ImageIcon` (already imported) is in scope for the "Show in Textures" item.

- [ ] **Step 6: Commit**

```bash
git add src/page/UnitModelEdit/components/UnitModelStructureTreeView.tsx
git commit -m "feat(unit-model): add right-click/double-click editing + badges to structure tree"
```

---

## Task 7: Hierarchy panel — thread the callbacks

**Files:**
- Modify: `src/page/UnitModelEdit/components/UnitModelHierarchyPanel.tsx`

- [ ] **Step 1: Extend props and forward to the tree view**

```tsx
import type { UnitModelTreeNode } from "../utils/unitModelStructureTree";

type UnitModelHierarchyPanelProps = {
  structureJson: unknown | null;
  structureJsonPath?: string | null;
  modelRoot?: string | null;
  onMutated?: () => void;
  onOpenEditor?: (node: UnitModelTreeNode) => void;
  onRevealNode?: (node: UnitModelTreeNode) => void;
  onCopyNodePath?: (node: UnitModelTreeNode) => void;
  onShowTextureInPanel?: (node: UnitModelTreeNode) => void;
  editingPaths?: ReadonlySet<string>;
  modifiedPaths?: ReadonlySet<string>;
};
```

Forward all new props into `<UnitModelStructureTreeView ... />`:
```tsx
        <UnitModelStructureTreeView
          structureJson={structureJson}
          structureJsonPath={structureJsonPath}
          className="h-full border-r-0"
          onOpenEditor={onOpenEditor}
          onRevealNode={onRevealNode}
          onCopyNodePath={onCopyNodePath}
          onShowTextureInPanel={onShowTextureInPanel}
          editingPaths={editingPaths}
          modifiedPaths={modifiedPaths}
        />
```

Destructure the new props in the `UnitModelHierarchyPanel` function signature.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm tsc --noEmit`
Expected: no errors.
```bash
git add src/page/UnitModelEdit/components/UnitModelHierarchyPanel.tsx
git commit -m "feat(unit-model): thread editing callbacks through hierarchy panel"
```

---

## Task 8: Texture panel — accept focus + open-numatb affordance

**Files:**
- Modify: `src/page/UnitModelEdit/components/UnitModelTexturePanel.tsx`

- [ ] **Step 1: Extend props**

Update `Props` (line 68):
```tsx
type Props = {
  unitRoot: string | null;
  embedded?: boolean;
  /** When set, scroll to + highlight the texture with this filename (basename, case-insensitive). */
  focusTextureFilename?: string | null;
  /** Open the numatb that references a texture, given a numatb basename (from `referencedBy`). */
  onOpenReferencingNumatb?: (numatbBasename: string) => void;
};
```

- [ ] **Step 2: Highlight + scroll to the focused texture**

Where each texture row is rendered (the list item that shows `texture.filename` — locate the `.map(` over the textures, near line 699/748), add a highlight class and a ref-based scroll. Add near the top of the component:
```tsx
  const focusKey = (focusTextureFilename ?? "").toLowerCase();
```
On each rendered texture container element, add:
```tsx
  className={cn(
    /* existing classes */,
    focusKey && texture.filename.toLowerCase() === focusKey && "ring-2 ring-amber-400",
  )}
  ref={focusKey && texture.filename.toLowerCase() === focusKey
    ? (el) => el?.scrollIntoView({ block: "center" })
    : undefined}
```
(Use the existing `cn` import. If rows are virtualized, instead set the search box value to the filename — but this panel renders a plain list, so direct `scrollIntoView` is fine.)

- [ ] **Step 3: Add the "open referencing numatb" affordance**

The texture entry already exposes `texture.referencedBy: string[]` (numatb basenames). Where `referencedBy` / ref count is shown (near line 748), render small buttons when `onOpenReferencingNumatb` is provided:
```tsx
  {onOpenReferencingNumatb && texture.referencedBy.length > 0 ? (
    <div className="flex flex-wrap gap-1">
      {texture.referencedBy.map((mat) => (
        <button
          key={mat}
          type="button"
          className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-primary/15 hover:text-primary"
          title={`Open ${mat}`}
          onClick={() => onOpenReferencingNumatb(mat)}
        >
          {mat}
        </button>
      ))}
    </div>
  ) : null}
```
Destructure `focusTextureFilename` and `onOpenReferencingNumatb` in the component signature.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm tsc --noEmit`
Expected: no errors.
```bash
git add src/page/UnitModelEdit/components/UnitModelTexturePanel.tsx
git commit -m "feat(unit-model): texture panel focus + open-referencing-numatb affordance"
```

---

## Task 9: Page wiring — mount editors, save side effects, cross-nav

**Files:**
- Modify: `src/page/UnitModelEdit/page.tsx`

- [ ] **Step 1: Imports + helpers**

Add:
```tsx
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { useSsbhFileEditorSessions } from "@/components/ssbh-model-preview/useSsbhFileEditorSessions";
import { SsbhFileEditorHosts } from "@/components/ssbh-model-preview/SsbhFileEditorHosts";
import { resolveUnitModelNodeAbsPath } from "./utils/unitModelNodePaths";
import type { UnitModelTreeNode } from "./utils/unitModelStructureTree";
```

- [ ] **Step 2: Add state in `UnitModelEditWorkspace`**

After `const [textureCount, setTextureCount] = useState(0);`:
```tsx
  const [modifiedPaths, setModifiedPaths] = useState<Set<string>>(new Set());
  const [focusTextureFilename, setFocusTextureFilename] = useState<string | null>(null);

  // Reset modified markers when the workspace root changes.
  useEffect(() => {
    setModifiedPaths(new Set());
  }, [workspace.activeRoot]);

  const relKey = useCallback((fileUrl: string | undefined) => {
    if (!fileUrl) return null;
    return fileUrl.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  }, []);
```

- [ ] **Step 3: Mount the editor hook with `onSaved`**

```tsx
  const handleEditorSaved = useCallback(
    (savedAbsPath: string) => {
      // Track which structure node was modified, keyed by relative fileUrl.
      const root = workspace.activeRoot;
      if (root && workspace.structurePath) {
        const dir = workspace.structurePath.replace(/\\/g, "/").replace(/\/+$/, "");
        const lastSlash = dir.lastIndexOf("/");
        const jsonDir = lastSlash >= 0 ? dir.slice(0, lastSlash) : dir;
        const abs = savedAbsPath.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
        const base = jsonDir.toLowerCase() + "/";
        const rel = abs.startsWith(base) ? abs.slice(base.length) : null;
        if (rel) setModifiedPaths((prev) => new Set(prev).add(rel));
      }
      const lower = savedAbsPath.toLowerCase();
      if (lower.endsWith(".numatb") || lower.endsWith(".numdlb")) {
        // Material/model mapping affects rendering + tree labels.
        onStructureMutated();
        if (root) void preview.loadModelAt(root);
      }
    },
    [workspace.activeRoot, workspace.structurePath, onStructureMutated, preview],
  );

  const editors = useSsbhFileEditorSessions({ onSaved: handleEditorSaved });
```

> Note: `editingPaths` from the hook is keyed by **absolute** normalized path; the tree compares against **relative** `fileUrl`. Convert before passing down (Step 4).

- [ ] **Step 4: Build relative-keyed badge sets + node callbacks**

```tsx
  const structureDirLower = useMemo(() => {
    if (!workspace.structurePath) return null;
    const dir = workspace.structurePath.replace(/\\/g, "/").replace(/\/+$/, "");
    const lastSlash = dir.lastIndexOf("/");
    return (lastSlash >= 0 ? dir.slice(0, lastSlash) : dir).toLowerCase();
  }, [workspace.structurePath]);

  const editingRelPaths = useMemo(() => {
    const set = new Set<string>();
    if (!structureDirLower) return set;
    const base = structureDirLower + "/";
    for (const abs of editors.editingPaths) {
      if (abs.startsWith(base)) set.add(abs.slice(base.length));
    }
    return set;
  }, [editors.editingPaths, structureDirLower]);

  const handleOpenEditor = useCallback(
    (node: UnitModelTreeNode) => {
      if (!workspace.structurePath || !node.fileUrl) return;
      const abs = resolveUnitModelNodeAbsPath(workspace.structurePath, node.fileUrl);
      const opened = editors.openEditorForPath(abs);
      if (!opened) toast.message(`No editor for ${node.label}`);
    },
    [workspace.structurePath, editors],
  );

  const handleRevealNode = useCallback(
    (node: UnitModelTreeNode) => {
      if (!workspace.structurePath || !node.fileUrl) return;
      void revealItemInDir(resolveUnitModelNodeAbsPath(workspace.structurePath, node.fileUrl));
    },
    [workspace.structurePath],
  );

  const handleCopyNodePath = useCallback(
    (node: UnitModelTreeNode) => {
      if (!workspace.structurePath || !node.fileUrl) return;
      void writeText(resolveUnitModelNodeAbsPath(workspace.structurePath, node.fileUrl)).then(() =>
        toast.success("Copied path"),
      );
    },
    [workspace.structurePath],
  );

  const handleShowTextureInPanel = useCallback((node: UnitModelTreeNode) => {
    const name = (node.fileUrl ?? node.label).replace(/\\/g, "/").split("/").pop() ?? node.label;
    setLeftTab("textures");
    setFocusTextureFilename(name);
  }, []);

  const handleOpenReferencingNumatb = useCallback(
    (numatbBasename: string) => {
      // Find the numatb item node whose fileUrl basename matches, then open it.
      if (!workspace.structurePath || structureJson == null) return;
      const targetLower = numatbBasename.toLowerCase();
      const tree = (() => {
        try { return buildUnitModelStructureTree(structureJson); } catch { return null; }
      })();
      if (!tree) return;
      let found: UnitModelTreeNode | null = null;
      const walk = (n: UnitModelTreeNode) => {
        if (found) return;
        if (n.kind === "item" && n.fileUrl) {
          const baseNoExt = (n.fileUrl.replace(/\\/g, "/").split("/").pop() ?? "").toLowerCase().replace(/\.numatb$/, "");
          if (n.fileUrl.toLowerCase().endsWith(".numatb") &&
              (baseNoExt === targetLower || baseNoExt === targetLower.replace(/\.numatb$/, ""))) {
            found = n;
          }
        }
        for (const c of n.children ?? []) walk(c);
      };
      walk(tree.root);
      if (found?.fileUrl) {
        editors.openEditorForPath(resolveUnitModelNodeAbsPath(workspace.structurePath, found.fileUrl));
      } else {
        toast.message(`Could not locate numatb "${numatbBasename}" in the structure`);
      }
    },
    [workspace.structurePath, structureJson, editors],
  );
```

Add `import { buildUnitModelStructureTree } from "./utils/unitModelStructureTree";` to the imports.

- [ ] **Step 5: Pass props into the hierarchy panel + texture panel**

Update the `<UnitModelHierarchyPanel ... />` call:
```tsx
                <UnitModelHierarchyPanel
                  structureJson={structureJson}
                  structureJsonPath={workspace.structurePath}
                  modelRoot={workspace.activeRoot}
                  onMutated={onStructureMutated}
                  onOpenEditor={handleOpenEditor}
                  onRevealNode={handleRevealNode}
                  onCopyNodePath={handleCopyNodePath}
                  onShowTextureInPanel={handleShowTextureInPanel}
                  editingPaths={editingRelPaths}
                  modifiedPaths={modifiedPaths}
                />
```

Update the `<UnitModelTexturePanel ... />` call:
```tsx
                <UnitModelTexturePanel
                  unitRoot={workspace.activeRoot}
                  embedded
                  focusTextureFilename={leftTab === "textures" ? focusTextureFilename : null}
                  onOpenReferencingNumatb={handleOpenReferencingNumatb}
                />
```

- [ ] **Step 6: Mount the editor hosts**

Just before the closing `</>` of `UnitModelEditWorkspace`'s return (after `<UnitModelExtractDialog ... />`), add:
```tsx
      <SsbhFileEditorHosts {...editors.hostProps} />
```

- [ ] **Step 7: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors. If `setLeftTab` isn't in scope for `handleShowTextureInPanel`, confirm it is declared above (it is: `const [leftTab, setLeftTab] = useState(...)`).

- [ ] **Step 8: Commit**

```bash
git add src/page/UnitModelEdit/page.tsx
git commit -m "feat(unit-model): wire SSBH editors, save side-effects, texture cross-nav into page"
```

---

## Task 10: TestEditor deprecation pointer comment

**Files:**
- Modify: `src/page/TestEditor/page.tsx`

- [ ] **Step 1: Add a comment above the numdlb session state**

Immediately above `const [numdlbSessions, setNumdlbSessions] = useState<NumdlbEditorWindowSession[]>([]);` (line ~119):
```tsx
  // NOTE: This inline SSBH editor session management is LEGACY. The canonical,
  // reusable implementation now lives in
  // `@/components/ssbh-model-preview/useSsbhFileEditorSessions` + `SsbhFileEditorHosts`
  // (used by the Unit Model Editor). For the unit-model flow this inline copy is
  // deprecated; new consumers must use the shared hook. TestEditor is left on this
  // copy intentionally to avoid a risky refactor — migrate when convenient.
```

- [ ] **Step 2: Commit**

```bash
git add src/page/TestEditor/page.tsx
git commit -m "docs(test-editor): mark inline SSBH editor sessions as legacy/deprecated"
```

---

## Task 11: Full verification

- [ ] **Step 1: Run the unit-model + ssbh tests**

Run: `pnpm vitest run src/page/UnitModelEdit src/components/ssbh-model-preview/useSsbhFileEditorSessions.test.ts`
Expected: all PASS (including the pre-existing UnitModelEdit tests).

- [ ] **Step 2: Typecheck the whole project**

Run: `pnpm tsc --noEmit`
Expected: no errors. (Pre-existing SceneEdit tsc errors noted in project memory are unrelated; confirm no NEW errors in the files this plan touched.)

- [ ] **Step 3: Lint the touched files**

Run: `pnpm eslint src/page/UnitModelEdit src/components/ssbh-model-preview/useSsbhFileEditorSessions.ts src/components/ssbh-model-preview/SsbhFileEditorHosts.tsx`
Expected: no errors.

- [ ] **Step 4: Manual smoke (do NOT run the dev server per project rules; ask the user to verify)**

Provide the user this checklist to run in their already-running app:
1. Open/extract a unit model → structure tree populates.
2. Right-click a `.numatb` node → "Edit NUMATB…" opens the editor; double-click also opens it.
3. Edit a value → node shows the ● unsaved badge; Save → badge clears, ▲ modified badge appears, preview refreshes.
4. Right-click → Reveal in Explorer / Copy path work.
5. Right-click a `.nutexb` under a model's texture set → "Show in Textures" switches the tab and highlights it.
6. In Textures, click a `referencedBy` chip → the referencing numatb editor opens.
7. Repeat for `.numdlb` / `.nuhlpb` / `.jnttbl`; multiple editors stack as windows; close-with-unsaved shows the guard dialog.

- [ ] **Step 5: Final commit (if any lint/type fixes were made)**

```bash
git add -A
git commit -m "chore(unit-model): verification fixes for SSBH file editing"
```

---

## Notes for the implementer

- **Path keying is the one subtlety.** `editingPaths` from the hook is keyed by absolute normalized path; the tree badges and `modifiedPaths` are keyed by **relative `fileUrl`** (lowercase, forward slash). Task 9 converts absolute→relative before passing `editingRelPaths` down. Keep both badge sets relative-keyed.
- **Do not modify the shared editor components** (`*EditorModalWindow`, `*EditorBody`) — cross-nav lives entirely in the unit-model surfaces.
- **`pnpm` is the package manager** (lockfile: `pnpm-lock.yaml`). Do not start the dev server (project rule).
- The SSBH IO services accept Windows-style absolute paths (the texture panel already passes such paths to Rust commands successfully).
