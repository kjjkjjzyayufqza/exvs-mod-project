# EFXBN Shader Fidelity and Visual Review Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Phases 1-3 are ordered by hard dependency; later phases are independently schedulable. Every task must end with a real test run — never mark a step done on inspection alone.

**Goal:** Close the gap between the fully decoded EFXBN shader set and the Test Editor preview implementation, then validate the result against reference appearance instead of only proving the preview is non-empty.

**Architecture:** Three layers move together. The Rust parser (`src-tauri/src/format/effect_folder.rs`) exposes authored fields and the runtime `drawSchemeFlag`; the TypeScript simulation (`efxbnSimulation.ts`, `effectFolderPreviewPlan.ts`) reproduces spawn/kinetic physics; the Three.js layer (`EfxbnParticlePreview.tsx`, `EfxbnStripPreview.tsx`, `SsbhModelCanvas.tsx`) reproduces the pixel-shader variants. The headless Blender tool (`tools/efxbn_blender_preview/`) imports the same simulation, so it stays a verification mirror rather than a second implementation.

**Tech Stack:** Rust (serde), TypeScript, React Three Fiber / three.js, Vitest, `cargo test`, Python 3 + Blender 5.1 headless, IDA Pro MCP, `fxc` + three DXBC decompilers.

---

## Context: State as of 2026-08-08

Codex session `019fccf9-ba8c-7662-bc4b-0abf56b74fc5` (2026-08-04 → 2026-08-05) terminated on a
provider usage limit at 14:50:34 with six subagents still running. That truncation, not a
technical blocker, is why the items below are open.

### Completed and verified in the repository

- Magic-error root cause closed. `129.efxbn` is an SSBH motion (`HBSS` / `MINA` at `0x10`),
  misnamed by the extractor. All 4,201 `.efxbn` in the official unpack tree are strict `EFXB`;
  there is no byte-swapped or alternate magic. Extraction now classifies by signature and
  preserves `file_type` for lossless repack (`fhm2d.rs:1348`).
- FHM2D header offsets re-confirmed against fresh IDA: format `+0x08`, file size `+0x10`,
  uncompressed/compressed `+0x18`/`+0x20`, body `+0x30`. The Rust parser was already correct;
  the stale note in `E:\research\efxbn` was the error.
- All eleven preview-stability findings are fixed: strip vertex budget before expansion,
  model-pool global budget, NUANMB manifest/clip promise caches, `effectMaterialActive`,
  plan `revisionSignature`, per-particle strip UV callback, versioned NUTEXB cache,
  `finalFrameIndex + 1` loop parity, and removal of the forced `playing: true`.

### Decoded but not implemented

`tmp/efxbn-preview/` holds 178 research artifacts: 57 DXBC blobs, 57 `fxc` dumps, 56 YYadorigi
HLSL files, cross-checked against etnlgd/HLSLDecompiler and spacehamster/DXDecompiler. The
fidelity ledger in `docs/agent-sessions/2026-08-04-efxbn-3d-preview.md` marks ColorEx, Light,
MultiUV, Soft, and HLight as "decoded, not rendered". A shader-review agent produced eight P0
and four P1/P2 deviations; none were applied before the session ended. Verified absent from the
current tree: `numEmitCountRandom`, `lifeTimeRatio`, `slotIndex`, any `0x40000` bypass, and
`effectType === 3` render routing.

### Never executed

- Reference-appearance comparison (the `cie_visual` agent started and never returned).
- The independent reverse-skill re-derivation audit.

### Evidence anchors confirmed for this plan

> **Corrected 2026-08-08.** The "runtime = disk + 8" mapping below was wrong. Block offsets
> and reflected `SEfxElementData` offsets are identical; the apparent shift came from the
> parser starting the block region at `0x20` instead of `0x18`. That is fixed, and
> Task 1.1 is already done. See
> `docs/agent-sessions/2026-08-08-efxbn-format-rederivation.md`.

