# MB and MBON stage batch delivery (2026-10-11)

Resume source: Claude session `e0fe480b-c34a-40c5-a1f2-3625e2bab833`.
Owner requested all earlier-title stages for local Over Boost testing, with
MB and MBON separated into group folders. Follow-up: review correctness at
each step, including omissions and current artifacts.

## Findings and corrections

- The Claude session ended on its quota after a successful 42-archive MBON
  batch. Only practice and Heliopolis had been delivered. Later source changes
  fixed collision winding, shadows, alpha masks and sky layers; the earlier
  batch predates these changes and was regenerated.
- MB's PCB `GEM` data is resolved by file id, with patch tables overriding
  base `EXMB.psarc` records in numeric version order. This yields 63 stage
  resources, file ids 19 through 81, including special arena variants.
- A 4-KiB prefix scan missed MB Side 7: its 277-entry model header puts the
  manifest beyond that prefix. The corrected bounded read finds it.
- MB FIDs 69, 70, 71 and 81 have no source sky. The adapter adds a regular
  triangle with zero vertex alpha and the transparent sky shader, solely to
  satisfy the OB folder layout. Rendering invisibility still needs an in-game
  test; no foreign sky dome is inserted.
- MB practice's object table is one zero-length blob. The stage reader accepts
  only that exact singleton sentinel as empty. Nonempty/mixed malformed tables
  still fail, and placements referencing absent objects remain invalid.
- `mbon_stage_port repack-list` validates the source stage-list binary and
  uses the existing Workspace FHM2D packer to produce the list test pack.
- Corrected the report's stale `vsngSkydomeFog` recipe to `vsngSkydome`.

## Delivery and evidence

Local task root: `local-note/stage-batch-20261011/` (git-excluded).
Scripts, inventories, conversions, pack reports, backups and the test catalog
live there. Original research project and game data are read-only inputs.

Mod editing folders: `E:/XB/mod/001stage/group/MBON/` and `group/MB/`.
Test packs: `001stage/0xXXXXXXXX.fhm2d`. Root-level packs avoid the current
custom-name index's nonrecursive folder scan. Practice/Heliopolis ids and
hashes are preserved. Their grouped editors are authoritative; legacy root
editing folders were absent at the final audit and were not recreated.
Other existing list/registry rows remain semantically unchanged.

The list is prepared off-mod and written only after all stage packs exist.
New rows clone the owner's Paris template, so icons are shared test icons.
The modern JSON import/export sidecar replaces the stale legacy-field sidecar.

Compile gate: debug `cargo check --lib --bins`, passed with no project rustc
warnings; Cargo reports existing dependency future-incompatibility notices.
Artifact gate: `python local-note/stage-batch-20261011/verify_delivery.py`.
Its saved `verification.json` is the completion evidence: every real pack is
extracted, source payload hashes are compared, and list/registry links and
original rows are checked.

That first gate was payload/list evidence only. The owner's subsequent request
for full byte/format comparison exposed wrong info-file ordering and IBL slot
ordering. `deep-audit/FINAL_AUDIT.json` and `DEEP_AUDIT.md` supersede the first
gate's scope; a hash-set comparison does not prove tree positions or gameplay.

Result: **PASS** — 105 real stage packs (42 MBON / 63 MB), 226 stage-list rows,
all 123 original rows preserved, 103 registry records added, and the packed
stage list extracts to the exact updated binary. `TEST_CATALOG.csv` and
`TEST_RESULTS_TEMPLATE.csv` are installed under `001stage/group/` and the
local task root. Four source stages have an absent-sky warning. No other
model/texture drops or skipped objects were reported by the converter.

## Runtime scope

This is a static stage test baseline. Object animations, destruction/debris,
stage effects, source STGP lighting, cube-map IBL and surface-kind behavior are
still the documented gaps, not completed game features. The catalog records
affected stages. No in-game test has been run in this session.

MB placement scale consumption has not been independently proven against its
native engine. Non-unit MB placement scales use the existing MBON baseline;
the catalog flags all affected MB resources for an object-position/size test.

The owner should test stage selection, loading, floor/border collision,
spawn/respawn, sky/transparency, shadows and object placement. Special arenas
may have only one spawn pair; record their actual battle behavior separately.

