# numatb-template-config - Process

## Context

- User request: make numatb editor templates persist and reload through Tauri config/store, and ensure UI load/apply behavior works.
- Project rule requires Tauri v2 APIs/plugins for native persistence.
- `@tauri-apps/plugin-store` is already installed in `package.json`.
- `src-tauri/src/lib.rs` already registers `tauri_plugin_store::Builder::default().build()`.
- Official Tauri v2 docs show `load("store.json")`, `store.get`, `store.set`, and `store.save` for persistent JS store usage.

## Relevant docs read

- `docs/exvs-stage-numatb-simple-color.md`
- `docs/gvs-numatb-step2-migration-changes.md`
- `docs/agent-sessions/numatb-texture-validation-gate/process.md`
- `docs/agent-sessions/numatb-texture-validation-gate/todo.md`

## Findings

- `src/components/ssbh-model-preview/store/daeSsbhTemplateLibrary.ts` already tries to persist templates with `@tauri-apps/plugin-store`.
- There are two template editor surfaces:
  - `src/components/ssbh-model-preview/components/NumatbTemplateEditor.tsx` uses the zustand session store.
  - `src/components/ssbh-model-preview/NumatbTemplateEditorModalBody.tsx` keeps a local template library state and calls the same template library helper.
- Need to make persistence robust and keep load/save/delete/apply UI states synchronized.

## Implementation

- `daeSsbhTemplateLibrary.ts`
  - Moved authoritative template persistence into the Tauri config store file `settings.json`.
  - Uses key `ssbhDaeNumatbTemplateLibrary`.
  - Migrates once from legacy `ssbh-dae-template-library.json` / `templateLibrary`.
  - Writes `ssbhDaeNumatbTemplateLibraryMigrated` to avoid resurrecting legacy templates after the user deletes everything.
  - Normalizes template names, ids, profile JSON, and sort order before saving.
- `NumatbTemplateEditor.tsx`
  - Loads templates on mount.
  - Adds inline load error text.
  - Adds explicit `Apply` button so the currently selected template can be re-applied after local edits.
  - Adds saving/deleting busy states and disables conflicting template actions.
- `NumatbTemplateEditorModalBody.tsx`
  - Mirrors the same load/apply/save/delete behavior for the modal-local state path.
  - Clears stale selected template ids after reload/delete.
- `daeSsbhSessionStore.ts`
  - Clears stale selected template ids after a template library reload.
  - Clears template library errors after successful save/delete.

## Verification

- `npx tsc --noEmit`: FAIL due to pre-existing unrelated test fixture errors:
  - `src/page/SceneEdit/utils/sceneDaeSessionImport.test.ts`
  - `src/page/SceneEdit/utils/sceneModelReplacePreview.test.ts`
- No reported TypeScript errors came from the files changed for this task.
- `git diff --check`: PASS (only existing CRLF conversion warnings).
- Searched changed UI/helper files for `—` / `–`: no matches.

## 2026-06-12 - Texture path validation refresh

- Root cause: `useStableMissingTextureFillSlots` permanently merged historical
  missing slots and only cleared them when the source model changed.
- Added a profile replacement revision so applying a template, importing a
  profile, resetting a session, or rebuilding profiles from analysis clears the
  historical fill rows even when the same template is applied repeatedly.
- Added current required-slot reconciliation so removed parameters/materials,
  disabled `Use*` toggles, and disabled export profiles no longer leave stale
  rows.
- New texture slots introduced by a template are now selected by default in the
  bulk-fill panel while existing manual checkbox choices are preserved.
- Both `DaeImportSsbhFullPanel` and `DaeSsbhSessionLayout` now use the same
  refreshed detection path.

### Verification

- `npx vitest run` for the hook, fill panel, helper, session store, and static
  mesh import panel: PASS, 5 files / 37 tests.
- `git diff --check`: PASS (line-ending warnings only).
- `npx tsc --noEmit`: no errors in changed files; the command remains blocked by
  6 pre-existing fixture errors in `sceneDaeSessionImport.test.ts` and
  `sceneModelReplacePreview.test.ts`.

## 2026-06-12 - Missing NUMATB texture reference gate

- Root cause: the existing frontend check only rejected empty required texture
  parameters. A template could supply a non-empty but nonexistent nutexb name,
  allowing FBX loading to continue and fail later with an unrelated parser
  error such as `Cannot use 'in' operator to search for 'Video' in undefined`.
- Added a Rust validation command that uses the same texture resolution rules as
  conversion: absolute paths, source-file directory, stage root, and
  `stageRoot/textures`, with normalized names and optional `.nutexb` suffixes.
- Direct static mesh conversion now validates every declared texture reference
  in the exported Nust and Maya profiles before loading the FBX/DAE source.
- The SceneEdit import modal and standalone SSBH converter run the same
  validation as profile values change. Conversion remains disabled while
  validation is pending, fails, or reports unresolved references.
- The fill panel shows each invalid row with profile, material, parameter,
  current value, and a `Not found: <name>.nutexb` message.
- Added defensive preflight checks to direct conversion, preview import, and
  model replacement so programmatic callers cannot bypass the UI gate.
- Checked the similar standalone SSBH conversion path and applied the same
  blocking behavior there.

### Verification

- Focused Vitest suite: PASS, 5 files / 33 tests.
- Rust texture-reference tests: PASS, 3 tests.
- `cargo check --manifest-path src-tauri/Cargo.toml --lib`: PASS.
- Rustfmt check for `scene_session_commands.rs`: PASS.
- Scoped `git diff --check`: PASS, with line-ending warnings only.
- Full `npx tsc --noEmit` remains blocked by 6 unrelated pre-existing fixture
  errors in `sceneDaeSessionImport.test.ts` and
  `sceneModelReplacePreview.test.ts`.
- Full `cargo check` remains blocked by unrelated missing `quad_merge_enabled`
  initializers in `src/bin/perf_preview_hkt.rs` and
  `src/bin/gen_hkt_variants.rs`.