| Fact | Value | Source |
| --- | --- | --- |
| Block region start | `payload + 0x18` | `sub_140145DF0`, `v6[220 * i + 6]` |
| Block offset mapping | block offset == reflected offset | `elementType` at 40 read as `*(slot + 40)` |
| `numEmit` | `base + 60` | runtime `l(60)` |
| `numEmitCountRandom` | `base + 696` | runtime `l(696)`, `efxKineticEmitterCommon3rd.dump.txt:616` |
| `meshEmitterIndex` / `Count` | `base + 712` / `716` | runtime `l(712)` / `l(716)` |
| strip tail / head alpha rate | `base + 604` / `608` | reflected `stripTaleAlphaRate` / `stripHeadAlphaRate` |
| LCG | `x * 0x0019660d + 0x3c6ef35f` | `imad` at `efxKineticEmitterCommon3rd.dump.txt:618` |

The emit-count instruction sequence, read directly from the dump, is:

```text
r1.w  = numEmit                         ; l(60)
r5.x  = numEmitCountRandom (R)          ; l(696)
r5.yz = meshEmitterIndex, meshEmitterCount ; l(712), l(716)
r1.x  = lcg(r1.x)
r5.w  = bfi(31, 1, R, 1)                ; 2R + 1
r5.w  = r1.x % r5.w
r5.x  = r5.w - R
r1.w  = numEmit + r5.x                  ; N
r1.w  = meshEmitterCount > 0 ? meshEmitterCount : N
```

---

## Phase 0: Preserve the existing work

### Task 0.1: Commit the untracked deliverables

**Files:**
- Add: `tools/efxbn_blender_preview/` (excluding `__pycache__/`)
- Add: `docs/agent-sessions/2026-08-05-efxbn-magic-offline-render.md`
- Add: this plan
- Modify: `.gitignore` if `tmp/` is not already ignored

- [ ] **Step 1: Confirm ignore rules**

Already verified on 2026-08-08: `.gitignore:13` covers `tmp/` and `.gitignore:18` covers
`__pycache__/`, so `tmp/efxbn-render/`, `tmp/efxbn-preview/`, and the Python cache stay out.
Re-run `git check-ignore -v` if `.gitignore` has changed since.

- [ ] **Step 2: Decide the fate of the shader evidence**

`tmp/efxbn-preview/` (178 files) is the only copy of the DXBC extraction and is not in git.
Either archive it outside the repo or record the exact regeneration command in
`docs/agent-sessions/2026-08-04-efxbn-3d-preview.md`. Do not commit binaries extracted from
the game.

- [ ] **Step 3: Commit**

Run: `pnpm test` and `cargo test --manifest-path src-tauri/Cargo.toml --lib effect`
Expected: PASS before committing.

---

## Phase 1: Backend field exposure (blocks Phase 2 and 3)

### Task 1.1: Parse and expose `numEmitCountRandom` — DONE 2026-08-08

Superseded by the full block re-derivation: all 145 reflected fields are now parsed,
including `numEmitCountRandom` at offset 696. The original step-by-step is kept below
for reference only.

**Files:**
- Modify: `src-tauri/src/format/effect_folder.rs`
- Modify: `src/page/TestEditor/components/effect-folder-editor/effectFolderEditorUtils.ts`
- Test: `src-tauri/src/format/effect_folder.rs` (inline `#[cfg(test)]`)

- [ ] **Step 1: Write the failing test**

Extend the existing block-parse assertion near `effect_folder.rs:3318` (which already checks
`num_emit == 4`) with `num_emit_count_random` for the same fixture. Read the expected value
from the real `167.efxbn` bytes at `base + 0x2b0` before writing the assertion.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib efxbn`
Expected: FAIL — field does not exist.

- [ ] **Step 3: Implement**

Add `pub num_emit_count_random: u32` to `EfxbnEffectSummary` after `num_emit`, and
`num_emit_count_random: read_u32_le(bytes, base + 0x2b0)?` in the constructor. Mirror the
existing comment style used for the `0x2c0`/`0x2c4` mesh-emitter pair, noting that reflected
`SEfxElementData` offset `696` includes the runtime-only 8-byte prefix. Add the camelCase
field to the TypeScript summary type.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib efxbn`
Expected: PASS

