# Agent Handoff: Implement `numatb_format` Rust Module

**Model:** GPT 5.5 High (or best available reasoning model)  
**Coordinator note:** Parent agent reverted inline edits in `fhm2d_stage_validate.rs`. Do **not** patch rules back into that file.

---

## Your goal

Align **Rust** numatb empty-path pre-flight validation with the **frontend** rules in `numatbTemplateStoreHelpers.ts`, by introducing a reusable `src-tauri/src/format/numatb_format.rs` module and wiring `exvs_stage_check_numatb_empty_params` to use it.

Success = same missing/OK judgments as frontend for the same `MatlData` / entries, validating **every** material entry in each `.numatb` file that the stage scanner reads.

---

## Required reading (discover, do not skip)

1. **Design spec (primary):**  
   `docs/agent-sessions/numatb-texture-validation-gate/design-numatb-format-module.md`

2. **Frontend source of truth:**  
   `src/page/TestEditor/components/ssbh-model-preview/store/numatbTemplateStoreHelpers.ts`  
   Focus: `ALWAYS_REQUIRED_TEXTURE_PATH_PARAM_IDS`, `TEXTURE_MAP_USE_TOGGLES`, `collectRequiredTextureMapParamIds`, `collectMissingTexturePathSlotRefsForExportSession`.

3. **Frontend tests (parity cases):**  
   `src/page/TestEditor/components/ssbh-model-preview/numatbTemplateStoreHelpers.test.ts`

4. **Current Rust validator (integration target only):**  
   `src-tauri/src/format/fhm2d_stage_validate.rs` — function `exvs_stage_check_numatb_empty_params` (lines ~404–479 today).

5. **Param semantics:**  
   `src/store/numatbStore.ts`, `docs/gvs-numatb-step2-migration-changes.md`

6. **Session context:**  
   `docs/agent-sessions/numatb-texture-validation-gate/process.md`, `todo.md`

---

## Implementation steps (you decide file-level details)

1. Create `numatb_format.rs` per design; export from `format/mod.rs`.
2. Port rule logic from TypeScript to Rust using `ssbh_data::matl_data::{MatlEntryData, MatlData, ParamId}`.
3. Refactor `exvs_stage_check_numatb_empty_params` to call `collect_missing_texture_paths_for_entry` (or equivalent) for **each** `matl.entries` item — not only NUMDLB-mapped labels (Rust never had that filter; confirm no regression).
4. Add Rust unit tests mirroring frontend cases; run `cargo test` / `cargo check`.
5. Update `docs/agent-sessions/numatb-texture-validation-gate/process.md` with commands run and outcomes.
6. Update `todo.md` checkboxes for completed items.

---

## Regression scenario (must pass)

Given a nust entry `emiMtl` with all `UseMetallicMap`, `UseRoughnessMap`, `UseNormalMap`, `UseEmissiveMap`, `UseAmbientOcclusionMap` = true and empty texture paths, validation must flag Texture1 + those maps.

Given maya entry with empty `RoughnessMap` but **no** `UseRoughnessMap` boolean (or false), validation must **not** flag RoughnessMap.

Given `pbr1Mtl` with filled Texture1 and base color per frontend rules, no false positives.

---

## Constraints

- English comments in code; no `TODO`/`FIXME` in production code.
- Minimal diff outside `numatb_format.rs`, `mod.rs`, `fhm2d_stage_validate.rs`, session docs, and tests.
- Do not start dev servers.
- Do not commit unless user asks.

---

## Deliverable summary (return to coordinator)

- List files created/changed.
- Brief rule parity statement vs frontend.
- `cargo test` / `cargo check` output summary.
- Any open questions (e.g. DiffuseCubeMap policy).
