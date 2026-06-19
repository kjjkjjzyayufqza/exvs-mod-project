# TestEditor Workspace Layout Design

> **Date:** 2026-06-19
> **Status:** Approved direction, implementation pending
> **Scope:** Workspace metadata, asset routing, extraction, discovery, tree reveal, dirty tracking, repack, and staged migration of TestEditor consumers

## 1. Problem

TestEditor currently treats the selected workspace as a flat collection of hash folders and sibling structure files:

```text
workspace/
  0xBDBE6FEA/
  0xBDBE6FEA_structure.json
  0x036B9E67/
  0x036B9E67_structure.json
```

This works while every resource shares one directory, but it loses the resource domain encoded by the game layout. It also creates ambiguous dirty/repack keys when the same hash can occur in different domains.

The target layout introduces configurable route prefixes:

```text
workspace/
  test_editor_workspace.json
  002chara/
    0xBDBE6FEA/
    0xBDBE6FEA_structure.json
  041cpm/
    0x036B9E67/
    0x036B9E67_structure.json
```

The selected workspace remains the stable project root. Editors must resolve their own resource roots from workspace metadata instead of assuming `workspace/hash`.

## 2. Evidence From The Game Layout

The supplied reference directories contain these top-level domains:

```text
001stage
002chara
003motion
004ragdoll
005renderinfo
006effect
009gui
010localizedtext
011camera
012list
020common
040msc
041cpm
051mission
060navi
090sound
091waveform
100system
800etcetera
```

`041cpm` further separates parameter families such as `arms_param`, `bullet_param`, `character_id`, `character_param`, `chrsys`, `grap_param`, `hitgroup`, `interaction`, `shell`, and `speed_param`.

These names provide defaults, not a requirement to reproduce every original folder. The workspace schema remains user-configurable and permits nested prefixes.

## 3. Design Principles

1. The workspace root is a project boundary, not an asset folder.
2. Every asset operation uses a logical route ID.
3. A single path resolver owns prefix joining and validation.
4. New writes always use configured prefixes.
5. Legacy flat workspaces remain readable until explicitly migrated.
6. No silent file moves occur while opening a workspace.
7. The resource registry and workspace layout remain separate documents.
8. Frontend code resolves paths with Tauri v2 APIs; Rust commands receive already-resolved roots.
9. Dirty and repack identities include the route prefix, not only the hash.

## 4. Workspace Document

### 4.1 Location

The document is stored at:

```text
{workspaceRoot}/test_editor_workspace.json
```

Missing documents resolve to built-in version 1 defaults. The app only writes the document when the user saves layout settings or initializes a workspace.

### 4.2 Schema Version 1

```typescript
export type WorkspaceAssetRouteId = string;

export interface TestEditorWorkspaceDocument {
  version: 1;
  legacyReadFallback: boolean;
  assetRoutes: Record<WorkspaceAssetRouteId, WorkspaceAssetRouteConfig>;
}

export interface WorkspaceAssetRouteConfig {
  prefix: string;
  kind: "fhm2d-pack" | "directory";
  label: string;
}
```

Example:

```json
{
  "version": 1,
  "legacyReadFallback": true,
  "assetRoutes": {
    "stage.model": {
      "prefix": "001stage",
      "kind": "fhm2d-pack",
      "label": "Stage"
    },
    "unit.model": {
      "prefix": "002chara",
      "kind": "fhm2d-pack",
      "label": "Character Model"
    },
    "unit.motion": {
      "prefix": "003motion",
      "kind": "fhm2d-pack",
      "label": "Character Motion"
    },
    "unit.effect": {
      "prefix": "006effect",
      "kind": "fhm2d-pack",
      "label": "Character Effect"
    },
    "unit.msc": {
      "prefix": "040msc",
      "kind": "fhm2d-pack",
      "label": "Character MSC"
    },
    "unit.param": {
      "prefix": "041cpm",
      "kind": "fhm2d-pack",
      "label": "Character Param"
    },
    "unit.sound": {
      "prefix": "090sound",
      "kind": "fhm2d-pack",
      "label": "Character Sound"
    }
  }
}
```

### 4.3 Validation

