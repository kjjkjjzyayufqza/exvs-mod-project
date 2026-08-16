# EFXBN Preview and Editing Roadmap

> **The preview track of this plan is superseded by**
> `2026-08-16-efxbn-preview-fidelity-continuation.md`. Start there for any preview work: this
> file's §3 phases were re-audited on 2026-08-16 and most of Phase A and B had already shipped
> while still being listed as open. The **editing track (§4, Phases F–J) is still current** and is
> not restated in the continuation plan.
>
> **Supersedes the open portions of** `2026-08-08-efxbn-shader-fidelity-and-visual-review.md`.
> That plan stays as the record of the shader-fidelity investigation; every task still open in it
> is restated here with corrected priorities and merged with the editing work it never covered.
>
> **For agentic workers:** every task carries its evidence anchor, the files it touches, and a
> definition of done. Never mark a step done on inspection alone — each ends with a real test run.

**Goal.** A preview that can be trusted to predict what the game draws, and an editor that can
change an effect and ship it back into the game without corrupting the pack.

---

## 0. Working rules

These are not style preferences. Each one exists because breaking it already produced a bug in
this codebase.

1. **Never promote a guess to a mapping.** When an enum or field role is unproven, expose the raw
   value and say it is unproven. Precedent: `blendState` was assumed `2→Additive / 3→Subtractive`;
   the corpus contains no `3` at all, so half that mapping was dead code guarding nothing.
2. **Look for the enum name table before reverse-engineering the consumer.** `find_regex` on
   candidate value names found `hkImageAddressMode::Enum` instantly and settled texture addressing
   in one step. The same search for blend factors returns zero hits — which is itself the finding.
3. **Measure the corpus before ranking work.** The plan this one supersedes ranked the `0x40000`
   half-brightness bypass as a P0 appearance fix. It applies to 0.5% of blocks. Counting first
   reorders the backlog every time.
4. **Read the runtime value, never the authored one.** `sub_140146590` rewrites blocks in place
   before anything draws them. Anything that renders or simulates reads `runtime`.
5. **One typed view per set of bytes.** The flat `modelControlIndices[4]` duplicate of
   `colorTextureParameterIndex[2] + uvTextureParameterIndex[2]` is what let a distortion map get
   promoted into the colour slot on 453 blocks. Duplicated untyped views get deleted, not kept.
6. **Truth flows Rust → TypeScript → GLSL, once.** The Blender mirror imports the same TypeScript
   simulation. A second implementation of any rule is a bug waiting to diverge.
7. **File-based TDD against real packs, never writing into `E:\XB`.** Copy into a tempdir; assert
   afterwards that the game tree is untouched.

---

## 1. Where we are

### Proven and implemented

