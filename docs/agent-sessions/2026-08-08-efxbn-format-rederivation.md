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
