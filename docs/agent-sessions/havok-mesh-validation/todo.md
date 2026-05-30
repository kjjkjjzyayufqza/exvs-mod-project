# Havok Mesh Validation Todo

## Objective

Generate a correct `map_hit.hkt` from `numshb -> mesh -> hkt` that does not hang Havok Preview Tool, using the real game XML template when useful. Do not rely on user-only manual testing; build a local evidence loop and self-review before handing off.

## Current User Evidence

- [x] User confirmed multiple generated HKT files still hang Havok Preview Tool.
- [x] User confirmed manually converting `E:\XB\解包\com\test\_hkt_template_base\base_map_hit_template.xml` to `E:\XB\解包\com\test\_hkt_preview_single\test.hkt` works.
- [x] User confirmed the latest generated `E:\XB\解包\com\test\_hkt_preview_single\map_hit.hkt` still hangs.

## Phase 1: Baseline And Harness

- [x] Read `AGENTS.md` and `.cursor/rules/custom-rules.mdc`.
- [x] Read relevant Havok docs:
  - `docs/havok_compressed_mesh_encode.md`
  - `docs/havok_compressed_mesh_decode.md`
  - `docs/havok-hkt-xml-conversion-analysis.md`
- [x] Maintain session notes in `docs/agent-sessions/havok-mesh-validation/process.md`.
- [x] Create a repeatable local PreviewTool watchdog test:
  - implemented `scripts/hkt_preview_watchdog.ps1`
  - baseline working HKT: `E:\XB\解包\com\test\_hkt_preview_single\test.hkt`
  - baseline failing HKT: `E:\XB\解包\com\test\_hkt_preview_single\map_hit.hkt`
  - baseline `test.hkt` produces a titled `Havok Preview Tool [StandAlone]` window
  - generated failing files only produce untitled visible windows until timeout
- [x] Create a CLI round-trip verifier that extracts structural HKT facts from generated XML:
  - implemented `scripts/hkt_struct_verify.ps1`
  - note: `maxKeyValue` and `primitiveDataRuns` are reported as facts, not hard-fail invariants, because real game files can use nontrivial values
- [x] Export a simple real-game sample HKT to XML + OBJ for visual comparison:
  - source: `E:\XB\解包\com\test\0xBBC60B47\0\0\211stage211_object_build_b_before\map_hit.hkt`
  - outputs: `E:\TAURI_PROJECT\test\211stage211_object_build_b_before\map_hit.xml` and `E:\TAURI_PROJECT\test\211stage211_object_build_b_before\map_hit.obj`
- [ ] Extend CLI round-trip verifier with section-level invariants:
  - target shape id and data id
  - `numShapeKeyBits`
  - `triangleIsInterior.numBits`
  - `meshTree.numPrimitiveKeys`
  - `bitsPerKey`
  - `maxKeyValue`
  - section count
  - mesh Axis5 node count and leaf keys
  - section Axis4 node counts and leaf primitive references
  - packed/shared vertex counts
  - primitive data run counts
  - `simdTree` / `hasSimdTree`

## Phase 2: Code Self-Review

- [x] Review `src-tauri/src/havok_mesh_encode.rs` against the encode spec:
  - section primitive limit
  - section packed vertex limit
  - shared vertex indexing threshold
  - packed vertex quantization
  - shared vertex quantization
  - primitive index order
  - `firstPackedVertexIndex`
  - `firstSharedVertexIndex`
  - `firstPrimitiveIndex`
  - `firstDataRunIndex`
  - `primitiveDataRuns.index/count/value`
  - mesh Axis5 branch/leaf encoding
  - section Axis4 branch/leaf encoding
  - shape key bit semantics
- [x] Review real-template injection:
  - `bodyCinfos -> shape -> data` target selection
  - object-level shape metadata consistency
  - whether replacing only the last body is correct
  - whether stale `simdTree`, `connectivity`, `properties`, or material/user-data references can poison PreviewTool
- [ ] Review `src-tauri/src/havok_mesh_export.rs` decode path against generated files:
  - generated HKT decodes back into expected triangle count
  - no missing shared vertices
  - no out-of-range primitive indices
  - no zero/collapsed sections

## Phase 3: Black-Box Test Matrix

- [x] Generate and test minimal HKT variants using the same real template:
  - original template converted by PreviewTool/manual path
  - unchanged template converted by our CLI path
  - one triangle injected into target data
  - unit box injected into target data
  - first 100 real triangles
  - first 255 real triangles
  - first 256 real triangles
  - first 300 real triangles
  - full mesh without shared vertices
  - full mesh with shared vertices
- [x] For each variant, record:
  - HKT size
  - CLI XML round-trip status
  - structural verifier output
  - PreviewTool watchdog result
- [x] Identify the smallest tested pattern that hangs:
  - 500 real triangles / 4 sections opens
  - 512 synthetic grid triangles / 8 sections hangs
  - 1000 real triangles / 8 sections hangs
  - full mesh / 31 sections hangs

## Phase 4: Fix Candidates To Validate

- [x] Test whether PreviewTool requires non-empty `simdTree` when `hasSimdTree=true/false` differs.
- [x] Test whether PreviewTool requires original-style `triangleIsInterior` bit semantics instead of zeroed bitfield.
- [x] Test whether `primitiveDataRuns.value` must be `0` versus `65535`.
- [ ] Test whether section `numPrimitives` must stay below `127` or can be `255`.
- [x] Test whether `bitsPerKey/maxKeyValue` must be section-key based or primitive-key based for multi-section meshes.
- [ ] Test whether Axis4 leaf data must be `primitive_index * 2` or raw primitive index.
- [ ] Test whether Axis5 branch offsets are using the right half-offset convention.
- [ ] Test whether every section's local primitive indices stay within `numPackedVertices + numSharedIndices`.
- [x] Test whether shared vertex encoding is the immediate cause by disabling shared vertices.
- [x] Test whether top-level Axis5 traversal is the immediate cause by forcing a single mesh node.
- [x] Fix and test section `leafIndex` to point at its Axis5 leaf node.
- [x] Test `numPrimitiveKeys = physical primitives * 2`.
- [ ] Test whether converting generated XML through PreviewTool's own GUI path differs from CLI path.

## Phase 5: Implement And Verify

- [ ] Apply the smallest evidence-backed code fix.
- [ ] Run `cargo fmt`.
- [ ] Run `cargo test havok_mesh_encode --lib`.
- [ ] Run `cargo test collect_save_artifacts --lib`.
- [ ] Regenerate `E:\XB\解包\com\test\_hkt_preview_single\map_hit.hkt`.
- [ ] Run CLI HKT -> XML round-trip verifier.
- [ ] Run PreviewTool watchdog on working baseline and generated output.
- [x] Perform interim self-review:
  - no unrelated code changes
  - no dead experimental path left active
  - docs/process updated with commands and evidence
  - remaining uncertainty explicitly stated

## Done Criteria

- [ ] The generated `map_hit.hkt` opens in local Havok Preview Tool without watchdog timeout.
- [ ] The generated HKT round-trips to XML through Havok CLI.
- [ ] The structural verifier reports no invalid section/tree/index/key invariants.
- [ ] The implementation is covered by focused tests and session documentation.
