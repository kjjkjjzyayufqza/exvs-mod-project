# EXVS2 custom model PBR map calibration ("model renders too white")

Status: applied (2026-08-09)
Case: `wing_gundam_zero_rebellion_model` custom weapons `models/tbsrifle_out` and
`models/bsrifle00b_out`, package root `E:\XB\mod\002chara\wing_gundam_zero_rebellion_model`.

Symptom: the custom weapons render as a bright white mirror in game. The author had
hand-painted only a base color; normal / roughness / metallic / AO were generated from
that base color by an external texture wizard.

## Summary

The whiteness is **not** a base-color problem. The base color is dark
(mean RGB `0.162 / 0.216 / 0.290`). The three generated maps are luminance derivatives
of the base color rather than material data, and they push the surface into
"polished chrome", so the environment cube map (`barispecular00_cubemap`) drowns the
albedo out. Metals have no diffuse response in this shader family, so the painted blue
and gold never reach the screen.

Four independent defects were found; all four are fixed below.

## Evidence

All numbers are the raw stored 8-bit values of the R channel, measured after decoding
each `.nutexb` to PNG. `mirror` is the fraction of texels below `0.1` (a roughness that
low is a near-perfect specular reflector).

| Map | Custom (`wep_2004_*`) | Game (`016gundmw_001wgzero_001_pbr1_*`) | Reference mod (`gdk0_col_01_*`) |
|---|---|---|---|
| roughness mean | **0.120** (mirror **57.2%**) | 0.525 (mirror 0.3%) | 0.464 (mirror 2.8%) |
| roughness p25 / p50 / p75 | 0.039 / 0.090 / 0.149 | 0.357 / 0.482 / 0.694 | 0.145 / 0.349 / 0.847 |
| metallic mean | **0.631** (p25 = 0.541) | 0.285 (19.3% below 0.1) | 0.404 (p25 = 0.149) |
| AO mean | 0.995 (100% above 0.9) | 0.838 (p5 = 0.149) | 0.994 |
| normal R std | **0.0053** (range 0.416–0.576) | 0.1709 (range 0–1) | 0.0129 |

Visual inspection of the generated maps confirms the cause: the "metallic" map is a
desaturated copy of the base color — the painted highlights, the gold gradient and the
green lens are all still visible in it. The "roughness" map is a darkened inverse of the
same luminance, so flat armor faces read as mirrors and only bevel rims read as rough,
which is inverted relative to the shipped art (game armor plates are the *bright*, rough
regions).

### Defect 1 — surface is chrome

`metallic ≈ 0.63` over 75% of the surface combined with `roughness ≈ 0.12` over 57% of
the surface. Root cause of the white render.

### Defect 2 — every non-color map is tagged sRGB

| Texture | Custom format | Game format | Reference mod format |
|---|---|---|---|
| base color | `BC7Srgb` | `BC7Srgb` | `BC7Unorm` |
| normal | **`BC7Srgb`** | `BC7Unorm` | `BC7Unorm` |
| roughness | **`BC7Srgb`** | `BC4Unorm` | `BC7Unorm` |
| metallic | **`BC7Srgb`** | `BC3Srgb` | `BC7Unorm` |
| ambient occlusion | **`BC7Srgb`** | `BC4Unorm` | `BC7Unorm` |

An sRGB texture view makes the GPU apply the sRGB→linear transfer on sample, so a stored
roughness of `0.120` reaches the shader as `≈0.013` — an order of magnitude more mirror-like
than the already-wrong stored value. A normal map must never be sRGB. The game is
internally inconsistent on metallic (`pbr1_metallic` is `BC3Srgb` while `emi_metallic` is
`BC4Unorm`), so linear was chosen for it, matching the reference mod.

`BC4Unorm` is also valid and halves the file size, and is proven by the shipped
`pbr1_roughness` / `pbr1_ambientocclusion` / `emi_metallic` textures reading from R only.
`BC7RgbaUnorm` was used here because it keeps the codec identical to the author's current
files, so only the color space and the pixel values change.

### Defect 3 — `Texture1` was never bound

