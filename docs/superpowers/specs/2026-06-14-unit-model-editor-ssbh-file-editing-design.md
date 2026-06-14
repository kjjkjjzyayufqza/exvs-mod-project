# Unit Model Editor — Full SSBH File Editing (Scene-Editor Parity)

> Status: DESIGN (brainstormed & approved 2026-06-14).
> Goal: bring per-file SSBH editing (numatb / numdlb / nuhlpb / jnttbl) to the
> Unit Model Editor's structure tree via right-click + double-click, reusing the
> existing editor modal hosts through a new **shared** session hook, plus four
> companion capabilities a real unit-model modder needs.

## Problem

The Unit Model Editor's structure tree (`UnitModelStructureTreeView`) is
**read-only**: each node carries only a "Copy info to AI" button. There is no
right-click menu and no way to edit `numatb` / `numdlb` / `nuhlpb` / `jnttbl`.

The editing capability already exists and is proven in two places:

- **Scene Editor** wires the shared SSBH editors into windowed detail-view tabs
  via `useSceneDetailView` (bundle/node driven, grouped per model).
- **TestEditor** (`src/page/TestEditor/page.tsx`) opens the same editors **by
  file path** (`openNumatbSession(path)` etc.), dispatched by file extension,
  with draft / save / reload / dirty-guard and multi-window support.

The reusable editor units live in `src/components/ssbh-model-preview/`:
`NumatbEditorModalHost/Window`, `NumdlbEditorModalHost/Window`,
`NuhlpbEditorModalHost/Window`, `JnttblEditorModalHost/Window`, plus their
`*EditorBody` / IO services (`ssbhDaeIoService`, `numatbEditorUtils`,
`numdlbEditorUtils`, `nuhlpbEditorUtils`, `jnttblEditorUtils`,
`jnttblIoService`).

The Unit Model Editor extracts to a folder where every structure node maps to a
real on-disk file (`fileUrl` is relative to the `_structure.json` directory), so
the TestEditor "open-by-path" pattern applies directly. The gap is purely
**wiring**, not new editing logic.

## Scope (approved)

- Editable file types: **numatb, numdlb, nuhlpb, jnttbl** (full parity with the
  available SSBH file editors; textures keep their existing dedicated panel).
- Entry points: **right-click context menu + double-click** on structure-tree
  item nodes.
- Companion capabilities (all four approved):
  1. Auto-refresh the 3D preview after saving a numatb/numdlb.
  2. Structure-tree dirty / modified badges.
  3. Reveal in Explorer + copy-path actions in the context menu.
  4. Texture ↔ numatb cross-navigation (implemented at the unit-model UI layer).

## Chosen architecture (Approach A)

Extract a focused, reusable hook + host component into the shared
`ssbh-model-preview/` directory, used by the Unit Model Editor now. **TestEditor
is left untouched** (it keeps its inline copy) apart from a pointer comment.

### Deprecation comments (explicit, required)

- Top of `useSsbhFileEditorSessions.ts`: a doc comment stating this is the
  **canonical shared implementation**; TestEditor's inline per-editor session
  code is the **legacy copy**, **deprecated for reuse / for the unit-model
  flow**, and new consumers MUST use this hook.
- A short comment next to TestEditor's session block pointing at the shared hook
  as the preferred path. TestEditor is NOT refactored in this change.

## New shared units

### `src/components/ssbh-model-preview/useSsbhFileEditorSessions.ts`

Encapsulates session management for **numdlb, numatb, nuhlpb, jnttbl**, ported
from TestEditor's proven logic (same load → clone base/draft → save → reload →
dirty-guard lifecycle, per-editor zIndex / `onRegisterZLayer` patterns
preserved).

Public surface:

- `openEditorForPath(absPath: string): boolean` — dispatch by lower-cased
  extension to the matching opener (`.numdlb` → numdlb, `.numatb` → numatb,
  `.nuhlpb` → nuhlpb, `.jnttbl` → jnttbl). Returns `false` for non-editable
  extensions (caller decides what to do).
