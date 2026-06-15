# Unit Model Add Folder + Replace Model - Product/Technical Design

Status: phase 1 implemented for the existing Unit Model Editor surface.

This feature is for operators who already have a prepared SSBH model folder and
do not want to go through `Add -> FBX/DAE -> SSBH`. The same prepared-folder
source should support both:

1. **Add prepared SSBH folder**: copy the folder contents into the Unit Model
   package as a new model.
2. **Replace model from prepared SSBH folder**: swap an existing model's SSBH
   content in place while preserving references.

## Current Grounding

The codebase already has most of the backend mutation primitives:

- `validate_unit_model_source_folder(source_dir)` scans a prepared folder and
  validates the required SSBH set.
- `add_unit_model_model(model_root, structure_json_path, source_dir)` copies a
  validated source as a new model, dedupes textures into the shared pool,
  synthesizes texture-container nodes, appends the model group, and creates an
  empty NUHLPB.
- `replace_unit_model_model(model_root, structure_json_path, target_model_name,
  source_dir)` swaps a model group in place, preserves the target model position,
  rewrites the new NUMDLB's `model_name` to the target name, dedupes new
  textures, drops orphaned old files/textures, keeps the target NUHLPB, and uses
  rollback-style staging.
- `UnitModelAddFolderModal` and `UnitModelSourceValidationPreview` already exist
  for the add preview.
- `UnitModelModelManagerPanel` currently exposes add-from-FBX/DAE,
  add-from-folder, and remove. A user-facing replace entry point is not wired.

The design below treats the existing backend as the foundation and focuses on
the missing operator experience: preflight visibility, replace diffing, clear
identity rules, and safe commit behavior.

## Source Folder Contract

A prepared source folder is valid only when all of these checks pass:

- Exactly one `.numdlb`.
- Exactly one `.numshb`.
- Exactly one `.nusktb`.
- Exactly one `.jnttbl`.
- Exactly two `.numatb` files:
  - `<sourceModel>__maya__.numatb`
  - `<sourceModel>__nust__.numatb`
- Required companion files share the NUMDLB stem, allowing the existing
  `__maya__` suffix exceptions for `.numshb` and `.nusktb`.
- NUMDLB parses successfully, and non-empty internal `model_name` matches the
  source filename stem.
- NUMSHB, NUSKTB, both NUMATB files, and JNTTBL parse successfully.
- `jnttbl.bone_count == nusktb.bones.length`.
- Any source `.nuhlpb` is accepted but not used by Add. Replace keeps the
  target NUHLPB by default.
- NUMATB texture references are collected by basename. Each referenced texture
  must be either:
  - present in the source folder, or
  - already present in the package shared texture pool.

Current validation reports "not in source" but does not know package-pool
availability by itself. The user-facing preview should add pool-aware resolution
before enabling commit.

## Feature 1 - Add Prepared SSBH Folder

### User Flow

1. User clicks `Add` in the Models panel.
2. User chooses `Add SSBH Folder`.
3. Tauri directory dialog opens, defaulting to the last used add-folder path or
   the active model root.
4. App validates the folder.
5. App shows a compact preflight modal.
6. User confirms.
7. Backend runs `add_unit_model_model`.
8. App reloads structure JSON, refreshes model list/preview, and invalidates any
   stale validation/repack result.

### Add Preview Modal

The preview modal should show a read-only, scannable report:

- **Identity**
  - Derived source model name.
  - Source folder path.
  - Duplicate-name state.
  - If duplicate: block Add and offer `Replace existing...` as the next action.
- **Required files**
  - Checklist for NUMDLB, NUMSHB, NUSKTB, JNTTBL, MAYA NUMATB, NUST NUMATB.
  - File names are shown, not only counts.
- **Texture plan**
  - Total referenced textures.
  - Textures found in the source folder: will be copied and deduped.
  - Textures missing from source but found in package pool: will be reused.
  - Textures missing from both source and pool: blocker.
- **Companion behavior**
  - Add creates a fresh empty NUHLPB.
  - Source NUHLPB, if present, is ignored.
- **Commit summary**
  - New model group appended at the end of the models container.
  - SHL/effect_project/vernier/ragdoll/nudnbb are not edited.