| Area | State | Anchor |
| --- | --- | --- |
| Block layout | Region starts at `payload + 0x18`; block offset == reflected offset. All 145 fields parsed except `reserve_area[31]` | `sub_140145DF0` |
| Runtime normalization | `runtime` record per block; wrapper type adoption, `zWriteEnable`, soft range, strip defaults, action-flag forcing | `sub_140146590` |
| Topology | `level` + `childIndexSize` + `childIndexArray[8]` tree; type 6 is as common an emitter as type 9 | corpus |
| Element types | Drawable = {1 Billboard, 3 Model, 5 Strip}. **Type 2 occurs in zero files** | corpus, 36,737 blocks |
| `drawSchemeFlag` | Every producer bit + the enable gate. `0x8000` and `0x40000` test the same `extraFlags & 0x2000` | `sub_1401470F0`, `sub_140145DF0` |
| Shader variant selection | Any-bit-hit masks: `0x40` AddMix, `0x280` ColorEx, `0x20804` Light, `0x1000` MultiUV, `0x10001` Soft, `0x20000` HLight | `sub_140188E30` |
| Texture slots | `color0 / color1 / uv0 / uv1`, slot-aware resolution at every call site | block `0x150`-`0x15c` |
| ColorEx `0x80` | Implemented at all three draw sites, from the DXBC | `efxDrawFaceColorExPS` |
| `0x40000` brightness | Flag-driven at all three draw sites | base Face/Model PS |
| Texture addressing | `hkImageAddressMode`: 0 WRAP, 1 MIRROR, 2 CLAMP, 3 BORDER. Identity map into the sampler | name table `0x1415CB9B0` |
| Effect model materials | Effect models legitimately ship no NUMATB; discriminator is the declared `__nust__` profile | 8,767-model survey |
| View-angle alpha ramp | The `blur*` fields are **not** blur: `actionFlags & 0x02000000` fades a billboard's RGBA to `endColor` as it turns edge-on, and end alpha is 0 in every shipped variant. Billboard-only | `efxConstructDrawBufferBillboard3rd` |
| Camera-proximity fade | `(extraFlags & 0x1000) && \|cameraFadeRange\| >= 1e-5 && (actionFlags & 0x00400000)`; hidden inside half the range, linear to full | same shader |
| Particle draw order | Key `(opaque && extraFlags & 0x2000 ? -dist : dist) * 1000`, sorted **descending** — back-to-front for 99.9% of drawable blocks | `efxMakeSortInfoBillboardDrawerID3rd`, `efxSortParticle3rd` |
| Per-particle determinism | Each particle draws from its own `particleSeed(pairSeed, id)` stream. A shared stream re-randomised every particle behind an expiry on the frame it died, because `simulateParticle` returns before drawing when the particle is already dead | `efxSpawnParticleCommon3rd` (per-instance LCG) |
| Model instance slots | `bindEfxbnModelInstanceSlots` holds a pool slot with its particle across frames and frees it on expiry. Indexing the live array by position teleported every instance behind an expiry | engine free-list allocation |
| Billboard quad basis and pivot | Basis from `actionFlags & 0x20 / 0x80 / 0x20000000`, and `centerPivot` offsets the quad by `right*(sizeX*pivotX*0.5) + up*(sizeY*pivotY*0.5)`. Non-zero on 24.0% of billboards, dominated by ±1 (edge-anchored) | `efxConstructDrawBufferBillboard3rd`, `efxExtractDrawInfoBillboard3rd` |
| Face culling | `cullingType` 0/1/2 → DoubleSide/FrontSide/BackSide. Verified by measuring the shipped `sphere_001` mesh: it winds counter-clockwise seen from outside, which is WebGL's front face, so FrontSide shows the exterior. Matters — 31.4% of model blocks cull | mesh winding measurement |
| Playback window | Derived per effect from the longest root-to-leaf `delay + life` chain instead of a fixed 120 frames. 25.4% of files were playing into dead air, 8.7% were cut off mid-flight. Looping effects keep the 120-frame floor so they do not restart more often than before | corpus, 678 files |
| Cross-pack references | Models and colour maps are bound by CRC32 across the whole `006effect` tree. **57.8% of model references (664/1,149) and 69.5% of texture references (1,191/1,714) exist only in `000common_001`.** `inspect_effect_folder` indexes the shared pack alongside the opened one; the preview plan resolves against both and tags each hit `pack` or `common` | corpus, 11 non-common packs |

### Known-wrong or unimplemented (preview)

Re-audited 2026-08-16 against the source. The Phase A rows, the strip-history row and the
billboard-basis row had all been implemented since this table was written and are struck from it;
what follows is what is still genuinely open.

| Gap | Share of drawable blocks | Phase |
| --- | --- | --- |
| Strip `centerPivot.x` ignored — `efxExtractDrawInfoStrip3rd` puts the ribbon edges at `centre - side*halfWidth*(pivotX ± 1)`, so a non-zero pivot slides the ribbon off its path | 20.0% of strips | B |
| Strip UV axes transposed | 1,306 strips | B |
| UV scroll semantics not split by draw type; limit applied as modulo everywhere | 7,320 scroll parameters | C |
| Four-corner `uvU/uvV` collapsed to a min/max rectangle | all | C |
| Spawn-form branches 2/4/7/8 and `emitInterpolate*` back-fill | see §C3 | C |
| Curve LUT quantization (16-column texture) not reproduced | all curves | C |
| Soft variant | 51.6% | D |
| Light / HLight | 7.4% / 2.4% | D |
| MultiUV | model blocks with a second UV set | D |
| ColorEx `0x200` framebuffer grab | 1.8% | D |
| `blendState` 1 rendered as Normal, unverified | 18.1% | E |
| Looping effects still restart the timeline from tick 0, so a looping emitter ramps up from nothing once per window instead of running continuously. Needs a warm-up offset, which in turn needs care for effects that mix looping and one-shot blocks | 57.4% of files contain a looping block | E |