`prefix` is a relative directory path. Validation rejects:

- empty paths;
- absolute Windows, UNC, or POSIX paths;
- `.` or `..` segments;
- segments containing Windows-invalid characters;
- duplicate normalized prefixes assigned to incompatible route kinds;
- unsupported document versions.

Forward slashes are canonical in JSON. Tauri `join()` creates platform-native paths at runtime.

Unknown route IDs are preserved so future editors can extend the document without a schema bump.

## 5. Default Route Catalog

The application owns a default catalog independent of the persisted document:

| Route ID | Default prefix | Initial consumer |
|---|---|---|
| `stage.model` | `001stage` | Stage model FHM2D |
| `unit.model` | `002chara` | Character ID `Model` |
| `unit.motion` | `003motion` | Character ID `Motion` |
| `unit.effect` | `006effect` | Character ID `Effect` |
| `unit.msc` | `040msc` | Character ID `Msc` |
| `unit.param` | `041cpm` | Character ID `Param` |
| `unit.sound` | `090sound` | Character ID `Sound` |
| `list.character` | `012list` | Character ID and character list packages |
| `list.series` | `012list` | Series list package |
| `list.stage` | `012list` | Stage list package |
| `gui.card-icons` | `009gui` | Character card icon package |
| `gui.series-icons` | `009gui` | Series icon package |
| `gui.stage-icons` | `009gui` | Stage icon packages |
| `param.for-outgame` | `041cpm` | Character cost package |
| `msc.workspace` | `040msc` | Extracted MSC packages |

Only routes whose current package semantics are verified are activated during migration. The reference game's second-level folders such as `arms_param` and `character_list` describe the original unpacked resource organization; they are not imposed on this hash-pack workspace. Param visual editors resolve files inside the selected character's `unit.param` hash package rather than creating top-level `041cpm/arms_param` routes.

Persisted entries override matching defaults. Missing entries inherit defaults. This keeps documents concise while allowing every prefix to be customized.

## 6. Module Boundaries

```text
src/services/testEditorWorkspace/
  types.ts          schema and route IDs
  defaults.ts       immutable built-in document and route catalog
  validation.ts     parser, normalization, validation issues
  persistence.ts    load/save test_editor_workspace.json via Tauri fs
  paths.ts          pure and async path resolution
  migration.ts      legacy discovery and explicit migration planning
src/hooks/
  useTestEditorWorkspace.ts
src/page/TestEditor/components/workspace-layout/
  WorkspaceLayoutDialog.tsx
  WorkspaceRouteTable.tsx
```

`useTestEditorWorkspace(workspaceRoot)` exposes loading state, effective routes, validation issues, save/reset actions, and path helpers. Consumers do not read the JSON directly.

## 7. Path Resolution Contract

### 7.1 Resolved Roots

```typescript
export interface ResolvedWorkspaceRoute {
  routeId: WorkspaceAssetRouteId;
  prefix: string;
  rootPath: string;
}

export interface ResolvedFhm2dPackPaths extends ResolvedWorkspaceRoute {
  hashHex: string;
  folderPath: string;
  structureJsonPath: string;
  packKey: string;
}
```

For `workspaceRoot = E:/XB/unpack/com/file`, route `unit.model`, and hash `0xBDBE6FEA`:

```text
rootPath          E:/XB/unpack/com/file/002chara
folderPath        E:/XB/unpack/com/file/002chara/0xBDBE6FEA
structureJsonPath E:/XB/unpack/com/file/002chara/0xBDBE6FEA_structure.json
packKey           002chara/0xBDBE6FEA
```

### 7.2 Read Resolution

`resolveExistingFhm2dPack()` checks:

1. configured prefix folder and structure JSON;
2. when `legacyReadFallback` is true, legacy flat folder and structure JSON;
3. otherwise returns `existing: null` while preserving the configured write target.

The result contains `configured: ResolvedFhm2dPackPaths`, `existing: ResolvedFhm2dPackPaths | null`, `sourceLayout: "configured" | "legacy" | "missing"`, and `duplicateLayout: boolean`. UI surfaces legacy reads with a migration action. A missing structure JSON never silently pairs with a folder from another route. If both layouts exist, configured wins and `duplicateLayout` is true.