Every shipped material in the package (7 of 7) and every material in the working
third-party reference mod binds `Texture1`. The custom `Wep_2004` entry was the only one
without it, in both the `__nust__` and `__maya__` profiles.

| Source | `Texture1` target |
|---|---|
| Game `pbr1Mtl` / `emiMtl` | `../../textures/..._roughnessandmask` (RGB = secondary mask, mean 0.273; A = separate mask, mean 0.327) |
| Reference mod `gdk0` / `UCdkw00` | the material's own `RoughnessMap` |
| Custom `Wep_2004` (before) | **absent** |

The repo's own material validation gate already treats this as mandatory —
see `DaeSsbhSessionLayout.tsx:383` ("Texture1 is always required").

### Defect 4 — normal map carries no detail

`R std = 0.0053` versus `0.1709` in the shipped art. The generated normal map is
effectively blank. This is a detail gap, not a brightness gap — the reference mod ships an
almost equally flat normal map (`0.0129`) and still looks correct in game — so it was
treated as secondary.

## Reference conventions confirmed while investigating

- **Bare texture names resolve.** The custom materials reference `wep_2004_color` with no
  `../../textures/` prefix while all shipped materials use the prefix. A scan of
  `E:\XB\mod` found 172 bare-name texture references across working mods, so the bare form
  is a supported convention and was ruled out as a cause.
- **Shader label is identical** (`vsngCharaBasic`) between custom and shipped materials, so
  no shader-family mismatch is involved.
- Other observed deltas, none of which affect brightness: the custom material sets
  `UseEmissiveMap = false` / `EmissiveScale = 0` with no `EmissiveMap` (the shipped `emiMtl`
  uses `EmissiveScale = 10`), and its `DiffuseSampler` uses
  `texture_filtering_type = Default` / `unk12 = 2139095022` where shipped materials use
  `Default2` / `1098907648`.

## Fix applied

### Map values — histogram matching against the shipped art

Remapping the custom maps onto the cumulative distribution of the game's own maps for the
same unit preserves the author's spatial detail while adopting the game's material range.
This is preferable to hand-picked levels because the target is derived from the reference
rather than guessed.

```python
def histogram_match(src: np.ndarray, ref: np.ndarray) -> np.ndarray:
    """Map src's 8-bit values onto ref's distribution via CDF lookup."""
    src_hist = np.bincount(src.ravel(), minlength=256).astype(np.float64)
    ref_hist = np.bincount(ref.ravel(), minlength=256).astype(np.float64)
    src_cdf = np.cumsum(src_hist) / src.size
    ref_cdf = np.cumsum(ref_hist) / ref.size
    lut = np.interp(src_cdf, ref_cdf, np.arange(256)).round().astype(np.uint8)
    return lut[src]
```

| Output | Source | Reference |
|---|---|---|
| `wep_2004_roughnessmap` | own R channel | `016gundmw_001wgzero_001_pbr1_roughness` |
| `wep_2004_metallicmap` | own R channel | `016gundmw_001wgzero_001_pbr1_metallic` |
| `wep_2004_aomap` | passthrough | — (p1 = 0.969, no usable contrast to match; amplifying it would turn compression noise into hard occlusion) |
| `wep_2004_normalmap` | XY scaled ×4 around 128, B and A forced to 255 | — |

### Encoding

```powershell
tools\ultimate_tex_cli.exe <fixed>.png <out>.nutexb -f BC7RgbaUnorm
```

The nutexb footer name defaults to the output file stem, so keeping the file names
unchanged keeps the material references valid.

### Material — add `Texture1`

Inserted into the `Wep_2004` entry pointing at `wep_2004_roughnessmap`, following the
reference mod's convention. Insertion position mirrors the shipped files so the attribute
order stays identical to a stock entry:

| Profile | Insert after |
|---|---|
| `__nust__` | `MetallicMap` |
| `__maya__` | `NormalMap` |

Edited through a `ssbh_lib_json` round trip. Fidelity was verified before editing —
converting `bsrifle00b_out__nust__.numatb` to JSON and back produced a **byte-identical**
file (SHA-256 `2D17394B…A2067AAE`, 3007 bytes), so the round trip is lossless for these
materials.