### Task 1.2: Carry the model-control slot number into texture bindings

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/effectFolderPreviewPlan.ts`
- Test: `src/page/TestEditor/components/effect-folder-editor/effectFolderPreviewPlan.test.ts`

The four `modelControlIndices` slots are positional: `0` primary color, `1` pass-2 color,
`2` primary UV offset, `3` pass-2 UV offset (RDEF `colorTextureParameterIndex[2]` +
`uvTextureParameterIndex[2]`, selector `sub_1401757B0`). The plan builder at
`effectFolderPreviewPlan.ts:316-327` iterates the array but discards the position, so every
consumer that calls `.find(binding => binding.file !== null)` can promote an auxiliary map
into the primary color slot.

- [ ] **Step 1: Write the failing test**

Extend the binding assertion at `effectFolderPreviewPlan.test.ts:162` to cover a block whose
slot `0` is unresolved and slot `2` is resolved, asserting that the primary-color lookup
returns `null` rather than the slot-2 file.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/page/TestEditor/components/effect-folder-editor/effectFolderPreviewPlan.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Add `slotIndex: 0 | 1 | 2 | 3` to `EffectFolderPreviewTextureBinding` and populate it from the
loop position. Add a `resolvePrimaryColorBinding(plan, effectIndex)` helper that matches
`slotIndex === 0` only. Auxiliary slots must never be promoted.

- [ ] **Step 4: Update the four consumers**

Replace the slot-agnostic `.find` calls at `EfxbnParticlePreview.tsx:213`,
`EfxbnStripPreview.tsx:119`, and `EfxbnDiagnosticOverlay.tsx:163` and `:208` with the helper.
`EfxbnPreviewInspector.tsx:55,96` filters for display and should show the slot label instead.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/page/TestEditor/components/effect-folder-editor`
Expected: PASS

### Task 1.3: Compute `drawSchemeFlag` in the backend

**Files:**
- Modify: `src-tauri/src/format/effect_folder.rs`
- Test: `src-tauri/src/format/effect_folder.rs`

The runtime flag word at element `+0x390` is synthesized by `sub_1401470F0` from the copied
`0x370` record, and `sub_140188E30` selects the pixel-shader variant from it. The frontend
currently has no access to it, so every variant decision is a guess. Producing it once in Rust
removes that guesswork for both the preview and the Blender tool.

- [ ] **Step 1: Re-derive the producer**

Route through reverse-skill / IDA MCP and decompile `sub_1401470F0` fully. The prior session
recorded partial producers (`0x20`, `0x40`, `0x8000` from authored fields; `0x80`, `0x200`,
`0x2000`, `0x4000` from model-control presence and input type; `0x1000` from a type-3 mesh
walk) but the IDA instance disconnected before a complete pass. Record every producer bit in
the fidelity ledger with its source condition.

- [ ] **Step 2: Write the failing test**

Assert the expected `draw_scheme_flag` for each of the four blocks in the real `167.efxbn`
fixture, plus one block from a pack that exercises a Light or Soft variant.

- [ ] **Step 3: Implement**

Add `pub draw_scheme_flag: u32` to `EfxbnEffectSummary`, computed from already-parsed fields.
Do not read `+0x390` from disk — it is runtime-only. Per the no-fallback rule, any producer
condition that cannot be derived from parsed data must raise an error rather than default to
zero.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib efxbn`
Expected: PASS

- [ ] **Step 5: Expose the decoded variant list**

Add a derived `shaderVariants: string[]` to the TypeScript summary using the any-bit-hit masks
(these are masks, not enum values):

```text
0x40      AddMix
0x280     ColorEx
0x20804   Light
0x1000    MultiUV
0x10001   Soft
0x20000   HLight
```

---

## Phase 2: P0 simulation correctness

All four tasks touch `efxbnSimulation.ts` and are covered by
`src/page/TestEditor/components/effect-folder-editor/efxbnSimulation.test.ts`
(create it if the existing tests live only in the plan/geometry files).

### Task 2.1: Randomize emitter lifetime and retain `lifeTimeRatio`

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/efxbnSimulation.ts`

The spawn shader computes `life = base * (1 + signedRandom * rate)` and stores
`lifeTimeRatio = base / randomizedLife` for later curve evaluation. The emitter path at
`efxbnSimulation.ts:362` uses raw `lifeTimeBase`, while the particle path at `:195` already
randomizes. The mismatch shortens or lengthens whole emitter bursts.