### 7.3 Write Resolution

All extraction, copy-as-new, generated structures, and new editor artifacts use configured paths only. Legacy fallback is never a write target.

The selected extract output directory is another root to which the active workspace document is applied:

```text
extractOutputRoot/002chara/0xBDBE6FEA
extractOutputRoot/002chara/0xBDBE6FEA_structure.json
```

The extract output directory does not need its own workspace document.

## 8. Character ID Table Migration

The six Character ID asset fields map to route IDs:

| Field | Route ID |
|---|---|
| `Model` | `unit.model` |
| `Effect` | `unit.effect` |
| `Sound` | `unit.sound` |
| `Param` | `unit.param` |
| `Msc` | `unit.msc` |
| `Motion` | `unit.motion` |

`AssetRefInfo` gains route metadata and separate configured/legacy state. It no longer constructs workspace paths from `currentDir` directly.

The following operations share the resolved route root:

- workspace existence badge;
- tree reveal;
- extract collision detection;
- extract destination;
- copy-as-new source and destination;
- remove workspace/extract output artifacts;
- registry collision probing.

After extraction, existence state is recomputed from the actual returned path. It is not set to true for the workspace when extraction used a distinct output root.

## 9. Rust Command Boundary

Rust commands remain prefix-agnostic.

`copy_asset_as_new` receives `source_asset_root_dir` and `destination_asset_root_dir`, not the workspace root. It reads:

```text
source_asset_root_dir/oldHash
source_asset_root_dir/oldHash_structure.json
```

and writes the corresponding new hash paths under `destination_asset_root_dir`. The roots are equal for configured assets. A legacy flat asset can therefore be copied into the configured prefix without creating another flat write.

`remove_asset_workspace` receives resolved asset roots for workspace and extract output. The backend validates each root and removes only the hash folder pair inside those roots.

This avoids duplicating route mappings in Rust and prevents frontend/backend drift.

## 10. File Tree And Repack

### 10.1 Pack Identity

Dirty state changes from `Set<hash>` to `Map<packKey, DirtyPack>`:

```typescript
export interface DirtyPack {
  packKey: string;
  routeId: WorkspaceAssetRouteId | null;
  prefix: string;
  hashFolderName: string;
  folderPath: string;
  structureJsonPath: string;
}
```

This prevents collisions such as `002chara/0x12345678` and `006effect/0x12345678`.

### 10.2 Event Classification

Watcher events are classified using the effective route prefix list in memory. The longest matching prefix wins. No filesystem probe is performed for every event.

For a configured `fhm2d-pack` route, the first path segment after the prefix identifies the hash folder. A sibling `_structure.json` event resolves to the same pack key.

Legacy top-level hash folders continue to classify while fallback is enabled.

### 10.3 Tree Actions

Context-menu repack is enabled for:

- a hash folder directly under a configured `fhm2d-pack` prefix;
- its sibling `_structure.json`;
- a legacy direct-child hash folder while fallback is enabled.

The repack dialog receives full `folderPath` and `structureJsonPath` values. It does not reconstruct paths from `rootDir + folderName`.

Selecting or revealing a nested hash folder continues to work because path matching already traverses descendants. Folder-to-structure automatic selection resolves the sibling structure file in the same parent directory.

## 11. Workspace Layout UI

TestEditor adds a workspace layout command beside the workspace picker. The dialog provides:

- route label and route ID;
- editable relative prefix;
- validation state;
- reset-to-default per route;
- save and reload actions;
- legacy fallback toggle;
- explicit legacy migration preview.

The UI uses text fields because prefixes are paths, not arbitrary option sets. Saving writes one JSON document atomically. Invalid rows block save.

No automatic migration occurs when a workspace opens.

## 12. Explicit Legacy Migration

Migration is a separate command with preview and confirmation.

The planner scans only known root-level hash folder pairs and maps them when exactly one route can be inferred from current editor metadata or an explicit user-selected route. Ambiguous packs remain unmoved.

Migration operations are expressed as source/destination pairs and validated before execution. Existing destinations block the operation. The backend performs moves within the selected workspace and returns per-pack results.