### Blocked

- **Reference-appearance comparison.** The Blender mirror approximates all blend states with
  emissive materials, so its renders blow out and cannot judge appearance. Needs an in-game
  capture or real blend states.
- **Blend and culling enums.** No name table exists in the binary. Route: `sub_1400876A0`.

### Editing — essentially absent

| Capability | State |
| --- | --- |
| Import / copy / delete / repack files | Implemented (`stage_commands`) |
| Repack validation | Implemented (`validate_effect_folder_for_repack`) |
| EFXBN field editing | Colour only. `EfxbnColorAuthor` edits the r/g/b/a control-constant lanes of the selected block through a draft session; every other block field is read-only |
| EFXBN write path | `patch_efxbn_control_constants` — curve-key values only. Called from `EffectFolder3dPreview` when the draft is saved |
| Curve editing | None |
| Texture / model rebinding | None |
| Round-trip byte-fidelity proof | None |

### Baseline

`cargo test` 34 · `vitest` 782 pass / 6 pre-existing failures
(`Fhm2dMemoryPreviewModal` ×2, `useSsbhFileEditorSessions` ×3, `ListeningRepackDialog` ×1) ·
`test_preview` 2 · clippy clean · `tsc` 2 pre-existing errors
(`BulletPropertyPanel.tsx:227`, `motionFolderService.ts:724`).

---

## 2. Architecture

```
IDA / DXBC  ──derives──▶  docs + memory          (the only place a rule is justified)
                              │
Rust  src-tauri/src/format/effect_folder.rs      parse + runtime normalization + writer
                              │  serde camelCase
TypeScript  effectFolderPreviewPlan.ts           parameter/binding semantics
            efxbnSimulation.ts                   spawn/kinetic physics, topology, variants
                              ├──────────────────────────────┐
GLSL  EfxbnParticlePreview / EfxbnStripPreview   Blender  tools/efxbn_blender_preview
      SsbhModelCanvas (onBeforeCompile)          (imports the same TS — a mirror, not a fork)
```

Rules already encoded here: the parser exposes `runtime` beside untouched authored fields; bits
the parser cannot resolve (the multi-UV mesh walk) are reported separately rather than guessed;
the model path injects into `MeshBasicMaterial` so three.js keeps owning skinning.

---

## 3. Preview track

### Phase A — Simulation ("特效过程"). Do this first.

Four defects, all in `efxbnSimulation.ts`, all specified, none needing IDA. This is the largest
untouched block and the one the user reports as "the effect's progression is wrong".

**A1. Loop wraps phase, not position.** `actionFlags & 1` currently rebuilds position from the
spawn point each cycle, so looping particles teleport. The kinetic shader updates
`objectPool position + 0xA0` in place and never re-runs spawn; only lifetime and curve phase wrap.
*Test:* a looping particle's position is monotonic across a cycle boundary while its curve phase
wraps. *Done when:* no discontinuity at the boundary and existing strip tests still pass.

**A2. Emitter lifetime randomisation + `lifeTimeRatio`.** Spawn computes
`life = base * (1 + signedRandom * rate)` and stores `lifeTimeRatio = base / life` for curve
evaluation. The particle path randomises; the emitter path at `efxbnSimulation.ts` uses raw
`lifeTimeBase`. *Test:* two differently seeded emitters produce different active spans, and curve
phase uses the ratio.

**A3. Emit count randomisation.** Apply verbatim:

```text
r1.w = numEmit ; r5.x = numEmitCountRandom (R)
r5.w = (2R + 1) ; r5.w = lcg(r1.x) % r5.w ; r5.x = r5.w - R
N = numEmit + r5.x
N = meshEmitterCount > 0 ? meshEmitterCount : N
```

LCG is `x * 0x0019660d + 0x3c6ef35f`. *Test:* fixed seed reproduces `N`; a block with
`meshEmitterCount > 0` emits exactly that regardless of `numEmit`.

**A4. Spawn basis for local velocity.** `speedBaseX/Y/Z` are spawn-local. Spawn writes a basis to
`spawnSystem + 0x140`; the kinetic shader `dp4`s against it every frame and accumulates into
position. Current code treats the vector as world XYZ. *Test:* a particle spawned on a rotated
ring travels along its own local axis.

> **Note on parity.** `seededUnit(seed, lane)` preserves distribution but not the game's
> sequential LCG state. Never claim frame-exact parity in UI or docs.

