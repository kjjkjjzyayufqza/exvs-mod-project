# SSBH Model Optimization Analysis Process

## Goal

Analyze how `D:\rpcs3\tools\StudioSB-master` rewrites SSBH models to substantially
smaller files while preserving model data, then produce an implementation-ready
plan for changing this project's core SSBH logic.

## Startup Context

- Read `AGENTS.md`.
- Read `.cursor/rules/custom-rules.mdc`.
- Read relevant existing SSBH and Scene Editor design/session documents.
- Read the `code-tour` and `improve-codebase-architecture` skill instructions.
  Their required artifact formats do not match the requested `plan.md`, so this
  task uses direct source analysis while retaining their evidence-first approach.
- Confirmed the current project CodeGraph index is healthy.
- Confirmed StudioSB has no CodeGraph index; analysis of that external repository
  is read-only and uses native C# project/symbol inspection.

## StudioSB Findings

- `SBSceneSSBH.ExportSceneToFile` calls
  `MESH_Loader.CreateMESH` and then saves the newly constructed mesh.
- `MESH_Loader` reads semantic attributes and indices into `SBUltimateMesh`.
  The save path copies those values into `SsbhMeshMaker`.
- The customized `SsbhMeshMaker.GetMeshFile` creates buffer0, buffer1, and the
  polygon buffer. It sets buffer2 and buffer3 to empty.
- The customized `UltimateVertexAttribute` uses float data for the sampled EXVS2
  layout. Compact half-float or byte encodings are not the measured mechanism.
- No vertex deduplication or index remapping was found in the numshb-to-numshb
  path.
- StudioSB's checked-in `SSBHLib.dll` is modified relative to the repository.
  Matching decompiled source exists at `D:\rpcs3\tools\反编译_SSBHLib_dll`.
- The decompiled serializer contains broad Gundam-specific hacks. The plan does
  not recommend copying those wholesale.

## Current Rust Core Findings

- The application depends on the `wmmt2` branch of
  `https://github.com/kjjkjjzyayufqza/ssbh_lib`.
- The lockfile revision analyzed was
  `8bbe8e2d58009ca860d91ff5cfb79e8aec1191a6`.
- `dae_to_ssbh.rs` creates Mesh v1.8 with `is_vs2: true` and uses normal
  `MeshData::write_to_file`.
- Mesh v1.8 attribute generation still sets `use_buffer2: true`.
- The writer appends `32 * vertex_count` zero bytes to buffer2.
- For v1.8, `is_vs2` does not affect attribute records, so it does not remove
  this payload.
- The fork also forces `DrawElementType::UnsignedShort`; the implementation plan
  requires restoring lossless 16/32-bit selection.

## Binary Measurements

### `D:\output\anti-L\anti_L.numshb`

- File size: 130,240 bytes.
- Objects: 3.
- Total vertices: 828.
- Buffer sizes: `[59,616, 26,496, 26,496, 0]`.
- buffer2 non-zero bytes: 0.
- `26,496 = 828 * 32`.

A temporary copy was saved after changing only buffer2 to empty:

- Output size: 103,744 bytes.
- Saved: 26,496 bytes (`20.34%`).
- Reparse succeeded.
- Object count remained 3.
- Buffer0 remained 59,616 bytes.
- Buffer1 remained 26,496 bytes.
- Buffer2 became zero length.
- Temporary output:
  `C:\Users\kjjkjj\AppData\Local\Temp\anti_L_no_buffer2.numshb`.

### Other samples

- `D:\output\exvs2\zaku-ii-kai\1.numshb`
  - Size: 1,382,912 bytes.
  - Buffers: `[836,784, 371,904, 0, 0]`.
  - StudioSB-style empty buffer2.
- `E:\XB\解包\com\file\0x2A96A016\model.numshb`
  - Size: 7,680,904 bytes.
  - Objects: 52.
  - Buffers: `[3,737,736, 1,661,216, 1,661,216, 0]`.
  - buffer2 is entirely zero.

The common sampled attribute layout is:

```text
Position0  buffer0 offset 0
Normal0    buffer0 offset 12
Tangent0   buffer0 offset 24
Tangent1   buffer0 offset 36
Tangent2   buffer0 offset 48
Tangent3   buffer0 offset 60
map1       buffer1 offset 0
uvSet      buffer1 offset 8
colorSet1  buffer1 offset 16
```

