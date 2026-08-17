# SSBH Model Canonical Write Optimization Plan

> **STATUS (2026-07-26): IMPLEMENTED IN FORK, REVERTED IN PRODUCTION.**
> The `MeshWriteProfile` work was implemented in the fork (now on the pinned
> dependency branch `wmmt2-merge`) and the application opt-in shipped in
> commit 5375831 — but canonical output broke in-game meshes (skin stretching,
> missing mesh objects), so the app change was deliberately REVERTED in
> commit a60621f. Production hard-codes legacy `write_to_file`; see the
> "Do NOT switch to Vs2Canonical" comment at
> `src-tauri/src/ssbh_dae/dae_to_ssbh.rs:103-107` and the `#[ignore]`d
> canonical-profile test (~line 979). Any revival requires root-cause
> investigation (in-game capture + IDA) and explicit user approval first.

> **For implementation agents:** Execute this plan in order. Do not enable the
> optimized writer in the application until the dependency-level semantic
> equivalence tests pass. Keep the legacy writer available for rollback.

**Goal:** Add an explicit EXVS2 canonical mesh write profile to the Rust SSBH
core so generated `.numshb` files omit provably unused data, preserve all model
semantics, select a lossless index width, and match the compact reconstruction
behavior verified in StudioSB.

**Primary finding:** StudioSB does not run a vertex-deduplication algorithm.
It parses the source mesh into semantic vertices, indices, attributes, and
rigging, then creates a new `Mesh` from those semantics. Its customized
`SsbhMeshMaker` writes buffer0, buffer1, and the polygon buffer, while setting
buffer2 and buffer3 to empty. The current Rust fork writes an additional
32-byte all-zero buffer2 record for every vertex in Mesh v1.8 and v1.9.

**Architecture:** Preserve the existing `SsbhData::write_to_file` and
`TryFrom<&MeshData>` behavior as the compatibility path. Add an explicit
`MeshWriteProfile` and profile-aware conversion/write API. The application must
opt in with `MeshWriteProfile::Vs2Canonical`; other callers remain unchanged.
The profile is resolved into small internal policies for dummy buffers,
attribute metadata, subindices, and index width instead of adding more
unrelated `is_vs2` conditionals.

**Repositories involved:**

1. SSBH fork: `https://github.com/kjjkjjzyayufqza/ssbh_lib`, branch `wmmt2`.
2. Application: `E:\TAURI_PROJECT`.

**Current dependency revision:** `8bbe8e2d58009ca860d91ff5cfb79e8aec1191a6`.

---

## Verified Evidence

### StudioSB write path

1. `StudioSB/Scenes/Ultimate/SBSceneSSBH.cs:253` calls
   `MESH_Loader.CreateMESH`.
2. `StudioSB/Scenes/Ultimate/Loaders/MESH_Loader.cs:269-464` copies semantic
   attributes, indices, and rigging into `SsbhMeshMaker`.
3. `D:\rpcs3\tools\反编译_SSBHLib_dll\SsbhLib.Tools\SsbhMeshMaker.cs:315-344`
   sets:

   ```text
   BufferSizes = [buffer0 length, buffer1 length, 0, 0]
   VertexBuffers = [buffer0, buffer1, empty, empty]
   ```

4. `SBSceneSSBH.cs:257` saves the newly constructed mesh.
5. The customized StudioSB `UltimateVertexAttribute` uses float attributes for
   the sampled EXVS2 layout. Half-float or byte quantization is not responsible
   for the measured reduction.
6. No vertex lookup table, hash-based merge, or index remapping occurs in this
   path. Vertex count and index order are copied from the semantic model.

### Current Rust write path

1. `src-tauri/src/ssbh_dae/dae_to_ssbh.rs:560-565` constructs Mesh v1.8 with
   `is_vs2: true`.
2. `src-tauri/src/ssbh_dae/dae_to_ssbh.rs:99` uses the normal
   `MeshData::write_to_file` path.
3. `ssbh_data/src/mesh_data/mesh_attributes.rs:66-118` creates v1.8 attributes
   and currently returns `use_buffer2: true`.
4. `ssbh_data/src/mesh_data.rs:1016-1020` writes
   `stride2 * vertex_count` zero bytes to buffer2.
5. The v1.8 attribute writer explicitly states that `is_vs2` does not otherwise
   affect v1.8 attributes. Therefore the current flag does not remove this
   payload.