- [ ] **Step 1: Write the failing test** — assert two emitters seeded differently produce
      different active spans, and that curve phase uses the ratio rather than raw age.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement** — reuse the existing `randomizedBase` helper; store `lifeTimeRatio`
      on the particle record.
- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/page/TestEditor/components/effect-folder-editor`

### Task 2.2: Randomize the emit count and honour `meshEmitterCount`

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/efxbnSimulation.ts`

**Depends on:** Task 1.1

- [ ] **Step 1: Write the failing test**

Assert `N = numEmit + (lcg % (2R + 1)) - R` for a fixed seed, and that a block with
`meshEmitterCount > 0` emits exactly `meshEmitterCount` regardless of `numEmit`.

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement** — `efxbnSimulation.ts:371` currently emits a fixed `numEmit`.
      Apply the sequence quoted in the Context section verbatim. The surrounding
      `emitterProgress` term already matches the shader's `* 100` scaling; leave it alone.
- [ ] **Step 4: Run test to verify it passes**

### Task 2.3: Loop lifetime and curve phase, not position

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/efxbnSimulation.ts`

`efxbnSimulation.ts:200` computes `phaseAge = age % lifeTime` when `actionFlags & 1` is set and
then rebuilds the position from the spawn point, so looping particles teleport once per cycle.
The kinetic shader updates `objectPool position + 0xA0` in place and never re-runs the spawn
shader; only lifetime and curve phase wrap.

- [ ] **Step 1: Write the failing test** — assert a looping particle's position is monotonic
      across a cycle boundary while its curve phase wraps.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement** — accumulate position and rotation across the whole simulated span;
      apply the modulo only to lifetime-derived curve inputs.
- [ ] **Step 4: Run test to verify it passes**

### Task 2.4: Persist the spawn basis and transform local velocity

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/efxbnSimulation.ts`

`speedBaseX/Y/Z` are spawn-local, not world. The spawn shader writes a basis to
`spawnSystem + 0x140`; the kinetic shader does `dp4` against it each frame and accumulates the
result into position. The current code treats the vector as world XYZ and only adds
`directionAccel` along `spawn.direction`.

- [ ] **Step 1: Write the failing test** — a particle spawned on a rotated ring must travel
      along its own local axis, not a shared world axis.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement** — store the full 3x3 (or 3x4) spawn basis on the particle and
      transform local velocity per frame.
- [ ] **Step 4: Run test to verify it passes**

---

## Phase 3: P0 routing and base material

### Task 3.1: Route model particles by `effectType`, not by model hash

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/EfxbnParticlePreview.tsx`

`sub_140188E30` selects `efxDrawModel` when `*(a3 + 40) == 3` and `efxDrawFace` otherwise.
The billboard component at `EfxbnParticlePreview.tsx:305-308` instead excludes blocks by
`modelHash.signed !== 0`, so a type-3 block with an unresolved hash silently renders as a
billboard and a non-type-3 block carrying a model hash is wrongly excluded.

- [ ] **Step 1: Write the failing test** — cover the two mismatch cases above.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement** — branch on `effectType === 3`. Keep the external-model proxy path,
      but drive it from resolution state rather than from routing.
- [ ] **Step 4: Run test to verify it passes**

### Task 3.2: Consume slot-aware texture bindings

**Depends on:** Task 1.2 — this is Step 4 of that task; verify no consumer still calls the
slot-agnostic `.find`.

- [ ] **Step 1: Grep for regressions**

Run: `rg "textureBindings\.find" src/`
Expected: no matches outside the slot-aware helper.

### Task 3.3: Implement the `0x40000` half-brightness bypass

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/EfxbnParticlePreview.tsx`
- Modify: `src/page/TestEditor/components/effect-folder-editor/EfxbnStripPreview.tsx`
- Modify: `src/components/ssbh-model-preview/SsbhModelCanvas.tsx`

**Depends on:** Task 1.3

The base Face and Model pixel shaders are:

```text
c = ColorMap(uv) * particle_or_vertex_color
discard if c.a < 0.01
out.rgb = (drawSchemeFlag & 0x40000) ? c.rgb : c.rgb * 0.5
out.a = c.a
```

All three call sites currently multiply by `0.5` unconditionally.

- [ ] **Step 1: Write the failing test** — a material-uniform test asserting the multiplier
      follows the flag.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement** — pass the flag through to a shader uniform; do not branch in JS
      per frame.
- [ ] **Step 4: Run test to verify it passes**

### Task 3.4: Treat strip head/tail alpha rates as time windows

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/EfxbnStripPreview.tsx`
- Modify: `src/page/TestEditor/components/effect-folder-editor/efxbnStripGeometry.ts`

`stripTailAlphaRate` (disk `0x254`, runtime `604`) and `stripHeadAlphaRate` (disk `0x258`,
runtime `608`) are fade durations gated by action flags, not endpoint alpha values.
`efxExtractDrawInfoStrip3rd.dump.txt` shows the comparison and division:

```text
flag 0x8000:      age < tailRate       -> alpha *= age / tailRate
flag 0x40000000:  remaining < headRate -> alpha *= remaining / headRate
```

The current code linearly interpolates the two values along the whole ribbon.

- [ ] **Step 1: Write the failing test** — assert alpha is flat mid-life and only fades inside
      the two windows, and that a block without the flags never fades.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run test to verify it passes**

---

## Phase 4: P1 strip and billboard geometry

### Task 4.1: Store full per-node strip history

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/efxbnSimulation.ts`
- Modify: `src/page/TestEditor/components/effect-folder-editor/efxbnStripGeometry.ts`

`EfxExtractedDrawInfoStrip3rd` carries previous and current segment positions, widths and
endpoints, alpha and colour, and UV state per node. The preview history holds centre points
only, so the whole ribbon inherits the current particle's size and colour.

- [ ] **Step 1: Write the failing test** — a widening, colour-shifting particle must produce a
      tapered, gradient ribbon rather than a uniform one.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement** — extend the history sample record; keep the existing
      `vertexBudget` truncation semantics from Phase 0 intact.
- [ ] **Step 4: Run test to verify it passes**

### Task 4.2: Correct the strip UV axes

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/efxbnStripGeometry.ts`

`efxConstructDrawBufferStrip3rd.dump.txt` vertex stores show `uv_prev_u` / `uv_current_u`
running along the strip length with the other axis across the width. The current builder writes
`[side, t]`, which transposes them.

- [ ] **Step 1: Write the failing test** — assert `u` advances along the ribbon and `v` spans
      the width, using accumulated per-segment offsets.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run test to verify it passes**

### Task 4.3: Select the billboard basis from action flags and apply `centerPivot`

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/EfxbnParticlePreview.tsx`

The construct shader picks different bases from action flags `0x20`, `0x80`, and `0x20000000`
(around lines 390 and 448 of `efxConstructDrawBufferBillboard3rd.dump.txt`) and offsets each
quad by `width * pivotX / 2` and `height * pivotY / 2`. The preview implements only view-XY
facing and ignores `centerPivot`, which is already parsed.

- [ ] **Step 1: Write the failing test** — one case per basis, plus a non-zero pivot offset.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement** — name the modes by flag value, not by invented authoring names;
      HLSL alone does not establish the authoring vocabulary.
- [ ] **Step 4: Run test to verify it passes**

### Task 4.4: Confirm signed scale is preserved (verify first)

`efxbnSimulation.ts:295-297` currently multiplies `sizeBase * sizeRandom * scale` without
`Math.abs`, and no clamp was found in `EfxbnParticlePreview.tsx`. The reported `Math.abs` and
`0.006` minimum appear to be already gone.

- [ ] **Step 1: Add a regression test** asserting negative `sizeBase` yields a flipped quad and
      zero size hides the particle.
- [ ] **Step 2: Run it** — if it passes, close this task as already-satisfied and record that
      in the ledger. If it fails, fix and re-run.

---

## Phase 5: UV and curve corrections