Add is disabled for duplicate model names, invalid source folders, or missing
texture refs that are absent from both source and pool.

## Feature 2 - Replace Model From Prepared Folder

Replace is not "remove then add". It is an in-place content swap.

### Identity Rule

The target model's identity is sacred:

- Preserve the target model name used by the existing NUMDLB item.
- Preserve the target model group position inside the models container.
- Preserve the target folder index, because control bins can reference model
  order.
- Rewrite the incoming NUMDLB `model_name` to the target model name.
- Keep SHL, vernier, effect_project, characterid, ragdoll, nudnbb, and weapon
  icon data unchanged.

The source folder contributes geometry, mesh, skeleton, materials, JNTTBL, and
texture references. It does not rename the target model.

### User Flow

1. User selects a model row or uses that row's context menu.
2. User clicks `Replace`.
3. Tauri directory dialog opens for a prepared SSBH source folder.
4. App validates the source folder.
5. App computes a replace preview against the selected target.
6. App shows a side-by-side diff modal.
7. User confirms `Replace contents`.
8. Backend runs `replace_unit_model_model`.
9. App reloads structure JSON, refreshes preview, invalidates validation/repack,
   and reports removed/orphaned files.

### Replace Preview Modal

The replace modal should be explicit about what stays and what changes.

Sections:

- **Target lock**
  - Target model name.
  - Target model index/order.
  - "Model identity and position will be preserved."
- **Source folder validation**
  - Reuse `UnitModelSourceValidationPreview`.
  - In replace mode, duplicate source name is not a blocker because the source
    name is discarded.
- **Compatibility diff**
  - Skeleton bone count: target vs source.
  - Bone name overlap: same / missing from source / new in source.
  - JNTTBL count: target vs source.
  - NUMATB profiles detected: maya and nust.
  - Material labels added/removed/kept when available.
  - Texture plan: copied, reused from pool, missing, old textures that may be
    garbage-collected.
- **NUHLPB policy**
  - Phase 1 behavior: keep target NUHLPB.
  - Show a warning when skeleton bone names/count differ, because keeping the
    old NUHLPB may refer to bones that changed.
  - Future option: `Auto` = keep when bone-name set matches, reset to empty
    when it does not.
- **Unaffected files**
  - SHL, vernier, effect_project, characterid, ragdoll, nudnbb, and weapon icons
    are not changed.
- **Commit plan**
  - New SSBH files are copied into the target model folder.
  - Target model group children are rebuilt in place.
  - New textures are copied to the shared `textures/` pool.
  - Existing textures with the same basename are reused.
  - Old target model files and orphaned textures are removed after commit.

Replace is blocked only by hard errors. Compatibility mismatches are warnings,
because some intentional replacements will change skeleton or materials.

### Hard Blockers

- No active Unit Model folder or missing `_structure.json`.
- Target model not found in the models container.
- Source folder invalid by the source folder contract.
- Any NUMATB texture reference missing from both the source folder and package
  texture pool.
- Any currently open dirty editor session for files that replace would overwrite
  unless the user saves/discards first.
- Backend dry-run cannot build a valid structure plan.

### Warnings

- Source model name differs from target model name. This is normal; identity
  will be rewritten to target.
- Skeleton bone count differs.
- Bone names differ.
- JNTTBL count differs from target.
- Material label set differs.
- Replace may remove old textures that are no longer referenced by any model.
- Source NUHLPB is present but ignored.
- SHL count/order is not edited; validation after replacement may still require
  manual SHL work.

## Backend Preview Surface

Add one backend command instead of computing all replace diffing in React:

```rust
#[tauri::command]
pub async fn preview_unit_model_model_replacement(
    model_root: String,
    structure_json_path: Option<String>,
    target_model_name: String,
    source_dir: String,
) -> Result<UnitModelReplacePreview, String>
```

Suggested response shape:

