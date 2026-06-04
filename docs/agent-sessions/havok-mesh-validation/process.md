# Havok Mesh Validation Process

## Goal

Determine whether the current EXVS stage Havok mesh generation path can correctly produce an `hkt` collision file that opens in `C:\Program Files\Havok\HavokContentTools\PreviewTool.exe`, using public GitHub/web references plus the local implementation.

## Startup Context

- Read `AGENTS.md`.
- Read `.cursor/rules/custom-rules.mdc`.
- Read relevant project docs:
  - `docs/havok_compressed_mesh_encode.md`
  - `docs/havok-hkt-xml-conversion-analysis.md`
  - `docs/superpowers/specs/2026-05-18-scene-editor-havok-import-pipeline-design.md`
- Inspected local implementation:
  - `src-tauri/src/havok_mesh_encode.rs`
  - `src-tauri/src/havok_collision_encode.rs`
  - `src-tauri/src/havok_cli.rs`
  - `src-tauri/src/bin/gen_hkt_variants.rs`
  - `src-tauri/assets/havok_box_collision_template.xml`

## External References

- GitHub raw source:
  - `soulsmods/DSMapStudio`:
    - `src/HKX2/HKX2/Builders/hknpCollisionMeshBuilder.cs`
    - `src/HKX2/HKX2/Builders/BVH.cs`
- GitHub wiki:
  - `BadDogSkyrim/PyNifly`:
    - `FO4-Havok-Packfile-Format-(hk_2014.1.0).md`
    - `Collisions.md`
- Web search used to confirm public references around `hknpCompressedMeshShape`, compressed mesh layout, and BVH structure.

## Local Findings

- The local pipeline is:
  1. Parse imported geometry into a merged collision triangle mesh.
  2. Hand-build Havok XML in `build_mesh_collision_xml()`.
  3. Pass that XML through Havok's `Write to Platform` filter to obtain binary `hkt`.
- `havok_cli.rs` uses Havok's official filter manager for XML -> HKT, so the binary writer step is likely not the main issue.
- `havok_mesh_encode.rs` currently:
  - keeps section limits at `255` vertices and `127` triangles,
  - packs local vertices with 11-11-10 quantization,
  - builds only a simplified section BVH with zeroed AABB bytes,
  - hardcodes the top-level `meshTree.nodes` to a single Axis5 node,
  - leaves `sharedVertices` and `sharedVerticesIndex` empty,
  - writes `firstDataRunIndex=0` for every section and compensates by changing the run `index` field globally.

## Reference Comparison

- DSMapStudio builds a real BVH first, then:
  - splits sections from BVH nodes when primitive count exceeds `127` or unique vertex count exceeds `255`,
  - computes shared vertices across sections,
  - builds section-local Axis4 trees with compressed AABB bytes,
  - builds a mesh-level Axis5 tree whose leaves reference section indices.
- The local encoder matches the packed vertex quantization and section-cap heuristics reasonably well.
- The local encoder does **not** match DSMapStudio in the following important ways:
  - no real mesh-level BVH / Axis5 tree for multiple sections,
  - no compressed per-node AABB data in section trees,
  - different section data-run indexing semantics,
  - no shared-vertex path for multi-section meshes.

## Provisional Conclusion

- The current method is **partially correct**:
  - correct direction: mesh -> Havok XML -> official Havok HKT writer,
  - likely acceptable for trivial or single-section meshes,
  - not structurally faithful enough for reliable multi-section `hknpCompressedMeshShape`.
- The highest-confidence root cause for `PreviewTool.exe` failures is the hand-written multi-section `meshTree` structure, especially the single-node top-level Axis5 tree combined with simplified section BVH encoding.

## Additional Black-Box Findings (2026-05-30)

- Generated variants under `E:\XB\解包\com\test\_hkt_variants` were all produced successfully by the current Rust encoder.
- `PreviewTool.exe` launched a visible window for:
  - original `border_hit.hkt`
  - `V1_box.hkt`
  - `V6_real_1section.hkt`
- `PreviewTool.exe` started but did not create a visible main window for:
  - `V7_real_2sections.hkt`
  - `V4_full.hkt`
