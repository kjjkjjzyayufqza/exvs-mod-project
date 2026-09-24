# EXVS2 deferred renderer

The Over Boost renderer, reconstructed for the Unit Model Editor and the Scene
Editor viewports. It replaces the hand-tuned cel shading (`previewRenderStyle:
"anime"`) with the pass graph the game actually runs.

Code: `src/components/exvs-renderer/`.

## Provenance

The reconstruction is read off the shipped shaders' own disassembly and their
`RDEF` constant-buffer names, which survive in every DXBC container. Those names
are the developers', so field names in this port are not invented. The capture
tooling and the shader inventory live in the research tree
(`EXVS2-POC/xDocs/Graphics_research/`); **no dump, listing or bytecode is
committed here** — this repository carries the reconstruction only.

Target scope is Over Boost and earlier, per `AGENTS.md`.

## Pass graph

| # | Pass | Source shader | Output |
|---|---|---|---|
| 1 | Shadow atlas | `vs-7EBBB5D26CCB06BF` | 2x2 depth atlas, 4 partitions |
| 2 | G-buffer | `vs-E99CC3BC6752F5F3`, `ps-A46F9C9D4B98F6ED` (character), `ps-302B77184673BB7D` / `ps-2B5EEB07C38FE518` (background) | 4 targets + depth |
| 3 | Depth reduction | `cs-0593BB4DAB0DE410` | next frame's partition bounds |
| 4 | Ambient occlusion | `ps-BFDD0CD4399077B3`, `ps-DD2FCC1D98B2FDF6`, `ps-F1E8F8B2457CDA69`, `ps-7CC29CADBC510360` | multiplied into target 3 alpha |
| 5 | Shadow resolve | `ps-1EDEBAE73920DD10` | multiplied into target 1 alpha |
| 6 | Analytic lighting | `cs-D3FABD508AD39F40` | diffuse + specular accumulation |
| 7 | Ambient lighting | `ps-9CA18D4459E4DBB5` | added to the same two |
| 8 | Composite | `ps-CE7B7A3265CC4F9D` | scene colour, writes depth through |
| 9 | Character rim | `ps-0CB737AB94786C65` | additive over the composite |
| 10 | Forward | — | transparency and editor helpers |
| 11 | Bloom | `ps-9706A0FCC0F096FE`, `ps-9ED7554FA76C4F62`, `ps-9F0C489CD27F7102`, `ps-4BD2FA2CCAC97EBD` | |
| 12 | Depth of field | `ps-FF3A4EAB5AB00EF3` | |
| 12b | Effect blend | `ps-092DD88CBCD380C9` | four effect layers + the effect tone curve rows |
| 13 | Post filter | `ps-9417D9CEC02D40F9` | gamma, grading, screen effects |
| 14 | Antialiasing | `ps-3E6DFF52EB37B249` | FXAA 3.11, preset 12, to the canvas |

Pass 14 is the only one that writes the canvas. Pass 13 always runs, because it
owns the gamma encode; its individual effects are each behind their own enable.

Pass 4 runs at full resolution and only the depth its sample taps read is halved,
which is how the shipped pass is wired: it loads the depth and the normal at the
pixel it is shading, and only the taps are cheap.

## G-buffer layout

```
target 0  .xy  view-space normal, Lambert azimuthal equal-area encoded
          .z   emissive intensity
          .w   0
target 1  .rgb albedo
          .a   lighting mask  (written by the G-buffer, refined by pass 5)
target 2  .x   roughness
          .y   metallic
          .z   flag byte / 255
          .w   diffuse-only ambient occlusion offset
target 3  .rgb emissive, or a baked light map
          .a   ambient occlusion (written by the G-buffer, refined by pass 4)
```

Flag byte:

| Bits | Meaning |
|---|---|
| `0x01` | the emissive slot holds a baked light map |
| `0x02` | shadow caster |
| `0x04` | shadow receiver |
| `0x08` | lighting passes discard this pixel |
| `0xF0` | material class — `0x00` background, `0x40` character |

The material class is read back in three places: ambient occlusion is skipped for
characters, the composite picks a different block of tone-curve rows for them,
and `brightness_ratio` is applied to the background only.

