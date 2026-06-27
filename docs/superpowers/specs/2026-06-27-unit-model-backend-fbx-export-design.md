# Unit Model Backend FBX Export Design

## Goal

Replace Unit Model Editor's Three.js-based SSBH-to-FBX path with a Rust-only
binary FBX exporter. The export reads disk-backed SSBH files directly and does
not depend on viewport visibility, GPU resources, preview layout, or the current
animation pose.

## Scope

- Export FBX only. No new DAE behavior is added.
- Export every selected disk-backed Unit preview instance in its SSBH bind pose.
- Preserve mesh object names, subindices, positions, normals, first UV channel,
  skeleton hierarchy, rigid attachments, arbitrary bone weights, and materials.
- Optionally convert every NUTEXB referenced by the model's NUMATB files to an
  external PNG and reference the selected base-color PNG from the FBX.
- Keep Scene Editor's existing frontend FBX exporter unchanged.
- Memory-backed preview instances are skipped because they have no authoritative
  disk SSBH source.
- Automated tests are not run, per the user's explicit time-saving request.

## Architecture

The frontend builds lightweight export entries from disk-backed
`SsbhModelPreviewInstance` values and invokes one batch Tauri command. The
command runs in `spawn_blocking`, resolves NUMSHB/NUSKTB/NUMATB files from each
NUMDLB reference, and exports entries sequentially to bound peak memory. It does
not build or serialize a preview bundle.

The Rust exporter follows the intermediate-scene pattern used by
`E:\research\ssbh_editor`: SSBH `MeshData` and `SkelData` become format-neutral
mesh and bone records. A binary FBX 7.5 writer based on
`E:\research\gvg_np\src\fbx.rs` serializes those records through `fbxcel`.

## FBX Contents

Each SSBH mesh object becomes a distinct FBX Geometry and Mesh Model. Geometry
uses indexed triangles, polygon-vertex normals, and polygon-vertex UVs. Each
object has a material resolved through NUMDLB/NUMATB metadata.

Binary FBX object identifiers use `name + NUL + SOH + class`, not a visible
`Class::name` prefix. UV export preserves U and converts V with `1.0 - v` to
match FBX/DCC texture coordinates.

Each skeleton bone becomes a LimbNode Model and NodeAttribute. Local SSBH bone
matrices define hierarchy transforms; computed world matrices define bind-pose
and cluster `TransformLink` matrices. Each skinned mesh gets a Skin deformer and
one Cluster per referenced bone. Rigid `parent_bone_name` objects are represented
as full-weight skinning to that bone.

FBX cluster `Transform` is stored in bone space rather than directly as the
mesh world matrix. Since exported mesh models have an identity bind transform,
each cluster writes `inverse(bone_world)` as `Transform`, `bone_world` as
`TransformLink`, and identity as `TransformAssociateModel`. Importers therefore
recover the intended mesh bind transform as `TransformLink * Transform = I`
instead of moving the entire mesh to the first influencing bone.

Bone local matrices are converted to FBX XYZ Euler values with a direct matrix
decomposition, including separate positive/negative 90-degree gimbal-lock
branches. This keeps the FBX Model transforms equivalent to the exact bind-pose
matrices instead of introducing a non-identity default pose on compound
90-degree bones.

Y-up exports declare Y/Z axes; Z-up exports declare Z/X axes. Geometry remains
in SSBH coordinates and importers apply the FBX GlobalSettings axes. The scale
factor is applied to mesh positions and bone translations consistently.

## Texture Handling

When texture export is enabled, the exporter collects every non-empty reference
from both `textures` and `textures2` in every NUMATB referenced by the NUMDLB.
This collection happens before material-profile merging so secondary profiles
cannot lose texture references. Each unique source NUTEXB is converted once per
batch to a collision-safe PNG name. The existing base-color selection rule
chooses which exported PNG is referenced by the FBX Texture and Video records;
the other PNGs are exported alongside it for downstream material setup. Missing
NUMATB texture references are reported as a per-model export failure instead of
being silently omitted. Materials with no texture references remain valid
untextured materials.

## Errors And Performance

The batch command validates output paths and positive scale values before work
starts. Per-model failures are collected while remaining models continue. File
parsing and FBX serialization stay off the async/UI thread. Sequential model
processing avoids retaining multiple expanded meshes and FBX buffers at once.

## Frontend Changes

Unit Model Editor no longer obtains `Object3D` values from
`SsbhModelPreviewViewport`, no longer gates export on rendered viewport objects,
and no longer calls `exportObjectsAsFBXToDirectory`. The existing export dialog
is reused in FBX-only mode, and its scale, axis, texture, and output-directory
values are forwarded to the Rust batch command.
