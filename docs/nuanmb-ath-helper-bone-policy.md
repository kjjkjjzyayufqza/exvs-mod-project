# NUANMB `ATH_*` helper-bone policy

Status: accepted (2026-08-02)  
Verified in-game on custom body clip `主射CSA.nuanmb` (Delta Kai motion pack).

## Rule (host Body / host wing — non-negotiable)

1. **Do not author or edit `ATH_*` bones in custom NUANMB motion files** that
   play on the **player Body(0)** or host Type1 wing.
2. **Do not convert / bake `ATH_*` tracks** when building those host clips from
   DCC (FBX/Cascadeur/Blender) or from `MotionClip` rewrite paths.
3. **Omit the entire Transform node** for every `ATH_*` bone on host clips. Do
   **not** write rest-pose tracks, identity tracks, or full TRS “frozen”
   tracks as a substitute — that is still “having animation data” and breaks
   in-game helpers.

**Extra / Part exception:** if the clip plays on a spawned extra (SHL Part,
not Body(0)), keep `ATH_*`. See [Extra / Part exception](#extra--part-exception-keep-ath).

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
| `write_motion_clip_as_nuanmb` / `transform_group_from_clip` | Default omits `ATH_*` via `is_ath_helper_bone`. `NuanmbWriteOptions.omit_ath_helper_bones = false` keeps them |
| FBX → NUANMB import (`import_motion_fbx`) | Same writer. UI checkbox **Skip ATH_* helper bones** defaults checked; uncheck for extra/Part |
| ClipOps / Cascadeur write-back | Still omit ATH (no checkbox) |
| NUSKTB / model / NUHLPB assets | Unchanged — helpers stay on the skeleton and in `.nuhlpb` |

Canonical code: `src-tauri/src/ssbh_motion_interchange/nuanmb.rs`  
Test: `nuanmb_writer_strips_ath_helper_bones` and
`nuanmb_writer_keeps_ath_helper_bones_when_omit_disabled` in
`src-tauri/tests/ssbh_motion_interchange_test.rs`  
(run: `cargo test --features motion-tests --test ssbh_motion_interchange_test nuanmb_writer`).

## Extra / Part exception (keep ATH)

Host Body(0) homemade clips still omit `ATH_*`. That rule does **not** apply
to a clip that plays on an **extra / Part** (SHL type Part, `sys_4B` spawned
model) rather than the player Body.

An extra does **not** run the host NUHLPB helper solver. Hand helpers,
backpack, and weapon sockets (`ATH_TE_*`, `ATH_BACKPACK`, …) stay wherever
the motion left them unless the NUANMB itself records those Transform nodes.

Proven case: Wing Zero Rebellion white extra `body_whitel` (`0x04DC16CE`)
on homemade `win_pose`. Owner:
`docs/msc-research/wing-zero-rebellion-victory-pose.md` §9.

| Clip owner | `ATH_*` in homemade NUANMB |
|---|---|
| Host Body(0) / host Type1 wing | Omit (NUHLPB + rest) |
| Extra / Part playing the same skeleton | **Keep every bone, including ATH animation** |

DCC: do not call `strip_ath_keys` on the extra armature. FBX isolation still
exports all bones (`bake_anim_use_all_bones=True`).

Import: **Import FBX as NUANMB** skips `ATH_*` while **Skip ATH_* helper bones**
is checked (default). Uncheck it for extra/Part clips so helper tracks are
written. ClipOps / Cascadeur write-back still omit ATH.

## Modder guidance

- Edit **humanoid / body** bones only (`BASE`, `GBL_RT`, limbs, etc.) on the
  **host** Body clip.
- Leave `ATH_*` alone in Blender/Cascadeur on the host if the skeleton still
  lists them; the tool strip ensures they are not written into the host NUANMB.
- On an **extra / Part** clip, author and keep `ATH_*` tracks. The extra has
  no host helper solver.
- Do **not** hand-edit structure JSON or raw NUANMB to “fix” host ATH offsets —
  fix the body animation, not the helper bones.
- Rare stock clips may contain a few hand helpers (`ATH_TE_*`); that does not
  license baking full ATH sets into homemade **host** body/shot motions.

## Related docs

- Motion FBX import design:
  `docs/superpowers/specs/2026-07-26-motion-fbx-import-roundtrip-design.md`
- ADR import path: `docs/adr/0002-motion-fbx-import-direct-ufbx.md`
- TransformFlags / sparse rest semantics (ssbh_lib research):
  `docs/ssbh-wmmt2-merge-animation-regression.md`
- **In-game homemade layout (CompScale/Visibility, full Translate, indexed `0x4300`):**
  `docs/nuanmb-exvs2-import-in-game-layout.md`
