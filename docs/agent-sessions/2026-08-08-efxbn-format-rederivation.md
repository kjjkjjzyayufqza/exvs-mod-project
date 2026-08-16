# EFXBN Format Re-derivation

## Goal

Re-derive the EFXBN container, block layout, resource binding, and transform generation
from the game binary instead of from inference, then correct the parser, the preview
topology, and the runtime semantics that had drifted from the native loader.

Target: `E:\OBHK0.3_v27\vsac27_Release.exe` (base `0x140000000`) through IDA Pro MCP,
cross-checked against the shader-reflected `SEfxElementData` in the `fxc` dumps under
`tmp/efxbn-preview/` and against the 4,201 shipped `.efxbn` files.

## Confirmed File Layout

`sub_140145DF0` reads block `i` from `payload + 0x18 + i * 0x370` (`v6[220 * i + 6]`,
220 dwords = 880 bytes) and copies it into a runtime slot of stride `0x410`.

```text
0x00  magic 'EFXB'
0x04  version
0x08  fileSize
0x0C  effectCount
0x10  curveKeyCount
0x14  modelControlCount
0x18  blocks[effectCount]          stride 0x370
      curveKeys[curveKeyCount]     stride 8, as (time, value) floats
      modelControls[...]           stride 0xB8
```

For `167.efxbn` this closes exactly on the file size:
`0x18 + 4*0x370 = 0xDD8`, `+ 99*8 = 0x10F0`, `+ 4*0xB8 = 0x13D0 = 5072` bytes.

### Corrections to the previous parser

- The block region started at `0x20`, eight bytes late. Every field offset was
  correspondingly eight bytes short, so values read correctly but the final block
  overran into the curve key region, and `control_lookup_region_offset` needed a
  `- 8` patch to land in the right place.
- `unk0x18` / `unk0x1C` were reported as header fields. They are block 0's `level`
  and `childIndexSize`.
- `control_block_size` and `control_remainder_size` were derived from that off-by-eight
  and described nothing real. Removed.
- `emitInterpolateType` was documented as needing a `+8` runtime adjustment; block and
  reflected offsets are identical, so no adjustment exists.

Block offsets now equal reflected `SEfxElementData` offsets. `elementType` is at 40,
`numEmitCountRandom` at 696, `meshEmitterIndex`/`Count` at 712/716.

### Field coverage

The parser read 40 of the 145 reflected entries. The remaining fields are now parsed,
including `level`, `childIndexSize`, `childIndexArray[8]`, `extraFlags`, `drawerID`,
`specialShaderType`, `pass2BlendType`, `reflectionPower`, `softParticleRange`, the
`lightType`/`lightingFlags`/`normalMapHash`/`lightAttenuationRadius` group, the nine
`animation*` fields, `rotationSpeedRandom`, `numEmitCountRandom`, `depthEmission*`,
`highlightPower`, `boundingSphereInfo`, the `blur*` and `noise*` groups, and the eight
`fieldEffect*` fields. Only `reserve_area[31]` is left unnamed.

`textureHandle` (offset 324) was parsed as `unk32` and never used; it is now named.
`nudHandle` (320) was already parsed as `model_id`, and `animationHash` (656) as
`animation_id`.

## Block Topology

Blocks form a tree, not a flat pair list. Each block declares `level`,
`childIndexSize`, and up to eight child indices.

The preview treated `elementType === 9` as "emitter" and followed only
`childIndexArray[0]`, so any block with more than one child lost all but the first, and
emitters of other types were missed entirely. A survey of the shipped corpus
(4,201 files, 36,737 blocks) shows the real parent/child edges include `6 -> 9`,
`6 -> 3`, `6 -> 1`, `6 -> 6`, `6 -> 5`, `6 -> 8`, `9 -> 3`, `9 -> 1`, `9 -> 6`, and
`9 -> 5` — type 6 is as common an emitter as type 9.

Pairs are now expanded from the tree, one per parent/child edge.

## Element Types

`sub_140145DF0` writes the per-slot enable gate at `slot + 916` as
`elementType == 1 || elementType == 3 || elementType == 5`. `sub_140188E30` selects
`efxDrawModel` when the type is 3 and `efxDrawFace` otherwise. The strip-specific
defaults in `sub_140146590` are gated on type 5.

Corpus distribution over 36,737 blocks:

| Type | Count | Role |
| ---: | ----: | --- |
| 1 | 6,860 | Billboard, drawable |
| 3 | 11,598 | Model, drawable |
| 5 | 1,149 | Strip, drawable |
| 6 | 5,142 | Container |
| 8 | 910 | Container |
| 9 | 10,658 | Emitter wrapper |
| 10 | 383 | Container |
| 11 | 37 | Container, special-cased in the loader |

**Type 2 does not occur in any shipped file.** The preview used `effectType === 2` as
its strip test in seven places, so strip rendering never ran. Strip is type 5.

## Runtime Normalization

`sub_140146590` rewrites each block before it is used. The preview read the authored
values and therefore diverged from the game on every one of these:

1. A type-9 wrapper adopts a type derived from its first child: child 1 → 0, 3 → 2,
   5 → 4, 6 → 7. This is why normalized wrapper types 0/2/4/7 appear at runtime while
   no file contains them.
2. `zWriteEnable` is derived, not read: `blendState == 0` forces it on, and
   `enableSoftParticle` forces it off.
3. `softParticleRange` defaults to `8.0` when it is approximately zero.
4. `actionFlags & 0x08000000` forces the loop bit on.
5. `actionFlags & 0x00800000` clears the loop bit and `deleteSettings & 2`.
6. For type 5 only: `stripSegmentLife` defaults to `stripSegmentInterval * 16` when
   negative, and both `stripTaleAlphaRate` and `stripHeadAlphaRate` default to `0.3`
   when approximately zero.
7. `internalElementDataIndex` is assigned the block index.
8. For type 10, `postEffectType != 2` clears the loop bit.

