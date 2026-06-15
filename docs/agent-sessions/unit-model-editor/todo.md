# Unit Model Editor TODO

- [x] Review project rules and relevant FHM2D documentation.
- [x] Inspect the real unit model sample layout.
- [x] Add Rust unit model validation module and Tauri command.
- [x] Add Rust tests, including real-sample validation when the sample path exists.
- [x] Move SSBH 3D preview components to a shared location.
- [x] Add Unit Model Editor route and page.
- [x] Add Unit Model validation/repack frontend tools.
- [x] Remove TestEditor 3D View entry points.
- [x] Run targeted verification and record results.

## Next Actions

Resolve the unrelated SceneEdit TypeScript errors before expecting full-project
`tsc --noEmit` to pass.

## 2026-06-12 Texture/Preview Pass

- [x] Add Unit Model `.nutexb` inventory command backed by `_structure.json`.
- [x] Add Unit Model `.nutexb` add/remove commands that update disk and `SubFileData`.
- [x] Add Unit Model Editor Textures tab with list, preview, export, add, replace, remove, refresh, and path copy actions.
- [x] Reuse Scene Editor texture add/replace/preview/export flows for Unit textures.
- [x] Invalidate stale Unit validation/repack result after texture edits.
- [x] Fix 3D preview resize sharpness by reasserting DPR after panel resize settles.
- [x] Force canvas invalidation after texture decode/material binding changes.
- [x] Improve bone picking with adjustable joint size and non-depth-tested joint handles.
- [x] Run narrow frontend/Rust verification and record outcomes.

## Remaining Follow-up

- [x] Full `npx tsc --noEmit` is no longer blocked by unrelated SceneEdit/resourceRegistry test type errors.
- [x] Full `cargo test --manifest-path src-tauri/Cargo.toml` is no longer blocked by unrelated Rust test failures.

## 2026-06-15 Control-bin editors (jnttbl / shell / vernier)

Goal: bring jnttbl / shell / vernier editors into the Unit Model Editor, referencing the
legacy TestEditor implementations, all on the shared resizable `SsbhEditorModalWindowShell`.
Decisions: shell = reverse SHLL now + full editor; vernier = reuse typed-param table + modernise.

Shell (`.shl`) backend:
- [x] Reverse-engineer SHLL format from real samples + IDA; write analysis doc
      (`docs/agent-sessions/unit-model-editor/shl-format-analysis.md`).
- [x] `src-tauri/src/format/shl.rs`: `parse_shl` / `build_shl` (byte-faithful) + structs.
- [x] Byte-roundtrip + json-roundtrip + CRUD tests over real samples — all pass.
- [x] IPC `parse_shl_file` / `build_shl_file` wired into `lib.rs`; `cargo check` clean.

Frontend:
- [x] Shell editor: `shlIoService` + `shlEditorUtils` (+tests) + `ShlEditorBody` (record table,
      type select, model select by folder, LE model-id field, add/remove) + `ShlEditorModalWindow`
      + `ShlEditorModalHost`, wired into `useSsbhFileEditorSessions` (`shl` kind/dispatch/session/
      guard) + `SsbhEditorModalWindowShell` (size) + `SsbhFileEditorHosts`. `.shl` editability is
      automatic via `ssbhEditorKindForPath` in the structure tree.
- [x] Resolve `model_id` -> model name via `folder_index`: `collectModelGroupNames` (structure
      order) passed as `shlModelFolderNames` from the Unit Model page.
- [x] Verify: vitest (16 passed: shlEditorUtils + dispatch) + `tsc --noEmit` (0 errors in touched
      files; 8 pre-existing SceneEdit test errors remain, unrelated).
- [x] Vernier editor: `vernierIoService` + `vernierEditorUtils` (+tests) reuse the generic typed-param
      IPC (`param_type="vernier_table"`) and `TypedParamDataPanel` table verbatim, wrapped by
      `VernierEditorBody` + `VernierEditorModalWindow` + `VernierEditorModalHost` on the shared shell.
      Hook gains a `vernier` kind; `ssbhEditorKindForPath` dispatches `vernier_table_*` by NAME
      (ships as `.bin`/`.vgsht2`, not a unique ext), so the structure tree gets "Edit VERNIER…" free.
- [x] jnttbl: already on the shared shell; polished the entry table to grow with the resizable
      window (`max-h` cap 480 -> 760) for parity with the shell/vernier editors.
