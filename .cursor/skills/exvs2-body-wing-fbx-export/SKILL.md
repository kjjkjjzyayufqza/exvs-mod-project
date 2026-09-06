---
name: exvs2-body-wing-fbx-export
description: Use when exporting EXVS2 unit motion FBX from a Blender scene that has both a body armature and a wing armature; when writing 001hito body vs 410wzerowing wing `_out.fbx`; when Import FBX as NUANMB reports Rig mismatch missing CENTER_RT; when baking trans_start, trans_end, trans_loop, kamae, or guard clips for Wing Zero Rebellion / ZeroEW_Body / ZeroEW_Wing; or when the user asks to split body and wing export, ATH_BACKPACK parent, CHILD_OF attach, or bake_anim_simplify.
---

# EXVS2 Body / Wing FBX Split Export

Game motion packages are **two skeletons**. A composed Blender scene (body + wing parented for preview) must still emit **two FBX files**. Never export the whole scene as one FBX.

**Proven source:** Grok session `019fec42-7a58-7a82-84cc-db2cc1eac5ed` (2026-08-10/11). Script: `scripts/export_body_wing_fbx.py`. Details: `references/`.

## When to use

- User names `001hito_*_body_*_out.fbx` and/or `410wzerowing_*_wing00_*_out.fbx`
- Live Blender has `ZeroEW_Body` + `ZeroEW_Wing` (or `.001` duplicates)
- NUANMB import: `Rig mismatch: candidate skeleton is missing reference bone 'CENTER_RT'`
- Transform clips `trans_start` / `trans_end` / `trans_loop`
- "把 body 和 wing 分开导出"

## When NOT to use

- Single-skeleton unit (no independent wing package)
- Official stock NUANMB copy with no DCC round-trip
- Model/mesh FBX for Unit Model editor (this skill is **motion** FBX)
- Source TV `body_tf` (78 bones) played onto Rebellion body — that is a different retarget problem; this skill only covers **export isolation** after the composed scene exists

## Hard rules

1. **Two files, two skeletons.** Body FBX → `001hito` NUSKTB. Wing FBX → `410wzerowing` NUSKTB.
2. **Identify armatures by bones, not object names.** Body = has `CENTER_RT`. Wing = has `LMAIN_1`. Skip `OLD_*`.
3. **Isolation is selection/visibility, not unparenting.** Keep `ATH_BACKPACK` bone-parent and `CHILD_OF` on wing `GBL_RT` for preview. Hide/deselect the other armature before export.
4. **Keep every bone.** `use_armature_deform_only=False`, `bake_anim_use_all_bones=True`, `add_leaf_bones=False`, `bake_anim_simplify_factor=0.0`.
5. **One action per file.** `bake_anim_use_all_actions=False`, `bake_anim_use_nla_strips=False`.
6. **Host clips: do not author `ATH_*` keys.** Strip them in DCC. Writer also omits them. **Extra / Part clips** (Rebellion white `ZeroEW_White_Body`): keep every bone, including ATH animation — the extra has no host NUHLPB. Policy: `docs/nuanmb-ath-helper-bone-policy.md`.
7. **Game-style filenames.** Do not ship `ZeroEW_Body_from_gwtv_out.fbx` as the import file. Pairing is by `001hito_` vs `410wzerowing_` prefix.
8. **Do not map TV wing bones onto Rebellion wing.** TV `WING_*` vs Rebellion `LMAIN_*` / `RMAIN_*` are incompatible. Wing clips come from `410wzerowing_*` FBX, not from gwtv body_tf.

## Armature identity

| Role | Marker bone | Rebellion Zero EW | Root chain |
|------|-------------|-------------------|------------|
| Body | `CENTER_RT` present, `LMAIN_1` absent | 52 bones | `GBL_RT → CENTER_RT → BASE` |
| Wing | `LMAIN_1` present, `CENTER_RT` absent | 44 bones | `GBL_RT` only |

Counts 52/44 are **this unit**. Other units: still split by marker bones.

## Scene contract (preview)

Composed scene is legal for editing. It is **illegal** as a single export.

```text
ZeroEW_Body                    ARMATURE  (own Action)
  meshes                       parent or Armature modifier → Body
  ZeroEW_Wing                  parent_type=BONE, parent_bone=ATH_BACKPACK
    GBL_RT                     CHILD_OF → Body.ATH_BACKPACK
    meshes                     parent or Armature modifier → Wing
OLD_*                          hidden leftovers; never export
```

Two Actions play together in Blender. They never merge into one FBX.

Full parenting, constraints, and mesh names: `references/scene-contract.md`.

## Export protocol

Prefer the script. Paste-into-MCP is allowed only if the script cannot be exec'd.

### A. Agent (required default)