- However, Havok's official `hctStandAloneFilterManager.exe` was able to convert all tested generated variants back to XML quickly (~0.4-0.5s), including:
  - `V7_real_2sections.hkt`
  - `V4_full.hkt`
  - the existing problematic `sssssccccc.hkt`
- This means the problematic files are **not grossly unreadable binaries**. They are parseable by Havok's official conversion pipeline even if `PreviewTool.exe` hangs.

## Important Naming Finding

- Inside the same extracted stage pack `E:\XB\解包\com\test\0x16F73C97\0\0\`, the top-level HKT files are:
  - `001stage001_object_box01/map_hit.hkt`
  - `base/map_hit.hkt`
  - `info/border_hit.hkt`
  - `sssssccccc/sssssccccc.hkt`
- The `sssssccccc/sssssccccc.hkt` filename is the outlier.
- Repository save logic currently has two conflicting behaviors:
  - `SceneMemorySession::collect_save_artifacts()` writes imported-object collision as `{base}/{import.name}.hkt`
  - `scene_generate_hkt_from_mesh()` writes collision into the in-memory bundle as `map_hit.hkt`
- Relevant code paths:
  - `src-tauri/src/scene_memory_session.rs` writes `relative_path: format!("{base}/{}.hkt", import.name)`
  - `src-tauri/src/scene_session_commands.rs` writes `map_hit.hkt`
- Existing tests and stage reconstruction helpers treat model-folder collision as `map_hit.hkt`, not `<model>.hkt`.
- `src-tauri/src/format/fhm2d_stage_test.rs` explicitly documents `sssssccccc.hkt` as a top-level decoy in the repro case.

## Updated Working Theory

- There are likely **two independent issues**:
  1. **Save-path / filename bug**: imported object collision is being written as `<folder>/<name>.hkt` instead of `<folder>/map_hit.hkt`, which is likely enough to break in-game collision pickup.
  2. **Mesh-tree quality bug**: even when the file is structurally parseable by Havok's CLI tools, the current hand-built `hknpCompressedMeshShape` still appears fragile for larger multi-section meshes and may hang `PreviewTool.exe`.

## Next Fix Direction

- Replace the current top-level `meshTree.nodes` stub with a real section BVH equivalent to DSMapStudio `BuildAxis5Tree()`.
- Rework section BVH generation to include compressed AABB bytes instead of all-zero xyz fields.
- Align section data-run indexing with the public builder semantics.
- Add shared-vertex support only after the top-level and section BVH layout is correct, unless black-box tests prove it is also required for loadability.

## Implementation Update (2026-05-30)

- Updated `src-tauri/src/havok_mesh_encode.rs`:
  - Added a small internal BVH builder using centroid median splits over primitive/section AABBs.
  - Added Havok-style compressed AABB nibble encoding and decompression for child-reference bounds.
  - Replaced the fixed one-node top-level `meshTree.nodes` stub with Axis5 nodes:
    - leaf data stores the section index,
    - internal data stores the half-offset to the right child with the high marker bit,
    - root xyz bytes are zeroed, matching DSMapStudio behavior.
  - Replaced section BVH `xyz = 0,0,0` placeholders with Axis4 compressed AABB bytes:
    - leaf data stores `primitive_index * 2`,
    - internal data stores the right-child offset with bit 0 set.
  - Set each section's `firstDataRunIndex` to its actual global run index.
  - Set each `primitiveDataRuns[index]` to `0`, matching the public builder where the section's `firstPrimitiveIndex` carries the primitive-array base.
- Updated `src-tauri/src/scene_memory_session.rs`:
  - Imported/generated object HKT save artifacts now use `{base}/map_hit.hkt` instead of `{base}/{import.name}.hkt`.

## Template / Sample Analysis

- Converted game samples to XML using Havok Content Tools:
  - `E:\XB\解包\com\test\0x16F73C97\0\0\001stage001_object_box01\map_hit.hkt`
  - `E:\XB\解包\com\test\0xBBC60B47\0\0\211stage211_object_build_a_before\map_hit.hkt`
  - old generated `E:\XB\解包\com\test\_hkt_variants\V7_real_2sections.hkt`
- The available game `map_hit.hkt` samples are single-section, so they are useful for naming/layout confirmation but not as direct multi-section templates.
- Old generated `V7_real_2sections.hkt` round-tripped to XML with:
  - `meshNodes=1`
  - `sections=3`
  - all sections `firstDataRunIndex=0`
  - run indices `0,127,254`
- Fixed generated `V7_real_2sections.hkt` round-tripped to XML with:
  - `meshNodes=5`
  - `sections=3`
  - `firstDataRunIndex=0,1,2`
  - all primitive data run `index=0`

## Verification (2026-05-30)

- `cargo fmt` passed.
- `cargo test havok_mesh_encode --lib` passed:
  - 3 passed.
- `cargo test collect_save_artifacts --lib` passed:
  - 3 passed.
- Generated fixed variants:
  - Command: `cargo run --bin gen_hkt_variants -- "E:\XB\解包\com\test\0x16F73C97\0\0\sssssccccc\0\sssssccccc.numshb" "E:\XB\解包\com\test\_hkt_variants_fixed"`
  - Output includes fixed multi-section files such as `V7_real_2sections.hkt`, `V10_1000tris_5sec.hkt`, and `V11_2000tris_10sec.hkt`.
  - Havok writer produced binary HKT files successfully for all generated variants.
- Converted fixed `E:\XB\解包\com\test\_hkt_variants_fixed\V7_real_2sections.hkt` back to XML with Havok Content Tools and confirmed the corrected mesh-tree/data-run structure.
- `cargo test --lib` was also run:
  - 192 passed, 8 ignored, 2 failed.
  - Failures were in unrelated `ssbh_motion::normalize_frame_tests`:
    - `animate_skel_cpu_maps_namespaced_node_names_to_skeleton_names`
    - `animate_skel_cpu_maps_transform_track_by_name_not_first_track`

## Current Handoff

- Fixed HKT variants are available in `E:\XB\解包\com\test\_hkt_variants_fixed`.
- Next manual black-box check, if needed: open fixed multi-section variants in `PreviewTool.exe`, especially:
  - `V7_real_2sections.hkt`
  - `V17_400tris.hkt`
  - `V11_2000tris_10sec.hkt`
  - `V4_full.hkt`
- If fixed variants still hang in PreviewTool, the next likely missing feature is shared-vertex support across sections.

## Follow-up After PreviewTool Full-Mesh Hang (2026-05-30)

- User tested the generated full `map_hit.hkt`; `PreviewTool.exe` still hung while loading it.
- New high-confidence issue found:
  - The XML template kept `hknpCompressedMeshShape.numShapeKeyBits=4`.
  - The full mesh currently encodes 31 sections.
  - 4 bits only covers 16 section keys, so the full mesh can produce invalid/ambiguous section keys even though Havok's CLI converter accepts the file.
- Updated `src-tauri/src/havok_mesh_encode.rs`:
  - Added `mesh_key_info()`.
  - For single-section meshes, `bitsPerKey/maxKeyValue` remain primitive-key based.
  - For multi-section meshes, `bitsPerKey/maxKeyValue` are section-key based.
  - Patched top-level `numShapeKeyBits` in the template dynamically.
- Verification:
  - `cargo test havok_mesh_encode --lib` passed: 4 passed.
  - `cargo test collect_save_artifacts --lib` passed: 3 passed.
  - Regenerated the single user-test file at `E:\XB\解包\com\test\_hkt_preview_single\map_hit.hkt`.
  - HKT -> XML round-trip confirmed:
    - `numShapeKeyBits=5`
    - `bitsPerKey=5`
    - `maxKeyValue=30`
    - `numPrimitiveKeys=3901`
- If this new file still hangs, the next likely issue is no shared-vertex/index path across sections, or the sequential section partitioning should be replaced with BVH-derived section grouping.

## Real Game Template Direction (2026-05-30)

- User requested to stop spending time on the simplified hand-written template and use a real game HKT as template:
  - `E:\XB\解包\com\test\0xBBC60B47\0\0\base\map_hit.hkt`
- Converted that file to:
  - `E:\XB\解包\com\test\_hkt_template_base\base_map_hit_template.xml`
- Template findings:
  - It contains five `hknpCompressedMeshShapeData` objects / `meshTree` fields.
  - Each original meshTree in this specific base file is still single-section, but the outer scene/shape metadata is authentic game output.
- Code update:
  - Added `build_mesh_collision_xml_with_template(mesh, template_xml)` in `src-tauri/src/havok_mesh_encode.rs`.
  - Real-template mode replaces every actual `<field name="meshTree">...</field>` in the template, not just the first one.
  - It patches every object-level `numShapeKeyBits`.
  - It patches all actual `simdTree` bounds fields.
  - `src-tauri/src/bin/gen_hkt_variants.rs` now honors `HKT_TEMPLATE_XML=<path>` for black-box generation.
- Generated a new single user-test HKT:
  - Output: `E:\XB\解包\com\test\_hkt_preview_single\map_hit.hkt`
  - Template: `E:\XB\解包\com\test\_hkt_template_base\base_map_hit_template.xml`
  - Size: `490128` bytes.
- HKT -> XML verification of the generated real-template file:
  - `meshTreeObjects=5`
  - each meshTree has `primKeys=3901`, `bits=5`, `max=30`, `sections=31`, `nodes=61`
  - all five object-level `numShapeKeyBits` values are `5`
- Verification commands:
  - `cargo test havok_mesh_encode --lib` passed: 5 passed.
  - `cargo test collect_save_artifacts --lib` passed: 3 passed.

## BVH Section Split + Shared Vertices Update (2026-05-30)

- User confirmed the real-template generated file still hung, while the untouched real template XML manually converted through PreviewTool worked.
- Re-checked DSMapStudio `hknpCollisionMeshBuilder.cs` and `BVH.cs`:
  - DSMapStudio builds a whole-mesh BVH first.
  - It cuts section heads from BVH nodes where primitive or unique-index limits require it.
  - The top-level Axis5 tree is the original BVH with section-head nodes replaced by section leaves.
  - Vertices referenced by more than one section are encoded through `sharedVertices` and `sharedVerticesIndex`, not duplicated as packed vertices in each section.
- Updated `src-tauri/src/havok_mesh_encode.rs` accordingly:
  - Section partitioning is now BVH-derived instead of triangle-order chunking.
  - The top-level Axis5 tree now preserves the split BVH topology.
  - Added shared vertex counting, global 21-21-22 shared-vertex compression, per-section shared-index tables, and mixed packed/shared primitive indices.
- Regenerated:
  - `E:\XB\解包\com\test\_hkt_preview_single\map_hit.hkt`
  - Still based on real template XML: `E:\XB\解包\com\test\_hkt_template_base\base_map_hit_template.xml`
  - Size: `516084` bytes.
- HKT -> XML verification:
  - `meshTreeObjects=5`
  - first meshTree: `primKeys=3901`, `bits=5`, `max=31`, `sections=32`, `nodes=63`
  - `sharedVerticesIndex=1383`
  - `packedVertices=4724`
  - `sharedVertices=672`
- Verification:
  - `cargo test havok_mesh_encode --lib` passed: 5 passed.

## Section Key 31 Avoidance (2026-05-30)

- User reported the BVH section split + shared-vertex version still hung.
- The generated XML had `sections=32`, `bits=5`, `maxKeyValue=31`.
- DSMapStudio's sample builder hardcodes `bitsPerKey=5` and `maxKeyValue=30`; this suggests key value `31` may be reserved/invalid.
- Added a fallback: if BVH-derived section splitting produces more than 31 sections, the encoder switches to a capacity-first greedy split to avoid Axis5 leaf key 31.
- Regenerated:
  - `E:\XB\解包\com\test\_hkt_preview_single\map_hit.hkt`
  - Size: `492168` bytes.
- HKT -> XML verification:
  - `meshTreeObjects=5`
  - `primKeys=3901`
  - `bits=5`
  - `max=30`
  - `sections=31`
  - `nodes=61`
  - `sharedVertices=97`
  - `sharedVerticesIndex=194`
- Verification:
  - `cargo test havok_mesh_encode --lib` passed: 5 passed.

## Template Object-Graph Replacement Update (2026-05-30)

- User reported the previous `last` real-template file still hung in Havok Preview Tool.
- Re-examined the real template XML as an object graph instead of a list of fields:
  - `bodyCinfos` references shapes `object5` through `object9`.
  - The last body (`polySurface5692`) references `object9`.
  - `object9.data` references `object19`, the complex `hknpCompressedMeshShapeData`.
- Found two incorrect assumptions in the previous generator:
  - `numShapeKeyBits` / `bitsPerKey` / `maxKeyValue` were being treated as section-key width. In the game template they follow the primitive-key space (`object19` uses `numShapeKeyBits=13`, `bitsPerKey=13`, `maxKeyValue=5043`), while Axis5 leaf data still stores section indices.
  - The real template mode replaced `meshTree` but left the old sibling `simdTree`, `connectivity`, and `hasSimdTree=true` in the `hknpCompressedMeshShapeData` object. That leaves stale acceleration/connectivity data pointing at the original mesh.
- Updated `src-tauri/src/havok_mesh_encode.rs`:
  - `TemplateReplaceMode::Last` now follows `bodyCinfos -> shape -> data` and patches the referenced data object, instead of blindly replacing the last `meshTree` text field.
  - It replaces the target data object's `meshTree`, clears `simdTree`, clears `connectivity`, and sets `hasSimdTree=false`.
  - It patches the target shape's `numShapeKeyBits` and replaces `triangleIsInterior` with a zeroed bitfield sized to the generated primitive count.
  - `mesh_key_info()` now uses the primitive-key max (`total_prims - 1`) rather than the section index max.
- Regenerated the user-test HKT:
  - Output: `E:\XB\解包\com\test\_hkt_preview_single\map_hit.hkt`
  - Source: `E:\XB\解包\com\test\0x16F73C97\0\0\sssssccccc\0\sssssccccc.numshb`
  - Template: `E:\XB\解包\com\test\_hkt_template_base\base_map_hit_template.xml`
  - Size: `114072` bytes.
- HKT -> XML round-trip verification:
  - First four template shapes remained original:
    - `66/66/180/180` primitive-key meshes with `hasSimdTree=true`.
  - Last body shape was replaced:
    - `numShapeKeyBits=12`
    - `triangleIsInterior.numBits=3901`
    - `numPrimitiveKeys=3901`
    - `bitsPerKey=12`
    - `maxKeyValue=3900`
    - `hasSimdTree=false`
- Verification:
  - `cargo test havok_mesh_encode --lib` passed: 5 passed.
  - `cargo test collect_save_artifacts --lib` passed: 3 passed.

## Local PreviewTool Harness And Self-Review (2026-05-30)

- User confirmed the latest generated file still hangs and requested a complete todo list, local self-testing, and self-review.
- Replaced `docs/agent-sessions/havok-mesh-validation/todo.md` with a full evidence-driven checklist:
  - harness setup,
  - structure verifier,
  - code self-review,
  - black-box matrix,
  - candidate fixes,
  - done criteria.
- Added local tooling:
  - `scripts/hkt_preview_watchdog.ps1`
    - Launches `PreviewTool.exe` for a target HKT.
    - Requires a stable titled window containing `Havok Preview Tool`.
    - Kills the process after the timeout so failed tests do not remain running.
  - `scripts/hkt_struct_verify.ps1`
    - Converts HKT back to XML with `hctStandAloneFilterManager.exe`.
    - Reports shape/data ids, shape-key fields, mesh-tree counts, section counts, vertex counts, run counts, and `hasSimdTree`.
    - Uses UTF-8 without BOM for the temporary `.hko`; Windows PowerShell UTF-8 BOM caused Havok CLI crashes.
- Harness validation:
  - `test.hkt` baseline:
    - watchdog result: `responsive`
    - titled window: `Havok Preview Tool [StandAlone]`
  - generated `map_hit.hkt` baseline:
    - watchdog result: `timeout`
    - only untitled windows were created.

## Black-Box Matrix Findings (2026-05-30)

- Generated variants under:
  - `E:\XB\解包\com\test\_hkt_preview_single_new`
  - `E:\XB\解包\com\test\_hkt_preview_simd2`
  - `E:\XB\解包\com\test\_hkt_preview_sectionbits`
  - `E:\XB\解包\com\test\_hkt_preview_keep_simd`
  - `E:\XB\解包\com\test\_hkt_preview_no_shared`
  - `E:\XB\解包\com\test\_hkt_preview_empty_tri_bits`
  - `E:\XB\解包\com\test\_hkt_preview_single_meshnode`
  - `E:\XB\解包\com\test\_hkt_preview_leafindex`
  - `E:\XB\解包\com\test\_hkt_preview_keycount2`
- PreviewTool watchdog results:
  - `V1_box.hkt`: opens.
  - `V6_real_1section.hkt`: opens.
  - `V7_real_2sections.hkt`: opens.
  - `V16_350tris.hkt`: opens.
  - `V17_400tris.hkt`: opens.
  - `V19_500tris.hkt`: opens.
  - `V20_grid_288.hkt`: opens.
  - `V21_grid_392.hkt`: opens.
  - `V12_synth_grid.hkt` (512 tris, 8 sections): hangs.
  - `V10_1000tris_5sec.hkt` (actual 8 sections after BVH split): hangs.
  - `V11_2000tris_10sec.hkt`: hangs.
  - `V4_full.hkt`: hangs.
- Smallest tested failure pattern:
  - 500 real triangles / 4 sections opens.
  - 512 synthetic grid triangles / 8 sections hangs.
  - 1000 real triangles / 8 sections hangs.
- Candidate tests that did **not** fix the 8-section hang:
  - keeping original template `simdTree/connectivity`,
  - replacing with two inactive `simdTree` sentinel nodes,
  - switching multi-section `bitsPerKey/maxKeyValue` between primitive-key and section-key semantics,
  - disabling shared vertices,
  - setting `primitiveDataRuns.value=0`,
  - emptying `triangleIsInterior`,
  - forcing the top-level mesh tree to a single leaf node.

## Code Self-Review Findings (2026-05-30)

- Found and fixed a real structural bug:
  - Each section's `leafIndex` must point to the corresponding leaf node in the top-level Axis5 `meshTree.nodes`.
  - The original game object19 confirms this pattern: section 0 has `leafIndex=5`, matching Axis5 node 5 whose leaf data is section 0.
  - The old generator wrote `leafIndex=0` for every section.
- Updated `src-tauri/src/havok_mesh_encode.rs`:
  - After building Axis5 nodes, it maps each leaf node back to its section index.
  - `format_section_xml()` now writes the correct per-section `leafIndex`.
  - `numPrimitiveKeys` now follows the observed single-section game pattern of physical primitives * 2.
  - `primitiveDataRuns.value` now uses `0`, matching the real template samples.
  - Experimental env toggles used during diagnosis were removed after they did not improve PreviewTool behavior.
- Verification:
  - `cargo test havok_mesh_encode --lib` passed: 5 passed.
  - `cargo test collect_save_artifacts --lib` passed: 3 passed.
- Latest generated user-test file:
  - `E:\XB\解包\com\test\_hkt_preview_single\map_hit.hkt`
  - size: `205832` bytes.
  - HKT -> XML structural report written to:
    - `E:\XB\解包\com\test\_hkt_preview_single\map_hit_struct_verify.json`
    - `E:\XB\解包\com\test\_hkt_preview_single\map_hit_struct_verify.xml`
  - PreviewTool watchdog still reports `timeout`, so the final HKT is still not correct.
- Current strongest remaining lead:
  - The failure correlates with generated section count reaching 8 or more.
  - Since forcing a single top-level Axis5 node still hangs when the section array has 8 entries, the next area to audit is section-level data: per-section Axis4 node encoding, section fields, local vertex/index bounds, and exact `leafIndex/firstDataRunIndex/numDataRuns` semantics.

## Simple Sample Export For Visual Comparison (2026-05-30)

- User asked to pause the large black-box sweep and instead decode a simple existing game sample into XML + OBJ for inspection.
- Source sample:
  - `E:\XB\解包\com\test\0xBBC60B47\0\0\211stage211_object_build_b_before\map_hit.hkt`
- Output directory created:
  - `E:\TAURI_PROJECT\test\211stage211_object_build_b_before`
- Conversion command used:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File "e:\TAURI_PROJECT\scripts\hkt_struct_verify.ps1" -HktPath "E:\XB\解包\com\test\0xBBC60B47\0\0\211stage211_object_build_b_before\map_hit.hkt" -OutXmlPath "e:\TAURI_PROJECT\test\211stage211_object_build_b_before\map_hit.xml"`
  - `node "e:\TAURI_PROJECT\scripts\hkt_xml_to_obj.mjs" "e:\TAURI_PROJECT\test\211stage211_object_build_b_before\map_hit.xml" "e:\TAURI_PROJECT\test\211stage211_object_build_b_before\map_hit.obj"`
