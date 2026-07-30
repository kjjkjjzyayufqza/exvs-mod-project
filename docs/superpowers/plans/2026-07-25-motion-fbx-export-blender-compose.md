# MotionFbxExport BlenderCompose Implementation Plan

> **STATUS: SHIPPED.** Delivered via commits a067301 (Blender 5.1 resolver),
> 11cb27d (headless compose script), f0c80cd (CompleteMotionFbx export via
> BlenderCompose), plus formatting in 91db7b0. Individual task checkboxes
> below are intentionally left as written; this banner is the completion
> record. Env-gated real-data/Blender tests live in
> `src-tauri/tests/ssbh_motion_fbx_import_test.rs` (`#[ignore]`, run green
> per b54d867).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (or executing-plans) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CascadeurBridge with one-way MotionFbxExport that produces a single CompleteMotionFbx (skinned model + bound action at 60 FPS) by orchestrating Blender 5.1 headless compose.

**Architecture:** Rust builds a StagingFbxPair (model-only FBX via existing unit model export, animation-only FBX via existing motion writer), resolves Blender 5.1, runs a shipped headless Python script that binds motion to the model armature and writes one output FBX, then cleans staging. Frontend exposes one Motion-panel export button with save dialog. Public CascadeurBridge commands and UI are removed.

**Tech Stack:** Rust (Tauri v2), React/TypeScript, Vitest, Blender 5.1 bpy headless, existing `ssbh_fbx` / `ssbh_motion_interchange`.

**Spec:** `docs/superpowers/specs/2026-07-25-motion-fbx-export-blender-compose-design.md`  
**ADR:** `docs/adr/0001-motion-fbx-export-via-blender-compose.md`  
**Glossary:** `CONTEXT.md`

## Global Constraints

- One user-visible output: CompleteMotionFbx only (no bridge.json, no user-facing motion.fbx package).
- SampleRate60: scene FPS = 60; frame count = real NUANMB length (never pad/truncate to 60 frames).
- Blender **5.1 only** (auto-detect + override); hard fail if missing; no silent version fallback.
- GeometryOnlyModel: textures not required for success (`export_textures: false` for staging model).
- HeadlessComposeScript is self-contained; do not require EXVS2-Easy-Blender-Tools.
- BridgeRemoval: remove public CascadeurBridge Tauri commands and UI; staging FBXs are internal only.
- English code/comments; Chinese only for user-facing UI strings if existing panel uses Chinese — match surrounding UI language (existing Cascadeur panel is English labels).
- Debug builds only (`cargo build` / `cargo test` without `--release`) unless user asks release.
- TDD for new logic: write failing tests first where the plan says so.
- Do not start dev servers.
- Work only on MotionFbxExport scope; do not modify unrelated dirty files (lighting presets, etc.).

## Target File Structure

| File | Responsibility |
|------|----------------|
| `src-tauri/src/ssbh_motion_interchange/blender_resolve.rs` | Blender 5.1 path auto-detect + override validation |
| `src-tauri/src/ssbh_motion_interchange/blender_compose.rs` | Staging pair, spawn Blender, cleanup, export report |
| `src-tauri/scripts/motion_fbx_compose.py` | Headless bind + export CompleteMotionFbx |
| `src-tauri/src/ssbh_motion_interchange/mod.rs` | Public request/report types + Tauri command; drop bridge commands |
| `src-tauri/src/ssbh_fbx.rs` | Expose minimal `pub(crate)` model FBX write for staging (no textures) |
| `src-tauri/src/lib.rs` | Register new command; unregister bridge commands |
| `src-tauri/tests/ssbh_motion_fbx_export_test.rs` | Rust unit/integration tests for resolve + export path safety |
| `src/components/ssbh-model-preview/motionFbxExportService.ts` | Typed invoke wrapper |
| `src/components/ssbh-model-preview/components/MotionFbxExportPanel.tsx` | Save-as + export UI |
| `src/components/ssbh-model-preview/components/MotionFbxExportPanel.test.tsx` | Panel tests |
| `src/components/ssbh-model-preview/SsbhModelPreviewMotionPanel.tsx` | Mount new panel; remove CascadeurBridgePanel |
| Delete or stop shipping: `CascadeurBridgePanel.tsx`, `cascadeurBridgeService.ts`, their tests (remove usage first) |

---

### Task 1: Blender 5.1 executable resolve

**Files:**
- Create: `src-tauri/src/ssbh_motion_interchange/blender_resolve.rs`
- Modify: `src-tauri/src/ssbh_motion_interchange/mod.rs` (mod declare + re-exports)
- Create/Modify: `src-tauri/tests/ssbh_motion_fbx_export_test.rs`

