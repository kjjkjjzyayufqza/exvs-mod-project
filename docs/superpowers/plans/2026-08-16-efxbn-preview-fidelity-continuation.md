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

**Where we stand.** Roughly 60% of visual fidelity, measured as "provably matches the decompiled
shader logic", up from the ~20–30% the user reported on 2026-08-15. Appearance cannot
be compared against the game — see §7 K1 — so every claim here is a claim about matching decoded
logic, never about looking identical.

---

> **Editing lives elsewhere.** This document is the authority on making the preview *look* right.
> Making the file *editable* — models, textures, curves, topology — is
> `2026-08-21-efxbn-real-editing-architecture.md`.

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
11. **Half-implemented is the dangerous state, and a coverage audit cannot see it.** The two
    largest bugs this project has found — `actionFlags & 0x10` uniform size (31.3% of drawable
    blocks) and the emitter's `rotationBase` (24.6% of emitter pairs) — were both inside features
    this plan listed as **done**. Uniform size copied the random factor but not the base; rotation
    read the target block but not the emitter. Ranking unimplemented features by corpus share is
    structurally incapable of finding either. When auditing something already implemented, put the
    shader lines and the TypeScript side by side and check they compute the same expression — do
    not ask "is the feature present".
12. **Drive from the user's symptom before the backlog.** Both of those bugs came from single words
    in a user report ("椭圆形", "2D 屏幕特效"), each resolving to a cause within an hour. Nothing
    the ranked backlog produced in the same session was as valuable or as visible. Ask for a precise
    description — shape, position, colour, timing — and treat the corpus ranking as what fills the
    gaps between symptom reports, not as the primary driver.
13. **A stale binary must fail loudly, not degrade.** The Rust backend and the TypeScript frontend
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
| **Spawn forms 0 / 5 on a sphere of `spawnFormLength[0]`** | `efxSpawnParticleCommon3rd` + the `efxbnSpawnBasis` column-2 derivation |
| **`actionFlags & 0x10` copies the X spawn size into Y and Z** | `efxSpawnParticleCommon3rd` lines 1443–1445 |
| **Emitter `rotationBase` orients everything it spawns** (position, direction, particle euler) | same file, read at line 273, composed at 1194–1212; `positionOffset` stays outside per line 794 |
| **Spawn form 2 as a flat ring** (form 3 minus the cylinder height) | same, `_643 = (type == 3)` gates the height alone |
| **`emitAreaType == 1` area sampling `r * sqrt(U)`** on forms 0/2/3/5 | same, `_1506` |
| **Per-particle deterministic RNG** — each particle owns `particleSeed(pairSeed, id)` | rule 9 |
| **Model instance pool slots held across frames** — `bindEfxbnModelInstanceSlots` | rule 9 |
| **Playback window derived per effect** — `resolveEfxbnPreviewFrameCount` | §5 P3 background |
| **Looping warm-up so progress 0 is steady state** — `resolveEfxbnWarmUpFrames` / `simulateEfxbnPreviewFrame` | §5 P3 |

### Geometry — ~85%