### Phase B — Geometry

**B1. Full per-node strip history.** `EfxExtractedDrawInfoStrip3rd` carries per-node previous and
current positions, widths, endpoints, alpha, colour and UV state. The preview stores centres only,
so the whole ribbon inherits the current particle's size and colour. Keep the Phase-0
`vertexBudget` truncation semantics.

**B2. Strip UV axes.** `efxConstructDrawBufferStrip3rd` stores `u` along the ribbon length and the
other axis across the width. The builder writes `[side, t]` — transposed.

**B3. Billboard basis + `centerPivot`.** The construct shader picks different bases from action
flags `0x20`, `0x80`, `0x20000000` and offsets each quad by `width * pivotX / 2`,
`height * pivotY / 2`. The preview implements view-XY facing only and ignores `centerPivot`, which
is already parsed. Name the modes by flag value — HLSL does not establish authoring vocabulary.

**B4. Signed scale (verify-first).** `sizeBase * sizeRandom * scale` already has no `Math.abs` and
no `0.006` clamp in the simulation. Add the regression test; if it passes, close as
already-satisfied and record that.

### Phase C — UV and curves

**C1. Split UV scroll semantics by draw type.** Three corrections against `fxc` output: Billboard
and Strip read offsets `36/52/68` (speed, direction, limit) while only Model reads `104/108`;
Model pattern 1 does not apply `uvScrollLimit`; Billboard and Strip subtract the limit once when
exceeded rather than applying a positive modulo.

**C2. Four-corner UVs.** `uvU[4]` / `uvV[4]` are per corner; the current code collapses them to a
min/max rectangle and discards sheared or non-monotonic authored quads.

**C3. Spawn-form branches.** Types 4/8 pick one of six face directions and honour `emitAreaType`;
type 3 distinguishes edge radius from area-uniform `R * sqrt(U)`; types 2/7 have dedicated angle
paths; `extraFlags & 8` with `emitInterpolateDistance` / `emitInterpolateType` back-fills particles
along emitter displacement. All fields are already parsed. **Measure each branch's share before
ordering the sub-tasks.**

**C4. Curve LUT quantization (P2).** The GPU samples a 16-column `floatKeyTableTexture` at
`u = p * 15 / 16 + 1 / 32`, `v = (curveIndex + 0.5) / 16384`. The preview interpolates raw keys.

### Phase D — Remaining shader variants

Ordered by measured share and infrastructure cost, not by mask order.

**D1. Light + HLight (`0x20804` / `0x20000`), 7.4% / 2.4%.** Requires replacing the model
particles' `MeshBasicMaterial` — or extending the existing `onBeforeCompile` injection, which is
the lower-risk option because three.js keeps owning skinning. `0x8` normal map through TBN; `0x4+0x8`
directional `reflectionPower * 0.01 * (saturate(dot(L,N)) + 0.24) * 0.833333`; `0x800` IBL cube with
a fifth-power Fresnel. HLight adds a GGX-like specular with `F0 = saturate(highlightPower * 0.01)`
and `alpha^2 = 0.0256`. Note `efxDrawModelHLightPS.dxbc` is byte-identical to the base PS
(SHA-256 `030E4E46...7296`), so HLight alone changes nothing — only Light+HLight does.

**D2. Soft (`0x10001`), 51.6%.** Largest share but **near-invisible in an empty preview**: the term
`saturate((sceneZ - particleEyeZ) / softParticleRange)` saturates to 1 with nothing behind the
particle. It matters for in-game comparison and for previews that include scene geometry. Needs a
scene depth target. `flag 0x10000` additionally scales rgb by
`pow(2 - saturate(delta / depthEmissionRange), depthEmissionPower)`.

**D3. MultiUV (`0x1000`).** Pass-2 maps live in slots `color1` / `uv1`, already addressable. The
`0x1000` gate needs the model mesh (two or more attribute streams of type 17) — the parser already
reports `meshMultiUvFlag` separately for exactly this. `pass2BlendType != 0 ? add : multiply`.

**D4. ColorEx `0x200`, 1.8%.** Framebuffer grab; needs a scene colour render target. Do last.

**D5. AddMix (`0x40`), 0.1%.** 16 blocks tree-wide. Cheap, so fold it in whenever the shader is
already open: `bright = max(c.rgb) > 0.8; rgb = c.rgb * c.a; a = bright ? 0 : c.a`.

