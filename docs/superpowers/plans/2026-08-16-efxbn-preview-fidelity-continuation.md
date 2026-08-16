# EFXBN Preview Fidelity — Continuation Plan

> **Supersedes the preview track of** `2026-08-09-efxbn-preview-and-editing-roadmap.md`.
> That document's Phase A/B rows had all been implemented by the time they were re-audited on
> 2026-08-16 but were still listed as open, which sent at least one session chasing work that was
> already done. Its editing track (Phases F–J) is still current and is **not** restated here.
>
> **For agentic workers.** Every task below carries: the measured corpus share that justifies its
> rank, the shader file and line that proves the behaviour, the exact files to touch, and a
> definition of done that ends in a real test run. Never mark a step done on inspection alone.

**Goal.** A preview that can be trusted to predict what the game draws.

**Where we stand.** Roughly 55–60% of visual fidelity, measured as "provably matches the
decompiled shader logic", up from the ~20–30% the user reported on 2026-08-15. Appearance cannot
be compared against the game — see §7 K1 — so every claim here is a claim about matching decoded
logic, never about looking identical.

---

## 0. How to use this document

1. Read §1 (working rules) and §7 (traps). Both exist because breaking them already cost a session.
2. Read §2 to learn what is already done. **Do not re-implement from the old roadmap.**
3. Pick the highest task in §5 that is not marked done. Tasks are ordered by measured impact.
4. Before starting, re-measure the share with §3. Corpus shares are the only ranking authority.
5. Finish with §6's verification protocol. Update §2 and §5 in this file as part of the task.

---

## 1. Working rules

Carried forward from the 2026-08-09 roadmap (each already caused a bug once):

1. **Never promote a guess to a mapping.** Expose the raw value and say it is unproven.
2. **Look for the enum name table before reverse-engineering the consumer.**
3. **Measure the corpus before ranking work.**
4. **Read the runtime value, never the authored one.** `sub_140146590` rewrites blocks before
   anything draws them; renderers and the simulation read `runtime`.
5. **One typed view per set of bytes.**
6. **Truth flows Rust → TypeScript → GLSL, once.** The Blender mirror imports the same TypeScript.
7. **File-based TDD against real packs, never writing into `E:\XB`.**

Added 2026-08-16, each from a defect found this session:

8. **Verify a field offset against `effect_folder.rs` before scanning for it.** A corpus scan run
   against `0x198` "proved" that 59.9% of `delayEmitTimeBase` values were fractional and that the
   emitter countdown could never fire. `0x198` is `positionOffset[2]`; the real offset is `0x1a0`,
   where 0% are fractional. The conclusion was entirely an artefact of the wrong offset. §3 carries
   the verified offsets — extend that table rather than reading offsets from a dump script.
9. **A replayed-from-frame-0 simulation makes every frame-dependent value a flicker source.**
   `simulateEfxbnEmitterPair` re-runs the whole emission history on every rendered frame. Anything
   whose result depends on *which* frame is being drawn — a shared RNG cursor, an array index into
   the live-particle list, a pool slot — will change under the viewer as particles expire. Audit
   for identity stability before blaming shading.
10. **Guard every `normalize` and every divide in vertex/fragment code.** A NaN in a vertex colour
    drops the whole primitive for that frame. That reads as flicker, not as a wrong colour, so it
    is easy to misattribute.
11. **A stale binary must fail loudly, not degrade.** The Rust backend and the TypeScript frontend
    ship separately during development. When the frontend depends on a new backend field, assert it
    at the service boundary (`assertResolvedInventoryShape` is the precedent) so an unrebuilt
    backend says so instead of silently rendering placeholder geometry.

---

## 2. Verified state as of 2026-08-16

Everything in this table has a test. Do not re-implement.

### Format and data model — ~95%