The parser now exposes these as a `runtime` record per block while leaving the authored
fields untouched so packs still round-trip byte for byte. The preview reads the runtime
record for looping, strip lifetime, strip alpha rates, and depth write.

## Curve System

The 16 `EfxElementKeyArrayInfo { size, curveIndex }` entries at offsets 88..216 were
already parsed as `control_references` with `selector` = key count and `lookupIndex` =
first key, and `evaluateEfxbnControl` already interpolated them over a 0..100 domain.
That was verified correct, not rewritten:

- Curve indices pack consecutively. In `167.efxbn` block 1, `scaleBaseY` is
  `size=2 curveIndex=28`, so `scaleBaseZ` starts at 30; `colorR` is `size=2 index=31`,
  `colorG` 33, `colorB` 35, `colorA` `size=11 index=36`.
- Key times run 0 to 100. Block 3's `colorA` is a clean quadratic fade:
  1.0, 0.809, 0.64, 0.49, 0.36, 0.25, 0.159, 0.09, 0.04, 0.009, 0.0.
- Key values are physically sensible: the first entry is `0.17453` (10 degrees of
  spread) and entry 6 is `6.28319` (a full-circle spawn form).

`id_table` is a duplicate legacy read of the same 16 entries and remains only for the
inspector.

## Resource Binding

`sub_140146D30` binds model controls in two loops over the runtime slot:

- `slot + 336` — `colorTextureParameterIndex[0..1]`, primary and pass-2 color maps
- `slot + 344` — `uvTextureParameterIndex[0..1]`, primary and pass-2 UV offset maps

Each index that is not `-1` selects a 184-byte (`0xB8`) record from the file's
model-control region, copies it into a runtime pool, and rewrites the slot entry in
place with the pool index. The existing four-slot model was correct; the slot roles are
now named rather than inferred. `textureHandle` does not participate in this path.

`sub_140146A00` is gated on `slot + 656` (`animationHash`) and performs the
`"Transform"` binding, which is the transform generation path. The nine `animation*`
control fields it depends on were previously unparsed.

## Verification

- `cargo test --lib effect` — 15 passed.
- `cargo test --test effect_folder_real_data_test` — 5 passed, including two new tests
  that pin the block layout, curve table, and normalization against real `167.efxbn`
  bytes.
- `pnpm vitest run src/page/TestEditor/components/effect-folder-editor` — 33 passed,
  including five new topology tests.
- `cargo clippy --lib` — clean. `cargo fmt` — applied.
- `tsc --noEmit` — two pre-existing unrelated errors only
  (`BulletPropertyPanel.tsx:227`, `motionFolderService.ts:724`).
- Pre-existing and unrelated: four `format::characterlist` tests fail because their
  sample file is absent on this machine, and two `Fhm2dMemoryPreviewModal` tests fail on
  a pointer-events assertion. Both verified against a clean tree.
- No file under `E:\XB` was modified. All reads and writes used explicit UTF-8.

## Not Yet Done

- Spawn-form branches for types 2, 4, 7, 8 and the `emitInterpolate*` back-fill.
- The pixel-shader variants (AddMix, ColorEx, Light, MultiUV, Soft, HLight).
- `blendState` / `cullingType` / `addressingMode` enum mappings, which need the CPU
  render-state builder rather than HLSL.
- Reference-appearance comparison for the offline Blender renders.

These remain tracked in
`docs/superpowers/plans/2026-08-08-efxbn-shader-fidelity-and-visual-review.md`.

---

## 2026-08-09 Follow-up: Material Reporting and Texture Slot Roles

Two defects surfaced while previewing `053gbftry_005tsient_001`, both from the same root
cause: a typed distinction existed in the data but the consumer read an untyped view of it.

### 1. Effect models were reported as missing their material

Every effect `.numdlb` records one `nusubf/<name>__maya__.numatb` that no pack contains,
because the material comes from the EFXBN model-control parameters and reaches the GPU
through the unlit `efxDrawModel` path. The loader reported that as an unresolved file, once
per model, so a single effect preview produced a wall of identical lines.

The first attempt keyed the exemption on "the folder holds no `.numatb`". That was too broad:
it also silenced `解包/com/file/0x2D1B7C40/custom_wing`, a model that declares
`model__nust__.numatb` and genuinely ships without it.

The discriminator is the material profile pair the modl declares — the same signal the
unit-model reader uses to decide whether a model folder is complete
(`unit_model_models.rs`: exactly two `.numatb`, `__maya__` + `__nust__`).

Survey of all 8,767 `.numdlb` under the game tree, classified by
`(material ref count, declares __nust__, folder holds any .numatb)`:

| Shape | Count | Meaning |
| --- | --- | --- |
| `(1, no, no)` | 2,583 | Effect models. All `eff_*`. Authored without a runtime material. |
| `(2, yes, yes)` | 6,031 | Character / stage models, fully resolved. |
| `(1, yes, yes)` | 49 | Runtime profile only, resolved. |
| `(1, no, yes)` | 78 | Authoring profile only, resolved. |
| `(0, no, yes)` | 23 | No material reference at all. |
| `(1, yes, no)` | 3 | `custom_wing` — genuinely unresolved, must warn. |

2,580 of the 2,583 use the `__maya__` marker; the other 3 carry no marker. So
`!folder_has_any_numatb && !declares_nust_material_profile(...)` separates the two families
with no false positives and no false negatives across the corpus.

`ssbh_preview.rs` now stays silent for that shape — including the generic "no material files
could be loaded" line — and warns as before otherwise.

### 2. UV-offset maps were promoted into the colour slot

Block offsets `0x150`-`0x15c` are `colorTextureParameterIndex[2]` followed by
`uvTextureParameterIndex[2]`. The parser exposed both the typed pair and a flat
`modelControlIndices[4]` view of the same four dwords, and the preview iterated the flat one,
so every consumer resolved its texture with
`textureBindings.find(b => b.file !== null)` — first resolved slot wins.