- [ ] **Step 1: Write failing tests** for:
  - Override path that does not exist → error mentioning Blender 5.1
  - Override path whose parent/name is not 5.1-like when file exists is optional; minimum: empty override falls through to candidates; non-empty missing path fails
  - `candidate_blender_51_paths()` includes `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe` on Windows
  - Successful resolve when override points at a temp file named `blender.exe` under a folder containing `5.1` (create temp file in test)

- [ ] **Step 2: Run tests — expect FAIL**

```powershell
cd src-tauri
cargo test --test ssbh_motion_fbx_export_test --no-fail-fast
```

- [ ] **Step 3: Implement** `resolve_blender_51_executable(override: Option<&Path>) -> Result<PathBuf, MotionInterchangeError>`:
  - If override Some and non-empty: require path exists and is a file; require path string contains `5.1` or parent dir name `Blender 5.1` (strict 5.1)
  - Else scan candidates in order; return first existing file
  - Else Err with clear message to install Blender 5.1 or set override

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** `feat(motion): resolve Blender 5.1 executable for MotionFbxExport`

---

### Task 2: Headless compose Python script

**Files:**
- Create: `src-tauri/scripts/motion_fbx_compose.py`
- Create: `src-tauri/scripts/README_motion_fbx_compose.md` (short usage only)

CLI (argv after `--`):

```text
--model-fbx <path>
--motion-fbx <path>
--output-fbx <path>
```

Behavior (must match HeadlessComposeScript invariants):

1. Fresh scene (clear default objects).
2. Import model FBX, then motion FBX (Blender FBX importer).
3. Identify model armature (meshes parented / armature modifiers) vs motion armature (has action, no meshes).
4. Copy motion action onto model armature (Blender 5.1 Action Slot aware if present), shift keys so action starts at frame 0, set scene FPS = 60, frame_start/end from action range.
5. Delete motion armature (and unused data).
6. Select model armature + its meshes only; export FBX:
   - use_selection=True
   - add_leaf_bones=False
   - bake_anim=True
   - bake_anim_use_nla_strips=False
   - bake_anim_use_all_actions=False
7. Print a single JSON line to stdout on success: `{"ok":true,"frame_start":0,"frame_end":N,"fps":60}`  
   On failure: non-zero exit, message on stderr.

- [ ] **Step 1: Implement script** (pure Python; no bpy available in CI — no unit test required in cargo; include a small pure-helper function testable without bpy if you extract path/arg parse, optional).
- [ ] **Step 2: Manual self-check**: `python -m py_compile src-tauri/scripts/motion_fbx_compose.py`
- [ ] **Step 3: Commit** `feat(motion): add headless Blender compose script for CompleteMotionFbx`

---

### Task 3: StagingFbxPair + export orchestrator + Tauri command

**Files:**
- Create: `src-tauri/src/ssbh_motion_interchange/blender_compose.rs`
- Modify: `src-tauri/src/ssbh_fbx.rs` — add `pub(crate) fn write_model_fbx_no_textures(numdlb_path: &Path, output_fbx: &Path) -> Result<()>` reusing `load_ssbh_model` + `build_export_scene` + `write_scene_fbx` with `export_textures: false`, scale 1.0, Y-up (match existing model export defaults)
- Modify: `src-tauri/src/ssbh_motion_interchange/mod.rs` — new request/report + `export_complete_motion_fbx` + `ssbh_export_complete_motion_fbx`; remove Tauri commands `ssbh_export_nuanmb_to_cascadeur_bridge`, `ssbh_import_cascadeur_bridge_to_nuanmb`, `ssbh_inspect_cascadeur_bridge` (may keep internal helpers if still used by tests temporarily, or migrate tests)
- Modify: `src-tauri/src/lib.rs` — register new command only
- Modify: `src-tauri/tests/ssbh_motion_fbx_export_test.rs` — path safety tests (output equals staging reject; empty paths; blender missing)
- Modify: `src-tauri/tests/ssbh_motion_interchange_test.rs` — remove or rewrite tests that only exist for public bridge export/import commands if they break; keep MotionClip/NUANMB tests

Request (camelCase serde):

```rust
pub struct CompleteMotionFbxExportRequest {
  pub nuanmb_path: String,
  pub nusktb_path: String,
  pub numdlb_path: String,
  pub output_fbx_path: String,
  pub blender_path: Option<String>,
  pub action_name: Option<String>,
}
```

Report:

```rust
pub struct CompleteMotionFbxExportReport {
  pub output_path: String,
  pub action_name: String,
  pub frame_count: usize,
  pub duration_seconds: f32,
  pub blender_path: String,
  pub warnings: Vec<String>,
}
```