- Result files:
  - `E:\TAURI_PROJECT\test\211stage211_object_build_b_before\map_hit.xml`
  - `E:\TAURI_PROJECT\test\211stage211_object_build_b_before\map_hit.obj`
- Structure summary from the XML round-trip:
  - one `hknpCompressedMeshShape`
  - one `hknpCompressedMeshShapeData`
  - `numShapeKeyBits=4`
  - `triangleIsInteriorBits=10`
  - `numPrimitiveKeys=10`
  - `bitsPerKey=4`
  - `maxKeyValue=9`
  - `meshNodes=1`
  - `sections=1`
  - `primitives=5`
  - `packedVertices=8`
  - `sharedVerticesIndex=0`
  - `sharedVertices=0`
  - `primitiveDataRuns=1`
  - `hasSimdTree=true`
- OBJ export summary:
  - `5018` XML lines parsed
  - `1` section found
  - `8` vertices
  - `5` quads
  - `0` triangles
- This sample is intentionally simple and useful as a low-complexity inspection/template reference, but it does not exercise the multi-section failure path because it is a single-section mesh.

## Simple Single-Section Template + Game-Format Migration (2026-05-30)

- Implemented the `simple-hkt-template` plan in `src-tauri/src/havok_mesh_encode.rs`:
  - `fit_to_single_section()`: reuses `simplify_collision_mesh`, then keeps the leading
    triangle run within `MAX_SECTION_TRIS=127` / `MAX_SECTION_VERTS=255` and compacts
    vertices, so the encoder emits exactly one section with empty shared-vertex arrays.
  - `build_mesh_collision_xml_sample_template()`: `All`-mode regeneration of
    `numShapeKeyBits` / `triangleIsInterior` / `meshTree` over the simple sample export,
    then `neutralize_acceleration_payload()` empties `simdTree`, empties `connectivity`,
    and sets `hasSimdTree=false` (element type ids read back from the template).
  - New bin `src-tauri/src/bin/gen_simple_hkt.rs` (numshb + sample XML -> patched XML +
    OBJ + HKT). `HKT_FIT=full` keeps the whole mesh (multi-section); default is the
    single-section experiment.
