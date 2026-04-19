# Memory Preview Backend Selection Design

**Date:** 2026-04-19

**Goal:** Move Character ID mapping and Collection interaction state out of the frontend into Tauri commands/state, while adding searchable Collection controls and a GPU-side selected highlight effect driven only by backend JSON state.

## Summary

This design splits the work into three coordinated changes:

1. Move `Character ID -> Model -> source .fhm2d` resolution into Rust so the frontend only receives JSON rows and renders them.
2. Move `Collection` interaction state (`visible`, `selected`, `active`, `viewRange`, `controlRange`, search result filtering) into Rust-backed state so the frontend no longer owns the selection logic.
3. Add a frontend-only shader highlight for selected preview instances in R3F. The shader consumes backend JSON state but does not define selection behavior itself.

The frontend remains responsible for:

- calling Tauri commands
- storing the latest JSON snapshots returned from Tauri
- rendering Inspector UI
- rendering GPU highlight effects based on JSON state

The frontend must not scan the filesystem, parse `character_id_table.bin`, or determine Collection selection state by itself.

## Current Problems

- `fhm2dMemoryPreviewCharacterTable.ts` performs workspace file reads and source path existence checks in the frontend.
- `SsbhModelPreviewContext.tsx` owns Collection state entirely in React (`activePreviewInstanceId`, `hiddenPreviewInstanceIds`, `previewViewMode`, `previewControlScope`).
- `SsbhModelCanvas.tsx` knows which preview instance is active for interaction, but it does not render a dedicated selected visual state for preview instances.
- The current architecture mixes data authority and presentation, making performance work and future interaction changes harder.

## Target Architecture

### 1. Backend-owned Character ID data

Add a Rust command in `src-tauri/src/fhm2d_memory_preview.rs` that:

- accepts `workspace_root`, `ob_dpl_cache_path`, and optional `query`
- reads `0x036B9E67/character_id_table.bin`
- extracts only `CharacterId` and `Model`
- resolves `Model` to `0xXXXXXXXX.fhm2d`
- checks source existence with cached lookup per hash
- applies search filtering in Rust
- returns JSON rows already sorted by `CharacterId`

Recommended response shape:

```ts
type CharacterIdMemoryPreviewRow = {
  characterId: number;
  modelValue: number;
  modelHashHex: string;
  sourcePath: string;
  sourceExists: boolean;
  disabledReason: string | null;
};

type CharacterIdMemoryPreviewResponse = {
  filePath: string;
  availableCount: number;
  query: string;
  rows: CharacterIdMemoryPreviewRow[];
};
```

Frontend changes:

- delete filesystem and parsing work from `fhm2dMemoryPreviewCharacterTable.ts`
- replace it with a thin Tauri service wrapper
- keep only presentational filtering state such as the current search input text

### 2. Backend-owned Collection state

Create a Rust module dedicated to preview collection state, recommended file:

- `src-tauri/src/preview_collection_state.rs`

This module owns the authoritative state for the current preview collection:

```ts
type PreviewCollectionItem = {
  id: string;
  displayLabel: string;
  modlPath: string;
  visible: boolean;
  selected: boolean;
  active: boolean;
};

type PreviewCollectionSnapshot = {
  query: string;
  viewRange: "all" | "single";
  controlRange: "all" | "single";
  allVisible: boolean;
  items: PreviewCollectionItem[];
};
```

Required commands:

- `preview_collection_replace_from_bundles`
- `preview_collection_append_from_bundles`
- `preview_collection_snapshot`
- `preview_collection_set_query`
- `preview_collection_toggle_item_visibility`
- `preview_collection_toggle_all_visibility`
- `preview_collection_toggle_item_selected`
- `preview_collection_set_active`
- `preview_collection_set_view_range`
- `preview_collection_set_control_range`
- `preview_collection_remove_missing_ids` if instances are disposed or replaced externally

Behavior rules:

- clicking an item toggles `selected`
- clicking the same selected item again clears only `selected`
- clearing `selected` does not clear `active`
- `active` remains the interaction target for existing viewport and motion control logic
- `toggle all visibility` is a single command: when all items are visible, hide all; otherwise show all
- search filtering happens in Rust and the frontend renders the returned subset only

### 3. Frontend integration with backend snapshots

`SsbhModelPreviewContext.tsx` should stop being the authority for Collection state.