Scan of all 4,512 shipped `.efxbn` (39,309 blocks with at least one slot):

- 18,702 blocks resolve `color0` — correct either way.
- **453 blocks leave `color0` empty while a later slot resolves** — these rendered a
  distortion map as their colour. `053gbftry_005tsient_001/0/0/150.efxbn` block 1 is one.

`EffectFolderPreviewTextureBinding` now carries a named `slot`
(`color0` / `color1` / `uv0` / `uv1`), and `resolveEfxbnColorMapBinding()` matches `color0`
only. It returns the binding even when the texture file is not local, because the UV
animation is authored on the parameter and still applies. The flat `modelControlIndices`
view is deleted from Rust, from the TypeScript summary, and from both fixtures, so the
ambiguous read is no longer reachable. The inspector now labels each slot by role instead of
printing the model-control record index as "slot N".

`tools/efxbn_blender_preview/scene_plan.ts` had the same slot-agnostic lookup and is fixed
the same way. Its fixture was also stale from the topology re-derivation (missing
`childIndexSize`, `childIndexArray`, and `runtime`), which made that test fail before this
session; it is updated and passing.

### Verification

- `cargo test` (isolated target dir) — 32 passed, 4 suites.
- `cargo test --test effect_model_preview_real_data_test` — 6 passed, including a sweep that
  loads 120 real effect models and asserts zero warnings, and a regression test on
  `custom_wing` that a declared `__nust__` profile still warns when absent.
- `pnpm vitest run src/page/TestEditor/components/effect-folder-editor` — 34 passed.
- `python -m unittest tools.efxbn_blender_preview.tests.test_preview` — OK.
- `cargo clippy --lib` — clean. `cargo fmt` — applied.
- `tsc --noEmit` — two pre-existing unrelated errors only.
- Full `vitest run` — 776 passed, 6 failed. All six reproduce with these changes stashed:
  `Fhm2dMemoryPreviewModal` (2), `useSsbhFileEditorSessions` (3), `ListeningRepackDialog` (1).
- No file under `E:\XB\mod\006effect` or `E:\XB\解包` was modified.

---

## 2026-08-09 `drawSchemeFlag` Fully Derived (Task 1.3)

IDA instance `ida-36628`, `vsac27_Release.exe`, base `0x140000000`.

### Producer — `sub_1401470F0`

Writes the flag word to `drawInfo + 0x20`, i.e. element `+0x390`. `a2` is the loaded element
record, so dword index *4 is the same offset the disk block uses.

Gate: `sub_140145DF0` sets the enable byte at element `+0x394` only for **authored** element
types 1, 3 and 5 (`140145fe3`-`140145ffc`), and does so *before* calling `sub_140146590`.
Blocks that fail the gate keep a zero flag word. Since normalization only rewrites type 9,
authored and normalized types agree for every enabled block.

| Bit | Condition | Field (block offset) |
| --- | --- | --- |
| `0x1` | `!= 0` | `enableSoftParticle` `0x18C` |
| `0x2` | `& 0x800` | `actionFlags` `0x40` |
| `0x4` | `& 1` | `lightingFlags` `0x1C4` |
| `0x8` | `!= 0` | `normalMapHash` `0x1C8` |
| `0x10` | `!= 0` | `zTestEnable` `0x178` |
| `0x20` | `!= 0` | `zWriteEnable` `0x174` |
| `0x40` | `== 4` | `blendState` `0x17C` |
| `0x80` | `!= -1` | `uvTextureParameterIndex[0]` `0x158` |
| `0x100` | `& 0x1000000` | `actionFlags` `0x40` |
| `0x200` | `!= -1` and that control's `inputSourceType == 1` | `colorTextureParameterIndex[0]` `0x150` |
| `0x400` | `& 0x2000000` | `actionFlags` `0x40` |
| `0x800` | `& 4` | `lightingFlags` `0x1C4` |
| `0x1000` | normalized `elementType == 3` **and** the model mesh has ≥ 2 attribute streams of type 17 | mesh walk |
| `0x2000` | `0x1000` set and `uvTextureParameterIndex[1] != -1` | `0x15C` |
| `0x4000` | `0x1000` set and `colorTextureParameterIndex[1]` bound with `inputSourceType == 1` | `0x154` |
| `0x8000` | `& 0x2000` | `extraFlags` `0x204` |
| `0x10000` | `& 0x40000` | `extraFlags` `0x204` |
| `0x20000` | `& 8` | `lightingFlags` `0x1C4` |
| `0x40000` | `& 0x2000` | `extraFlags` `0x204` |

`0x8000` and `0x40000` test the **same** `extraFlags & 0x2000` bit. Confirmed at instruction
level, not a decompiler artifact: `1401471e2 and eax, 2000h` / `bts ecx, 0Fh` and
`1401472f9 and eax, 2000h` / `bts ecx, 12h`. So the `0x40000` half-brightness bypass in the
base Face and Model pixel shaders is exactly `extraFlags & 0x2000`.

The model-control lookup is `*(a1 + 17564504 + 184 * index)`; `184 == 0xB8` is the model-control
stride and offset `+0` in that record is `inputSourceType`.

### Consumer — `sub_140188E30`

Base name is `efxDrawModel` when `*(element + 0x28) == 3`, else `efxDrawFace`. Because
`sub_140146590` writes the **normalized** type back to `+0x28` (`1401465cb`-`1401465e6`), a
type-9 wrapper over a model normalizes to 2 and draws as Face; only the child draws as Model.
**Task 3.1 must branch on the normalized element type, not the authored one and not the model
hash.**

Then one suffix per mask that shares any bit with the flag, in this order:

| Mask | Variant |
| --- | --- |
| `0x40` | AddMix |
| `0x280` | ColorEx |
| `0x20804` | Light |
| `0x1000` | MultiUV |
| `0x10001` | Soft |
| `0x20000` | HLight |