### Phase E — CPU render state (blocked on evidence)

**E1. Decode the blend descriptor.** `sub_140174B30` → `sub_1401774B0(blendState, desc)` →
`sub_140085A50(preset)`. The 48-byte-per-target descriptor and each preset's patches are recorded
in the session document. The enum namespace is unproven — preset 1 writes `6` where a D3D blend op
would be out of range. **Next concrete step: `sub_1400876A0`, which consumes the descriptor.**
Until it is proven: leave `blendState 1` as Normal, keep it marked unverified in the inspector, and
delete the dead `3 → Subtractive` branch (no `3` exists in the corpus).

**E2. Culling.** `sub_140177660` maps `cullingType` at block `0x170`: `0 → 2`, `1 → 0`, `2 → 1`,
otherwise `0`. Distribution is 82.5% / 16.1% / 1.4%. The target enum is unproven by the same
argument as blend; if `sub_1400876A0` settles the namespace it likely settles both. Model particles
are where back-face culling would actually change the picture.

**E3. Filter and anisotropy.** `sub_1401777A0`'s third argument sets min/mag/mip identically and the
fourth sets `4.0` in the LOD/aniso vector (default `(0, 0, 0, 16)`). Low value; record only.

---

## 4. Editing track

The preview is a viewer today. These phases make it an editor. **Ordering is deliberate: nothing
writes to a real pack until F1 proves round-trip fidelity.**

### Phase F — Foundation: a byte-faithful writer

**F1. `build_efxbn_bytes` with a round-trip proof.**
*Files:* `src-tauri/src/format/effect_folder.rs`, `src-tauri/tests/effect_folder_real_data_test.rs`.

Today the only writer is `patch_efxbn_control_constants`, which rewrites 4 bytes per curve key in
place. Real editing needs a full builder — but the safe order is:

- **F1a.** `build_efxbn_bytes(&EfxbnSummary) -> Vec<u8>` that reproduces the source file **byte for
  byte** for every unmodified input. *Test:* parse → build → compare across a corpus sample of at
  least 200 real `.efxbn` (all packs, all sizes), asserting exact equality. Any mismatch is an
  unparsed field, and `reserve_area[31]` is the known suspect — carry raw bytes rather than
  reconstructing them.
- **F1b.** Only once F1a is green: a `patch` API that takes a parsed summary with edited fields and
  rewrites the affected regions.

*Done when:* the round-trip test passes on the full sample and `git status` shows nothing under
`E:\XB` modified.

**F2. Retire or wire the constant patcher.** `patchEfxbnControlConstants` is reachable from the
service layer and called by nothing. Either it becomes the write path behind the curve editor (F5)
or it is deleted. Do not leave a third write path.

**F3. Edit session model.** Effect editing must not write on every keystroke. Mirror the existing
`useSsbhFileEditorSessions` pattern: an in-memory edited `EfxbnSummary`, a dirty flag, explicit
save, and a preview that renders the *edited* summary so the user sees the change before committing.
This is also what makes the preview worth having.

### Phase G — Field editing

**G1. Block field editor.** The `Block` tab in `EfxbnPreviewInspector` becomes editable for the
authored scalar fields (life, interval, `numEmit`, sizes, rotations, offsets, spawn form, flags).
Show authored **and** normalized values side by side — the runtime record already exists and the
difference is exactly what confuses people. Never let the user edit the runtime value.

**G2. Model-control (texture parameter) editor.** UV pattern, scroll, atlas, reverse, addressing
mode, distortion power. Every one of these now has a proven meaning and a live preview effect, so
edits are immediately visible.

**G3. Enum presentation.** Proven enums (`addressingMode`, element type, spawn form) render as
named dropdowns. Unproven ones (`blendState`, `cullingType`) render as raw numbers with an
"unverified" marker. This is rule 1 made visible in the UI.

### Phase H — Curve editing

The control lanes are what make an effect look alive; 18 curves per block are already parsed and
evaluated correctly.

**H1. Curve inspector → curve editor.** Drag key values on a graph, with the 0..100 domain shown
explicitly. Selector `1` is a constant lane; `N` is an N-key lane.
**H2. Live scrub.** The preview timeline already drives `evaluateEfxbnControl`; editing a key should
update the rendered frame without a save.
**H3. Key insert/remove.** Changes `curveKeyCount` and shifts every downstream `lookupIndex` —
depends on F1b, and is the first edit that cannot be done in place.