| Area | Anchor |
| --- | --- |
| 145 fields parsed; only `reserveArea[31]` unknown | `effect_folder.rs` `parse_efxbn_bytes` |
| Runtime normalization (`zWriteEnable`, action-flag forcing, wrapper type adoption, strip defaults) | `sub_140146590` |
| Topology: `level` + `childIndexSize` + `childIndexArray[8]` | corpus |
| `drawSchemeFlag`: every producer bit + the enable gate | `sub_1401470F0`, `sub_140145DF0` |
| Shader **variant selection** (identification, not rendering) | `sub_140188E30` |
| Cross-pack resolution against `000common_001` | §2 of `2026-08-08-efxbn-format-rederivation.md` |

Not done: a byte-faithful writer and its round-trip proof. That is roadmap Phase F1a and still gates
the editing track.

### Simulation — ~70%

| Area | Anchor |
| --- | --- |
| Emitter lifetime randomisation + `lifeTimeRatio` | `efxSpawnEmitterCommon3rd` |
| Emit count randomisation; `meshEmitterCount` override | `efxKineticEmitterCommon3rd` |
| Emission interval countdown (emit at 0, reload `base*(1+R*rand)`) | `efxKineticEmitterCommon3rd` slot 12 |
| Loop wraps curve phase without rebuilding position | `efxKineticParticleBillboard3rd` |
| Spawn basis so `speedBase*` is spawn-local | `efxSpawnParticleCommon3rd` |
| Mesh emitters (spawn form 9/10) from decoded draws | `efxbnMeshEmitter.ts` |
| **Per-particle deterministic RNG** — each particle owns `particleSeed(pairSeed, id)` | rule 9 |
| **Model instance pool slots held across frames** — `bindEfxbnModelInstanceSlots` | rule 9 |
| **Playback window derived per effect** — `resolveEfxbnPreviewFrameCount` | §5 P3 background |

### Geometry — ~85%

| Area | Anchor |
| --- | --- |
| Billboard basis: camera-facing / element-rotation / axis-locked from `actionFlags & 0x80 / 0x20 / 0x20000000` | `efxConstructDrawBufferBillboard3rd` line ~113 (`_248 & 536870912 \| _248 & 32`) |
| Billboard `centerPivot`: quad offset by `right*(sizeX*pivotX*0.5) + up*(sizeY*pivotY*0.5)` | same file lines 196–198 and 227–232 |
| Face culling `0/1/2 → DoubleSide/FrontSide/BackSide` | **measured**, see §7 T3 |
| Strip per-node history (own width and colour per node) | `EfxExtractedDrawInfoStrip3rd` |
| Per-particle depth sort, front-to-back only for opaque + `extraFlags & 0x2000` | `efxMakeSortInfoBillboardDrawerID3rd`, `efxSortParticle3rd` |

### Shading — ~45%

| Area | Anchor |
| --- | --- |
| Base Face/Model PS | `efxDrawFacePS`, `efxDrawModelPS` |
| ColorEx `0x80` UV displacement at all three draw sites | `efxDrawFaceColorExPS` |
| AddMix | `efxDrawFaceAddMixPS` |
| `0x40000` full-brightness bypass of the `rgb * 0.5` | base Face/Model PS |
| View-angle alpha ramp (`actionFlags & 0x02000000`), billboard only | `efxConstructDrawBufferBillboard3rd` |
| Camera-proximity fade | same |
| Texture addressing `hkImageAddressMode` 0–3, BORDER emulated | name table `0x1415CB9B0` |
| UV pattern 1/2/3 transforms | `efxKineticParticle*3rd` |

### Editing — ~10%

Colour control constants only, through `EfxbnColorAuthor` → `patch_efxbn_control_constants`.
Everything else is read-only. See roadmap Phases F–J.

---

## 3. The measurement toolkit

Rule 3 says measure before ranking. Rule 8 says verify the offset first. This section is what makes
both cheap.

### Container layout

```text
header      0x00  magic "EFXB"
            0x04  versionOrFlags
            0x08  fileSize
            0x0C  effectCount
            0x10  curveKeyCount
            0x14  modelControlCount
blocks      0x18  effectCount records, stride 0x370 (880 = sizeof SEfxElementData)
curve keys  after blocks, 8 bytes each: (f32 key, f32 value)
model ctrl  stride 0xB8
```

### Verified block field offsets