The suffix strings live at `0x142420BF0`+ in `.data` and are runtime-initialized, so they
cannot be read statically; the variant names come from the DXBC filenames instead.

### What this changes about priorities

Computed over all 4,512 shipped `.efxbn` — 21,408 blocks pass the drawable gate:

| Variant | Blocks | Share |
| --- | --- | --- |
| Soft | 11,039 | 51.6% |
| (base only) | 7,506 | 35.1% |
| ColorEx | 5,825 | 27.2% |
| Light | 1,594 | 7.4% |
| HLight | 507 | 2.4% |
| AddMix | 16 | 0.1% |

Bit frequencies worth recording: `0x10` zTest 98.7%, `0x1` soft particle 51.1%, `0x400` 36.5%,
`0x80` UV-offset map 27.2%, `0x40000` **0.5%**.

**The plan over-rated Task 3.3.** The `0x40000` half-brightness bypass applies to 104 of 21,408
blocks, so the preview's unconditional `rgb * 0.5` is already correct 99.5% of the time. It is
a correctness fix, not an appearance fix.

**ColorEx is the cheap win.** Its 27.2% comes almost entirely from bit `0x80` (UV-offset map
bound), not from `0x200` (framebuffer grab, 1.8%). The `0x80` path is
`colorUv += d * distortionUV; alpha *= offsetSample.a` — one extra texture sample, no scene
colour target needed. The expensive half of ColorEx is rare.

**Soft is the largest share but may be near-invisible in this preview.** Its effect is
`alpha *= saturate((sceneZ - particleEyeZ) / softParticleRange)`, which only bites where a
particle intersects scene geometry. The preview renders particles in an empty scene, so the
term saturates to 1 and the variant is close to a no-op there. It matters for in-game
comparison, not for the current preview.

`blendState` distribution: `2` 16,891 (78.9%), `1` 3,876 (18.1%), `0` 625 (2.9%), `4` 16 (0.1%).
**There is no `blendState == 3` anywhere in the corpus**, so the preview's `3 -> Subtractive`
branch is dead code and its `1 -> Normal` fallthrough covers 18% of blocks unverified.

### Render state — located, not yet decoded

`sub_140174B30` builds the draw state and calls `sub_1401774B0(blendState, descriptor)`, which
seeds a 48-byte-per-render-target descriptor from `sub_140085A50(preset)` and then patches it:

| `blendState` | preset | patch |
| --- | --- | --- |
| 0 | 0 | `[20] = 0`, `[12..20] = 0` |
| 1 | 1 | `[20] = 6`, `[12..20] = 0` |
| 2 | 2 | `[20] = 1`, `[12..20] = 0` |
| 3 | 3 | none |
| 4 | 1 | `[0] = 1`, `[8] = 6`, `[16] = 0`, `[20] = 6` |

The 48-byte default is `[0]=1 [4]=0 [8]=0 [12]=1 [16]=0 [20]=0 [24]=0(byte) [36]=1 [44]=15`,
which is shaped like a D3D11 render-target blend desc with `writeMask = 15`. **The enum
namespace is not established** — preset 1 writes `6` where a blend op would be out of range, so
no field assignment is proven yet. Recorded as raw evidence only; do not promote a mapping.
Next step: find where this descriptor is translated for the graphics API (follow
`sub_1400876A0`, which consumes it) — that call site fixes the namespace.

### Implemented

`EfxbnDrawScheme { flag, meshMultiUvFlag }` on every block's `runtime`. The multi-UV group is
reported separately because the mesh walk needs the model's NUMSHB, which the parser does not
read — the preview OR-s it in once it has the mesh, and nothing guesses. TypeScript mirrors the
type and `resolveEfxbnShaderVariants()` applies the masks; the inspector's material tab now
shows the flag word, the variant list, and a warning that the preview only renders the base
shader.

Verification: `cargo test` 34 passed, `vitest` 778 passed (same 6 pre-existing failures),
`python -m unittest tools.efxbn_blender_preview.tests.test_preview` OK, `cargo clippy --lib`
clean, `tsc` two pre-existing errors only.

---

## 2026-08-09 ColorEx Implemented (Task 6.5, ahead of schedule) + Phase 8.1

### `distortionU` / `distortionV` come from the offset-map parameter

`efxDrawFaceColorExPS` reads them from `SEfxFaceConstantBuffer` (`cb7[0].xy`), which the CPU
fills per draw — and the IDA path to that fill was not found (the `+0x390` and `+0x2BC` searches
returned only stack noise, and one query timed out). Settled from the corpus instead, which is
decisive:

| Parameter role | Distinct `uvDistortionPower` values across the 5,741 ColorEx blocks |
| --- | --- |
| `colorTextureParameterIndex[0]` | **1** — always `(0.1, 0.1)` |
| `uvTextureParameterIndex[0]` | **157** — e.g. `(0.32, 0.32)`, `(0.02, 0.02)`, `(0.0, -0.08)` |

A per-effect knob that never varies is not the knob being used. The offset-map parameter is.

### The shader, read from the DXBC rather than paraphrased

`tmp/efxbn-preview/efxDrawFaceColorExPS.dump.txt`, bit `0x80` branch:

```text
r1.xyz = EfxUVOffsetMap.Sample(s1, v2.zw).wxy    ; .x = a, .y = r, .z = g
r1.zw  = (r1.y, r1.z) - 0.5                      ; rg - 0.5
r1.zw  = r1.x * r1.zw                            ; d = a * (rg - 0.5)
r2.xy  = r1.zw * cb7[0].xy + v2.xy                ; colorUv += d * distortion
r0.xy  = r1.zw * cb7[0].xy + r0.xy                ; screenUv += d * distortion
...
r1.xyzw = (1,1,1,offset.a) * (colorTexel * particleColor)   ; alpha *= offset.a
discard if alpha < 0.01
rgb = (drawSchemeFlag & 0x40000) ? rgb : rgb * 0.5
```