- [x] Verify: vitest 21 passed (shl/vernier utils + dispatch + Numatb window) + `tsc --noEmit`
      (0 errors in touched files; 8 pre-existing SceneEdit test errors remain, unrelated).

## 2026-06-15 Add Folder + Replace Model UX Design

- [x] Refresh `add-replace-model-design.md` against current code reality.
- [x] Document prepared SSBH folder validation requirements.
- [x] Design pool-aware Add preview behavior.
- [x] Design reference-preserving Replace flow and target identity rules.
- [x] Define backend replacement preview response shape.
- [x] Define frontend modal/panel changes and verification plan.
- [x] Implement pool-aware Add preview.
- [x] Implement replacement preview command.
- [x] Wire Replace row action and confirmation modal.
- [x] Add Rust/frontend tests for replacement preview and commit safety.

## 2026-06-14 Modal Shell Cleanup

- [x] Replace the remaining Unit Model Editor floating modal shell usage with the shared resizable RND modal shell.
- [x] Remove `UnitModelFloatingModalShell`.
- [x] Confirm no `UnitModelFloatingModalShell` / `FloatingModalShell` references remain under `src/` or `docs/`.
- [x] Run targeted Vitest coverage for Unit Model path/tree helpers, shared SSBH editor dispatch, and shared RND shell.
- [x] Run full `tsc --noEmit` and confirm failures are limited to existing unrelated test fixture errors.

## 2026-06-14 SSBH File Editor RND Cleanup

- [x] Replace legacy draggable SSBH file editor windows with the shared resizable RND modal shell.
- [x] Cover Unit Model double-click/right-click `.numatb`, `.numdlb`, `.nuhlpb`, and `.jnttbl` editor hosts.
- [x] Pass Unit Model viewport suspend behavior into SSBH editor host windows.
- [x] Remove old draggable editor-window usage under `src/components/ssbh-model-preview`.
- [x] Make interactive Unit Model structure tree rows use a pointer cursor.
- [x] Run targeted Vitest and TypeScript verification checks.

## 2026-06-14 NUMATB Drag Performance

- [x] Identify pointerdown/pointerup stall source in Unit Model NUMATB editor dragging.
- [x] Stop SSBH editor drag pointer events from toggling Unit Model provider state.
- [x] Skip redundant activate/z-index updates for already-topmost editor windows.
- [x] Run targeted SSBH/Unit Model tests and filtered TypeScript checks.

## 2026-06-14 NUMATB Profile Loading Parity

- [x] Compare Unit Model and Scene Editor NUMATB window/loading implementations.
- [x] Inspect `unit-model-structure-tree.json` profile naming and pairing variants.
- [x] Add failing regression coverage for dual maya/nust loading and saving.
- [x] Make the shared Unit Model NUMATB session use Scene Editor dual-profile semantics.
- [x] Run targeted tests and TypeScript verification.

## 2026-06-14 NUMATB AI Copy Action

- [x] Identify why the shared window hides the Copy JSON icon.
- [x] Add a window-level regression test for full maya/nust clipboard export.
- [x] Restore the copy action in windowed NUMATB editors.
- [x] Run targeted tests and TypeScript verification.

## 2026-06-12 Follow-up Fixes

- [x] Force material remount when decoded texture data arrives so white meshes do not require hide/show.
- [x] Add decoded texture identity to GPU texture-pool keys to avoid stale same-path/same-size texture reuse.
- [x] Make Skeleton display default off and reset-to-default off.
- [x] Hide bone joint handles and transform gizmo when Skeleton display is off.
- [x] Stop model load/append from auto-activating the first/last preview item.
- [x] Keep preview collection selected IDs empty after load.
- [x] Make non-motion canvas DPR stay at device/base DPR instead of adaptive low DPR after resize.
- [x] Add ResizeObserver-based canvas sharpness guard for panel size changes.

## 2026-06-12 Texture Detail / AI Payload Follow-up

- [x] Add Unit texture batch PNG export.
- [x] Stop Unit texture inventory refresh from auto-selecting the first texture.
- [x] Make texture preview fit the modal area by default instead of showing a fixed-size preview.
- [x] Add texture preview wheel zoom, toolbar zoom in/out, and reset.
- [x] Remove the selected texture metric strip from the bottom of Unit texture panel.
- [x] Expand Copy AI review payload with validation rules, validation judgement, result, preview state, texture inventory, parsed SSBH/nutexb/jnttbl assets, and structure JSON data.
- [x] Compact Copy AI review payload by summarizing heavy numshb mesh data and skeleton bone data.