Every one of these was read back out of `src-tauri/src/format/effect_folder.rs`. Add to this table
only after doing the same — see rule 8.

| Offset | Field | Type |
| --- | --- | --- |
| `0x00` | `level` | u32 |
| `0x04` | `childIndexSize` | u32 |
| `0x08` | `childIndexArray[8]` | i32×8 |
| `0x28` | `effectType` | u32 (1 Billboard, 3 Model, 5 Strip; 6/8/9/10/11 containers) |
| `0x2c` | `lifeTimeBase` | f32 |
| `0x30` | `lifeTimeRandom` | f32 |
| `0x34` | `intervalBase` | f32 |
| `0x38` | `intervalRandom` | f32 |
| `0x3c` | `numEmit` | u32 |
| `0x40` | `actionFlags` | u32 |
| `0x44` | `spawnFormType` | u32 |
| `0x48` | `spawnFormLength[4]` | f32×4 |
| `0x58`–`0xd0` | 16 control references, 8 bytes each `(selector, lookupIndex)` | see below |
| `0x140` | `nudHandle` (model id) | i32 |
| `0x150`/`0x154` | `colorTextureParameterIndex[2]` | i32×2 |
| `0x158`/`0x15c` | `uvTextureParameterIndex[2]` | i32×2 |
| `0x160` | `centerPivot[2]` | f32×2 |
| `0x170` | `cullingType` | u32 |
| `0x174` | `zWriteEnable` (authored; read `runtime`) | u32 |
| `0x178` | `zTestEnable` | u32 |
| `0x17c` | `blendState` | u32 |
| `0x18c` | `enableSoftParticle` | u32 |
| `0x190` | `positionOffset[4]` | f32×4 |
| `0x1a0` | `delayEmitTimeBase` | f32 — **not `0x198`**, see rule 8 |
| `0x1a4` | `emitAreaType` | u32 |
| `0x1a8` | `enableZSort` | u32 |
| `0x1c4` | `lightingFlags` | u32 |
| `0x1c8` | `normalMapHash` | u32 |
| `0x1cc` / `0x1d4` | control refs `worldGravityAccel`, `directionAccel` | |
| `0x1e0` | `stripSegmentInterval` | f32 |
| `0x1fc` | `softParticleRange` | f32 (runtime normalizes 0 → 8) |
| `0x200` | `cameraFadeRange` | f32 |
| `0x204` | `extraFlags` | u32 |
| `0x210` | `blurStartColor[4]` — view-angle ramp start, **not blur** | f32×4 |
| `0x220` | `blurEndColor[4]` | f32×4 |
| `0x230` | `blurEnableRange` (ramp threshold) | f32 |
| `0x234` | `blurFadePower` | f32 |
| `0x290` | `animationId` | i32 |
| `0x2b8` | `numEmitCountRandom` | u32 |
| `0x2c8` / `0x2cc` | `meshEmitterIndex` / `meshEmitterCount` | u32 |
| `0x2d0` | `fieldEffectType` | u32 |
| `0x2f0` | `emitInterpolateType` | u32 |

Control reference order at `0x58` onward, 8 bytes apart:
`spawnForm0..3`, `spreadX`, `spreadY`, `speedBaseX/Y/Z`, `scaleBaseX/Y/Z`, `colorR/G/B/A`, then
`worldGravityAccel` at `0x1cc` and `directionAccel` at `0x1d4`.

### Scan recipe

Write throwaway scanners into the session scratchpad, never into the repo. Skeleton:

```python
import os, pathlib, struct, collections
BASE, STRIDE = 0x18, 0x370
SKIP = {"node_modules", ".git", ".pnpm"}          # E:/XB contains a dangling .pnpm junction;
                                                   # pathlib.rglob raises WinError 3 on it,
                                                   # so always use os.walk with onerror.
def u32(b, o): return struct.unpack_from("<I", b, o)[0]
def f32(b, o): return struct.unpack_from("<f", b, o)[0]

for cur, dirs, names in os.walk("E:/XB/mod/006effect", onerror=lambda e: None):
    dirs[:] = [d for d in dirs if d not in SKIP]
    for nm in names:
        if not nm.lower().endswith(".efxbn"): continue
        data = (pathlib.Path(cur) / nm).read_bytes()
        if len(data) < 0x1C: continue
        n = u32(data, 0x0C)
        if n == 0 or n > 4096 or len(data) < BASE + n * STRIDE: continue
        for i in range(n):
            b = BASE + i * STRIDE
            ...
```