### Phase I — Resource rebinding

**I1. Texture rebinding.** `colorMapId` is a CRC32 of the basename. Rebinding = pick another
`.nutexb` from the pack inventory and write its hash. The inventory and hash resolution already
exist; this is a picker plus a write.
**I2. Model / animation rebinding.** Same shape for `nudHandle` and the animation hash.
**I3. Cross-pack import closure.** `copy_effect_folder_selection` already computes a dependency
closure. Rebinding to a resource from another pack must reuse it, not hand-roll a second copier.

### Phase J — Ship it

**J1. Validation gate.** Extend `validate_effect_folder_for_repack` with EFXBN-level checks:
dangling child indices, texture/model handles that resolve nowhere, curve lookup indices past
`curveKeyCount`, element types outside the known set.
**J2. Repack.** Reuse the existing path, and respect the two recorded constraints: the in-process
Rust FHM2D packer produces game-crashing packs, so pack with `node compression.js`; and the pack
stem must be lowercase `0x` + UPPERCASE hex.
**J3. In-game verification loop.** Edit → repack → launch → capture. This is also what unblocks
Phase K.

---

## 5. Verification track

**K1. Reference comparison (currently blocked).** Needs one of:
(a) an in-game capture of a named effect — the cheapest unblock, and it also validates Phase A/B/D;
(b) teaching the Blender mirror real blend states, which is blocked on Phase E.
Until then, nothing may be described as visually validated.

**K2. Golden-image regression.** Once (a) exists, render the positive sample
(`053gbftry_005tsient_001/0/0/200.efxbn` — 5/5 models and 11/15 textures pack-local) at fixed
frames and diff against stored images, so a shader change that breaks appearance fails a test
instead of a human.

**K3. Corpus invariants as tests.** Several facts in §1 are corpus-wide claims that silently rot.
Promote the load-bearing ones to a test that scans the tree and skips when it is absent: no type-2
blocks; no `blendState == 3`; every drawable block's `color0` slot resolves or is genuinely empty;
every effect model folder holds no `.numatb`.

**K4. Independent re-derivation audit.** Never executed. Spawn an agent without implementation
context to re-derive the `drawSchemeFlag` producer, the address-mode enum, and the ColorEx
semantics from scratch, and reconcile disagreements by evidence.

---

## 6. Suggested order

| Order | Work | Why here |
| --- | --- | --- |
| 1 | **A1–A4** | Largest untouched preview gap, fully specified, no IDA, directly answers "过程不对" |
| 2 | **F1a** | Unblocks every edit; pure Rust; round-trip proof is cheap insurance |
| 3 | **B1–B3** | Visible geometry errors on 100% of strips and billboards |
| 4 | **F3 + G1–G3** | First real editing capability, on top of a proven writer |
| 5 | **C1–C3** | UV correctness; C3 needs its own corpus measurement first |
| 6 | **H1–H3** | Curve editing — the highest-leverage authoring feature |
| 7 | **D1, D3, D5** | Variants that need no render target |
| 8 | **E1** | One IDA hop (`sub_1400876A0`); unblocks blend, culling, and the Blender mirror |
| 9 | **D2, D4** | Need depth / colour render targets |
| 10 | **I, J, K** | Rebinding, ship path, and the verification loop |

**K1(a) is out of band — one in-game screenshot from the user unblocks the whole verification track
at any point and should be collected as soon as it is convenient.**

---

## 7. Definition of done for the whole plan

- [ ] Every row in §1 "Known-wrong or unimplemented" is either implemented or carries a recorded
      reason it cannot be.
- [ ] No enum is mapped without a name table, a consumer decode, or a corpus argument written down.
- [ ] `build_efxbn_bytes` round-trips a 200-file sample byte for byte.
- [ ] An effect can be edited in the UI, saved, repacked, and loaded by the game.
- [ ] A reference comparison exists for at least one named effect.
- [ ] `cargo test`, `pnpm test`, and `python -m unittest tools.efxbn_blender_preview.tests.test_preview`
      all pass; `tsc` introduces no new errors beyond the two known ones.
- [ ] No file under `E:\XB` is modified by any test or tool run.