1. Confirm Blender MCP is the live scene the user is editing. Do not open a different `.blend` unless the user names it.
2. Inventory armatures in the **current scene + view layer**. Print name, marker bones, action, frame range, parent, CHILD_OF targets.
3. If both body and wing exist, plan **two** output paths before touching export.
4. Exec `scripts/export_body_wing_fbx.py` inside Blender, then call `export_pair(...)`.
5. Verify both files (section below). Stop if a check fails; do not import a failed FBX.

Blender MCP (`blender__execute_blender_code`). Pass `user_prompt` as the user's verbatim request on every call.

First call may `exec` the script file:

```python
p = r"E:\TAURI_PROJECT\.cursor\skills\exvs2-body-wing-fbx-export\scripts\export_body_wing_fbx.py"
exec(compile(open(p, "r", encoding="utf-8").read(), p, "exec"), globals())
print(inspect_scene())
```

Second call exports:

```python
export_pair(
    out_dir=r"D:\output\exvs2\wing_gundam_zero_rebellion\motion",
    body_filename="001hito_016gundmw_001wgzero_001_body_<clip>_out.fbx",
    wing_filename="410wzerowing_016gundmw_001wgzero_001_wing00_<clip>_out.fbx",
    which="both",  # "body" | "wing" | "both"
)
```

Headless:

```text
blender --background "<scene.blend>" --python ".cursor/skills/exvs2-body-wing-fbx-export/scripts/export_body_wing_fbx.py" -- --out-dir "D:\output\exvs2\<unit>\motion" --body-name "001hito_..._body_<clip>_out.fbx" --wing-name "410wzerowing_..._wing00_<clip>_out.fbx"
```

### B. Isolation (what the script does)

Do **not** unparent wing.

1. Object mode.
2. Collect export set = armature + meshes parented to it + meshes whose Armature modifier targets it. Exclude `OLD_*` and the other role's objects.
3. Hide every other view-layer object. Show only the export set.
4. Set scene `frame_start` / `frame_end` from **that armature's current Action** key range (not the other armature).
5. `export_scene.fbx` with `use_visible=True`, `use_selection=False`, kwargs from the script (`FBX_EXPORT_KWARGS`).
6. Restore hide flags, frame range, object/pose mode, and the user's
   previous object + pose-bone selection. Isolation is temporary; do not
   leave Object Mode with nothing selected while they are keying.
7. Repeat for the other armature.

If view-layer / context override fails, fall back to `use_selection=True` on the same export set. Do not fall back to exporting the whole scene.

### C. Human UI (same isolation)

1. Object Mode → Select None.
2. Select only the body armature and its meshes.
3. File → Export → FBX. Check **Selected Objects**. Limit to Armature + Mesh.
4. Bake Animation on. All Actions off. NLA Strips off. Simplify `0`. Add Leaf Bones off. Forward `-Z`, Up `Y`.
5. Save as `001hito_..._body_<clip>_out.fbx`.
6. Select None. Repeat for wing → `410wzerowing_..._wing00_<clip>_out.fbx`.

Kwargs table: `references/fbx-kwargs.md` (must match `FBX_EXPORT_KWARGS` in the script).

## Naming

```text
<packagePrefix>_<unitCanon>_<part>_<clip>_out.fbx
```

| Role | Prefix | Part token | Import skeleton |
|------|--------|------------|-----------------|
| Body | `001hito_016gundmw_001wgzero_001` | `body` | 001hito body `.nusktb` |
| Wing | `410wzerowing_016gundmw_001wgzero_001` | `wing00` | 410 wing `.nusktb` |

Clip tokens from the proven export set:

| Clip | Body file | Wing file | Frames (proven) |
|------|-----------|-----------|-----------------|
| from_gwtv / kamae retarget | `..._body_from_gwtv_out.fbx` | `..._wing00_guardbgn_sht_air_out.fbx` (or kamae) | body 1–24 / wing 1–20 |
| trans_end | `..._body_trans_end_out.fbx` | `..._wing00_trans_end_out.fbx` | body 1–24 / wing 1–20 |
| trans_loop | `..._body_trans_loop_out.fbx` | `..._wing00_trans_loop_out.fbx` | both 1–60 |

`_out` means "DCC-authored, ready for Import FBX as NUANMB". Stock dumps keep `_fr` and are not this skill's output.

## NUANMB import pairing

| FBX | Target in Unit Model / Motion panel |
|-----|--------------------------------------|
| `001hito_*_body_*_out.fbx` | Body motion + body `.nusktb` |
| `410wzerowing_*_wing00_*_out.fbx` | Wing motion + wing `.nusktb` |

If the editor says missing `CENTER_RT`, the FBX is the wing (or a mixed scene export). Re-export body in isolation. Do not "add CENTER_RT" to the wing file.

Homemade in-game layout: `docs/nuanmb-exvs2-import-in-game-layout.md` (indexed `0x4300`, CompScale/Visibility, full Translate, no ATH).

