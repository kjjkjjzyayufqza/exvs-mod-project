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

- [ ] Full `npx tsc --noEmit` is still blocked by unrelated SceneEdit test type errors.
- [ ] Full `cargo test` is still blocked by unrelated bin target `CollisionSimplifyOptions` initializer errors.

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