| Area | Anchor |
| --- | --- |
| Billboard basis: camera-facing / element-rotation / axis-locked from `actionFlags & 0x80 / 0x20 / 0x20000000` | `efxConstructDrawBufferBillboard3rd` line ~113 (`_248 & 536870912 \| _248 & 32`) |
| Billboard `centerPivot`: quad offset by `right*(sizeX*pivotX*0.5) + up*(sizeY*pivotY*0.5)` | same file lines 196–198 and 227–232 |
| Face culling `0/1/2 → DoubleSide/FrontSide/BackSide` | **measured**, see §7 T3 |
| Strip per-node history (own width and colour per node) | `EfxExtractedDrawInfoStrip3rd` |
| **Strip `centerPivot.x` slides the ribbon off its path** (magnitude proven, side unproven) | `efxExtractDrawInfoStrip3rd` lines 223, 362–363 |
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
| ~~S1~~ | ~~`actionFlags & 0x10` uniform size only equalised the random factor, not the base~~ — **done 2026-08-16** | was **31.3% of drawable blocks** | simulation |
| ~~S2~~ | ~~Emitter `rotationBase` ignored, so everything it spawns stayed unrotated~~ — **done 2026-08-16** | was **24.6% of emitter pairs / 40.0% of files** | simulation |
| ~~P1~~ | ~~Spawn forms 2 / 5 ignore their radius~~ — **done 2026-08-16**, forms 0/2/5 + area sampling | was 17.4% of emitters | simulation |
| ~~P2~~ | ~~Strip `centerPivot.x` ignored~~ — **done 2026-08-16** | was 20.0% of strips | geometry |
| P1b | Spawn form 7 still falls through to the unproven fallback | **3.0% of emitters** (97 with a radius) | simulation |
| P1c | Box forms 4 / 8 fill the volume; the shader picks one of six **faces** | 4.9% of emitters | simulation |
| ~~P3~~ | ~~Looping effects restart from tick 0 at the wrap~~ — **done 2026-08-16** | was 49.1% of files (measured, not the 57.4% flag count) | simulation |
| **BLOCKED** | Lighting variants (`lightingFlags`) — needs a scene environment cube | 5.5% of blocks / **14.6% of files** (207; model 124, billboard 83) | scene-coupled |
| **BLOCKED** | Normal map (`normalMapHash`) — feeds the same lighting path. Re-measured: it is a **billboard** feature (135) far more than a model one (27) | 4.3% of blocks / **11.1% of files** (162) | scene-coupled |
| **BLOCKED (evidence)** | Soft particle *colour* term, draw-scheme `0x10000`. `CB1_m0[2].w` and `CB1_m0[3].x` have no identified authored counterpart; needs IDA on the CB1 upload site | **0.5%** (19 blocks, 9 files) — measured, so the blocked half is negligible | shading |
| P5 | Strip UV axes — the transpose was already fixed; what the shader's 4-component vertex UV actually means is **unresolved** | all 290 strips | geometry |
| P5 | UV scroll semantics not split by draw type | 7,320 scroll parameters | shading |
| P6 | Four-corner `uvU/uvV` collapsed to a min/max rectangle | all | shading |
| P6 | Curve LUT quantization (16-column texture) not reproduced | all curves | shading |
| P7 | `blendState 1` rendered as Normal, unverified | 18.1% | render state |
| P7 | MultiUV — self-contained, needs the mesh's second UV stream | model blocks with a 2nd UV set | shading |
| **BLOCKED** | ColorEx `0x200` framebuffer grab | 1.8% | scene-coupled |
| ~~—~~ | ~~HLight~~ — **closed as a phantom**: `efxDrawModelHLightPS` is byte-identical to `efxDrawModelPS` | was 2.4% | — |
| ~~Soft particle depth fade~~ | **done 2026-08-21** — the host-model feature turned this from the smallest item into the largest | was ≤4.6% of files with no host; **66.3% of drawable blocks / 72.6% of files** with one | shading |

### The remaining shading gaps are one blocked group, not five items

Reading the texture registers each pixel-shader variant binds splits the whole shading backlog
cleanly, and the split is more useful than any individual percentage:

| variant | texture slots | needs a scene input? |
| --- | --- | --- |
| `efxDrawModelPS` (base) | t0 | no — done |
| `efxDrawModelAddMixPS` | t0 | no — done |
| `efxDrawModelHLightPS` | t0 | no — **byte-identical to the base shader**, phantom |
| `efxDrawModelColorExPS` | t0, t1, t8 | no — t1/t8 are the block's own offset map, done |
| `efxDrawModelMultiUVPS` | t0, t3, t4, t8 | no — effect textures plus the mesh's 2nd UV set |
| `efxDrawModelSoftPS` | t0, **t7** | **yes — scene depth** |
| `efxDrawModelLightPS` | t0, t2, **t5 cube** | **yes — environment cube map** |

Everything self-contained is done or is a phantom. Everything still open below the self-contained
tier — Soft, Light, normal map, the ColorEx `0x200` framebuffer grab — waits on **one** thing:

> **The preview has no scene context.** No opaque geometry to occlude against, no depth buffer, no
> environment cube, no framebuffer to sample. In game these terms are computed against the stage
> and the unit the effect is attached to.