Two details the prose summary in the plan lost: the offset map has its **own** UV set (`v2.zw`,
animated independently of the colour UV), and `alpha *= offset.a` applies even though the
`0x200` framebuffer branch is not taken.

### Implemented at all three draw sites

ColorEx is not billboard-only — measured per drawable type: Model 3,872 of 12,707 (30.5%),
Strip 364 of 1,306 (27.9%), Billboard 1,578 of 7,395 (21.3%).

- `EfxbnParticlePreview.tsx` — two extra instanced attributes carry the offset UV set.
- `EfxbnStripPreview.tsx` + `efxbnStripGeometry.ts` — `buildEfxbnStripMeshData` now emits a
  second `offsetUvs` array from a second per-particle transform callback.
- `SsbhModelCanvas.tsx` — model particles keep their `MeshBasicMaterial` (so three.js still owns
  skinning, vertex colours and instancing) and get the distortion injected through
  `onBeforeCompile`, replacing `#include <map_fragment>`. The injection only ever touches the
  EFX override materials, so no other page is affected.

The `0x40000` full-brightness branch is wired at the same three sites: `mix(0.5, 1.0, flag)` in
the two GLSL shaders and the override material's base colour in the model path. It changes 0.5%
of blocks, but it is now driven by the flag instead of hard-coded.

`resolveEfxbnUvOffsetMapBinding()` reads the `uv0` slot, so the offset map can never be confused
with the colour map — the same slot discipline introduced earlier today.

### Phase 8 Task 8.1 — positive sample rendered

The previous sample (`167.efxbn`) has zero local models and zero local textures, so its render
only ever exercised the neutral-billboard fallback. Scanning every pack for an EFXBN whose model
and texture handles resolve inside its own folder found 57 candidates; the best is
`053gbftry_005tsient_001/0/0/200.efxbn` — **5 of 5 model handles and 11 of 15 texture handles
are pack-local**.

Rendering it converts 10 models and 10 textures, and 20 of its 32 particle groups resolve a
colour texture including 10 model-particle groups. `tests/test_preview.py` now asserts exactly
that, and additionally that every binding handed to Blender is the `color0` slot. The test
skips the Blender invocation, so it stays at ~13s.

### Phase 8 Task 8.2 — blocked, and why

The offline render of the positive sample is heavily blown out: the Blender mirror approximates
every game blend state with emissive materials (its own README says so), so additive stacking
saturates. **It validates the parse and simulation chain, not appearance**, and therefore cannot
serve as the "our render" side of a reference comparison.

Task 8.2 needs one of:
1. an in-game capture of a named effect to compare against, or
2. teaching the Blender mirror the real blend states — which is blocked on the same unproven
   enum namespace as Phase 7.

Nothing here should be described as visually validated until one of those lands.

---

## 2026-08-09 Texture Addressing — the "edges" symptom (Phase 7, partly closed)

Reported symptom: textures that have no visible edge in game show hard edges and seams in the
preview. Root cause found and fixed.

### The enum is proven, not inferred

`sub_1401777A0(dest, addressingMode, filter, aniso)` is the sampler-state builder. It copies the
authored `addressingMode` **identically** into the U, V and W address modes — values 0..3 map to
0..3, anything else falls back to 0.

The enum name table is in the binary at `0x1415CB9B0` (values 0..5 at `0x1415CB998`):

| Value | Name | String |
| --- | --- | --- |
| 0 | WRAP | `0x14157ECB8` |
| 1 | MIRROR | `0x1415CD114` |
| 2 | CLAMP | `0x1415CD11C` |
| 3 | BORDER | `0x1415CD124` |
| 4 | MIRROR_ONCE | `0x1415CD130` |
| 5 | COUNT | `0x1415CD13C` |

The type name at `0x1415CD0F0` is `hkImageAddressMode::Enum` — a Havok enum the engine reuses.
This is a read name table, not an inference, unlike the blend descriptor.

**Bonus confirmation of the model-control layout.** `sub_140174B30` reads
`modelControl + 12` for the texture id and `modelControl + 16` for the addressing mode from a
base held in `a5`. Both land exactly on our parsed `colorMapId` (`+0x04`) and `addressingMode`
(`+0x08`) under a single consistent `a5 = base - 8` shift, which independently validates a layout
that until now rested only on a self-authored fixture.

### Impact

Bound texture parameters across the corpus: **76% WRAP, 17% MIRROR, 4.5% BORDER, 3% CLAMP** —
so 24.6% were sampled with the wrong addressing. `0` is WRAP rather than CLAMP because
`addressing=0` pairs with `uvPattern=1` (scroll) 7,320 times, and scrolling UVs must wrap.

Both wrong cases produce exactly the reported artifact:
- MIRROR rendered as REPEAT hard-cuts at the tile boundary instead of folding back.
- BORDER rendered as REPEAT tiles instead of fading out, so the quad grows a visible frame.

### Implementation

`threeWrapForEfxbnAddressMode()` maps WRAP→Repeat, MIRROR→MirroredRepeat, CLAMP/BORDER→ClampToEdge,
and **throws** on MIRROR_ONCE or anything else rather than silently repeating (MIRROR_ONCE occurs
in zero shipped files and has no WebGL equivalent). `useEfxbnTexture(path, addressMode)` applies it
per binding, so the same `.nutexb` used by two blocks with different modes still samples correctly.

WebGL2 has no `CLAMP_TO_BORDER`, so BORDER clamps and every fragment shader zeroes alpha outside
the authored `[0, 1]` range — the D3D default transparent-black border. Applied to both the colour
map and the ColorEx offset map, at all three draw sites (billboard, strip, and the model
`onBeforeCompile` injection).

### Still open on the other two reported symptoms