Orchestration:

1. Validate paths non-empty; output must end with `.fbx`; output must not equal any input path.
2. `resolve_blender_51_executable`
3. Read clip via `read_nuanmb_as_motion_clip`
4. Create temp dir under `std::env::temp_dir()/exvs2_motion_fbx_export_<uuid>/`
5. Write `model.fbx` via `write_model_fbx_no_textures`
6. Write `motion.fbx` via `write_animation_only_fbx` (do **not** write bridge.json)
7. Resolve script path: relative to executable or `CARGO_MANIFEST_DIR/scripts/motion_fbx_compose.py` for dev — use a function that checks in order: env `EXVS2_MOTION_FBX_COMPOSE_SCRIPT`, then `src-tauri/scripts/...` from current_dir variants, then beside executable.
8. Spawn: `"blender" -b -P script -- --model-fbx ... --motion-fbx ... --output-fbx ...` with timeout 10 minutes; capture stdout/stderr
9. Require output file exists and non-empty
10. Cleanup temp dir (always, even on error)
11. Return report with frame_count from clip

- [ ] **Step 1: Failing tests** for validation / missing blender (mock by override to missing path)
- [ ] **Step 2: Implement**
- [ ] **Step 3:** `cargo test --test ssbh_motion_fbx_export_test --no-fail-fast` and `cargo test --test ssbh_motion_interchange_test --no-fail-fast`
- [ ] **Step 4: Commit** `feat(motion): export CompleteMotionFbx via BlenderCompose`

---

### Task 4: Frontend MotionFbxExport panel + remove CascadeurBridge UI

**Files:**
- Create: `src/components/ssbh-model-preview/motionFbxExportService.ts`
- Create: `src/components/ssbh-model-preview/components/MotionFbxExportPanel.tsx`
- Create: `src/components/ssbh-model-preview/components/MotionFbxExportPanel.test.tsx`
- Modify: `src/components/ssbh-model-preview/SsbhModelPreviewMotionPanel.tsx`
- Modify: `src/utils/dialogLastPath.ts` — add key for motion fbx export save if needed
- Delete: `CascadeurBridgePanel.tsx`, `CascadeurBridgePanel.test.tsx`, `cascadeurBridgeService.ts` (after no imports)

Panel props:

```ts
selectedNuanmbPath: string | null
skeletonPath: string | null
numdlbPath: string | null
workspaceRoot: string | null
disabled: boolean
blenderPathOverride?: string | null  // optional; pass null in v1 if no settings UI yet
```

Behavior:

- Disabled unless nuanmb + skel + numdlb present
- On click: `save` dialog default `{nuanmb_stem}.fbx`
- Cancel → no-op
- Invoke `ssbh_export_complete_motion_fbx` with camelCase request
- Show busy, inline error, toast success with frame count / duration
- No import UI, no onImportedNuanmb

- [ ] **Step 1: Write failing Vitest** for save + invoke payload
- [ ] **Step 2: Implement panel + service + wire Motion panel with `activeInstance.bundle.modlPath`**
- [ ] **Step 3:** `npm test -- src/components/ssbh-model-preview/components/MotionFbxExportPanel.test.tsx`
- [ ] **Step 4: Commit** `feat(motion): replace CascadeurBridge UI with MotionFbxExport`

---

### Task 5: Optional Blender path setting (minimal)

**Files:**
- Prefer localStorage key `exvs2.blender51Path` read in panel (same pattern as dialog last path) **without** a full settings page if none exists
- Panel: small optional text field or "Set Blender 5.1…" file picker that stores override

- [ ] **Step 1: Implement** minimal override UI on MotionFbxExportPanel (collapsed/details)
- [ ] **Step 2: Test** that invoke receives blenderPath when set
- [ ] **Step 3: Commit** `feat(motion): allow Blender 5.1 path override for MotionFbxExport`

---

### Task 6: Verification sweep

- [ ] `cargo test --test ssbh_motion_fbx_export_test --no-fail-fast`
- [ ] `cargo test --test ssbh_motion_interchange_test --no-fail-fast`
- [ ] `cargo build --bin exvs2_json` not required; `cargo check` or `cargo build` for lib
- [ ] `npm test -- src/components/ssbh-model-preview/components/MotionFbxExportPanel.test.tsx`
- [ ] `git diff --check`
- [ ] Confirm no remaining frontend invokes of cascadeur bridge commands
- [ ] Commit only if fixups needed

## Progress Ledger

Controller maintains `.superpowers/sdd/progress.md` during SDD execution.