## 2026-06-14 Dynamic Folder Pipeline (Scene-Editor parity)

Design + decision log: `dynamic-folder-pipeline-plan.md`; full dev spec: `implementation-plan.md`.

Verified this session (real-disk TDD, throwaway tests deleted after):
- [x] **Finding:** byte-identical extract->repack is INFEASIBLE (packer recompresses; 0xABE08869
      17,681,692 B -> 17,767,421 B). Fidelity bar revised to **logical roundtrip** (identical decoded
      payloads + SubFileStructure). Decision #8 updated in the plan.
- [x] **Phase 1 foundation:** logical roundtrip proven on real 0xABE08869 (94 files, 341 entries,
      payloads + structure equal).
- [x] **Phase 2 backend:** `format/unit_model_extract.rs` -> `extract_unit_model_fhm2d_to_folder`
      produces the renamed/regrouped/deduped semantic layout (8 named model folders, shared
      `textures/` 15 deduped nutexb, separate `weapon_icon/` 6, `ragdoll/`, `nudnbb/`, control bins)
      AND preserves the logical roundtrip. Command + lib registration + `unitModelExtractService.ts`
      wired; `cargo build --lib` clean.
      Key fix: tree parser must expand `EndMark.endMarkCount` into N closes (one EndMark can close
      multiple nested folders).
- [x] **Frontend (tree view + copy-to-AI):** `utils/unitModelStructureTree.ts` (pure parser, real-disk
      verified), `components/UnitModelStructureTreeView.tsx` (left-side collapsible structure viewer),
      reusable `src/components/CopyInfoToAiButton.tsx`, mounted as leftmost panel in `page.tsx`
      (loads sibling `_structure.json`). tsc clean on new/changed files.

- [x] **Phase 1 validator generalization (§4.1):** relaxed `validate_unit_model_for_repack` to allow
      >=1 texture container and `unk5>=1` (variant index); the SHLL count is per-shader-slot not
      per-model, so a count > model count is now a warning (only fewer-than-models is an error).
      Verified: 0xABE08869 valid (8 models, shl=12 warning) AND 0xAF73362C valid (14/14/14); in-module
      unit tests 7/7 green.
- [x] **Phase 4 texture add folder-aware:** `add_unit_model_nutexb` now writes into the shared
      `textures/` pool (fileUrl derived from path). Texture replace = overwrite same-name; remove =
      existing refcount gate (`can_remove`). numatb is never rewritten (decision #4), so texture
      add/remove need no SubFileStructure surgery.
- [x] **Phase 2 frontend:** "Extract .fhm2d to folders" action in `UnitModelToolsPanel` (picks a
      .fhm2d, extracts to `<parent>/<stem>/`, loads it). Validate + Repack already existed and work on
      the new layout (Phase 3 effectively done).
- [x] **Phase 6 (read + copy-to-AI):** `UnitModelModelManagerPanel` (model list + per-model + copy-all
      copy-to-AI), mounted under the structure tree in the left column.

- [x] **Phase 5 model ops (add + remove):** `format/unit_model_models.rs` —
      `remove_unit_model_model` (drops the model group + paired nuhlpb, removes now-unreferenced pool
      entries incl. orphan textures, deletes files) and `add_unit_model_model` (scans a source SSBH
      folder, dedups textures into the shared pool, synthesizes a texture container per numatb,
      appends the model group + nuhlpb, clones an empty nuhlpb template when none supplied). Key
      insight: the packer remaps fileIndex (`build_file_index_remap`) and expands EndMarks, so surgery
      keeps original fileIndex values (gaps fine) and emits fresh per-folder EndMarks. Commands +
      `unitModelModelService.ts` + Model Manager Add/Remove buttons (with structure reload) wired.
      Verified real-disk roundtrip on 0xABE08869: remove 8->7 (validates), add 7->8 (validates,
      8 models/8 nuhlpb), repack->re-extract confirms the re-added model survives. shl stays
      validate-only.

All 7 planned phases are functionally complete and verified on real disk. Follow-ups (optional):
one-click "import DAE then add" that runs the scene DAE->SSBH export into a temp folder and calls
add_unit_model_model; model replace (= remove + add); reorder.
