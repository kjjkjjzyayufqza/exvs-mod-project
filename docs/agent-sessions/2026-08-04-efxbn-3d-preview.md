# EFXBN 3D Preview

## Goal

Add a Blender-like 3D preview to Test Editor effect details by reusing the Unit Model Editor Three.js pipeline. Keep texture preview unchanged and support both EFXBN entries and plain model entries.

## Evidence

- The on-disk effect block is `0x370` bytes and is byte-for-byte the shader-reflected
  `SEfxElementData` (`0x370`/880 bytes), so block offsets and reflected offsets are the
  same number. **Superseded claim:** an earlier note in this file described an "eight-byte
  runtime prefix" and a `+8` mapping. That was an artifact of the parser starting the block
  region at `0x20` instead of `0x18`; see
  `docs/agent-sessions/2026-08-08-efxbn-format-rederivation.md`.
- `fxc /dumpbin`, YYadorigi, etnlgd/3DMigoto, and spacehamster/DXDecompiler independently agree on the reflected structures and DXBC instruction offsets. All 44 named EFX compute shaders were extracted; all 44 produced YYadorigi HLSL.
- Spawn and kinetic shaders prove the LCG (`1664525*x + 1013904223`), lifetime/interval/size randomization (`base * (1 + signedRandom * rate)`), frame counters, wrapper-to-target spawn requests, per-particle curve time, gravity, direction acceleration, wind/water gates, and billboard/model/strip field use.
- The base Face PS samples `colorMap * particleColor`, discards alpha below `0.01`, and halves RGB unless the `0x40000` feature is set. Source-external textures intentionally use a neutral radial fallback.
- Three independent decompilers produce the same base Model PS: `EfxColorMap * vertex/particle color`, alpha cutoff `0.01`, and the same half-RGB gate. It is an unlit EFX path, not the source model's NUMATB/PBR material path.
- The draw shader database contains a factored Model/Face feature matrix. `ColorEx` adds UV-offset and frame-buffer sampling, `MultiUV` adds pass-2 color/offset maps, `Light` adds normal/IBL/effect-directional-light evaluation, and `Soft` adds depth-map intersection fade. `HLight` leaves the base PS unchanged and is driven by another stage or renderer state.
- Compute HLSL proves atlas state is packed into two 16-bit lanes: flag `0x1` loops, flag `0x2` randomizes the per-particle starting frame, authored start frames are 1-based, pattern `3` selects a static random atlas cell, and reverse enum `2` is a per-particle random flip.
- v27 CPU analysis proves runtime offsets and feature gates for action flags, z-test, z-write, soft particles, lighting, and blend state. Mapping blend enum `2` to additive remains a renderer-state inference (supported by the old prototype and the half-RGB PS path), not an HLSL fact.
- Global model and texture lookup exists. This preview intentionally resolves only files present in the selected source pack.

## Shader Fidelity Ledger

The CPU-side shader-name selector at `sub_140188E30` reads generated runtime
flags at element `+0x390` and chooses the following factored variants:

| Variant | Runtime flag test | Decompiled physical role | Preview status |
| --- | ---: | --- | --- |
| Base | none | color map × particle/vertex color; alpha cutoff; half RGB unless bypassed | implemented |
| AddMix | `0x40` | alternate alpha/color mixing | blend state approximated; shader branch not exact |
| ColorEx | `0x280` | UV-offset map plus framebuffer distortion sampling | decoded, not rendered |
| Light | `0x20804` | normal map, IBL cube, and effect directional lights | decoded, not rendered |
| MultiUV | `0x1000` | second color/offset maps and pass-2 blending | decoded, not rendered |
| Soft | `0x10001` | scene-depth intersection fade | decoded, not rendered |
| HLight | `0x20000` | selected with the factored PS name; base PS body is unchanged | decoded; external stage/state unresolved |

This selector evidence is independent from shader decompilation. The older
runtime trace confirms that `sub_1401470F0` derives `+0x390` after copying the
`0x370` disk record into a `0x410` slot. Confirmed producers include authored
fields for `0x20`, `0x40`, and `0x8000`, model-control presence/input type for
`0x80`, `0x200`, `0x2000`, and `0x4000`, and a type-3 mesh walk for `0x1000`.
The IDA instance disconnected before a fresh full producer decompile, so the
remaining producer bits are not promoted beyond the existing anchored notes.