- **Colour.** `blendState` is `1` on 18.1% of drawable blocks and the preview renders it as plain
  Normal blending, unverified. Unlike the address mode, **the binary contains no blend-factor enum
  name table** (searched `SRC_ALPHA|INV_SRC_ALPHA|DEST_ALPHA|BlendOp|REV_SUBTRACT|SRC_COLOR` —
  zero hits), so the descriptor from `sub_140085A50` still cannot be decoded by name. The
  remaining route is `sub_1400876A0`, which consumes it. Not guessed.
- **Progression.** Phase 2 is entirely unimplemented: emitter lifetime randomisation (2.1), emit
  count randomisation (2.2), loop semantics that wrap phase but not position (2.3), and the spawn
  basis for local velocity (2.4). Those four are what "the effect's progression is off" maps to,
  and none of them has been touched.

## 2026-08-15 The "flicker" and "solid instead of transparent" symptoms

Two user-reported symptoms, both traced to the same stage of the pipeline: the compute shader
that builds the billboard draw buffer, and the sort that runs just before it. Neither symptom is
visible in the `efxDrawFace*PS` decompilations, which is why earlier passes missed them — the
engine folds both terms into the **vertex colour** before the pixel shader ever samples.

### Confirming where the vertex colour comes from

`efxDrawFaceVS` takes `POSITION` already in world space and passes `COLOR` straight through to
`TEXCOORD_2`, which is the `TEXCOORD` the pixel shaders multiply the texel by. Its only edit is
an atmosphere/scattering blend on RGB when `drawScheme & 0x100`; `TEXCOORD_2.w = COLOR.w` leaves
alpha untouched. So every per-particle alpha decision happens in
`efxConstructDrawBufferBillboard3rd`, upstream of both shaders.

### The view-angle colour ramp — the "solid" symptom

The `blur*` field names in the reflected schema are wrong. There is no blur. Element fields
`+0x210` / `+0x220` / `+0x230` / `+0x234` (`blurStartColor`, `blurEndColor`, `blurEnableRange`,
`blurFadePower`) drive a **view-angle ramp** on the whole RGBA, gated by `actionFlags & 0x02000000`:

```text
rim  = 1 - |dot(normalize(particlePos - cameraPos), quadNormal)|   ; 0 face-on, 1 edge-on
t    = rim > threshold ? pow((rim - threshold) / (1 - threshold), power) : 0
color *= lerp(startColor, endColor, t)                              ; multiply, not replace
```

The quad normal is the third basis vector the same shader builds for the corners: the camera
forward axis for a screen-facing quad, the element rotation's z axis for a rotated one, and
`cross(right, up)` for the axis-locked branch.

Corpus (25,891 drawable blocks in 5,325 files):

| | count | share |
| --- | --- | --- |
| billboard blocks with the ramp | 1,079 | 12.1% of billboards |
| ...of those, axis-locked | 634 | 58.8% |
| ...element-rotated | 278 | 25.8% |
| ...screen-facing | 167 | 15.5% |

The end colour's **alpha is 0 in every shipped variant** — 792 blocks fade to `(0,0,0,0)` and 161
to `(1,1,1,0)`. Threshold is `0.0` everywhere; power ranges 0.5–5.0 with 2.0 dominant (810).

So an axis-locked or element-rotated quad is supposed to **fade to nothing as it turns edge-on**.
The preview drew it at full opacity, which is exactly "not transparent but solid": a hard opaque
sliver where the game shows nothing. It also produced the flicker, because an animating quad
sweeps through edge-on repeatedly and the slab popped in and out each time.

**This is billboard-only.** `efxConstructDrawBufferStrip3rd` and `efxConstructDrawBufferModel3rd`
read neither `0x02000000` nor the `+0x210` block, even though 52.5% of model blocks author the
flag. Applying it to models or strips would be wrong.

### Camera-proximity fade

Same shader, gated by `(extraFlags & 0x1000) && |cameraFadeRange| >= 1e-5 &&
(actionFlags & 0x00400000)`:

```text
depth = dot(particlePos - cameraPos, quadNormal)
alpha *= depth > cameraFadeRange ? 1 : (depth / cameraFadeRange < 0.5 ? 0 : 2*depth/range - 1)
```

and the quad collapses to a point when the result reaches zero. Only 15 of 25,891 drawable blocks
arm all three conditions (`cameraFadeRange` 10.0 x14, 300.0 x1), but it is cheap and shares the
normal the ramp already needs.

### Particle sorting — the "flicker" symptom

`efxMakeSortInfoBillboardDrawerID3rd` writes, per particle:

```text
dist        = length(particlePos - cameraPos)                      ; CB0_m0[12].xyz is the camera
frontToBack = (blendState == 0) && (extraFlags & 0x2000)           ; T3[+95] and T3[+129]
key         = (frontToBack ? -dist : dist) * 1000 + subPriority * 0.001
payload     = particleIndex | (drawerID << 16)
inactive particles get key 100000.0 and payload 0xFFFFFFFF
```

`efxSortParticle3rd` is a bitonic sort whose comparator swaps when
`drawerB < drawerA || (drawerA == drawerB && keyA < keyB)` — **drawerID ascending, key
descending**. Descending on `+dist` draws the farthest particle first (back-to-front, correct for
every transparent state); descending on `-dist` draws the nearest first (front-to-back, correct
for opaque early-Z). 25,874 of 25,891 drawable blocks take the back-to-front branch; only 17 are
`blendState == 0 && extraFlags & 0x2000`.

The preview uploaded instances in simulation order and never sorted. Element stride confirmation:
the sort shader indexes the element table at `elementIndex * 220` dwords = 880 bytes =
`SEfxElementData`, and `+95`/`+129` dwords land exactly on `blendState` (`0x17C`) and `extraFlags`
(`0x204`).

Render-state corpus for context — the preview's `depthWrite` was **not** the problem:

```text
blendState : 2=78.0%  1=19.1%  0=2.8%  4=0.1%
zWriteEnable (post-normalization): 0=96.3%  1=3.7%
zTestEnable: 1=98.7%  0=1.3%
enableSoftParticle: 1=53.9%
```