Reference totals for `E:/XB/mod/006effect` (678 files), so a scan that disagrees is wrong:

```text
drawable blocks 3761 = billboard 1142 + model 2329 + strip 290
emitter blocks (childIndexSize > 0) 3213
container/other blocks: type 6 911, type 8 174, type 9 2303, type 10 116
```

### Decompiled shader set

`tmp/efxbn-preview/` (gitignored, 178 files, 60 `.hlsl`). SPIRV-Cross output, so it reads as
`_1234` temporaries; the `.dump.txt` next to each is the raw DXBC disassembly when the HLSL is
unclear. **This directory is the only copy.** If it is missing, the shader anchors in this plan
cannot be re-derived without redoing the extraction.

Pipeline order, which is what tells you *which* file owns a behaviour:

```text
efxSpawnEmitterCommon3rd    emitter birth: randomised life, lifeTimeRatio
efxKineticEmitterCommon3rd  emitter tick: delay countdown, emit count, interval reload
efxSpawnParticleCommon3rd   particle birth: spawn form, spawn basis, per-instance LCG
efxKineticParticle*3rd      particle tick: position, curve phase, lifeCount wrap
efxExtractDrawInfo*3rd      per-particle draw record (sizes, pivot, colour)
efxConstructDrawBuffer*3rd  world-space corners + final vertex colour
efxMakeSortInfo*3rd         sort keys
efxSortParticle3rd          bitonic sort
efxDrawFaceVS               vertex passthrough + atmosphere blend
efxDrawFace*PS / efxDrawModel*PS   pixel variants
```

Per-particle colour and alpha are decided in `efxConstructDrawBuffer*3rd`, **never** in the pixel
shaders. Looking for a fade in a `*PS` file wastes a session.

---

## 4. Gap ledger

Measured 2026-08-16 over `E:/XB/mod/006effect`. Shares are of the 3761 drawable blocks unless
stated. Rank = the order to work in.

| Rank | Gap | Share | Phase |
| --- | --- | --- | --- |
| P0 | Soft particle depth fade not implemented | **66.3%** (2495) | shading |
| P1 | Spawn forms 2 / 5 / 7 fall through to a generic point emitter | **36.5% of emitters** | simulation |
| P2 | Strip `centerPivot.x` ignored | **20.0% of strips** | geometry |
| P3 | Looping effects restart from tick 0 at the wrap | **57.4% of files** contain a looping block | simulation |
| P4 | Lighting variants (`lightingFlags`) | 5.5% (207) | shading |
| P4 | Normal map (`normalMapHash`) | 4.3% (162) | shading |
| P5 | Strip UV axes transposed | all 290 strips | geometry |
| P5 | UV scroll semantics not split by draw type | 7,320 scroll parameters | shading |
| P6 | Four-corner `uvU/uvV` collapsed to a min/max rectangle | all | shading |
| P6 | Curve LUT quantization (16-column texture) not reproduced | all curves | shading |
| P7 | `blendState 1` rendered as Normal, unverified | 18.1% | render state |
| P7 | MultiUV, HLight, ColorEx `0x200` framebuffer grab | small | shading |

**Closed as not-a-gap:** `fieldEffectType` is **0** across the whole tree, so the four
`efxKineticParticle*FieldEffect3rd` shaders describe behaviour no shipped effect uses. Do not
spend time on them.

---

## 5. Tasks

### P0 — Soft particle depth fade · 66.3% of drawable blocks

Two thirds of every drawable block sets `enableSoftParticle`, and the preview reads the field only
to derive `zWriteEnable`. Nothing fades. This is the single largest remaining appearance gap.

**Evidence.** `tmp/efxbn-preview/efxDrawModelSoftPS.yyadorigi.hlsl`, `frag_main`. Transcribed:

```text
screenUv    = (clip.xy / clip.w) * (0.5, -0.5) + 0.5
sceneDepth  = depthTexture.Sample(screenUv).x
linearScene = CB0_m0[1].x / (sceneDepth - CB0_m0[0].w)      // A / (z - B)
                                                            // CB0_m0 is the camera block

if (drawScheme & 0x1)        // soft alpha term
    alpha *= clamp((linearScene - clip.w) / CB1_m0[1].z, 0, 1)

if (drawScheme & 0x10000)    // second term, scales RGB not alpha
    k    = clamp((linearScene - clip.w) / CB1_m0[2].w, 0, 1)
    rgb *= pow(2 - k, CB1_m0[3].x)

discard if alpha < 0.01
rgb *= (drawScheme & 0x40000) ? 1.0 : 0.5                   // already implemented
```

`CB1_m0[1].x` is the draw-scheme flag word, which confirms the existing constants:
`DRAW_SCHEME_SOFT_PARTICLE = 0x1`, `DRAW_SCHEME_EXTRA_40000 = 0x10000`,
`DRAW_SCHEME_FULL_BRIGHTNESS = 0x40000`. The `Soft` variant mask in
`EFXBN_SHADER_VARIANT_MASKS` is `0x10001` — both terms, consistent with this shader.

`CB1_m0[1].z` should be the block's `softParticleRange` at `0x1fc`. The runtime normalizes a zero
range to `8`, so read `efxbnRuntime(block).softParticleRange`, never the authored field (rule 4).
`CB1_m0[2].w` and `CB1_m0[3].x` drive the second term and have no obvious authored counterpart —
identify them before implementing that half, and ship the alpha term alone if they resist.

**Blocker to solve first.** The preview has no depth texture. `SsbhModelCanvas` never allocates
one — `grep -rn "depthTexture" src/components/ssbh-model-preview/` returns nothing. This task is
therefore two pieces:

*P0a — depth pre-pass.* Render the opaque scene into a `WebGLRenderTarget` with a `DepthTexture`
before the transparent effect pass, and expose it on the preview context. Effect layers already
render after models, so ordering is in place. Watch for: resize handling, `previewSuspended`, and
the cost on the 64/128-instance model pools.

*P0b — the fade itself.* Add the two terms to the billboard fragment shader
(`EfxbnParticlePreview.tsx`), the strip fragment shader (`EfxbnStripPreview.tsx`) and the model
override material (`SsbhModelCanvas.tsx`, driven from `EfxbnDiagnosticOverlay`'s
`PreviewInstanceHostTransform`). Keep the maths in **one** exported pure function per rule 6 —
extend `efxbnBillboardShading.ts` with `efxbnSoftParticleAlpha(linearScene, fragmentDepth, range)`
and unit-test it, then call the same formula from all three GLSL sites.

**Files.** `src/components/ssbh-model-preview/SsbhModelCanvas.tsx`,
`src/components/ssbh-model-preview/SsbhModelPreviewContext.tsx`,
`src/page/TestEditor/components/effect-folder-editor/EfxbnParticlePreview.tsx`,
`EfxbnStripPreview.tsx`, `EfxbnDiagnosticOverlay.tsx`, `efxbnBillboardShading.ts`.

**Test.** Unit-test the pure fade against hand-computed values including the clamp at both ends and
a zero range (must use the normalized `8`). Add an inspector row so the value is visible per block.

**Done when.** The pure function is tested, all three draw sites call it, `tsc` is at baseline, the
effect-folder suite is green, and the inspector shows the soft range for the selected block.

---

### P1 — Spawn forms 2 / 5 / 7 · 36.5% of emitter blocks

`spawnPositionAndDirection` in `efxbnSimulation.ts` (the `switch` at ~line 296) handles
1, 3, 4, 6, 8, 9, 10. Everything else falls into `default`, which puts the particle at the origin
with a uniformly random direction. Measured distribution over the 3213 emitter blocks:

| `spawnFormType` | share | status |
| --- | --- | --- |
| 0 | 49.9% | falls through, but a point emitter is plausibly exactly this — **verify, then record** |
| 5 | 18.6% | falls through — wrong shape |
| 2 | 12.1% | falls through — wrong shape |
| 7 | 5.8% | falls through — wrong shape |
| 3 | 7.2% | implemented (ring) |
| 4 + 8 | 4.9% | implemented (box) |
| 1 + 6 | 1.5% | implemented (line) |
| 9 + 10 | 0.2% | implemented (mesh emitter) |

Particles emerging from the wrong shape is directly visible, and unlike shading it needs no new
rendering infrastructure.

**Evidence.** `tmp/efxbn-preview/efxSpawnParticleCommon3rd.yyadorigi.hlsl`. The type is read at
line 260 (`(_171 * 220u) + 17u` → `0x44`) into `_573`; dispatch sites at lines 285 (`== 5`),
429 (`== 7 || == 2`), 635 (`== 6 || == 8 || == 7 || == 5`). `_640` in the same region is
`emitAreaType` (`0x1a4`) and selects edge vs area-uniform sampling — the roadmap's C3 note about
`R * sqrt(U)` belongs here.

**Approach.** Do one type per commit, largest first (5, then 2, then 7), each with its own test.
Confirm type 0 before changing it: if the shader's default branch matches the current code, close
it as verified and say so in §2 rather than leaving it ambiguous.

**Files.** `efxbnSimulation.ts`, `efxbnSimulation.test.ts`.

**Done when.** Each implemented type has a test asserting a distribution property that the generic
branch would fail (e.g. all sampled positions lie on the declared surface within epsilon), and the
share of emitters reaching `default` is re-measured and recorded in §4.

---

### P2 — Strip `centerPivot.x` · 20% of strips

Billboards honour `centerPivot`; strips do not. A non-zero pivot slides the whole ribbon off the
path its particles travelled.

**Evidence.** `tmp/efxbn-preview/efxExtractDrawInfoStrip3rd.yyadorigi.hlsl`. `_1569` is read at
line 223 from element dword 88 (`0x160` = `centerPivot.x`) and used at lines 362–363 and 391–392:

```text
edgeA = centre - side * halfWidth * (pivotX + 1)
edgeB = centre - side * halfWidth * (pivotX - 1)
```

With `pivotX = 0` this is the symmetric `centre ± side*halfWidth`. With `pivotX = -1` the ribbon
lies entirely on one side of the path. Equivalently: the ribbon centre shifts by
`-halfWidth * pivotX` along `side`, and the width is unchanged.

**Note the sign differs from the billboard rule** (`+hx*pivotX` there). Do not assume they share a
convention — transcribe each from its own shader.

**Files.** `efxbnStripGeometry.ts`, `efxbnStripGeometry.test.ts`.

**Done when.** A test builds a straight ribbon with `pivotX = -1` and asserts both edges sit on one
side of the path, and `pivotX = 0` still produces the symmetric ribbon.

---

### P3 — Looping effects restart from tick 0 · 57.4% of files

**Background.** `resolveEfxbnPreviewFrameCount` now derives the timeline from the longest
root-to-leaf `delay + life` chain. Corpus impact: 25.4% of files shortened (they were playing into
dead air), 8.7% extended (they were being cut off), 65.9% unchanged. One-shot effects are now
correct.

**What is still wrong.** A looping effect has no natural end, so it keeps a 120-frame floor —
otherwise it would restart once per cycle and pulse. But at the wrap the simulation still replays
from tick 0, so the effect ramps up from nothing instead of continuing. That is one visible
discontinuity per window for 57.4% of files.

**The fix and why it is not trivial.** Simulate `warmUp + timelineFrame` instead of
`timelineFrame`, with `warmUp` large enough that the system is already in steady state at progress
0, and a window that is a whole number of emitter cycles so the phase matches at the wrap. Two
complications:

- With several looping emitters of different cycle lengths there is no exact common window. Pick
  the dominant cycle and accept phase drift on the others; say so in the code comment.
- An effect that mixes looping and one-shot blocks would have its one-shot parts already finished
  at progress 0 and never visible. Warm-up must therefore be per-pair, not global — or the window
  must cover the one-shot span as well.