6. `ssbh_data/src/mesh_data.rs:986` forces `UnsignedShort` even though the
   surrounding code already has both `UnsignedShort` and `UnsignedInt`
   representations. This must be corrected before claiming general lossless
   output.

### Measured files

| File | Total bytes | Vertex buffers | buffer2 contents | Notes |
|---|---:|---|---|---|
| `D:\output\anti-L\anti_L.numshb` | 130,240 | 59,616 / 26,496 / 26,496 / 0 | all zero | Current-style output, 828 vertices |
| Temporary rewrite of `anti_L` | 103,744 | 59,616 / 26,496 / 0 / 0 | empty | Reparsed successfully |
| `D:\output\exvs2\zaku-ii-kai\1.numshb` | 1,382,912 | 836,784 / 371,904 / 0 / 0 | empty | StudioSB-style canonical output |
| `E:\XB\解包\com\file\0x2A96A016\model.numshb` | 7,680,904 | 3,737,736 / 1,661,216 / 1,661,216 / 0 | all zero | 52 objects |

For the `anti_L` sample, deleting only buffer2 reduced the file by exactly
26,496 bytes, from 130,240 to 103,744 bytes (`20.34%`). The semantic vertex
payload changed from 136 bytes per vertex to 104 bytes per vertex, a `23.53%`
reduction in vertex-buffer payload.

The available evidence proves a deterministic and substantial reduction. It
does not prove that this one mechanism explains every report of files becoming
several times smaller. A source/output pair exhibiting that ratio must be
measured before adding more destructive normalization.

---

## Semantic Preservation Contract

Optimized output is allowed to differ byte-for-byte from the input. It is not
allowed to differ in model behavior. Tests and benchmark tooling must compare
the following after reparsing both files:

- Mesh major/minor version.
- Object count and object order.
- Object name, subindex, and parent bone.
- Vertex count and exact index sequence.
- Index values and triangle topology.
- Attribute count, usage, subindex/name, component count, and logical order.
- Every position, normal, tangent, binormal, UV, and color `f32` bit pattern for
  the first optimization phase.
- Rigging group count, bone names, vertex indices, and weights.
- Bounding sphere, AABB, and oriented bounding box values.
- MODL mesh name/subindex references when validating an application export set.

Raw padding, relative offsets, zero-only unreferenced buffers, and serializer
ordering metadata are not semantic.

The first implementation must not introduce half-float conversion, color
quantization, vertex merging, normal regeneration, tangent regeneration, or
attribute deletion.

---

## Target API

Add a profile-aware API in `ssbh_data` without silently changing existing
callers:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MeshWriteProfile {
    LegacyCompatible,
    Vs2Canonical,
}

impl MeshData {
    pub fn to_mesh_with_profile(
        &self,
        profile: MeshWriteProfile,
    ) -> Result<ssbh_lib::formats::mesh::Mesh, error::Error>;