```ts
interface UnitModelReplacePreview {
  source: UnitModelSourceValidation;
  target: {
    modelName: string;
    modelIndex: number;
    numdlbPath: string | null;
    numshbPath: string | null;
    nusktbPath: string | null;
    jnttblPath: string | null;
    numatbPaths: string[];
    nuhlpbPath: string | null;
  };
  compatibility: {
    skeleton: {
      sourceBoneCount: number;
      targetBoneCount: number;
      matchingBoneNames: number;
      missingInSource: string[];
      newInSource: string[];
    };
    jnttbl: {
      sourceBoneCount: number;
      targetBoneCount: number | null;
    };
    materials: {
      keptLabels: string[];
      removedLabels: string[];
      addedLabels: string[];
    };
  };
  textures: {
    referenced: string[];
    copiedFromSource: string[];
    reusedFromPool: string[];
    missing: string[];
    orphanedAfterReplace: string[];
  };
  warnings: string[];
  blockers: string[];
}
```

The existing `replace_unit_model_model` can remain the commit command. If the
preview response has blockers, the frontend must not call commit.

## Frontend Components

Add or extend these components:

- `UnitModelReplaceFolderModal`
  - Replace-specific modal using the preview response.
  - Includes target lock, source validation, compatibility diff, texture plan,
    NUHLPB policy, and commit summary.
- `UnitModelSourceValidationPreview`
  - Add `mode: "add" | "replace"` and optional pool-aware texture status.
  - Duplicate names block add but not replace.
- `UnitModelModelManagerPanel`
  - Add a per-row replace icon button and context menu action.
  - Track `replacePreview` state.
  - Call preview command after folder pick.
  - Call `replaceUnitModelModel` only after confirmed preview.

Design direction: this is a dense technical tool for repeated modding work.
Keep it quiet, compact, and scannable. Use existing shadcn primitives and lucide
icons. Do not add a landing-style explanation. The first visible surface should
be the model list and row-level actions.

## Mutation Safety

Replace should keep the backend's rollback-style discipline:

1. Validate source and target before copying.
2. Build the new structure in memory.
3. Stage old target files aside or record restorable backups.
4. Copy new files.
5. Atomically write `_structure.json`.
6. Delete old files and orphan textures only after structure commit succeeds.
7. On failure, restore old files and old structure JSON.

All path deletion must stay inside the selected Unit Model root or the sibling
structure directory. Never delete arbitrary user paths derived from `fileUrl`
without resolving and boundary-checking them.

## Verification Plan

Rust:

- Source validation rejects missing/duplicate required files.
- Source validation rejects invalid parse or JNTTBL/NUSKTB bone-count mismatch.
- Add blocks duplicate names and appends a new model group when valid.
- Replace preserves model group index and target model name.
- Replace rewrites incoming NUMDLB `model_name` to the target.
- Replace keeps target NUHLPB.
- Replace removes old unreferenced model files and orphan textures.
- Replace rolls back when copy or structure write fails.
- Repack validation passes after add/replace on real samples.

Frontend:

- Add preview renders required files and disables commit on duplicate name.
- Add preview distinguishes copied textures, pool textures, and missing textures.
- Replace row action opens folder picker for the selected target.
- Replace preview displays target identity lock and source validation.
- Skeleton/material warnings do not disable commit.
- Hard blockers disable commit.
- Mutation success reloads structure and clears stale validation/repack result.

Manual real-disk smoke:

1. Extract/open a real Unit Model package.
2. Add a prepared folder with source-local textures.
3. Validate and repack.
4. Replace an existing model with a differently named source folder.
5. Confirm model order and target name stay stable.
6. Validate and repack.
7. Re-extract the output and confirm the replaced model survives.

## Implementation Phases

1. **Preview correctness**
   - Add pool-aware texture resolution for add.
   - Add backend replacement preview command.
   - Add tests for preview blockers/warnings.
2. **Replace UI**
   - Add row action and `UnitModelReplaceFolderModal`.
   - Wire preview -> confirm -> existing commit command.
3. **Commit hardening**
   - Add dirty-editor overwrite guard.
   - Expand rollback tests for replace.
   - Surface removed/orphaned files in success details.
4. **Optional NUHLPB policy**
   - Add `nuhlpbMode: "keep" | "reset" | "auto"` to preview and commit.
   - Default remains `keep` until reset/auto is fully verified.