Note: `src-tauri/target/release/exvs2_json.exe` does **not** handle `numatb` — its
`inspect` types are jnttbl, character-id-table, vernier-table, armsparam, bulletparam,
speedparam, projectile-depiction-table, nusktb, numshb, numdlb. Use `tools/ssbh_lib_json.exe`
for material files. `ParamId` numeric values, if a raw parser is needed, live in
`ssbh_lib/src/formats/matl.rs` of the `wmmt2-merge` checkout.

## Verification

Measured after BC7 compression, by decoding the produced `.nutexb` back to PNG:

| Map | Before | After | Game target |
|---|---|---|---|
| roughness mean | 0.120 | **0.530** | 0.525 |
| roughness mirror (<0.1) | 57.2% | **0.0%** | 0.3% |
| roughness p25 / p50 / p75 | 0.039 / 0.090 / 0.149 | **0.357 / 0.494 / 0.702** | 0.357 / 0.482 / 0.694 |
| metallic mean | 0.631 | **0.290** | 0.285 |
| metallic below 0.1 | 0.0% | **19.2%** | 19.3% |
| normal R std | 0.0053 | 0.0211 | 0.1709 |

Files produced: 4 `.nutexb` (linear BC7, 2048², 12 mips) and 4 `.numatb`
(2 models × `__nust__` / `__maya__`). Original files were not modified; the output was
staged for the author to copy over after taking a backup.

## Remaining gaps (author action required)

1. **Base color has baked lighting.** The custom base color has highlights, shading and
   metal gradients painted in; every shipped base color in this package is flat color
   blocks with no lighting. Painted lighting fights the engine lighting and breaks as the
   model rotates. This is the largest remaining stylistic difference and cannot be
   automated without destroying the author's art.
2. **Normal map must be re-baked.** The ×4 boost reaches `std = 0.021` against the game's
   `0.171`. A normal map inferred from a single base color has no real height information;
   crisp armor chamfers and panel lines need a high-poly bake or hand authoring.
3. **AO does nothing** (100% of texels above 0.9). Low priority — the working reference mod
   ships an equally flat AO map.
4. **`wep_2004_color` is 1408×1408**, not a power of two. It is BC block aligned so it
   encodes, but the mip chain can misalign on some hardware. Prefer 1024 or 2048.

## Tooling used

| Tool | Purpose |
|---|---|
| `tools/ssbh_lib_json.exe` | `.numatb` ⇄ JSON (lossless round trip verified) |
| `tools/ultimate_tex_cli.exe` | `.nutexb` ⇄ PNG, `-i` for format/dimension info, `-f` to pick the encoded format |
| `tools/magick.exe` | contact sheets and channel splits for visual inspection |
| numpy / Pillow | percentile statistics and histogram matching |

## Why the editor preview did not catch this

The three.js preview rendered the broken maps as plausible dark chrome. Three of the four
defects are structurally invisible to it: texture color space is decided by slot role and
never read from the nutexb footer (`ssbhTextureUpload.ts:45`), the EXVS binding path never
reads `Texture1` (`meshFromSsbh.ts:627-637`), and every nutexb — including the `BC6Ufloat`
HDR specular cube map — is decoded to 8-bit RGBA, clamping the reflected energy that
produces the in-game blowout (3.90% of that cube map's texels clip at 255 when forced to
8-bit). Follow-up work is planned in
`docs/superpowers/plans/2026-08-09-pbr-map-calibration-lint-and-hdr-env.md`.

## Related docs

- Follow-up plan (map lint, reference diff, HDR environment):
  `docs/superpowers/plans/2026-08-09-pbr-map-calibration-lint-and-hdr-env.md`
- Material validation gate design: `docs/agent-sessions/numatb-texture-validation-gate/design-numatb-format-module.md`
- Stage material color research: `docs/exvs-stage-numatb-simple-color.md`
- Unit model dynamic folder pipeline (shared deduped nutexb pool):
  `docs/agent-sessions/unit-model-editor/dynamic-folder-pipeline-plan.md`