## Progress

- Added a deterministic preview plan that preserves one model instance per EFXBN effect block, including repeated model hashes.
- Added source-local `.numdlb` and `.nuanmb` resolution with explicit source-external diagnostics.
- Embedded the shared SSBH model canvas, material/texture loader, camera controls, and motion timeline in Effect Folder details.
- Plain model entries use the same preview. Existing NUTEXB preview is unchanged.
- Replaced per-block proxy circles with deterministic frame-based wrapper/emitter simulation and instanced camera-facing particles.
- Added shader-derived lifetime, emission interval/count, delay, type-3 ring spawning, size/speed randomization, per-particle curves, gravity, direction acceleration, color/alpha, z-test/z-write, alpha cutoff, and source-local texture sampling.
- Added physical emitter gizmos, a compact outliner/inspector, play/pause/scrub/reset/speed controls, and a 120-frame 60 FPS loop.
- Exposed each block's four proven model-control indices and resolves their color-map hashes against source-local NUTEXB files.
- Renamed all control lanes from anonymous `ctrlNN` labels to their reflected shader semantics.
- Restored per-particle source-local NUTEXB atlas, scroll, model-scroll, random-offset, and reverse behavior without a global shared UV phase.
- Model particles now use pooled geometry with independent transform/color/UV state, an unlit EFX color-map override, and NUANMB motion frames derived from each particle's age.
- Added type-9/10 mesh-emitter sampling from local NUMDLB vertices. Skinned emitters are CPU-sampled from the current NUANMB bone matrices instead of remaining frozen in bind pose.
- Added strip history, segment lifetime/interval, interpolated ribbon geometry, head/tail alpha, camera-facing width, texture, and blend/depth state.

## Real Pack Result

`E:\XB\mod\006effect\053gbftry_005tsient_001\0\0\167.efxbn` contains four blocks: looping wrappers `0 → 1` and `2 → 3`. They emit `3` and `2` particles per frame from type-3 ring forms; targets live about 16 frames and animate speed, scale, HDR color/alpha, gravity, and direction acceleration. The preview now shows these particles even though there is no source-local model or texture.

The EFXBN declares hash sets `(model/texture/animation) = 1/2/1`, but none resolve to files in this source pack. The real-data copy test confirms the correct closure is `source-local = 0/0/0`, `copied_files = 1`, warnings `0`, and the source bytes remain unchanged.

`E:\XB\mod\006effect\001gundam_005gyan00_001` is the complementary positive fixture. The test discovers an EFXBN whose hashes resolve locally, copies it into a temporary empty effect pack, and proves that the resulting model/texture/animation counts equal the calculated source-local closure. It also asserts that more than the selected EFXBN was copied, but fewer files than the source pack total, excluding both the zero-dependency and whole-pack failure modes.

## Verification

- Frontend/copy: targeted Vitest passed 6 files / 37 tests, covering copy closure, exact UV evaluation, particle simulation, dynamic skinned mesh sampling, strip geometry, and shared SSBH mesh conversion. The compact copy dialog is imported by the plan test.
- Copy UI/plan: targeted Vitest passed 1 file / 13 tests while explicitly loading the compact dialog component.
- Backend: `effect_folder_real_data_test` passed 2/2 against the specified all-global fixture and the Gyan source-local fixture, including parse, exact closure counts, temp-destination copy, target reinspection, whole-pack exclusion, and source immutability.

## Remaining Work

- Resolve the numeric D3D blend-state enum from CPU state creation before claiming exact blend parity for every pack.
- Finish the unproven `sub_1401470F0` producer bits, then implement `ColorEx`, pass-2 `MultiUV`, effect lighting, and soft-particle depth fade. They are intentionally reported as decoded-but-not-rendered today.
- Add a fixture containing source-local NUANMB if animation-copy coverage is needed independently; the current Gyan positive fixture exercises the locally available dependency classes, while the user-specified pack remains the correct all-global negative case.