**Files.** `efxbnSimulation.ts` (`resolveEfxbnPreviewFrameCount` and a new warm-up resolver),
`EfxbnDiagnosticOverlay.tsx`, `EfxbnParticlePreview.tsx`, `EfxbnStripPreview.tsx`,
`EffectFolder3dPreview.tsx`.

**Done when.** For a looping fixture, the live particle set at `warmUp` and at `warmUp + window` is
equal within epsilon, and a mixed looping/one-shot fixture still shows its one-shot blocks at
progress 0.

---

### P4 — Lighting and normal map · 5.5% and 4.3%

`lightingFlags` (`0x1c4`) and `normalMapHash` (`0x1c8`) both feed the draw-scheme word and select
the `Light` / normal-map variants. Anchors: `efxDrawModelLightPS.yyadorigi.hlsl` (5.3K) and the
`DRAW_SCHEME_LIGHTING_1 / _4 / _8` and `DRAW_SCHEME_NORMAL_MAP` bits already derived in
`effect_folder.rs`. The preview renders the base variant and the inspector already warns that it
will not match. Low share; do after P0–P3.

---

### P5 — Strip UV axes, UV scroll per draw type

**Strip UV axes.** `efxConstructDrawBufferStrip3rd` stores `u` along the ribbon length and the
other axis across the width; the builder writes `[side, t]` — transposed. Affects all 290 strips.

**UV scroll by draw type.** Three corrections against the `fxc` output, carried over from the
2026-08-09 roadmap C1 and still open: Billboard and Strip read offsets 36/52/68 (speed, direction,
limit) while only Model reads 104/108; Model pattern 1 does not apply `uvScrollLimit`; Billboard
and Strip subtract the limit once when exceeded rather than applying a positive modulo. The current
`evaluateEfxbnUvTransform` has a `modelParticle` flag but applies a modulo everywhere.

---

### P6 — Four-corner UVs, curve LUT quantization

`uvU[4]` / `uvV[4]` are per corner; `authoredUvRange` in `effectFolderPreviewPlan.ts` collapses
them to a min/max rectangle and discards sheared quads. Separately, the GPU samples a 16-column
`floatKeyTableTexture`, so curve values are quantized in a way the preview's exact interpolation is
not. Both are "everything is slightly off" rather than "this looks wrong"; do them last.

---

### P7 — Render state verification

`blendState 1` is rendered as Normal on 18.1% of blocks without proof, and `blendState 3` occurs in
zero files. There is no blend-factor enum name table in the binary — searching for one is itself
the finding (rule 2). Route: `sub_1400876A0`. Needs IDA, so it is blocked in the same way as §7 K1.

---

## 6. Verification protocol

Run all of these before claiming a task done. Numbers are the accepted baseline as of 2026-08-16 —
if yours differ, explain why in the same message.

```bash
# TypeScript
./node_modules/.bin/tsc --noEmit -p tsconfig.json        # 2 errors, both pre-existing:
                                                          #   daeSsbhTypes.ts:318
                                                          #   BulletPropertyPanel.tsx:227
./node_modules/.bin/vitest run --no-file-parallelism      # 910 passed / 6 failed
                                                          # the 6: Fhm2dMemoryPreviewModal x2,
                                                          # useSsbhFileEditorSessions x3,
                                                          # ListeningRepackDialog x1

# Rust (from src-tauri/)
cargo test --test effect_folder_real_data_test            # 14 passed
cargo fmt -- --check                                      # pre-existing diffs in bulletparam.rs,
                                                          # unit_model_models.rs, exvs2_json_cli_test.rs
                                                          # — your files must add none
cargo clippy --test effect_folder_real_data_test
```

**Always use `--no-file-parallelism` for the full vitest run.** In parallel the count varies
between 6 and 10 failures because several timing-sensitive suites in `ssbh-model-preview` blow
their budgets under load. Those files are unrelated to effect work and pass in isolation; an A/B
with the change stashed confirms it. Reporting a parallel-run number as a regression wastes a
round trip.