## trans_start / trans_end / trans_loop

These are **three scenes / three action pairs**, not one FBX with NLA.

| Stage | How to build | Export |
|-------|----------------|--------|
| `trans_start` | Authored enter clip (user keys) | Split body + wing `_out` |
| `trans_end` | Reverse of `trans_start` time (do not re-author) | Open `trans_end.blend`, split export |
| `trans_loop` | New 60 fps action: **every frame is `trans_start` last pose** | Open `trans_loop.blend`, split export |

Do not bake trans_end/loop from a dirty live scene if the matching `.blend` exists. Open the `.blend`, then `export_pair`.

Helpers in the script: `make_reversed_action`, `make_hold_last_frame_action`. Full procedure: `references/trans-clip-pipeline.md`.

## Same-name retarget (gwtv → Rebellion body)

When applying a TV `body_tf` dump onto Rebellion body:

- Copy curves only for **identical bone names that exist on the target**.
- Skip source-only bones (`WING_*`, `FOOT_*` extras, `BSRIFLE_*`, …).
- Do **not** auto-copy `GBL_RT` from body onto wing.
- Optional leg map (`FOOT_*_1/2/3_1` → `HIZA/ASHI/TSUMASAKI`) **only if the user asks**. Default proven path did not keep that map.
- Strip `ATH_*` keys after copy.

Bone lists: `references/bone-mapping.md`.

## Verification (required before claiming success)

Run `verify_exported_fbx(path, role)` from the script, or equivalent byte-string checks:

| Check | Body FBX | Wing FBX |
|-------|----------|----------|
| File exists, size > 0 | yes | yes |
| ASCII contains `CENTER_RT` | yes | **no** |
| ASCII contains `LMAIN_1` | **no** | yes |
| ASCII contains `GBL_RT` | yes | yes |
| ASCII contains `BASE` | yes | optional |
| Leaf bones / `*_end` / `*_leaf` | no | no |
| Frame range | matches that armature's Action | matches that armature's Action |
| Selected/visible objects at export | body arm + body meshes only | wing arm + wing meshes only |

Rebellion Zero EW extra: body 52 bones, wing 44 bones (from Blender armature, not from guessing FBX).

Print a two-row table (path, size, frames, marker checks) in the user reply.

## Common mistakes

| Failure | Cause | Fix |
|---------|-------|-----|
| Missing `CENTER_RT` on import | Wing FBX or mixed export used as body | Body-only isolation; game-style `001hito_` name |
| Extra bones / rig mismatch | `add_leaf_bones=True` | Always false |
| Bones drop to rest | `bake_anim_simplify_factor != 0` | `0.0` |
| Missing unused bones | `use_armature_deform_only=True` or `bake_anim_use_all_bones=False` | Keep all bones |
| Two actions in one FBX | `bake_anim_use_all_actions=True` or whole-scene export | One action, isolated objects |
| Wing world jump | Unparented wing for export | Do not unparent; isolate by hide/select |
| ATH twisted in game | ATH keys authored | Delete ATH fcurves; writer omits nodes |
| Body still after export | Imported against 410 skeleton | Switch reference NUSKTB |
| "Only wing plays" in Blender | Body assigned the wrong Action, or Action Editor showing the selected arm only | Each armature has its own Action; both can play |

## Rationalizations (forbidden)

| Excuse | Reality |
|--------|---------|
| "They are parented, one FBX is fine" | Game loads two NUANMB against two NUSKTB |
| "I will split it in the importer" | Importer matches one candidate skeleton |
| "Unparent wing so FBX is clean" | Isolation is enough; unparenting breaks preview and bake space |
| "Simplify 1.0 is smaller" | Constant-but-not-rest channels get culled |
| "Deform bones only" | `CENTER_RT` / helpers drop; body import fails |
| "Same GBL_RT so share the root action" | Wing `GBL_RT` is a different bone on a 44-bone rig |
| "ATH identity tracks are safe" | Present ATH Transform nodes still fight NUHLPB |

## Related

- Script: `scripts/export_body_wing_fbx.py`
- `references/scene-contract.md`
- `references/fbx-kwargs.md`
- `references/trans-clip-pipeline.md`
- `references/bone-mapping.md`
- `docs/nuanmb-ath-helper-bone-policy.md`
- `docs/nuanmb-exvs2-import-in-game-layout.md`
- `docs/msc-research/homemade-motion-clock-vs-game-frame.md` — after import, MSC phase length is `global244 -= func_274()`, not `func_309`
- `docs/adr/0002-motion-fbx-import-direct-ufbx.md`
- Blender FBX pitfalls (connected bones, constant-channel cull, declared axes): Claude project memory `blender-fbx-motion-pitfalls` / `docs/superpowers/specs/2026-07-26-motion-fbx-import-roundtrip-design.md`