- Black-box result:
  - Single-section file (`map_hit_sssssccccc.hkt`, 127 tris): opens in PreviewTool.
  - Full file (`map_hit_sssssccccc_full.hkt`, 31 sections, 3901 tris): **the game loads
    and recognizes it correctly**; PreviewTool still hangs.
- Decision: stop targeting PreviewTool and migrate to the game-native format.
- Shape-key migration applied in `mesh_key_info()`:
  - Was: section-key space for multi-section meshes (`bitsPerKey=5`, `maxKeyValue=30`
    while declaring `numPrimitiveKeys=7802`) — internally inconsistent, tolerated only by
    the game runtime.
  - Now: primitive-key space for all meshes (`maxKeyValue = numPrimitiveKeys - 1`,
    `bitsPerKey`/`numShapeKeyBits` cover every key), matching both game samples
    (simple `4/10/9`, complex `13/.../5043`).
  - Verified full output: `numShapeKeyBits=13`, `numPrimitiveKeys=7802`, `bitsPerKey=13`,
    `maxKeyValue=7801`; sections=31, sharedVertices=97 unchanged.
- `simdTree` / `connectivity` are left empty with `hasSimdTree=false`: a valid,
  game-accepted configuration. Authoring real ones byte-faithfully requires porting
  Havok's official `hknpCollisionMeshBuilder` and is deferred rather than guessed.