### Task 5.1: Split UV scroll semantics by draw type

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/effectFolderPreviewPlan.ts`

Three corrections, all against `fxc` output:

1. The old claim that all kinetic paths use model scroll speed is wrong. Billboard and Strip
   read offsets `36` / `52` / `68` (ordinary speed, direction, limit); only Model reads
   `104` / `108`.
2. Model pattern 1 does not apply `uvScrollLimit` at all.
3. Billboard and Strip apply the limit as a single subtraction when `current > limit`, not as
   an arbitrary positive modulo. `effectFolderPreviewPlan.ts:101-102` currently applies
   `positiveModulo` for every path.

- [ ] **Step 1: Write the failing test** — one case per correction.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement** — thread the draw type into `evaluateEfxbnUvTransform`.
- [ ] **Step 4: Run test to verify it passes**

### Task 5.2: Preserve four-corner UVs

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/effectFolderPreviewPlan.ts`

`uvU[4]` / `uvV[4]` are per-corner. The current code collapses them to a min/max rectangle,
discarding non-rectangular or non-monotonic authored UVs.

- [ ] **Step 1: Write the failing test** using a sheared authored quad.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement** — emit four corners into the vertex attributes.
- [ ] **Step 4: Run test to verify it passes**

### Task 5.3: Complete the spawn-form branches

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/efxbnSimulation.ts`

- `type 4` / `8`: the shader picks one of six face directions and honours `emitAreaType`;
  the preview randomizes inside a box then normalizes.
- `type 3`: `emitAreaType` distinguishes edge radius from area-uniform `R * sqrt(U)`;
  the preview always uses a fixed radius.
- `type 2` / `7`: have dedicated angle paths; the preview falls through to generic random.
- `extraFlags & 8` with `emitInterpolateDistance` / `emitInterpolateType` back-fills particles
  along emitter displacement; not implemented. Both fields are already parsed
  (`effect_folder.rs:2268-2269`).

- [ ] **Step 1: Write one failing test per branch**
- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run tests to verify they pass**

### Task 5.4: Match GPU curve LUT quantization (P2)

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/efxbnSimulation.ts`

The GPU samples a 16-column `floatKeyTableTexture` at `u = p * 15 / 16 + 1 / 32`,
`v = (curveIndex + 0.5) / 16384`. The preview interpolates raw keys linearly — semantically
reasonable, but it will not reproduce LUT quantization.

- [ ] **Step 1: Write the failing test** — assert sampled values match the LUT formula at
      several `p`.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run test to verify it passes**

### Note on random parity

`seededUnit(seed, lane)` preserves distribution but not the game's sequential LCG state, so
per-particle values will not match the game exactly. Do not claim frame-exact parity anywhere
in the UI or documentation.

---

## Phase 6: Pixel-shader variants

**Depends on:** Task 1.3 for variant selection.

Implement in ascending order of infrastructure cost. Each task adds one variant, one test, and
one ledger row moving from "decoded, not rendered" to "implemented".

### Task 6.1: AddMix (`0x40`)

```text
bright  = max(c.rgb) > 0.8
out.rgb = c.rgb * c.a
out.a   = bright ? 0 : c.a
```

Then apply the `0x40000` half-brightness rule from Task 3.3.

- [ ] Write failing test → run → implement → run → update ledger.

### Task 6.2: Soft (`0x10001`)

```text
sceneZ = projectionNumerator / (depthSample - projectionOffset)
delta  = sceneZ - particleEyeZ

flag 0x1:     alpha *= saturate(delta / softParticleRange)
flag 0x10000: rgb   *= pow(2 - saturate(delta / depthEmissionRange), depthEmissionPower)
```

Requires a scene depth target in the preview pipeline.

- [ ] Add the depth render target → write failing test → run → implement → run → update ledger.

### Task 6.3: Light and HLight (`0x20804`, `0x20000`)

- `0x8`: normal map through TBN to world normal.
- `0x4 + 0x8`: directional light,
  `reflectionPower * 0.01 * (saturate(dot(L, N)) + 0.24) * 0.833333`.
- `0x800`: IBL cube reflection with `reflectionPower * 0.01` and a fifth-power Fresnel term.
- HLight combines with Light (selector `0x20000` hits both the Light mask `0x20804` and the
  HLight suffix). The combined shader uses a GGX-like specular: `F0 = saturate(highlightPower * 0.01)`,
  `F = F0 + (1 - F0) * (1 - VdotH)^5`, roughness constant `alpha^2 = 0.0256`.