### What was implemented

`efxbnBillboardShading.ts` (new) holds the billboard-only paths and the sort, all pure and
unit-tested:

- `resolveEfxbnViewAngleRamp` / `efxbnViewAngleFactor`
- `resolveEfxbnCameraFadeRange` / `efxbnCameraFadeAlpha`
- `efxbnParticleDrawOrder` / `efxbnParticleSortsFrontToBack` / `efxbnRequiresParticleDepthSort`

The billboard vertex shader now computes the quad normal per basis mode and applies both terms to
`vColor`, which the existing `a < 0.01` discard then turns into the same "quad disappears"
behaviour the engine gets by collapsing the corners. The strip layer reorders its ribbons before
building the index buffer — one strip particle is one ribbon, so emitting them far-to-near is the
whole fix there.

`efxbnRequiresParticleDepthSort` skips the sort only where the result is provably identical:
opaque (the depth test alone decides) and additive without a depth write (commutative). That keeps
the per-frame cost off the 78% additive majority while still matching the engine's output.

The inspector's Detail tab now reports `Draw order`, `View-angle ramp` and `Camera fade` so a
block's expected behaviour can be read off while judging the viewport.

### Still open

- The sort's `subPriority * 0.001` tiebreak lives in the draw-info buffer written by
  `efxExtractDrawInfoBillboard3rd`, not in the element record, and is not modelled. It cannot
  reorder across the `* 1000` distance term, so it only breaks exact ties.
- `drawScheme & 0x100` blends an atmosphere/scattering texture into RGB in `efxDrawFaceVS`. The
  preview has no scene to sample.
- `enableZSort` (`+0x1a8`, 8.3% of drawable blocks) and `zSortOffset` are parsed but their
  consumer has not been located; the distance sort above runs unconditionally in the engine, so
  these are something else.

## 2026-08-15 Cross-pack references: most of an effect lives in `000common_001`

`33.efxbn` in `wing_gundam_zero_rebellion_effect` should draw a sphere. The preview drew a flat
disc. All six of its blocks are Model or Emitter — there is not one Billboard in the file — so the
disc was not a billboard bug: the preview had failed to find the model and had fallen back to
proxy geometry.

Block 0 binds `nudHandle = 0x328D9438`. That is
`crc32("eff_000common_000common_001_sphere_001")`, and the only `.numdlb` with that stem lives in
`006effect/000common_001/0/0/101/`. The four model-control blocks all bind
`0xAD0769F6 = crc32("eff_000common_000common_001_color_001")`, likewise present only in
`000common_001`.

### How large the problem is

Scanning every `.efxbn` in the 11 shipped non-common packs and resolving each ID against (a) the
pack's own files and (b) `000common_001`:

| Reference kind | Own pack | `000common_001` only | Nowhere |
| --- | --- | --- | --- |
| Model (`nudHandle`, block `+0x140`) | 484 (42.1%) | **664 (57.8%)** | 1 (0.1%) |
| Texture (`colorMapId`, model control `+0x04`) | 518 (30.2%) | **1,191 (69.5%)** | 5 (0.3%) |
| Animation (`animationHash`, block `+0x290`) | 8 (80%) | 0 | 2 (20%) |

`000common_001` ships 122 models and no `.nuanmb` at all. The whole corpus binds only 10 animation
references, so animations stay pack-local; models and colour maps do not.

For `wing_gundam_zero_rebellion_effect` specifically: 71 model-block references, 22 own, **49
shared**, 0 missing. Indexing that pack alone leaves 69% of its model references unresolved.

### Why the parser missed it

`inspect_effect_folder` read one structure JSON and built `model_hashes` from that pack only.
Nothing was wrong with the hash math — Rust does not even compute CRC32 here, it reads the folder
entry's `unk5`, whose values coincide with `crc32(stem)`. The pack boundary was the bug. Texture
references were never checked at all, and unresolved models produced no warning from `inspect`
(only `validate_effect_folder_for_repack` warned, at which point the pack shape is already fixed).

### What resolution now does

`inspect_effect_folder` indexes the sibling `000common_001` for models and textures only —
`.efxbn` payloads there are never parsed, because nothing reads them and the pack contributes
~1,000 files to every inspection. Each reference is then sorted three ways:

- resolved in the opened pack — silent, the normal edit target
- resolved in the shared pack — aggregated into one warning plus `summary.commonModelIds` /
  `commonTextureIds`
- resolved nowhere — one warning per ID, plus `summary.unresolvedModelIds` /
  `unresolvedTextureIds`

The opened pack wins a hash collision: a pack that ships its own copy of a shared resource is
editing that copy, and the preview must show what the edit does.

An absent shared pack is a warning rather than an error, because a pack extracted or copied on its
own is still worth inspecting — but every reference it can no longer resolve is then listed by ID,
so nothing degrades silently. A shared pack that exists but cannot be read *is* an error.

### Downstream

`buildEffectFolderPreviewPlan` resolves models and colour maps against the union of both packs and
tags every hit `pack` or `common`. Loading was already path-based (`loadModelSetAt(paths)`,
`loadNutexbPreview(path)`), so no loader change was needed — only discovery.

Copy is deliberately unchanged: a shared-pack model is not copied into a copy destination, because
the destination resolves it from `000common_001` at runtime exactly as the source did.

## 2026-08-16 The flicker was two identity bugs, not a shading bug

The view-angle ramp and the particle sort fixed the "solid slivers" symptom but left most effects
flickering. The remaining cause was not shading at all: the preview was silently re-randomising
its particles and re-pointing its model instances on almost every frame.

### 1. One shared random stream, consumed conditionally

`simulateEfxbnEmitterPair` replays the whole emission history from tick 0 on every rendered frame,
drawing from a single `makeRandomSource(pairSeed(...))`. `simulateParticle` draws the particle's
lifetime first and then returns early when that particle has already expired:

