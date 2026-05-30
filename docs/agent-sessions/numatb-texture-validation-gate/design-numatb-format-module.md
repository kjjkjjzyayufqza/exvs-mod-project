# Design: Reusable Rust `numatb` Format Module

## Background

Frontend DAE/Scene import already validates in-memory Maya/Nust profiles via
`src/page/TestEditor/components/ssbh-model-preview/store/numatbTemplateStoreHelpers.ts`.

Rules (must stay in sync with Rust):

| Rule | Behavior |
|------|----------|
| **Texture1** | Always required (missing row or empty path = invalid) |
| **PBR maps** (`MetallicMap`, `RoughnessMap`, `NormalMap`, `EmissiveMap`, `AmbientOcclusionMap`, `SpecularMap`) | Required only when matching `Use*` boolean is `true` |
| **Base color** (`BaseColorMap`, `BaseColorMapLayer1`, `DiffuseMap`, `DiffuseMapLayer1`) | Required when `UseBaseColorMap` or `UseDiffuseMap` is true; else implicit when slot exists (see `docs/gvs-numatb-step2-migration-changes.md`) |
| **Scope** | Every `material_label` in each profile file — not filtered by NUMDLB mapping |
| **DiffuseCubeMap** | No `Use*` toggle in EXVS set — do not require unless product adds a rule later |

Rust pre-flight today (`fhm2d_stage_validate.rs::exvs_stage_check_numatb_empty_params`) still flags **any** empty texture row in `textures` / `textures2`, which disagrees with frontend and produces false positives (e.g. empty `RoughnessMap` with `UseRoughnessMap: false`).

**Do not re-embed validation logic inside `fhm2d_stage_validate.rs`.** Extract a dedicated module and call it from the stage validator.

---

## Proposed module layout

**New file:** `src-tauri/src/format/numatb_format.rs`  
**Register:** `pub mod numatb_format;` in `src-tauri/src/format/mod.rs`

Suggested public surface (names can be refined by implementer):

```rust
// ── Rules (pure, no I/O) ──────────────────────────────────────────────

pub const ALWAYS_REQUIRED_TEXTURE_PATHS: &[ParamId]; // [Texture1]
pub const TEXTURE_MAP_USE_TOGGLES: &[(ParamId, ParamId)]; // map → Use*

pub fn read_entry_boolean(entry: &MatlEntryData, param_id: ParamId) -> Option<bool>;
pub fn entry_has_texture_param(entry: &MatlEntryData, param_id: ParamId) -> bool;
pub fn is_base_color_map_path_required(entry: &MatlEntryData) -> bool;
pub fn collect_required_texture_map_param_ids(entry: &MatlEntryData) -> Vec<ParamId>;
pub fn param_texture_path<'a>(entry: &'a MatlEntryData, param_id: ParamId) -> Option<&'a str>;
pub fn texture_param_uses_textures2_bucket(entry: &MatlEntryData, param_id: ParamId) -> bool;

// ── Per-entry / per-file validation ───────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MissingTexturePath {
    pub material_label: String,
    pub param_id: ParamId,
    pub is_textures2_bucket: bool,
}

pub fn collect_missing_texture_paths_for_entry(entry: &MatlEntryData) -> Vec<MissingTexturePath>;
pub fn collect_missing_texture_paths_for_matl(matl: &MatlData) -> Vec<MissingTexturePath>;

// ── Stage disk scan (optional helper for stage validator) ─────────────

pub fn collect_numatb_paths_in_folder(ssbh_folder: &Path) -> Vec<PathBuf>;
pub fn read_matl_from_numatb_file(path: &Path) -> Result<MatlData, /* typed error */>;
```

`fhm2d_stage_validate.rs` should shrink to:

1. Discover models / numatb paths (existing helpers).
2. For each file + entry, call `numatb_format::collect_missing_texture_paths_for_entry`.
3. Map `MissingTexturePath` → existing `ExvsStageValidationError` (`phase: "empty_texture_param"`).

Keep `exvs_stage_check_numatb_textures` (on-disk `.nutexb` existence) **unchanged**.

---

## Source-of-truth references (implementer must read)

| Area | Path |
|------|------|
| Frontend rules | `src/page/TestEditor/components/ssbh-model-preview/store/numatbTemplateStoreHelpers.ts` |
| Param types / COMMON_ATTRIBUTES | `src/store/numatbStore.ts` (`PARAM_TYPE_MAPPING`, booleans list) |
| GVS → EXVS migration (UseBaseColorMap implicit) | `docs/gvs-numatb-step2-migration-changes.md` |
| Current Rust pre-flight (to wire, not duplicate) | `src-tauri/src/format/fhm2d_stage_validate.rs` |
| Stage command entry | `src-tauri/src/stage_commands.rs` → `scene_validate_numatb_empty_params` |
| Repack gate | `src-tauri/src/scene_session_commands.rs` (~1354) |
| ssbh types | `ssbh_data::matl_data::{MatlData, MatlEntryData, ParamId}` |
| DAE export texture lookup patterns | `src-tauri/src/ssbh_dae/dae_export.rs` (`param_texture_ref`) |

Frontend tests to mirror in Rust:

- `src/page/TestEditor/components/ssbh-model-preview/numatbTemplateStoreHelpers.test.ts`

---

## Test plan (Rust)

Add `#[cfg(test)] mod tests` in `numatb_format.rs` (or `numatb_format/tests.rs`):

1. `Texture1` always required even without a texture row.
2. `RoughnessMap` empty + `UseRoughnessMap: false` → not required.
3. `RoughnessMap` empty + `UseRoughnessMap: true` → required.
4. Implicit `DiffuseMap` slot empty → required with `Texture1`.
5. `NormalMap` empty without `UseNormalMap` → not required.
6. All `Use*` true + all paths empty (emiMtl-style nust entry) → full PBR set + Texture1.

Optional integration: one test that builds minimal `MatlEntryData` structs (see ssbh_data test fixtures in crate) without reading disk.

Run: `cargo test numatb_format --manifest-path src-tauri/Cargo.toml`

---

## Non-goals for this task

- Do not change on-disk texture existence validation (`exvs_stage_check_numatb_textures`).
- Do not change frontend TypeScript unless Rust exposes a new error shape the UI must parse (should not be needed).
- Do not duplicate ParamId string serialization — reuse `param_id_to_string` pattern from `fhm2d_stage_validate.rs` or move shared helper into `numatb_format.rs` and import from validator.

---

## Acceptance criteria

1. `fhm2d_stage_validate.rs` has **no** embedded Use*/Texture1 rule tables; only calls `numatb_format`.
2. User JSON scenario (pbr1Mtl OK, emiMtl nust all Use* true + empty paths) reports missing **only for emiMtl** when both profiles validated — matches frontend.
3. Maya profile: empty RoughnessMap without Use flags does **not** error.
4. `cargo test` for new module passes; `cargo check` green.