- Verification: `cargo test --lib havok_mesh_encode` passed (8 tests).
- Comparison reference: `docs/hkt-collision-format-comparison.md`.

## DSMapStudio Reference Cross-Check (2026-05-30)

- User requested a faithful migration to the game format by referencing DSMapStudio.
- Fetched the authoritative source (`soulsmods/DSMapStudio`,
  `src/HKX2/HKX2/Builders/hknpCollisionMeshBuilder.cs` + `BVH.cs`) and compared
  line-by-line with `src-tauri/src/havok_mesh_encode.rs`.
- Result: our full multi-section encoder is already **byte-identical** to the reference
  for every correctness-bearing piece — `CompressDim` (226/extent, sqrt, nibble pack),
  `BuildAxis4Tree` (leaf `prim*2`, internal `offset|0x1`), `BuildAxis5Tree` (leaf
  section idx, internal `offset/2`, hi `|0x80`, root xyz=0), 11/11/10 packed vertices,
  21/21/22 shared vertices, and the `>127 || >255` section split.
- Key reframing finding: the reference itself **dummies** the acceleration structures —
  `simdTree` is a 2-node inverted-bounds stub, `connectivity` is never built, and
  `triangleIsInterior` is `numBits=0`. There is no real `simdTree`/`connectivity`
  builder to port; a populated one only exists in Havok-SDK-exported assets.
  DSMapStudio also hardcodes `bitsPerKey=5 / maxKeyValue=30` with literal `// ?`
  comments — a FromSoftware guess that does not match this game; our primitive-key
  sizing is correct for this game.