Note: `efxDrawModelHLightPS.dxbc` is byte-identical to the base PS
(SHA-256 `030E4E46131A88FB0F33325B9DF8A86E1411D93525546B670CCD6C18A0147296`), so HLight alone
changes nothing — only the Light+HLight combination does.

Model particles currently use `MeshBasicMaterial`, which cannot express any of this.

- [ ] Replace with a custom `ShaderMaterial` → write failing test → run → implement → run →
      update ledger.

### Task 6.4: MultiUV (`0x1000`)

```text
primary   = ColorMap0(uv0)
secondary = ColorMap1(uv1)

flag 0x2000: d2 = OffsetMap1(uvOffset1).a * (rg - 0.5)
             uv1 += d2 * distortionPass2
             secondaryAlpha *= offset.a
flag 0x4000: secondary = FrameBuffer(distortedScreenUv); secondary.a = 1

rgb   = pass2BlendType != 0 ? primary.rgb + secondary.rgb : primary.rgb * secondary.rgb
alpha = primary.a * secondary.a * particle.a
```

**Depends on:** Task 1.2 — pass-2 maps live in slots `1` and `3`.

- [ ] Write failing test → run → implement → run → update ledger.

### Task 6.5: ColorEx (`0x280`)

```text
screenUv     = clip.xy / clip.w * (0.5, -0.5) + 0.5
offsetSample = UVOffsetMap(offsetUv)
d            = offsetSample.a * (offsetSample.rg - 0.5)

flag 0x80:  colorUv += d * distortionUV; screenUv += d * distortionUV; alpha *= offsetSample.a
flag 0x200: color = FrameBuffer(screenUv); color.a = 1
else:       color = ColorMap(colorUv)
```

Requires a scene colour render target — a single Three.js material cannot express this. Do this
last.

- [ ] Add the colour render target → write failing test → run → implement → run → update ledger.

---

## Phase 7: CPU render state (not derivable from HLSL)

### Task 7.1: Resolve blend, culling, and addressing enums from the state builder

**Files:**
- Modify: `docs/agent-sessions/2026-08-04-efxbn-3d-preview.md`
- Modify: `src/page/TestEditor/components/effect-folder-editor/EfxbnParticlePreview.tsx`

These four mappings currently have no evidence and are marked as inferences:

| Field | Current preview behaviour | Status |
| --- | --- | --- |
| `blendState` | `2 -> Additive`, `3 -> Subtractive` | inference |
| `cullingType` | always `DoubleSide` | unverified |
| `addressingMode` | always `RepeatWrapping` | unverified; clamp/mirror assets sample wrongly |
| `zWriteEnable` / `zTestEnable` | applied directly | state descriptor unverified |

Pixel shaders cannot establish any of them — blend and depth are D3D state objects.

- [ ] **Step 1: Locate the state builder**

Route through reverse-skill / IDA MCP. The previous session searched for `CreateBlendState`
imports and found the calls wrapped by the engine, so search the render-state descriptor
construction reachable from `sub_1401886B0` (which reads slot `+0x270` to choose between fixed
depth/zanzou shaders and the dynamic selector) instead of the D3D import table.

- [ ] **Step 2: Record findings with confidence levels**

Update the ledger. If a mapping cannot be proven, leave it marked as an inference — do not
promote a guess.

- [ ] **Step 3: Apply only proven mappings**