## Constant buffers

Every settings group in `exvsRenderSettings.ts` keeps its source buffer's field
names:

| Group | Buffer |
|---|---|
| `ibl` | `cbSceneLightInfo` |
| `shadowParameter` | `vsngShadowParameter` |
| `sdsm` | `cbSDSM_ShadowMap`, `cbSDSM_Partitions` |
| `ssao` | `cbSSAOAttribs` |
| `charaGBuffer` | `vsngCharaGBufferControl` |
| `charaBasic` | `vsngCharaBasic` |
| `bloom` | `nuBloomCBuffer` |
| `dof` | `nuDOFCBuffer` |
| `sceneFilter` | `PERSCENE_VSNG` |
| `postFilter` | `VsngPostFilterParameter` |
| `fxaa` | `cbFxaaAttribs` |
| `objectDefaults` | `UpdatePerObject` |

## Reproduced exactly

These look like mistakes and are not:

- **Alpha test at 0.95.** The shipped cutout discards anything below almost fully
  opaque. It is reached only through an explicit `userData.exvs.enableAlphaTest`,
  because the numatb flag that turns it on is not carried on a resolved binding and
  applying that cutoff to a material which never asked for one erases it.
- **Bloom's hard threshold.** A binary luminance cut with no soft knee, on
  Rec. 601 weights. The engine's value is authored per scene and was not captured;
  `bloom.bloomThreshold` defaults below a full-brightness emissive texel so
  emissive blooms and ordinary lit geometry does not.
- **Bloom's sample offsets.** Derived from the pixel coordinate rather than a
  texel size, so the spread shrinks toward the bottom right of the screen.
- **The two cube spaces.** The ambient pass samples the specular cube through
  `g_IBLWorldInverseMatrix` and the diffuse cube in plain world space.
- **The cube z flip.** Both cube lookups negate z; it is the handedness flip
  between the engine's world and the cube's frame.
- **`GBufferDiffuseMultiply` is a lerp**, not a multiply, despite its name.
- **The NaN guard colour** `(0.219, 0.247, 0.278)`.
- **Sphere area lights double the light vector** before adding the representative
  point pull. The result is normalised, so only the ratio survives.
- **Point lights are not shadowed.** Only directional light is masked by target 1
  alpha, which is where the shadow resolve writes.
- **Fog comes from the ramp texture's alpha.** A stage that authors no ramp fog is
  not fogged; distance alone never produces fog.

## Deliberate differences

