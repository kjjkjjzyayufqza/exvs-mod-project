# FBX export kwargs

Canonical values live in `scripts/export_body_wing_fbx.py` as `FBX_EXPORT_KWARGS`. This page is the why.

## Required

| Kwarg | Value | Why |
|-------|-------|-----|
| `object_types` | `{ARMATURE, MESH}` | No lights/cameras/empties |
| `use_armature_deform_only` | `False` | Keep `CENTER_RT` and non-deform bones |
| `bake_anim` | `True` | Motion FBX needs baked pose |
| `bake_anim_use_all_bones` | `True` | Bones without keys still exist on the NUSKTB |
| `bake_anim_use_all_actions` | `False` | One action per file |
| `bake_anim_use_nla_strips` | `False` | Do not merge NLA |
| `bake_anim_force_startend_keying` | `True` | Stable clip ends |
| `bake_anim_step` | `1.0` | One sample per frame |
| `bake_anim_simplify_factor` | `0.0` | Blender culls constant channels; offset bones fall back to rest |
| `add_leaf_bones` | `False` | Extra tip bones fail NUSKTB match |
| `primary_bone_axis` | `Y` | Matches existing EXVS2 FBX |
| `secondary_bone_axis` | `X` | Same |
| `armature_nodetype` | `NULL` | Same |
| `axis_forward` | `-Z` | Game / Blender FBX convention used in this repo |
| `axis_up` | `Y` | Same |
| `embed_textures` | `False` | Motion file, not a model pack |
| `path_mode` | `AUTO` | No texture search |

Isolation flags (not in the dict; set per call):

| Isolation | Flags |
|-----------|--------|
| Default (`visible`) | hide non-export objects, `use_visible=True`, `use_selection=False` |
| Fallback (`selection`) | `use_selection=True`, `use_visible=False` |

Scene `frame_start` / `frame_end` must match **that armature's** Action key range before bake.

## Human UI equivalent

File → Export → FBX:

- Selected Objects (or Visible Objects if you hid the other side)
- Object Types: Armature, Mesh
- Armature: Add Leaf Bones **off**; Only Deform Bones **off**
- Bake Animation **on**; All Actions **off**; NLA Strips **off**; Simplify **0**
- Forward `-Z`, Up `Y`

## Do not change

- Do not set simplify to 1.0 to "make a smaller file".
- Do not enable All Actions to "catch everything".
- Do not enable leaf bones "for Maya".