    pub fn write_to_file_with_profile<P: AsRef<std::path::Path>>(
        &self,
        path: P,
        profile: MeshWriteProfile,
    ) -> Result<(), error::Error>;
}
```

Exact module paths may follow the fork's existing public exports. The behavioral
requirements are:

| Policy | `LegacyCompatible` | `Vs2Canonical` |
|---|---|---|
| v1.8/v1.9 dummy buffer2 | Preserve current behavior | Do not emit |
| v1.10 buffer2 | Preserve current behavior | Preserve valid empty behavior |
| Attribute precision | Preserve current behavior | Preserve current EXVS2 float data |
| Attribute names | Preserve current `is_vs2` behavior initially | EXVS2 canonical behavior |
| Index width | Smallest lossless width | Smallest lossless width |
| Subindices | Preserve data | Preserve data unless a separate validated rule exists |
| Unknown semantic fields | Preserve | Preserve |

`TryFrom<&MeshData> for Mesh` and normal `write_to_file` should call the legacy
profile during the compatibility phase. Do not infer the optimized profile from
`is_vs2`; the application call site must opt in explicitly.

---

## File Changes

### SSBH fork

| File | Change |
|---|---|
| `ssbh_data/src/mesh_data.rs` | Add write profile, profile-aware conversion/write methods, profile propagation, and lossless index selection |
| `ssbh_data/src/mesh_data/mesh_attributes.rs` | Make dummy buffer2 use an explicit profile policy; retain existing attribute layout |
| `ssbh_data/src/lib.rs` | Re-export the profile if needed and document compatibility behavior |
| `ssbh_data/tests/mesh_write_profiles.rs` | Add public-API integration tests if the repository test layout supports it |
| Existing mesh unit-test modules | Update/add focused buffer, index, round-trip, and compatibility tests |

### Application

| File | Change |
|---|---|
| `src-tauri/src/ssbh_dae/dae_to_ssbh.rs` | Use `write_to_file_with_profile(..., Vs2Canonical)` for `.numshb` only |
| `src-tauri/src/ssbh_mesh_binary.rs` | Update test constructors only if the dependency API changes; add no implicit optimization |
| `src-tauri/Cargo.toml` | Continue using the `wmmt2` fork; no temporary path dependency in committed code |
| `src-tauri/Cargo.lock` | Pin the reviewed fork commit containing the profile implementation |
| `docs/agent-sessions/ssbh-model-optimization/process.md` | Record final benchmark matrix and game/runtime validation |

Do not add frontend controls in the first implementation. EXVS2 mesh exports
should use the canonical profile centrally at the Rust write boundary.

---

## Task 1: Freeze Baselines and Add a Semantic Comparator

**Repository:** SSBH fork

- [ ] Add a test-only `assert_mesh_data_semantically_equal` helper.
- [ ] Compare every field listed in the semantic preservation contract.
- [ ] Compare float attributes with `to_bits()` for phase one.
- [ ] Include object and attribute names in assertion messages.
- [ ] Add a helper that extracts raw buffer lengths from the generated
  `ssbh_lib::Mesh`.
- [ ] Add a helper that verifies no attribute references a buffer before a test
  treats that buffer as removable.

**Required tests:**

- [ ] Equal meshes pass.
- [ ] A changed index fails with object context.
- [ ] A changed vertex attribute fails with object/attribute context.
- [ ] A changed rigging influence fails.
- [ ] Object reordering fails.

**Checkpoint:** No production behavior changes.

---

## Task 2: Introduce the Explicit Write Profile

**Files:**

- Modify `ssbh_data/src/mesh_data.rs`.
- Modify `ssbh_data/src/lib.rs` only if required for exports/docs.

- [ ] Add `MeshWriteProfile`.
- [ ] Change the private `create_mesh` path to accept a profile.
- [ ] Add `to_mesh_with_profile`.
- [ ] Add `write_to_file_with_profile`.
- [ ] Keep `TryFrom<MeshData>`, `TryFrom<&MeshData>`, and
  `SsbhData::write_to_file` mapped to `LegacyCompatible`.
- [ ] Keep `MeshData::is_vs2` temporarily for source compatibility and existing
  v1.9/v1.10 attribute naming behavior.
- [ ] Document that `is_vs2` describes format naming conventions while the
  write profile selects serialization policy.
- [ ] Do not add a default `Vs2Canonical` implementation.

**Required tests:**

- [ ] Existing legacy snapshots remain unchanged.
- [ ] Calling the new API with `LegacyCompatible` produces the same raw buffers
  as the old API.
- [ ] Calling the new API does not mutate `MeshData`.

---

## Task 3: Remove the Unused EXVS2 Dummy Buffer

**Files:**

- Modify `ssbh_data/src/mesh_data/mesh_attributes.rs`.
- Modify `ssbh_data/src/mesh_data.rs`.

- [ ] Replace the hardcoded v1.8/v1.9 `use_buffer2` decision with a profile
  policy.
- [ ] For `Vs2Canonical`, set `use_buffer2` to false when no attribute references
  buffer2.
- [ ] Set `stride2` to zero for the optimized object.
- [ ] Do not write zero bytes to `buffers[2]`.
- [ ] Keep `vertex_buffer2_offset` structurally valid according to the existing
  serializer. An empty buffer may share the current end offset.
- [ ] Set the file-level third buffer size to zero.
- [ ] Keep buffer3 unchanged.
- [ ] Preserve buffer0, buffer1, polygon, and rigging data.
- [ ] Return an error rather than dropping buffer2 if a future attribute layout
  actually references it.

**Required tests:**

- [ ] v1.8 legacy profile emits `32 * vertex_count` buffer2 bytes.
- [ ] v1.8 VS2 profile emits a zero-length buffer2.
- [ ] v1.9 legacy profile retains current behavior.
- [ ] v1.9 VS2 profile emits a zero-length buffer2 only when unreferenced.
- [ ] v1.10 behavior remains unchanged.
- [ ] Optimized v1.8 output reparses successfully.
- [ ] Original `MeshData` and reparsed optimized `MeshData` are semantically
  equal.
- [ ] Buffer0, buffer1, polygon indices, and rigging values are unchanged.
- [ ] File-size reduction equals the removed buffer2 length except for any
  documented serializer alignment difference.

**Acceptance example:** A synthetic 828-vertex mesh with stride2 32 removes
exactly 26,496 bytes of vertex data.

---

## Task 4: Make Index Serialization Lossless

**File:** `ssbh_data/src/mesh_data.rs`

The current fork calculates a `VertexIndices` variant and then forces
`DrawElementType::UnsignedShort`. This is unsafe for a general core writer.

- [ ] Select `UnsignedShort` only when every index is `<= u16::MAX`.
- [ ] Select `UnsignedInt` otherwise.
- [ ] Set `draw_element_type` from the selected `VertexIndices` variant.
- [ ] Write two bytes per index for `UnsignedShort`.
- [ ] Write four bytes per index for `UnsignedInt`.
- [ ] Set index-buffer offsets and file-level polygon size from actual bytes.
- [ ] Reject indices outside the object's vertex range before serialization.
- [ ] Keep index order unchanged.

**Required tests:**

- [ ] Maximum index 65,535 uses `UnsignedShort` and round-trips.
- [ ] Maximum index 65,536 uses `UnsignedInt` and round-trips.
- [ ] An out-of-range index returns an error with object name and index value.
- [ ] Small meshes remain 16-bit and do not grow.
- [ ] Existing application split-mesh tests still pass.

This task is a correctness prerequisite. It is not permission to merge vertices
or reorder triangles.

---

## Task 5: Lock Down Canonical EXVS2 Attribute Behavior

**Files:**

- Modify tests around `ssbh_data/src/mesh_data/mesh_attributes.rs`.
- Change production attribute code only when a failing test proves a mismatch.

- [ ] Define the expected EXVS2 v1.8 attribute sequence for the application's
  current output:
  `Position0`, `Normal0`, `Tangent0`, `Tangent1`, `Tangent2`, `Tangent3`,
  `map1`, `uvSet`, `colorSet1`.
- [ ] Assert buffer assignments and offsets.
- [ ] Assert the sampled canonical strides: buffer0 `72`, buffer1 `32`.
- [ ] Assert the current `f32` storage type for each attribute.
- [ ] Assert that the profile does not remove an attribute merely because all
  values are zero.
- [ ] Assert that subindices and object names survive round-trip.

Do not copy StudioSB's hardcoded `isGundam = true`, reflection property-count
checks, or unconditional metadata omission. Those are implementation artifacts,
not a stable format contract.

---

## Task 6: Integrate the Profile at the Application Write Boundary

**File:** `src-tauri/src/ssbh_dae/dae_to_ssbh.rs`

- [ ] Import `MeshWriteProfile`.
- [ ] Replace only the `.numshb` call:

  ```rust
  mesh_data.write_to_file_with_profile(
      &mesh_path,
      MeshWriteProfile::Vs2Canonical,
  )?;
  ```

- [ ] Leave `.numdlb` and `.nusktb` writes unchanged.
- [ ] Keep Mesh version `1.8`.
- [ ] Keep the existing nine-attribute EXVS2 layout unchanged.
- [ ] Add a test that exports a small scene, parses the `.numshb`, and asserts
  file-level buffer2 size is zero.
- [ ] Assert the exported file's semantic data matches the pre-write
  `MeshData`.
- [ ] Add a test with enough vertices/indices to exercise the selected index
  width or reuse the existing split-mesh fixture where appropriate.

No UI option is required because this path already represents an EXVS2 export.

---

## Task 7: Build the Regression and Benchmark Matrix

Use generated test fixtures in source control. Keep private or very large game
files outside the repository and record only paths, hashes, aggregate metrics,
and results in `process.md`.

### Automated fixtures

- [ ] Single rigid mesh.
- [ ] Skinned mesh with multiple bones.
- [ ] Multiple mesh objects and subindices.
- [ ] All nine canonical EXVS2 attributes.
- [ ] Non-zero tangent/binormal/color values.
- [ ] Empty optional attribute collections.
- [ ] 16-bit index boundary.
- [ ] 32-bit index boundary.
- [ ] Mesh v1.8, v1.9, and v1.10 compatibility cases.

### Local real-file checks

- [ ] `D:\output\anti-L\anti_L.numshb`.
- [ ] A multi-object skinned model.
- [ ] A StudioSB-exported canonical model.
- [ ] One large stage model, tested manually rather than in unit tests.

For each file, record:

```text
input bytes
output bytes
ratio
object count
vertex count
index count
buffer sizes before/after
attribute layout
semantic comparator result
parse result
in-game result
```

Do not load the known 948 MB or 1.26 GB stage samples in normal unit tests.
Large-file validation must be an explicit manual benchmark because parsing and
semantic comparison can require several times the file size in memory.

---

## Task 8: Update and Pin the Dependency

**Files:**

- Modify `src-tauri/Cargo.lock`.
- Modify `src-tauri/Cargo.toml` only if the branch or package declaration changes.

- [ ] Implement and test the SSBH fork change on `wmmt2`.
- [ ] Review the fork diff for unrelated serializer behavior.
- [ ] Commit the fork change.
- [ ] Update the application lockfile to the reviewed commit.
- [ ] Confirm all four SSBH workspace packages resolve to the same commit:
  `ssbh_data`, `ssbh_lib`, `ssbh_write`, and `ssbh_write_derive`.
- [ ] Do not commit a local `path` dependency.
- [ ] Record the old and new commit hashes in `process.md`.

External push or pull-request creation requires explicit user approval.

---

## Task 9: Verification Commands

Run the narrowest commands first.

### SSBH fork

```powershell
cargo test -p ssbh_data mesh_data
cargo test -p ssbh_data --test mesh_write_profiles
cargo test -p ssbh_data
cargo fmt --all -- --check
cargo clippy -p ssbh_data --all-targets -- -D warnings
```

Omit the integration-test command if tests remain in the existing unit module.

### Application

```powershell
cargo test --manifest-path src-tauri/Cargo.toml ssbh_dae
cargo test --manifest-path src-tauri/Cargo.toml ssbh_mesh_binary
cargo check --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