## Full collision investigation after owner feedback

The owner reported rare penetration across all new maps and could not supply
a reliable location. All 2,062 ground, border and object collision files were
therefore compared with their complete source VCL vertex/index/normal arrays.
The source has 868,585 triangles; its stored normals agree with face winding.
The old decoded output had 854,212 triangles. Face-count reduction alone is
not a defect proof: the audit also compares surface distances and topology.

The inherited interactive collision policy clusters faces up to 15 degrees
apart, retriangulates regions and authors quads. This can change the diagonal
of a bent pair and move its actual surface. A focused regression reproduces
that failure. VCL import now bypasses simplification, welding, face dropping
and quad authoring; safe per-body shape-key splitting remains enabled.

The second fault was section-local 11/11/10-bit vertex quantization. Imported
VCL data now uses supported global 21/21/22-bit shared vertices throughout.
Encoding uses the f32 domain actually serialized to the runtime. BVH bounds
contain decoded coordinates with conservative float-rounding margins; raw
geometry validation remains separate from those padded search bounds.

The mesh tree also previously encoded descendants against the raw BVH root
bounds while serializing a different padded domain and a zero root codec.
The Axis5 encoder now uses the declared domain as its root parent. Independent
checks decode every section tree, mesh tree and SIMD tree, including leaf/key
references, reachability and containment. Geometry is read from exact XML hex
reals; Havok's human-readable dec fields can lose precision.

The repaired collision policy is `faithful_vcl_shared_vertices_bounds_v4`.
Every original face must have a target face in a complete bijection with the
same winding and a recorded corner-error bound. All collision outputs are
generated and gated before editable copies change. Repacked stage files are
prepared before publication and replaced atomically. The final delivery gate
checks actual root packs, local copies and list/registry references again.

Native sample HKT SDKV is 20160200; the installed writer emits 20180100. The
OB v27 executable identifies `hk2017_2_0_r1`. No version-string rewriting is
used to masquerade as a native asset. Runtime compatibility and disappearance
of the reported penetration still need a new in-game regression; static
geometry/format evidence cannot prove those behaviors.

Final evidence: `deep-audit/FINAL_AUDIT.json` reports 105 packs, 24,728 packed
files, 2,062 collision files and a complete source/target bijection for all
868,585 triangles. Maximum corresponding-corner error is
0.0021678514144822677 game units. Every section, mesh and SIMD tree passed
containment and key/reference checks. All packed payload bytes were compared
with the editable source; the total decoded payload size is 3,598,310,953
bytes. The list and registry gate passed with 226 rows and all original rows
preserved. Three focused regression tests passed; the required debug Cargo
check passed without project rustc warnings.

The later sky/color pass supersedes those pack hashes and list counts. Native
OB v27 shader bytecode proves sky alpha controls RGB gain `(1 + 2a)^3`, with
output alpha replaced by one. The former alpha-255 sky copies introduced 27x
gain; shader-label changes alone were insufficient. All 105 baselines now use
source HDR alpha or explicit gain-one alpha for RGB-only skies. Source sky
vertex fades and empty-sky placeholders use a native shader that consumes
vertex RGBA. All authored sky mip RGB bytes are retained; obsolete sky-only
opaque texture copies are backed up and removed from the editing trees.

The corrected baseline contains 24,744 packed resources and 8,255 source
texture variants. All 23,945 protected field resources retain their original
bytes, including all 2,062 collision files. Collision policy v4 and its
complete geometry/BVH proof remain applicable. Runtime verification remains
pending; static evidence does not guarantee a visual match to MB/MBON.

Nine isolated visual tests occupy list IDs 2111950300..2111950308, with labels
`VIS METAL0`, `VIS LINEAR`, and `VIS LUT_OFF`. They cover MBON Heliopolis,
MB FID 00019 and MB FID 00075. Their model/material/texture names are unique,
and their collision bytes match the corresponding corrected baseline.
The list now contains 235 rows, preserving all 226 previous rows. Test editing
trees are under `001stage/group/VISUAL_TEST/<source>/<profile>/`; packed files
are still at the game-facing `001stage/` root. Local counterparts, catalogs,
backups, native shader provenance and read-only IDA v27 evidence are under
`local-note/stage-batch-20261011/visual-audit/`.