- Actions applied:
  - `gen_simple_hkt` now defaults to the full game-faithful encode; single-section fit
    is opt-in analysis-only via `HKT_FIT=single`.
  - Doc-commented `havok_mesh_encode.rs` to cite DSMapStudio as the reference and mark
    `fit_to_single_section` analysis-only.
  - Regenerated production HKT `e:\XB\解包\com\test\map_hit_sssssccccc.hkt` (93112 bytes,
    3901 tris, 31 sections, primitive-key shape space).
- Conclusion: the faithful migration is complete; the encoder matches the reference and
  the game-native shape-key space. PreviewTool is out of scope by user decision.

## Resume-Session Verification (2026-05-30)

- Re-entered the task to verify and finalize the uncommitted faithful-migration work.
- Reviewed the in-progress diff:
  - `build_mesh_collision_xml_faithful()` is the single production entry point. It injects
    the mesh into the embedded real-game shell
    `src-tauri/assets/havok_collision_sample_template.xml` (new, ~214 KB) and neutralizes
    the acceleration payload.
  - Both production callers are migrated:
    - `havok_collision_encode.rs::generate_hkt_from_import_bytes` (DAE import path)
    - `scene_session_commands.rs::scene_generate_hkt_from_mesh` (existing-SSBH path)
  - `mesh_key_info()` is now single-arg primitive-key sizing; all call sites updated.
  - `gen_simple_hkt` defaults to full game-faithful; `HKT_FIT=single` is opt-in analysis.
  - The legacy `build_mesh_collision_xml` (box template) and the multi-arg helpers remain
    only for the diagnostic `bin/` tools (`gen_hkt_variants`, `debug_hkt_to_obj`) and tests.