Run the repository's configured Rust audit command before committing if the
environment has the required audit tool and advisory database.

### Diff review

```powershell
git diff --check
git diff -- src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/ssbh_dae/dae_to_ssbh.rs
```

Review the SSBH fork diff separately. Do not mix application and dependency
changes into one repository commit.

---

## Acceptance Criteria

- [ ] Existing callers of normal `MeshData::write_to_file` retain legacy output.
- [ ] The application explicitly uses `Vs2Canonical` for EXVS2 `.numshb`.
- [ ] EXVS2 v1.8 output has buffer sizes `[buffer0, buffer1, 0, buffer3]` when
  no attribute references buffer2.
- [ ] No attribute references an omitted buffer.
- [ ] Semantic comparison passes after write and reparse.
- [ ] Float attribute values are bit-exact in phase one.
- [ ] Indices are never truncated.
- [ ] Small indices use 16-bit storage; large indices use 32-bit storage.
- [ ] `anti_L` or an equivalent 828-vertex fixture saves 26,496 buffer bytes.
- [ ] The optimized file parses in both the Rust library and StudioSB.
- [ ] Representative output loads correctly in the target game.
- [ ] No vertex deduplication or precision reduction is included.
- [ ] No new `TODO` or `FIXME` markers are added.

---

## Rollback

The application rollback is one call-site change:

```rust
mesh_data.write_to_file(&mesh_path)
```

The core `LegacyCompatible` profile remains available throughout rollout. If a
runtime incompatibility appears, revert the application opt-in without removing
the tested profile implementation or changing the dependency's normal writer.

---

## Deferred Work

These changes require separate evidence and must not be bundled into the first
optimization:

- Removing unknown mesh metadata.
- Normalizing all object subindices to zero.
- Removing all-zero semantic attributes.
- Converting float attributes to half-float or byte formats.
- Vertex deduplication and index remapping.
- Reordering vertices or triangles for cache locality.
- Compressing rigging data.
- Adding an arbitrary-file "Optimize SSBH" UI command.

If a verified source/output pair still shrinks by several times after buffer2
is accounted for, add a second investigation phase that produces a per-section
binary size diff before selecting any deferred optimization.