So the correct next infrastructure step is not any single shading term but *giving the preview the
game's scene context* — the host unit or stage model, a depth pre-pass, and an environment map.
That one feature unblocks 5.5% + 4.3% + 1.8% of blocks plus soft particle's real (if small) share,
and it is also the only way to make the preview's framing and scale trustworthy. It is deliberately
**not** ranked in the ledger above, because it is a preview feature rather than a fidelity gap.

**Closed as not-a-gap:** `fieldEffectType` is **0** across the whole tree, so the four
`efxKineticParticle*FieldEffect3rd` shaders describe behaviour no shipped effect uses. Do not
spend time on them.

---

## 5. Tasks

### P0 — Soft particle depth fade · DONE 2026-08-21, by building what it was blocked on

**Ranked first on 2026-08-16, demoted the same day, then shipped on 2026-08-21 once its actual
prerequisite existed. The whole arc is the point.** The 66.3% is the share of drawable blocks that
*set* `enableSoftParticle`. On an empty scene that is not the share where a pixel changes:

| measurement | value |
| --- | --- |
| blocks with `enableSoftParticle` set | 2495 / 3761 = **66.3%** |
| blocks that **write depth** after runtime normalization | 69 / 3761 = **1.8%** |
| files containing a soft block | 492 / 678 = 72.6% |
| files containing any depth writer | 43 / 678 = 6.3% |
| files where **both** coexist | 31 / 678 = **4.6%** |

A soft particle fades against whatever wrote depth. The effect preview scene contains **no opaque
geometry at all**: the only non-effect object is drei's `Grid`, which is an alpha-blended shader
plane (and is preview furniture, so fading against it would be actively wrong). Effect blocks
themselves almost never write depth, because the runtime normalization is

```text
blendState == 0            -> zWriteEnable = 1
enableSoftParticle != 0    -> zWriteEnable = 0     // applied second, wins
```

so a block that opts into soft particles simultaneously opts out of writing depth. The two are
mutually exclusive by construction.

With an empty depth buffer the fade computes `clamp((far - fragDepth) / range, 0, 1) = 1` and
multiplies alpha by 1. **No visible change on 95.4% of files**, and on the remaining 4.6% only
where a soft particle intersects one of those 69 depth-writing blocks.

**The real prerequisite** is putting the host character or stage model into the preview scene —
in game that is what soft particles fade against. That is a separate feature with its own value
(seeing an effect at the right scale on the unit it belongs to), and soft particles should be
implemented as part of it, not before it.

**Two findings worth keeping for whoever does implement it.**

*The naive depth-texture path is wrong here.* `SsbhModelCanvas` creates its `<Canvas>` with
`logarithmicDepthBuffer: true`. The shader's linearization `CB0_m0[1].x / (sceneDepth - CB0_m0[0].w)`
assumes a standard perspective depth buffer; three.js writes `log2(w+1)`-encoded depth via
`gl_FragDepth` instead. Either linearize with the log formula or — better — render a dedicated
linear view-depth pass into a colour target so the encoding is under your own control. The override
material has to handle GPU skinning and instancing, both of which the model path uses.

*The maths itself is fully decoded already*, from
`tmp/efxbn-preview/efxDrawModelSoftPS.yyadorigi.hlsl`, `frag_main`:

```text
screenUv    = (clip.xy / clip.w) * (0.5, -0.5) + 0.5
sceneDepth  = depthTexture.Sample(screenUv).x
linearScene = CB0_m0[1].x / (sceneDepth - CB0_m0[0].w)      // A / (z - B), camera block

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
`DRAW_SCHEME_FULL_BRIGHTNESS = 0x40000`. `CB1_m0[1].z` is the block's `softParticleRange` at
`0x1fc`; read `efxbnRuntime(block).softParticleRange` so the 0 → 8 normalization applies (rule 4).
`CB1_m0[2].w` and `CB1_m0[3].x` drive the second term and have no obvious authored counterpart —
identify them before implementing that half.

**What actually shipped, 2026-08-21.**

The deferral was correct and its stated condition — "reinstate when the preview can show the host
unit/stage geometry" — was met by building that feature. Once a host model is in the scene the
measured share inverts completely:

| | without host geometry | with host geometry |
| --- | --- | --- |
| soft particle | ≤4.6% of files | **66.3% of drawable blocks / 72.6% of files** |

so this went from the smallest remaining item to the largest, without the corpus changing. A
deferral whose blocker is a feature you can build is a *sequencing* decision, not a rejection.

Shipped pieces:

- **Host model** — `effectPreviewHostModel.ts` composes the model set (`planEffectPreviewModelLoad`
  appends the host last so effect slots keep their indices), persisted per workspace as
  `hostModelPath`, picked from a `.numdlb` dialog in the preview toolbar. The host is deliberately
  kept out of `hostInstanceTransformsRef` so `SsbhModelCanvas` leaves its own opaque materials
  alone.
- **Linear view-depth pre-pass** — `EffectSceneDepthPass.tsx`. Runs from `scene.onBeforeRender`
  with a re-entrancy guard, which is the only hook guaranteed to fire after every `useFrame` and
  after `updateMatrixWorld`. It renders **only** the host, selected with
  `EFFECT_SCENE_DEPTH_LAYER` on the pass camera rather than by toggling visibility, under
  `scene.overrideMaterial`. `scene.background` is nulled during the pass — a solid background
  colour would otherwise be written into the target as if every pixel held that much depth.
- **Why a colour target, not the depth buffer** — the canvas runs `logarithmicDepthBuffer: true`,
  so the hardware buffer holds `log2(w + 1)`, not the perspective `z/w` the shader's
  `A / (z - B)` reconstruction assumes. Writing `-mvPosition.z` into an `R32F` target skips the
  reconstruction entirely and yields exactly the value it was there to produce. The pass throws if
  `EXT_color_buffer_float` is missing rather than silently producing garbage.
- **The term itself** — `efxbnSoftParticleAlphaFactor` plus GLSL in all three draw paths
  (billboard, strip, and the injected model material). A texel the pass never wrote reads 0 and is
  treated as infinitely far, which is what a cleared depth buffer means; that also doubles as the
  NaN guard for a fragment at `w == 0`.
- **The Face-variant inference, stated openly** — the extracted shader set has no
  `efxDrawFaceSoftPS`. `sub_140188E30` does build that name from the same `0x10001` mask, and
  `efxDrawFacePS` is byte-identical to `efxDrawModelPS` apart from which constant-buffer component
  holds the flag word, so the Model term is applied to billboards and strips too. That is a
  derivation with one unverified step, not a guess — but it is the weakest link in this task and
  should be checked if a billboard ever fades wrongly.

**Deliberately not implemented:** the second, colour-scaling term (`0x10000`). Its two constants
`CB1_m0[2].w` and `CB1_m0[3].x` have no identified authored counterpart. Measured share: **19
blocks across 9 files, 0.5%** — so the unimplementable half is negligible, which is why splitting
the variant was worth doing rather than deferring the whole thing again.

### P0-old — the ranking mistake this task records

Kept deliberately as a worked example of rule 3. "66.3% of blocks set the flag" and "66.3% of
blocks look different if I implement it" are different claims, and only the second one ranks work.
Before promoting any shading gap, ask what it is measured *against* and whether that input exists
in the preview at all.

---

### P1 — Spawn forms · DONE 2026-08-16, with two remainders

**What the headline share got wrong.** The plan first ranked this at "36.5% of emitters fall into
the generic `default` branch". That counts emitters whose form is unhandled, not emitters the
preview actually places wrongly — and most unhandled emitters author a zero radius, so the generic
"origin + random direction" already matched them. Measuring `spawnFormLength[0]` per form:

| form | emitters | radius == 0 | radius != 0 | max radius |
| --- | --- | --- | --- | --- |
| 0 | 1602 | 1568 (97.9%) | 34 | 10 |
| 2 | 388 | 47 | **341 (87.9%)** | **150** |
| 5 | 597 | 412 | 185 | 10 |
| 7 | 186 | 89 | 97 | 80 |

The honest figure was **657 / 3213 = 20.4%** of emitters spawning in the wrong place, and type 2 —
not type 5 — carried most of it, with radii up to 150 units collapsed onto a point.

**What shipped.**

*Forms 0 and 5 — sphere.* `efxSpawnParticleCommon3rd` routes both through one branch that draws two
angles as `float(lcg) * 2pi / 2^32 - pi` and rotates the shared local offset `(0, 0, radius)`.
Rotating `(0, 0, r)` by the spawn-system matrix is its third column times r, and `efxbnSpawnBasis`
already documented that column as `(cos A sin B, -sin A, cos A cos B)` — an independent
corroboration from prior work on the same shader. Form 0 still behaves as a point emitter because
97.9% of its blocks author a zero radius.

*`emitAreaType == 1` — area sampling.* The shader takes `sqrt((r * r * 0.5) * u)` with `u` over
`[0, 2)`, which is `r * sqrt(U)`. Applied to forms 0, 2, 3 and 5. **This also fixed form 3**, which
had been using a fixed radius on all 230 of its emitters including the 65 that ask for area
sampling.

*Form 2 — flat ring.* Forms 2, 3 and 7 share the curve-driven angle from `spawnForm0`/`spawnForm1`
and the shared radius; `_643 = (type == 3)` gates the cylinder-height term **alone**, so form 2 is
form 3 without the height.

**P1b — form 7 remains.** 186 emitters, 97 of them with a radius up to 80. It takes the same
curve-driven angle path as forms 2 and 3 but additionally evaluates `spawnForm2` / `spawnForm3`
(the branch at `efxSpawnParticleCommon3rd.yyadorigi.hlsl:635`, reading element dword 26 = `0x68`).
What those two curves feed is not decoded. It stays in the explicit unproven fallback rather than
being guessed — rule 1.

**P1c — box forms 4 and 8 are a surface, not a volume.** The preview picks a uniform point inside
the box. The shader draws `_640 = lcg % 6` and uses it to pick one of six face directions,
sign-flipping the half-extents `_1512/_1514/_1516` accordingly (the constants decode as
`1070141403 = pi/2`, `3217625051 = -pi/2`, `1078530011 = pi`). 156 emitters, 4.9%.

### P2 — Strip `centerPivot.x` · DONE 2026-08-16

Billboards honoured `centerPivot`; strips did not, so a non-zero pivot left the ribbon centred on a
path the game draws it beside. Non-zero on 20.0% of shipped strips.

From `efxExtractDrawInfoStrip3rd.yyadorigi.hlsl` — `_1569` read at line 223 from element dword 88
(`0x160`), used at lines 362-363 and 391-392:

```text
edgeA = centre - side * halfWidth * (pivotX + 1)
edgeB = centre - side * halfWidth * (pivotX - 1)
```

which is the symmetric `centre +/- halfWidth` shifted by `halfWidth * pivotX` along the side
vector. The preview's strip vertex shader multiplies `ribbonSide * ribbonWidth`, so the shift folds
into the side value: `sides.push(side - pivotX)`.

**Left unproven on purpose.** The magnitude is proven; which of the two edges the shader's side
vector calls positive is not, so a mirrored pivot would slide the ribbon to the opposite side of
its path. Centred ribbons are unaffected either way and an off-centre ribbon beats a centred one
regardless of sign, but settling it needs the UV write traced through
`efxConstructDrawBufferStrip3rd`. The code comment says so at the call site.

### P3 — Looping warm-up · DONE 2026-08-16

**Background.** `resolveEfxbnPreviewFrameCount` derives the timeline from the longest root-to-leaf
`delay + life` chain (25.4% of files shortened, 8.7% extended, 65.9% unchanged), and looping
effects keep a 120-frame floor so they do not restart once per cycle.

**The measured gap.** "57.4% of files contain a looping block" is a flag count. The visible
quantity is how far the population falls at the wrap, which is static-computable as
`rampRatio = childLifeTime / max(1, intervalBase)` — steady state over the first tick's burst:

| rampRatio | share of looping emitter/child pairs |
| --- | --- |
| > 1.5 | 65.1% |
| **> 3** | **52.3%** (median 4.0, p90 30, max 120) |
| > 10 | 26.4% |

**49.1% of files** (333/678) hold at least one pair above 3x, i.e. the cloud visibly collapses and
rebuilds once per window. Unlike soft particle, the flag count and the visible share broadly agree
here, so the item survived re-measurement.

**What shipped.** `resolveEfxbnWarmUpFrames(pair)` returns `delay + targetLife` for a looping
emitter and **0 for everything else**; `simulateEfxbnPreviewFrame` adds it to the timeline frame.
The population saturates exactly when the first particle emitted reaches its lifetime, so that is
both sufficient and minimal.

Per-pair rather than per-effect, which is what makes a mixed file work: the looping half starts in
steady state, the one-shot half still starts from nothing. A global warm-up would have finished the
one-shot half before progress 0.

All four call sites go through the wrapper — the three preview surfaces plus
`resolveEfxbnModelPoolPlan`, which must size the pool for steady state rather than for the ramp.
`simulateEfxbnEmitterPair` stays a pure "state at frame N" function so the emission-mechanics tests
can still drive it directly.

**Cost, measured rather than assumed.** Warm-up frames over looping pairs: p50 = 8, p75 = 23,
p90 = 38, p99 = 100, max = 207. Only 0.1% exceed 120 and nothing reaches the 600 clamp, so the
typical addition is single-digit ticks per rendered frame.

**Still imperfect.** Both ends of the window are now in steady state, so the population no longer
jumps — but the particles themselves are different particles across the wrap, because the window is
not constrained to a whole number of emitter cycles. For a dense cloud that is far less visible
than the collapse it replaces. Making the window an exact multiple of the dominant cycle would
close it, and is worth doing only if the residual proves visible.

### S3 — Expression-diff the "done" table · UNSTARTED, and the open worry

Two half-implementations were found by accident from one user sentence. Nobody has looked for the
rest. Every row in §2 marked done should be checked by putting its shader anchor and its TypeScript
side by side and confirming they compute the same expression — not merely that the feature exists.

Highest-suspicion rows, because they are multi-component rules where implementing one component and
missing another produces exactly the "looks plausible, wrong pixels" failure the two known bugs had:

- `sizeRandom` / `rotationRandom` — is the shader's exact `base * (1 + signedRand * rate)` form
  applied on every component?
- the UV pattern 1/2/3 transforms, which have per-draw-type branches (see P5)
- the draw-scheme producer bits — every bit is derived, but is each gated on the same condition?
- `stripTailAlphaRate` / `stripHeadAlphaRate` interpolation direction
- billboard basis selection versus the quad construction that consumes it

Unglamorous, and probably where the next 20% of fidelity is. See
`docs/agent-sessions/2026-08-16-efxbn-preview-session-reflection.md` §2 for why the ranked backlog
cannot surface these.

### P4 — Lighting and normal map · BLOCKED on scene context

`lightingFlags` (`0x1c4`, 5.5% / 207 blocks, values `{1,3,5,13,4,12,8}`) and `normalMapHash`
(`0x1c8`, 4.3% / 162 blocks; 108 blocks set both) select the `Light` variant.

`efxDrawModelLightPS.yyadorigi.hlsl` binds `T2 : TextureCube : register(t5)` and samples it at
line 121 with a reflection vector, plus `T1 : register(t2)` for the normal map, and consumes
`NORMAL` and `TANGENT` vertex inputs. The effect preview has no environment map to bind. Lighting
the effect against the viewport's `softCharacter` light preset would be preview furniture, exactly
the mistake the soft-particle deferral avoids.

Same prerequisite as P0 — see "The remaining shading gaps are one blocked group" in §4.

### P5 — Strip UV axes (row corrected 2026-08-16), UV scroll per draw type

**Strip UV axes — the inherited row was stale; the replacement is honest about not knowing.**
The 2026-08-09 roadmap's B2 said the builder wrote `[side, t]` transposed. That has since been
fixed: `efxbnStripGeometry.ts` writes `U = t` (along the ribbon) and `V = edge` (across the width),
with a shader-citing comment and a passing test. **The row is stale — do not re-do B2.**

Re-deriving it on 2026-08-16 advanced the picture but did not settle it. Two solid new facts:

*The vertex layout is pinned.* `efxDrawFaceVS`'s input struct is
`float4 POSITION; float4 COLOR; float2 TEXCOORD; float2 TEXCOORD_1;` — 12 floats, exactly the three
float4s per vertex that `efxConstructDrawBufferStrip3rd` writes. So float4 #1 is position, #2 is
colour, and #3 is `(TEXCOORD.xy, TEXCOORD_1.xy)` — two UV sets.

*The two emitted vertices differ in a specific way.* Per invocation the shader writes exactly two
vertices:

```text
vertexA: colour = (_175, _176, _177, _120)   uv = (_137.y, _201)   uv2 = (_137.w, _206)
vertexB: colour = (_175, _176, _177, _121)   uv = (_137.x, _201)   uv2 = (_137.z, _206)
```

They share RGB and both V components, and differ in alpha and both U components. `_137` is the
per-node record at dwords 25–28; `_201` / `_206` are `base` / `base + 1` chosen by the reverse-U and
reverse-V flags (`_148 & 2`, `_148 & 16`).

**The unresolved question is what those two vertices are.** If they are the ribbon's two *edges*,
then U varies across the width and the current implementation is transposed after all. If they are
*consecutive nodes* along the ribbon — which the differing alpha supports, since
`EfxExtractedDrawInfoStrip3rd` gives a node its own `prevColorAlpha` / `currentColorAlpha` — then U
runs along the length and the current implementation is right.

Settling it needs the index buffer traced: find how quads are assembled from the per-invocation
vertex pairs. **Do not change `efxbnStripGeometry.ts` before doing that** — it has a test and a
plausible reading, and flipping it on this evidence would be trading one guess for another.

Also noticed and unimplemented: `_148 & 2` and `_148 & 16` are reverse-U and reverse-V flags.

**UV scroll by draw type.** Three corrections carried over from the 2026-08-09 roadmap C1 and still
open: Billboard and Strip read offsets 36/52/68 (speed, direction, limit) while only Model reads
104/108; Model pattern 1 does not apply `uvScrollLimit`; Billboard and Strip subtract the limit once
when exceeded rather than applying a positive modulo. The current `evaluateEfxbnUvTransform` has a
`modelParticle` flag but applies a modulo everywhere.

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
./node_modules/.bin/vitest run --no-file-parallelism      # 2026-08-21: 1008 passed / 5 failed
                                                          # the 5: Fhm2dMemoryPreviewModal x2,
                                                          # useSsbhFileEditorSessions x3.
                                                          # ListeningRepackDialog was in the old
                                                          # baseline of 6 and now passes.

# Rust (from src-tauri/)
cargo test --test effect_folder_real_data_test            # 2026-08-21: 18 passed (E1 added 4)
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

**T5 — `33.efxbn` is the reference case, and it has caught three separate bugs.**
`wing_gundam_zero_rebellion_effect/0/0/33.efxbn` is a sphere wrapped in three rings: six blocks,
zero billboards; blocks 1/3/5 are rings resolving in the pack's own files and block 0 is the sphere
from the shared pack. The EXVS2 wiki describes the move as deploying a blue **spherical** effect
that jams guidance, which is independent corroboration of the geometry.

| symptom the user reported | cause |
| --- | --- |
| "flat circle" | shared-pack model unresolved — T4, not geometry |
| "**椭圆形**" (oval) | `actionFlags & 0x10` uniform size not applied: `sizeBase (2.5, 1, 1)` rendered as an ellipsoid instead of a 2.5x sphere |
| "**2D screen effect**" | emitter `rotationBase` ignored, so the 45-degree and (-55, 25)-degree ring emitters left all three rings coplanar |

Expected geometry after the fixes: a uniform 2.5x sphere, ring_001 at 0 degrees, ring_002 at 45
degrees, and a flattened ring_002 at (-55, 25) degrees — block 5 keeps its non-uniform
`(2.5, 0.5, 2.5)` because its `0x10` flag is clear, which is a useful consistency check that the
flag reading is right. Re-derive this table before trusting any new "33 looks wrong" report.

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
