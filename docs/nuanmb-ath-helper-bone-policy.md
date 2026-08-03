# NUANMB `ATH_*` helper-bone policy

Status: accepted (2026-08-02)  
Verified in-game on custom body clip `主射CSA.nuanmb` (Delta Kai motion pack).

## Rule (non-negotiable)

1. **Do not author or edit `ATH_*` bones in custom NUANMB motion files.**
2. **Do not convert / bake `ATH_*` tracks** when building homemade motions from
   DCC (FBX/Cascadeur/Blender) or from `MotionClip` rewrite paths.
3. **Omit the entire Transform node** for every `ATH_*` bone. Do **not** write
   rest-pose tracks, identity tracks, or full TRS “frozen” tracks as a
   substitute — that is still “having animation data” and breaks in-game
   helpers.

## Why

- `ATH_*` bones are **helper / attachment** nodes (shield, vernier, armor fins,
  hand helpers, etc.). Stock body motions almost never include them.
- In-game they are driven by **NUHLPB constraints + skeleton rest pose**, not by
  NUANMB Transform tracks.
- Baking DCC/FBX local TRS onto `ATH_*` (dense tracks, `override_*=false`)
  **fights the helper system** and produces twisted armor / vernier / shield
  attachments after import.
- Writing constant rest/identity tracks is **not equivalent** to omitting the
  node: a present track with default flags still prefers animation channels
  over rest hang-off offsets.

Leaf-name rule (path / namespace stripped first): names whose leaf starts with
`ATH_` (case-insensitive) are helper bones.

## Implementation (this repo)

| Stage | Behavior |
|-------|----------|
| `write_motion_clip_as_nuanmb` / `transform_group_from_clip` | Filters out `ATH_*` via `is_ath_helper_bone` before emitting Transform nodes |
| FBX → NUANMB import (`import_motion_fbx`) | Uses the same writer; **never** emits `ATH_*` tracks in the output file |
| ClipOps / Cascadeur write-back | Same writer; ATH omitted |
| NUSKTB / model / NUHLPB assets | Unchanged — helpers stay on the skeleton and in `.nuhlpb` |

Canonical code: `src-tauri/src/ssbh_motion_interchange/nuanmb.rs`  
Test: `nuanmb_writer_strips_ath_helper_bones` in
`src-tauri/tests/ssbh_motion_interchange_test.rs`  
(run: `cargo test --features motion-tests --test ssbh_motion_interchange_test nuanmb_writer_strips_ath_helper_bones`).

## Modder guidance

- Edit **humanoid / body** bones only (`BASE`, `GBL_RT`, limbs, etc.).
- Leave `ATH_*` alone in Blender/Cascadeur if the skeleton still lists them;
  the tool strip ensures they are not written into the NUANMB.
- Do **not** hand-edit structure JSON or raw NUANMB to “fix” ATH offsets —
  fix the body animation, not the helper bones.
- Rare stock clips may contain a few hand helpers (`ATH_TE_*`); that does not
  license baking full ATH sets into homemade body/shot motions.

## Related docs

- Motion FBX import design:
  `docs/superpowers/specs/2026-07-26-motion-fbx-import-roundtrip-design.md`
- ADR import path: `docs/adr/0002-motion-fbx-import-direct-ufbx.md`
- TransformFlags / sparse rest semantics (ssbh_lib research):
  `docs/ssbh-wmmt2-merge-animation-regression.md`
- **In-game homemade layout (CompScale/Visibility, full Translate, indexed `0x4300`):**
  `docs/nuanmb-exvs2-import-in-game-layout.md`