```ts
const lifeTime = randomizedBase(target.lifeTimeBase, target.lifeTimeRandom, random);
if (lifeTime <= EPSILON) return null;
const age = Math.max(0, frame - spawnFrame);
if (!looping && !forceLooping && isExpiredAtAge(age, lifeTime)) return null;   // <- draws stop here
```

Everything after that point — spawn position and direction, `speedRate`, `sizeRandom`,
`rotationBase` — is never drawn for a dead particle. The stream is sequential, so the moment any
particle expires, **every particle emitted after it reads a different slice of the stream**. A
regression test over frames 4-24 of a 3-per-tick emitter with `lifeTimeRandom = 0.6` caught it on
the first expiry: particle 6's lifetime jumped from 5.757 to 8.582 between frame 4 and frame 5.
With expiries happening on nearly every frame, the entire live cloud was re-rolled continuously.

Fix: the emitter keeps its own stream (its lifetime, then exactly two draws per emission tick —
emit count and interval), and each particle draws from `makeRandomSource(particleSeed(seed, id))`.
The engine does the same thing for the same reason: `efxSpawnParticleCommon3rd` advances an LCG
stored on the instance, not a per-emitter one.

### 2. Model instances addressed by array position

`EfxbnDiagnosticOverlay` drove the model pool with

```ts
instanceIds.forEach((instanceId, index) => {
  const particle = particles[index];
```

`particles` holds only the live ones. When a particle expires the array closes up, so on that
frame every instance behind it snapped onto a different particle's position, rotation, scale,
colour and `motionFrame`. For a model-driven effect that is a hard teleport of the whole pool,
several times a second.

Fix: `bindEfxbnModelInstanceSlots(particles, capacity, previousSlotByParticleId)` holds a slot
with its particle across frames and only releases it when that particle is gone — a free list, the
same shape the engine's instance allocator uses. Particle ids are assigned in emission order and
never reused, so they identify a particle across frames. The slot map is kept per emitter/target
edge rather than per target block, because two emitters may spawn the same block and each needs
its own stable assignment.

### Why the ids are safe to key on

`particleId` increments for every *attempted* particle, alive or not, and the tick loop always
replays from tick 0 with a frame-independent emitter stream. The `particles.length < maxParticles`
cap can stop emission earlier on one frame than another, but only ever truncates the tail — the
prefix of ids and their values is identical at every frame.

## 2026-08-16 The preview window, and what 33.efxbn actually is

### A fixed 120-frame window is wrong for a third of the corpus

The preview mapped progress 0..100 onto a hardcoded 120 frames for every effect. Measuring the
678 shipped files:

| | share |
| --- | --- |
| effects with a looping emitter (fill the window) | 57.4% |
| one-shot effects | 42.6% |
| …of those, finishing in under half the window | 77.2% |
| one-shot window fill ratio | p10 0.06, p50 0.25, p90 1.00 |
| effects needing more than 120 frames | 6.9% |

A median one-shot effect therefore played for about half a second and then left an empty viewport
for a second and a half before snapping back — a blink, not an animation — while 47 files were cut
off mid-flight.

`resolveEfxbnPreviewFrameCount` now derives the window from the longest root-to-leaf
`delay + life` chain down the child tree, because an emitter produces until its life ends and the
last thing it spawns lives its own span after that. Applied to the corpus: **25.4% shortened
(dead time removed), 8.7% extended (no longer cut off), 65.9% unchanged.**

A looping effect never ends, so its chain length says nothing about restart cadence — and
restarting once per cycle would make it pulse. Those keep the 120-frame floor, which is why the
unchanged share is exactly the looping share plus the one-shot effects that already filled the
window.

### Two NaN paths in the view-angle ramp

`normalize(particleCenter - cameraLocalPosition)` is undefined for a particle sitting on the
camera, and `(rim - threshold) / (1 - threshold)` divides by zero at `threshold == 1`. Either one
turns the whole vertex colour into NaN, which drops the quad for that frame — a flicker rather
than a wrong shade. Both are guarded now, in the GLSL and in `efxbnViewAngleFactor`, which the
inspector and the tests share.

### `cullingType` is not the reason a model goes missing

The EFXBN preview is the only surface in the app that culls faces — every other SSBH mesh draws
DoubleSide — and it does so from `cullingType`, which 31.4% of model blocks set non-zero
(27.1% type 1, 4.3% type 2). Getting the winding convention backwards would hide all of them.

Measured rather than assumed: the shipped `eff_000common_000common_001_sphere_001__maya__.numshb`
winds counter-clockwise seen from outside, which is WebGL's front-face convention, so
`cullingType 1 → FrontSide` shows the exterior. The mapping is correct and is now pinned by
`shipped_effect_meshes_wind_counter_clockwise_when_seen_from_outside`.

### What 33.efxbn is

Six blocks, no billboards:

| block | type | model | resolves in |
| --- | --- | --- | --- |
| 0 | Model | `0x328D9438` sphere_001 | **`000common_001`** |
| 1 | Model | `0x365C959D` ring_001 | own pack |
| 2 | Emitter → 3 | — | — |
| 3 | Model | `0xAF55C427` ring_002 | own pack |
| 4 | Emitter → 5 | — | — |
| 5 | Model | `0xAF55C427` ring_002 | own pack |

It is a sphere wrapped in three rings. The three rings resolve in the pack's own files and always
drew; only the sphere needs the shared pack. Seeing "a circular plane" is therefore the rings
rendering without the sphere — the shared-pack model is the single missing piece, and blocks 1/3/5
prove the rest of the path works.

`the_shared_sphere_model_exposes_a_loadable_numdlb` pins the backend half end to end: the sphere
resolves through the shared pack, its `.numdlb` and `.numshb` exist on disk and are not flagged
missing, and block 0 binds exactly that hash. A frontend that still draws proxy geometry for it is
running an `inspect_effect_folder` that predates shared-pack resolution, which
`assertResolvedInventoryShape` now rejects by name instead of letting the preview degrade.