- Verification commands and outcomes:
  - `cargo test --lib havok_mesh_encode` -> 9 passed (incl. new
    `faithful_builder_uses_game_shell_and_neutralizes_acceleration`).
  - `cargo test --lib collect_save_artifacts` -> 3 passed.
  - `cargo check --all-targets` -> success (lib + all bins + examples + tests); only
    pre-existing dead-code/unused warnings remain.
  - `rustfmt --check` on the four task-modified `.rs` files: clean after formatting them
    (fix applied only to those files; unrelated `examples/` fmt drift left untouched).
- Build dependency note: `havok_mesh_encode.rs` now `include_str!`s
  `assets/havok_collision_sample_template.xml`. That file is currently **untracked** (`??`)
  and not gitignored, so it MUST be committed alongside the code or the build will fail for
  anyone else.
- Status: the game-functional faithful migration is verified and build/test green. No code
  logic was changed in this resume session beyond `rustfmt`; awaiting explicit user
  confirmation before committing.

## 2026-06-04 — TDD fix for corrupt HKT visualization

User reported vertex-spike corruption after exporting ~1.7M triangle visual mesh (complexity
gate had been disabled).

Fixes:
1. Restored `validate_collision_mesh_for_hkt` (>80k tris, ineffective simplification).
2. Added `validate_havok_shared_vertex_count` / `validate_havok_section_count` in encoder.
3. Decode fail-fast in `havokXmlParser.ts` and `havok_mesh_export.rs` (no `[0,0,0]` fallback).

Tests: `cargo test validate_`, `cargo test havok_mesh_encode::tests`,
`npx vitest run src/utils/havokXmlParser.test.ts` — all green.