- `openNumdlb / openNumatb / openNuhlpb / openJnttbl(absPath)` — direct openers.
- `hostProps` — everything `SsbhFileEditorHosts` needs (the four `sessions`
  arrays + activate/close/reload/draft/save/reset callbacks + guard state and
  guard handlers).
- `editingPaths: ReadonlySet<string>` — normalized abs paths of open sessions
  whose draft differs from base (for the tree "unsaved" badge).
- `isAnyEditorOpen: boolean` — convenience.

Options:

- `onSaved?(savedAbsPath: string): void` — invoked after **any** editor saves
  successfully. Drives preview refresh + the page-level "modified" set.

Path normalization helper (shared with the tree): lower-case + `\`→`/` +
trim trailing separators, used consistently for set membership and de-dup of
sessions.

### `src/components/ssbh-model-preview/SsbhFileEditorHosts.tsx`

Renders the four `*EditorModalHost` components + their four dirty-guard
`AlertDialog`s, fed by `hostProps`. Mounted once. JSX/guard-dialog copy mirrors
TestEditor's existing dialogs (titles: "Unsaved NUMDLB/NUMATB/NUHLPB/JNTT
changes").

## Path resolution (key plumbing)

### `unitModelStructureTree.ts` changes (pure, backward compatible)

- Build `fileUrlByIndex: Map<number, string>` from `SubFileData`.
- Add optional `fileUrl?: string` to `UnitModelTreeNode`; populate it on **item**
  nodes during `toTreeNode`. Folder nodes stay unchanged.
- Existing fields/tests unaffected (additive only).

### New resolver

`resolveUnitModelNodeAbsPath(structureJsonPath: string, fileUrl: string): string`

= `dirname(structureJsonPath)` joined with the normalized `fileUrl`
(`\`→`/`). This **mirrors the Rust `resolve_file_path(json_dir, file_url)`** in
`unit_model_textures.rs` (fileUrl is relative to the `_structure.json`'s parent
dir). Lives in a small util (e.g. `unitModelStructureTree.ts` or a new
`unitModelNodePaths.ts`).

### Editability classification

`unitModelEditableKind(fileUrl|fileType): "numatb"|"numdlb"|"nuhlpb"|"jnttbl"|null`
by extension. `null` ⇒ not directly editable (still gets Reveal / Copy-path /
cross-nav actions where relevant).

## Tree interaction

`UnitModelStructureTreeView` (and the `TreeRow` within):

- New props threaded from the page through `UnitModelHierarchyPanel`:
  `onOpenEditor(node)`, `onRevealNode(node)`, `onCopyNodePath(node)`,
  `onShowTextureInPanel(node)`, `editingPaths`, `modifiedPaths`,
  `structureJsonPath` (already passed).
- **Single click**: unchanged (toggle folder / select).
- **Double click** on editable item: `onOpenEditor(node)`.
- **Right click**: shadcn `ContextMenu` (same primitives SceneEdit uses) wrapping
  the row. Items:
  - `Edit <TYPE>…` (only when `unitModelEditableKind != null`)
  - `Show in Textures` (only `.nutexb` items)
  - `Reveal in Explorer`
  - `Copy path`
  - `Copy info to AI` (reuse existing payload builder)
- Badges on item nodes: `●` unsaved (path ∈ `editingPaths`), `▲`/dot "modified"
  (path ∈ `modifiedPaths`). Compared via normalized abs path.

## Companion behaviours

### 1. Auto-refresh preview after save

In the page's `onSaved(absPath)`: if the saved file is `.numatb`/`.numdlb`
(affects rendering or tree labels), call `preview.loadModelAt(activeRoot)` and
`onStructureMutated()` (numdlb edits change model/material names shown in the
tree). Debounced to coalesce rapid saves. `.nuhlpb`/`.jnttbl` saves do not force
a preview reload (no visual change in the static preview).

### 2. Dirty / modified badges

- `editingPaths` comes from the hook (open sessions with draft≠base).
- `modifiedPaths` is page-level `useState<Set<string>>`; `onSaved` adds the saved
  path; cleared when `activeRoot` changes (new workspace).

### 3. Reveal + path actions

`revealItemInDir(absPath)` (already imported in `useUnitModelWorkspace`) and
`writeText(absPath)` for Copy path, exposed in the context menu.

### 4. Texture ↔ numatb cross-navigation (UI layer only)

Kept out of the shared editors to keep them generic.

- **numatb → texture**: a `.nutexb` item under a texture-container (these are the
  resolved texture refs of the paired numatb) → context menu "Show in Textures"
  → page switches the left tab to **Textures** and focuses that texture by
  filename in `UnitModelTexturePanel`.
- **texture → numatb**: `UnitModelTexturePanel` already exposes each texture's
  `referencedBy` (numatb basenames). Add an "open referencing numatb" affordance
  → resolve that numatb's tree-node abs path → `openNumatb`.
- Requires: `UnitModelTexturePanel` accepts a `focusTextureFilename` prop and
  exposes an "open numatb by basename" callback; the page owns
  `{ leftTab, focusTextureFilename }` state.
- **Risk note**: this is the heaviest of the four companions. If implementation
  cost proves high, confirm with the user before degrading scope (e.g. ship one
  direction first).

## Wiring location

- Mount `useSsbhFileEditorSessions` + `<SsbhFileEditorHosts />` in
  `UnitModelEditWorkspace` (page.tsx) so editors overlay the whole page and
  survive structure/texture tab switches.
- The page owns: `modifiedPaths` set, `leftTab` + `focusTextureFilename`, and the
  debounced `onSaved` handler (preview reload + structure remount + modified set).
- Pass `openEditorForPath`, `editingPaths`, `modifiedPaths`, reveal/copy/show
  callbacks down through `UnitModelHierarchyPanel` to `UnitModelStructureTreeView`.
- The preview is **not** suspended while editors are open (we want live updates).

## Testing (vitest, matching existing `*.test.ts`)

- `unitModelStructureTree`: `fileUrl` attachment on item nodes; existing
  parse/role tests still pass.
- New path resolver: abs-path from `structureJsonPath` + relative `fileUrl`,
  mirroring the Rust convention; handles `\` and `/`, nested folders.
- `unitModelEditableKind`: ext → editor kind mapping; non-editable → `null`.
- Editor dispatch (`openEditorForPath`): which opener fires for which extension;
  returns `false` for non-editable.
- Dirty/modified path-set logic: normalization + set membership + de-dup.
- The shared editor components already have their own tests; not duplicated.

## Out of scope (YAGNI)

- Refactoring TestEditor (only a pointer/deprecation comment is added).
- Any unit-model-specific logic inside the shared editor components.
- File rename / reference rewriting (the dynamic-folder pipeline design mandates
  "never rewrite numatb binaries").
- Suspending the preview while editors are open.
- effect_project / control-bin (`.bin`) editing (only the four SSBH types).

## References (existing surface)

- `src/page/TestEditor/page.tsx` — proven session-management logic to port.
- `src/components/ssbh-model-preview/{Numatb,Numdlb,Nuhlpb,Jnttbl}EditorModalHost.tsx`
  + `*EditorModalWindow.tsx` + IO services / editor utils.
- `src/page/SceneEdit/hooks/useSceneDetailView.ts` — alternate (tab) wiring, for
  reference only.
- `src-tauri/src/format/unit_model_textures.rs` — `resolve_file_path(json_dir,
  file_url)` path convention being mirrored.
- `src/page/UnitModelEdit/{page.tsx, components/UnitModelStructureTreeView.tsx,
  components/UnitModelHierarchyPanel.tsx, components/UnitModelTexturePanel.tsx,
  utils/unitModelStructureTree.ts, hooks/useUnitModelWorkspace.ts}` — wiring
  targets.