Typical strides are buffer0 `72`, buffer1 `32`, and the current dummy buffer2
`32`. Removing buffer2 changes vertex-buffer payload from 136 to 104 bytes per
vertex, a `23.53%` payload reduction.

## Conclusions

1. The verified optimization is semantic reconstruction plus omission of
   unreferenced buffers, not vertex deduplication.
2. The immediate core defect is the unconditional v1.8/v1.9 dummy buffer2.
3. The optimized behavior should be opt-in through an explicit write profile.
4. The first phase must preserve float precision, attributes, indices, rigging,
   names, subindices, and bounds.
5. Reports of files becoming several times smaller need a verified
   source/output pair. The measured buffer2 removal alone does not establish
   that ratio.
6. Known stage files near 1 GB must be tested manually. Parsing them in normal
   tests would create unacceptable memory and runtime cost.

## Deliverable

- `docs/agent-sessions/ssbh-model-optimization/plan.md`

## Workspace State

- Main repository changes are limited to this session folder.
- StudioSB already had unrelated modified files before analysis:
  `SBSceneSSBH.cs`, `SwitchSwizzler.cs`, and `lib/SSBHLib.dll`.
- The external repositories were inspected read-only and were not modified.

---

# Implementation Record (2026-06-13)

## SSBH fork change

- Repository: `E:\research\ssbh_lib`, branch `wmmt2`.
- Old revision: `8bbe8e2d58009ca860d91ff5cfb79e8aec1191a6`.
- New local commit: `212e317cc317865afbe682d76ff268b919b9bf5f`
  (`feat(mesh): add MeshWriteProfile with EXVS2 canonical buffer2 omission`).
- Files: `ssbh_data/src/mesh_data.rs`, `ssbh_data/src/mesh_data/mesh_attributes.rs`,
  new test-only `ssbh_data/src/mesh_data/semantic_compare.rs` and
  `ssbh_data/src/mesh_data/write_profile_tests.rs`.
- `MeshWriteProfile::LegacyCompatible` keeps byte-identical output for all
  existing callers (`TryFrom`, `SsbhData::write_to_file`); verified by a
  byte-comparison test across v1.8/v1.9/v1.10.
- `MeshWriteProfile::Vs2Canonical` omits the v1.8/v1.9 dummy buffer2 and
  errors with `AttributeReferencesOmittedBuffer` if a future layout actually
  references buffer 2 or 3.
- Index serialization now selects `UnsignedShort`/`UnsignedInt` losslessly
  from the actual index values for both profiles; the previous code wrote
  4-byte indices while forcing a 2-byte header type for indices above
  `u16::MAX`. `VertexIndexOutOfRange` now carries the object name.

## Deviations from plan.md (evidence-driven)

1. **`stride2` stays 32 under the canonical profile (plan said zero).**
   The StudioSB-written canonical file `D:\output\exvs2\zaku-ii-kai\1.numshb`
   has `stride2 = 32` and `vertex_buffer2_offset == vertex_buffer1_offset`
   on every object while the file-level buffer size is 0 and buffer2 is
   empty. The decompiled `SsbhMeshMaker` confirms this: positional field
   mapping shows `Unk6 = 0x20` is `stride2` (annotated "gundam need it") and
   `FinalBufferOffset` (= `vertex_buffer2_offset`) is assigned buffer1's
   running offset. The implementation matches the verified file, not the
   plan text. For the standard EXVS2 layout (stride1 = 32) the resulting
   offsets are identical to the legacy accumulation anyway.
2. **The plan's 9-attribute / stride1 32 sample is stale.**
   `anti_L.numshb` (2025-10-31) predates the DAE exporter (first commit
   `c14972d`, 2026-03-26). The application has always written 10 attributes
   since DAE export existed: buffer0 `Position, Normal, Binormal0, Tangent0,
   Binormal1, Tangent1` (stride 72) and buffer1 `TextureCoordinate,
   ColorSet0, ColorSet1, HalfFloat2 (Float4)` (stride 40). Task 5 locks the
   current production layout in `exvs2_attribute_layout_locked`.
3. **Tests live in the unit-test modules**, not `ssbh_data/tests/`; the
   plan explicitly allows this and the repository has no `tests/` layout.