It may still cache the latest backend snapshot locally for render performance, but every state mutation must go through commands and then refresh from a returned snapshot.

Required changes:

- keep `previewInstances` as render payloads needed by the viewport
- replace local Collection mutation helpers with service calls that return `PreviewCollectionSnapshot`
- derive `activePreviewInstanceId`, `previewViewMode`, `previewControlScope`, and hidden/selected membership from the snapshot instead of standalone React state
- update `SsbhModelPreviewInspector.tsx` to render from snapshot data only

Inspector UI changes:

- add a `Collection search` input
- keep `View range` and `Control range`, but source values from backend snapshot
- replace current `Show all` button with a single toggle button:
  - `Hide all` when `allVisible === true`
  - `Show all` otherwise
- clicking the row label toggles selected
- provide a distinct control for setting active if needed; do not couple `selected` and `active`

### 4. Selected highlight effect in R3F

Selection rendering stays on the frontend GPU side, but selection state comes only from backend JSON.

Implementation should patch the existing `MeshStandardMaterial` path in `SsbhModelCanvas.tsx` using `onBeforeCompile`, following the established pattern in `animeExvsMeshStandard.ts`.

Recommended uniforms:

```ts
type PreviewSelectionUniforms = {
  uSelectionEnabled: { value: number };
  uSelectionColor: { value: Vector3 };
  uSelectionTime: { value: number };
};
```

Recommended visual treatment:

- Fresnel rim highlight around selected models
- soft emissive lift
- subtle animated sweep band across the surface
- preserve base PBR lighting and current anime render style

Implementation rules:

- apply the shader patch only when the draw belongs to a selected preview instance
- do not replace the whole material pipeline with a separate standalone shader material
- active-only interaction logic remains unchanged
- repeated click must remove the selected effect immediately

## Data Flow

### Character ID picker

1. Frontend opens Memory Preview modal.
2. Frontend calls Rust `character_id_memory_preview_rows`.
3. Rust reads and filters data, then returns JSON.
4. Frontend renders rows and disabled state only.
5. Clicking a valid row still calls the existing memory-session open path, but the frontend does not resolve filesystem paths itself.

### Collection

1. Preview bundles are loaded or appended.
2. Frontend notifies Rust collection state with the current instance metadata.
3. Rust returns a fresh `PreviewCollectionSnapshot`.
4. Inspector renders the snapshot.
5. Any user action invokes one Rust command and receives an updated snapshot.
6. Canvas reads derived selected/visible/active ids from that snapshot.

## Non-Goals

- Do not move WebGL or shader execution into Rust.
- Do not redesign the existing preview bundle generation pipeline.
- Do not change current motion playback semantics beyond replacing frontend-owned Collection state with backend-owned state.
- Do not add event-stream synchronization for v1; command/response snapshots are sufficient.

## Error Handling

- Missing workspace root returns an explicit Rust error.
- Missing `character_id_table.bin` returns an explicit Rust error.
- Missing `obDplCachePath` keeps rows visible with `disabledReason`.
- Missing source `.fhm2d` keeps rows visible with `disabledReason`.
- Invalid Collection item ids passed from frontend return explicit Rust errors.
- Frontend only displays returned error strings; it does not guess fallback behavior.

## Testing

### Rust

- parse and return `CharacterId + Model` rows only
- deduplicate repeated hash existence checks
- search filtering on `CharacterId` and `modelHashHex`
- Collection state transitions:
  - toggle selected on/off
  - set active independently from selected
  - toggle all visibility
  - search filtering
  - single/all view range

### Frontend

- service wrappers deserialize Rust JSON shapes correctly
- Inspector renders Collection search, toggle-all button, and selected states from snapshots
- repeated click removes selected state without clearing active state
- selected snapshot entries produce selected highlight props in canvas

### Visual / integration

- selected models show the custom highlight in both `standard` and `anime` render styles
- deselect removes the effect without rebuilding the collection
- hidden models remain excluded from visible instance render output

## Implementation Order

1. Add Rust Character ID query command and tests.
2. Replace frontend Character ID filesystem logic with a service wrapper.
3. Add Rust Collection state module and commands.
4. Refactor preview context and inspector to consume backend snapshots.
5. Add selected highlight shader path in canvas.
6. Add regression and interaction tests.

## Open Decision Locked In

- Re-clicking a selected Collection item clears only the selected highlight state.
- It does not clear `active`, `viewRange`, or `controlRange`.