| What | Why |
|---|---|
| Light culling is not tiled | WebGL2 has no compute stage. The lighting pass walks the light lists directly. The shading arithmetic is unchanged; only the culling is gone, and an editor scene carries few enough lights that it does not matter. |
| Shadow partitions are drawn as four viewports | The original clips one instanced draw per quadrant with `SV_ClipDistance`, which WebGL2 does not expose. The atlas that comes out is the same. |
| Partition bounds come from frustum corners | The original scatters the depth buffer into per-partition light-space bounds. Corner bounds are a superset, so a partition can come out looser and never tighter: it costs some texel density and cannot produce an artefact. |
| The depth reduction is read back asynchronously | A synchronous read would fence every frame. Partitions are built from the previous frame's bounds, which is standard for sample distribution shadow maps. |
| The SSAO normal's z is not negated | The original negates it because its reconstructed position runs `+z` away from the camera while the G-buffer normal runs `+z` toward it. Both agree in WebGL, so reproducing the negation would tilt every sampling hemisphere backwards. |
| Target 1 and target 3 alpha are combined multiplicatively | The original's blend states were not captured. Both passes early-out with `1.0`, which is the identity for a multiply, and a multiply is the only choice that also lets a baked light map's own shadow survive alongside the dynamic one. |
| Logarithmic depth is supported | Both viewports run three.js's logarithmic depth buffer because their far plane is five million units out. `exvsViewPositionFromDepth` inverts it analytically rather than approximating. |
| Ambient and hemisphere lights feed the ambient pass | The engine's only ambient is the cube maps a stage authors. The editors light with an `AmbientLight` and a `HemisphereLight`, which are the controls their viewports already expose, so the ambient pass takes them as extra irradiance carrying the same `1 / PI` three.js applies to them. Without this the pass is skipped whenever no cube map is bound and every surface the sun misses reads as black. |
| The shadow range is its own setting | `g_CameraNearFarAndBias.xy` is a shadow range, not the camera's clip range: the reduction clamps to it and the first and last partitions are pinned to its ends. Both viewports here run a far plane five million units out, so `sdsm.shadowNear` and `sdsm.shadowFar` carry their own numbers. Anything past `shadowFar` is simply lit. |
| Emissive uses the shipped `EmissiveScale` | The forward render styles hold stage emissive down to 0.12 and refuse the map entirely on a material whose shader label resolves as generic, because they fold emissive into their own lighting. The deferred pipeline adds it in the composite as the engine does, so it binds the map whenever one exists and uses `UpdatePerObject.EmissiveScale`'s own default of 1. |
| Bloom combines back up the chain | The combine shader takes a colour buffer and a light buffer, which is the shape of a progressive upsample. Folding in only the smallest level would leave a one pixel highlight diluted to nothing. |
| The cutout threshold comes from the material | Without an explicit `EnableAlphaTest`, a draw cuts at its own material's `alphaTest`, so a cutout texture punches the same holes here as it does in the other render styles. |
| Instanced meshes are supported | The stage draws instanced props, so the G-buffer, depth and rim vertex shaders apply `instanceMatrix` the way three.js's own chunks do. |
| The material's `aoMapIntensity` is honoured | The engine has no such scalar, but the editor's materials carry one and the other render styles apply it, so the same map reads the same way in all three. |
| `IrradianceNormalTexture` is optional | Nothing in an editor scene produces one. With it off the diffuse lookup uses the G-buffer normal, which is what an identity irradiance normal gives. |
| The effect blend pass has no input yet | The four layers it folds together are produced by the engine's own effect pipeline. The pass is ported and wired, and runs as soon as a caller supplies all four through `sceneTextures`; the editor's EFX preview draws forward instead. |

## Open

**The rim pass's half vector.** `ps-0CB737AB94786C65` builds it as
`normalize(V - directionWS)`, while `cs-D3FABD508AD39F40` uses the same field
directly as the direction toward the light. One of the two implies the opposite
sign convention for `DirectionalLight.directionWS`. Both are transcribed as
written rather than reconciled: the dumps do not say which way the engine fills
the buffer for the rim pass, and "correcting" either one would change the look of
the thing being reproduced. If a capture of the buffer's live contents settles
it, fix the rim pass and delete this note.

## Using it

The renderer is a `previewRenderStyle` value.

- Unit Model Editor: the display settings dropdown, "EXVS2 deferred".
- Scene Editor: the aperture button in the viewport toolbar.

A mesh declares itself through `userData.exvs` (`ExvsObjectParams`). Anything it
leaves out takes the shipped default; anything malformed throws rather than
rendering with the wrong material class. `exvsObjectParamsFromBinding` derives
the declaration from a resolved numatb binding, which is what both editors use.

Stage-authored inputs — the cube maps, the tone curve and grading lookups, the
ramp fog, the border projection — are passed as `sceneTextures`. A pass whose
input is absent does not run, which is what the game does on a stage that authors
none of them. The specular cube falls back to the first cube map any material in
the scene carries, which is the one the numatb binding already resolved.

## Cost

Per frame, at the drawing buffer's resolution:

- four half-float MRT attachments plus depth — 32 bytes per pixel resident, and
  the G-buffer pass writes all four;
- two more half-float attachments for the light accumulation;
- one full-screen pass each for lighting, ambient, shadow resolve, composite,
  post filter and antialiasing, plus the bloom chain;
- ambient occlusion and its blur at full resolution, over a half resolution tap
  buffer.

At 2560x1440 that is roughly 300 MB of render targets. The heaviest single pass
is the ambient occlusion blur, as it is in the game — 239 instructions against
the occlusion's 85 — so `ssao.blurEnabled` is the first thing to turn off on a
slow machine, then `ssao.enabled`, then `sdsm.atlasSize`.

The viewports already cap device pixel ratio adaptively; that cap is what keeps
this bounded, and it applies to the pipeline because every target is sized from
the drawing buffer.