4. **Five pre-existing test failures at the old revision** (stale
   expectations from earlier VS2 fork behavior changes: Float4 tangents,
   u32 v1.10 weight indices, forced subindex 0) were updated to assert the
   current intended fork behavior so the suite runs green.

## Benchmark matrix (local real files)

| File | Input bytes | Legacy rewrite | Canonical rewrite | Saved vs legacy | Semantic check |
|---|---:|---:|---:|---:|---|
| `D:\output\anti-L\anti_L.numshb` (3 objects, 828 verts) | 130,240 | 130,240 | 103,744 | 26,496 (20.34%) | legacy reparse == canonical reparse |
| `E:\XB\解包\com\file\0x2A96A016\model.numshb` (52 objects, 51,913 verts) | 7,680,904 | 7,680,904 | 6,019,688 | 1,661,216 (21.63%) | legacy reparse == canonical reparse |
| `D:\output\exvs2\zaku-ii-kai\1.numshb` (StudioSB canonical, 3 objects, 11,622 verts) | 1,382,912 | 1,754,816 | 1,382,912 | 371,904 (21.19%) | legacy reparse == canonical reparse |
| `D:\output\minecraft\slic\Stationary_Water.fbx` (full FBX pipeline, 38 split objects, 2,490,152 verts) | 17,373,644 (fbx) | 366,072,048 | 286,387,184 | 79,684,864 (21.77%) | legacy reparse == canonical reparse |

The `Stationary_Water` row is an end-to-end conversion through the
production `convert_fbx_file` path (1.24 s convert time): the canonical
profile dropped the dummy buffer2 from `[179,290,944, 99,606,080,
79,684,864, 0]` to `[179,290,944, 99,606,080, 0, 0]`, saving 76 MB. The
`.numshb` is larger than the source FBX because the EXVS2 layout expands
every vertex to 104 bytes and generates binormal/tangent/HalfFloat2/color
attributes that the FBX does not store.

- The legacy profile reproduces the byte count of both legacy-style inputs
  exactly, and the canonical rewrite of the StudioSB file reproduces its
  byte count exactly.
- Field-level comparison of original parse vs canonical reparse showed the
  only differences are generated v1.8 binormal/tangent attribute names
  (`Binormal0/Binormal0` in old files vs `Binormal0/Binormal1` rewritten).
  v1.8 files store no attribute names; the rewritten subindex sequence
  `0,0,1,1` matches StudioSB's zaku output. No position, index, UV, color,
  or rigging bits changed.
- Large ~1 GB stage samples were intentionally not benchmarked in this
  pass; they require a separate manual run per the plan.

## Application change

- `src-tauri/src/ssbh_dae/dae_to_ssbh.rs`: only the `.numshb` write now
  uses `write_to_file_with_profile(&mesh_path, MeshWriteProfile::Vs2Canonical)`;
  `.numdlb`/`.nusktb` writes are unchanged. Mesh stays v1.8.
- New test `exported_numshb_uses_canonical_profile_without_dummy_buffer2`
  exports a scene, asserts file-level buffer2 size 0, `stride2 == 32`,
  `vertex_buffer2_offset == vertex_buffer1_offset`, no attribute references
  buffer >= 2, and bit-identical attribute data after reparse.
- Unrelated pre-existing build break fixed: `perf_preview_hkt.rs` and
  `gen_hkt_variants.rs` were missing the new `quad_merge_enabled` field of
  `CollisionSimplifyOptions` (set to `false` to preserve those debug bins'
  original behavior).

## Verification

- Fork: `cargo test -p ssbh_data` — 221 lib + 16 doc tests pass; clippy
  clean in changed mesh files (one pre-existing `% 3` idiom fixed).
- App (against the local fork via a temporary, uncommitted `[patch]`):
  `cargo test ssbh_dae` 11 passed, `cargo test ssbh_mesh_binary` 3 passed,
  `cargo check` passes.

## Pending (requires user approval / manual action)

- Push fork commit `212e317c` to `origin/wmmt2` (external push requires
  explicit approval per plan).
- After push: remove the temporary `[patch]` from `src-tauri/Cargo.toml`,
  run `cargo update -p ssbh_data -p ssbh_lib`, confirm all four SSBH
  workspace packages resolve to `212e317c`, re-run tests, then commit the
  application change.
- In-game validation of a representative canonical export.