The initial implementation may expose legacy warnings without the move command; however, prefix-aware reads and new writes are required from the first release. The move command is not required for correctness of the new layout.

## 13. Remaining TestEditor Consumer Migration

After the Character ID asset slice, fixed root joins are migrated by domain:

1. Character/list packages and icon structures.
2. Stage list, stage icons, and stage model assets.
3. Param editor families under `041cpm`.
4. MSC workspace discovery under `040msc`.
5. Motion, effect, sound, GUI, and other future asset editors.

Each consumer uses a route ID and the shared resolver. No consumer is allowed to introduce a new literal prefix join.

## 14. Error Handling

| Condition | Behavior |
|---|---|
| Missing workspace document | Use defaults; show `Defaults` status |
| Invalid JSON | Keep defaults in memory, show blocking validation error, do not overwrite file |
| Unsupported version | Reject document and preserve file |
| Invalid prefix | Block save and path operations for that route |
| Missing configured asset | Try legacy only when enabled |
| Configured and legacy assets both exist | Prefer configured, show duplicate-layout warning |
| Extract target exists | Existing overwrite confirmation remains, using configured path |
| Prefix directory missing | Create through existing extraction pipeline as needed |
| Distinct extract output root | Apply active workspace routes to that root |

## 15. Performance

- Load and validate the small workspace document once per workspace selection.
- Memoize normalized prefixes and route lookups.
- Classify watcher paths with string operations only.
- Do not recursively scan the reference game directories at runtime.
- Preserve `useTransition` for large tree updates; file I/O retains explicit loading state.
- Route changes trigger one explicit tree refresh rather than repeated per-consumer scans.

## 16. Testing

### Unit Tests

- document validation and default merging;
- Windows and POSIX prefix normalization;
- rejection of absolute and traversal paths;
- configured, legacy, missing, and duplicate path resolution;
- route mapping for all six Character ID fields;
- extract target and collision path under prefixes;
- dirty pack classification for nested and legacy layouts;
- nested folder and structure JSON repack target parsing.

### Rust Tests

- copy-as-new inside an arbitrary resolved asset root;
- remove folder pair inside arbitrary workspace/output roots;
- rejection of missing roots and existing copy targets.

### Integration Tests

- workspace document load/save through mocked Tauri fs;
- Character asset extraction invokes the configured target path;
- tree reveal selects a nested hash folder;
- repack dialog uses nested full paths;
- changing a route prefix refreshes consumer paths.

## 17. Delivery Phases

### Phase 1: Foundation And Character Assets

- schema, defaults, validation, persistence, resolver, and hook;
- layout settings dialog;
- six Character ID asset routes;
- extraction, copy, remove, reveal, and registry probing;
- legacy read warnings.

### Phase 2: File Tree And Repack

- nested pack identity;
- watcher dirty classification;
- nested structure pairing;
- context-menu and batch repack full-path contracts.

### Phase 3: Params And Fixed Consumers

- migrate Character/List, Stage, icons, param editors, and MSC workspace;
- remove direct `join(folderPath, hash)` assumptions from TestEditor consumers;
- add route coverage checks.

### Phase 4: Legacy Migration Tool

- previewable migration plan;
- explicit user-confirmed moves;
- conflict reporting and post-migration refresh.

## 18. Acceptance Criteria

1. With workspace `E:/XB/unpack/com/file`, extracting Character `Model` produces `E:/XB/unpack/com/file/002chara/0xHASH` and the sibling structure JSON.
2. A separate extract output root uses the same `002chara` prefix.
3. Character `Effect`, `Sound`, `Param`, `Msc`, and `Motion` use their configured routes.
4. Prefixes are editable and persisted in `test_editor_workspace.json`.
5. Legacy flat assets remain readable when fallback is enabled but receive no new writes.
6. Nested packs can be revealed, marked dirty, and repacked.
7. Two equal hashes under different prefixes remain distinct dirty/repack entries.
8. Resource registry behavior remains intact and uses resolved workspace paths for probes.
9. Invalid layout documents never cause writes outside the selected root.
10. Migrated TestEditor consumers no longer construct resource paths with unscoped workspace-root hash joins.