**`cargo test --lib` is broken at HEAD** — 9 errors in the in-file `#[cfg(test)]` module of
`effect_folder.rs` referencing a `meta_parsed` field that does not exist on `EfxbnEffectSummary`.
Pre-existing, unrelated to effect work, and it does not affect integration tests (they compile the
lib without `cfg(test)`). Do not treat it as your breakage; fix it deliberately or leave it.

**Real-data fixtures.** Tests that read `E:\XB` must skip gracefully:

```rust
if !Path::new(SOURCE_ROOT).is_dir() {
    eprintln!("SKIP: real effect fixture is unavailable: {SOURCE_ROOT}");
    return;
}
```

**Never write into `E:\XB`.** Copy into a tempdir and assert afterwards that the game tree is
untouched.

---

## 7. Traps and precedents

**T1 — The roadmap lies about what is done.** The 2026-08-09 "Known-wrong" table still listed all
of Phase A, strip per-node history, billboard basis and `centerPivot`, and culling as open on
2026-08-16; every one had shipped. Grep the source before trusting any status table, including
this one, and update it as part of the task.

**T2 — Wrong offsets manufacture findings.** See rule 8. The `0x198` / `0x1a0` incident produced a
confident, entirely false conclusion that 59.9% of emitters could never fire.

**T3 — `cullingType` is correct; do not "fix" it.** `0/1/2 → DoubleSide/FrontSide/BackSide`, and
31.4% of model blocks cull (27.1% type 1, 4.3% type 2). The EFXBN preview is the *only* surface in
the app that culls at all — every other SSBH mesh draws `DoubleSide` — which makes it a tempting
suspect whenever a model goes missing. It was measured: the shipped
`eff_000common_000common_001_sphere_001__maya__.numshb` winds counter-clockwise seen from outside,
which is WebGL's front-face convention, so `FrontSide` shows the exterior. Pinned by
`shipped_effect_meshes_wind_counter_clockwise_when_seen_from_outside`.

**T4 — A missing model is a resolution problem, not a rendering problem.** 57.8% of model
references and 69.5% of texture references exist only in `000common_001`. When a model draws as a
flat proxy quad, check the inventory first: `EffectFolder3dPreview` names the unresolved IDs under
the viewport, and `EffectFolderResolutionPanel` lists them. If the payload lacks the shared-pack
fields at all, `assertResolvedInventoryShape` throws — that means the Rust backend was not rebuilt.

**T5 — `33.efxbn` reference case.** `wing_gundam_zero_rebellion_effect/0/0/33.efxbn` is a sphere
wrapped in three rings: six blocks, zero billboards, blocks 1/3/5 are rings resolving in the pack's
own files and block 0 is the sphere from the shared pack. "I see a flat circle" means the rings
drew and the sphere did not — i.e. T4, not a geometry bug. Good smoke test for shared-pack work.

**T6 — Bash heredocs break on markdown.** Writing doc sections through a shell heredoc fails on
backticks and quotes. Write the section to a scratchpad `.md` with the Write tool and append it
with a small Python script.

**T7 — `vitest --reporter=basic` does not work in this project.** Use the default reporter.

**K1 — Appearance comparison is blocked.** The user confirmed the game cannot be captured with only
the effect visible, so there is no reference image and there will not be one. The Blender mirror
cannot judge appearance either — it approximates every blend state with emissive materials, so its
renders blow out. Verification therefore runs through: (a) matching decoded shader logic, (b) unit
tests on the pure functions, (c) the user's visual judgement on the preview. Never claim
frame-exact or pixel-exact parity.

---

## 8. Definition of done for this plan

- P0 through P3 complete, each with tests and a re-measured share recorded in §4.
- §2 updated so the next agent does not re-implement finished work (T1).
- The gap ledger contains no entry above 10% of drawable blocks.
- `docs/agent-sessions/2026-08-08-efxbn-format-rederivation.md` carries the derivation for every
  behaviour added, in the same style as the existing sections: what the shader does, the corpus
  share, and why the preview was wrong.
- The verification protocol in §6 passes at or better than its stated baseline.