Per the no-fallback rule, an unsupported enum value must raise a visible diagnostic rather than
silently degrade to a default blend mode.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/page/TestEditor/components/effect-folder-editor`

---

## Phase 8: Offline render and reference comparison

This is the phase that was cut off. `tools/efxbn_blender_preview/` works and produced
`tmp/efxbn-render/167-real/preview.png` (frame 23, 91 particles, visibly non-empty), but the
sample pack has zero local models and zero local textures, so the image is neutral blue-white
billboard fallback. Nothing has been compared against reference appearance.

### Task 8.1: Render a positive sample with local models and textures

**Files:**
- Modify: `tools/efxbn_blender_preview/tests/test_preview.py`

The prior session identified three effect packs that do carry local models and textures
(used as copy-closure positive samples). Rendering one of those is the only way to exercise the
texture and model path end to end.

- [ ] **Step 1: Identify the packs** from `src-tauri/tests/effect_folder_real_data_test.rs:198`.
- [ ] **Step 2: Render each** with the documented command:

```powershell
python tools/efxbn_blender_preview/efxbn_blender_preview.py `
  --effect-root "<pack>" `
  --structure "<pack>_structure.json" `
  --efxbn "<pack>\0\0\<n>.efxbn" `
  --output "tmp\efxbn-render\<name>"
```

- [ ] **Step 3: Add a regression test** asserting non-zero resolved textures and models.
- [ ] **Step 4: Run** `python -m unittest tools.efxbn_blender_preview.tests.test_preview`

### Task 8.2: Compare against reference appearance

This replaces the `cie_visual` agent that never returned.

- [ ] **Step 1: Collect references** for the rendered effects from the OB Wiki and any
      in-game capture available.
- [ ] **Step 2: Produce a side-by-side comparison** in
      `docs/agent-sessions/2026-08-05-efxbn-magic-offline-render.md`, one row per effect:
      reference, offline render, and the specific deviation.
- [ ] **Step 3: Convert each deviation into a task** in the relevant phase above, or into a new
      finding if it is not explained by any known gap.

Do not describe the preview as visually accurate until this comparison exists. Rendering a
non-empty frame proves the parse chain works; it does not prove appearance.

### Task 8.3: Apply NUANMB animation to exported DAE

**Files:**
- Modify: `tools/efxbn_blender_preview/blender_preview.py`

The tool records animation paths but does not apply them, so model particles export in bind
pose. Reuse the existing motion compose path. Beware the recorded Blender FBX pitfalls
(connected bones dropping location keys, all-constant channels being culled) — those apply to
this export too.

- [ ] Write failing test → run → implement → run.

### Task 8.4: Export mesh-emitter surface sampling

**Files:**
- Modify: `tools/efxbn_blender_preview/scene_plan.ts`

Type 9/10 emitters read 72-byte `SEfxMeshEmitterPoint` records; the preview already samples
them from local NUMDLB vertices, but the scene plan does not export them, so the Blender mirror
diverges from the in-app preview for those blocks.

- [ ] Write failing test → run → implement → run.

### Task 8.5: Shrink the emitted inventory

`inventory.json` reached 17.3 MB for a single sample because the full folder inventory is
serialized. Emit only the entries the scene plan references.

- [ ] Write failing test asserting a size bound → run → implement → run.

---

## Phase 9: Independent audit

### Task 9.1: Re-derive the conclusions with a fresh agent

This was requested and never ran. `reverse-skill` is current at upstream `v1.0.0` / `d8bf345`.

- [ ] **Step 1: Confirm reverse-skill is still current** against
      `https://github.com/zhaoxuya520/reverse-skill`; update if behind.
- [ ] **Step 2: Spawn an audit agent that does not inherit implementation context.**
      It must re-derive, from scratch: EFXBN magic handling, the resource dependency closure,
      the `drawSchemeFlag` producer, and the pixel-shader semantics implemented in Phase 6.
- [ ] **Step 3: Reconcile.** Any disagreement with the ledger must be resolved by evidence, not
      by preferring the implementation. Record the outcome in the session document.

---

## Verification Gate

Before declaring this plan complete:

- [ ] `pnpm test` passes.
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` passes.
- [ ] `python -m unittest tools.efxbn_blender_preview.tests.test_preview` passes.
- [ ] `npx tsc --noEmit` introduces no new errors. Two pre-existing unrelated errors are known:
      `BulletPropertyPanel.tsx:227` and `motionFolderService.ts:724`.
- [ ] Every fidelity-ledger row is either "implemented" or carries an explicit reason.
- [ ] Phase 8 Task 8.2 has produced a real reference comparison.
- [ ] No file under `E:\XB` was modified.
- [ ] All file reads and writes used explicit UTF-8; no mojibake in any generated document.
