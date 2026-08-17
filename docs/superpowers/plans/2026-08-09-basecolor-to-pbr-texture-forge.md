# Base Color → Full PBR Texture Set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task states its RED step (write the failing test, run it, confirm the expected failure) before its GREEN step.

**Goal:** One command. One base color PNG in, a complete game-conforming texture set out — `.nutexb` files in the right formats plus the `.numatb` slots wired — with no external site, no manual encoding step, and no per-map fiddling.

Replaces the current five-step shuffle (texturewiz → download → calibrate → `ultimate_tex_cli` → hand-patch `numatb`).

---

## What is achievable, and what is not

Every row below is backed by a measurement taken during the investigation in
`docs/exvs2-custom-model-pbr-map-calibration.md` and the live-site experiments that followed.

| Output | Achievable? | Evidence |
|---|---|---|
| Encoding (linear vs sRGB), POT size, nutexb footer name, `Texture1` binding | **Fully** — objectively right or wrong | Shipped art uses `BC4Unorm`/`BC7Unorm` for data maps; the broken set had all four as `BC7Srgb` |
| Roughness | **Yes, to the game's distribution** | Segment-derived constants land inside shipped range (mean 0.525, p50 0.482, mirror 0.3%) |
| Metallic | **Partly — conservative auto-label, human override for ambiguous units** | See the blocker below |
| Ambient occlusion | **Weakly** — a cavity estimate from albedo luminance is partly fictional | Shipped AO mean 0.838 with real dark cavities; a working reference mod ships 0.994 (flat) and looks correct, so AO is low-stakes |
| Normal | **Weakly, and this is inherent** | Shipped is a high-poly bake (R std 0.171). A gradient of one albedo cannot recover height. Reference mod ships 0.013 and works |
| Emissive | **No** — out of scope, off by default | Requires knowing which panels glow |

### The metallic blocker, stated precisely

K-means over the base colors (k=8, 384² sample):

| Source | Cluster makeup |
|---|---|
| Custom weapon `Wep_2004_color` | blue paint 58.3%, gold family 26.6%, near-black 12.7%, light blue 2.6% — **cleanly separable, hue rule finds the gold** |
| Shipped `016gundmw_001wgzero_001_pbr1_basecolor` | **55.7% near-neutral bright** (saturation 0.03–0.05, value 0.67–0.95), blue 18.7%, grey-blue 21.1%, red 2.8%, gold 1.8% |

A "low saturation + high value = metal" rule marks that 55.7% as metal. The shipped metallic map says otherwise: mean 0.285 with 19.3% of texels at pure zero. **Those bright neutral regions are white paint, not bare metal**, and no hue/saturation rule can tell white paint from silver metal — they are the same color.

That is the whole reason metallic cannot be fully automatic for neutral-colored units.

**Design consequence — asymmetric failure cost.** A false *metal* is catastrophic: metal has no diffuse response, so it renders as a mirror of the HDR environment, which is exactly the white blowout that started this. A false *dielectric* is mild: the surface just looks flatter than intended. So the classifier **defaults every ambiguous cluster to non-metal** and only marks metal on a positive warm-hue signal. Being wrong in the safe direction is the design, not a limitation to apologise for.

---

## Architecture: segment once, derive everything

texturewiz derives each map independently as a per-pixel curve over luminance — which is why its roughness came out as `0.72·luma` and its metallic as `1.20·(1−luma)`, two trivial functions of the same input carrying no material information (measured correlation +0.992 and −0.970 against base color luminance; shipped art measures −0.006 and −0.318).

This pipeline inverts that: **one segmentation of the base color into material clusters, then every map is a property lookup on that segmentation.**

```
base_color.png
     │
     ├─► [1] segment      k-means in CIELAB → N clusters + per-pixel label map
     │
     ├─► [2] classify     cluster → material class {metal, paint, dark_rubber, glass}
     │                    conservative defaults + optional materials.json override
     │
     ├─► [3] synthesize   roughness  = per-class constant + edge modulation
     │                    metallic   = per-class constant (0 unless class == metal)
     │                    ao         = cavity estimate, mild
     │                    normal     = luminance gradient, strength-scaled
     │
     ├─► [4] validate     measure every map against the shipped reference distribution
     │
     └─► [5] encode       POT resize → .nutexb (linear/sRGB per slot) → patch .numatb
```

Steps 1–2 are the part texturewiz has no equivalent of, and they are what make steps 3–5 meaningful rather than cosmetic.

**Tech stack:** Python 3.11 + numpy + Pillow (already used across `tools/`), `tools/ultimate_tex_cli.exe` for encoding, `tools/ssbh_lib_json.exe` for the `.numatb` round trip (verified byte-identical on these files).

**Non-goals:** recovering real surface height; emissive; replacing hand-authored art for hero assets; changing the FBX/model pipeline.

---

## Task 1: Segmentation core

**Files:**
- Create: `tools/texture_forge/segment.py`
- Create: `tools/texture_forge/tests/test_segment.py`

- [ ] **RED** — write failing tests:
  - A synthetic image of exactly 3 flat colors segments into 3 clusters whose centers match the inputs within 1/255, with correct pixel shares.
  - Segmentation is **deterministic**: two runs on the same input return identical labels (seeded RNG). A non-deterministic segmentation would make every downstream map unreproducible.
  - A single-color image returns one populated cluster and does not crash on empty clusters.
- [ ] Run: `python -m pytest tools/texture_forge/tests/test_segment.py`. **Expected: fail** (module missing).
- [ ] **GREEN** — implement `segment(image, k, seed) -> (centers_lab, labels, shares)`.
  - Cluster in **CIELAB**, not RGB: perceptual distance is what separates "gold" from "dark gold shading", and RGB k-means splits on brightness instead. Convert via sRGB → linear → XYZ → Lab.
  - Downsample to 384² for clustering (measured sufficient), then assign labels at full resolution by nearest center.
  - Merge clusters whose Lab distance is below a threshold, so shading variants of one material collapse into one class. In the measured data the gold appears as three clusters (hue 24/33/36) that must become one.
- [ ] Run the test again. **Expected: pass.**

## Task 2: Material classification

**Files:**
- Create: `tools/texture_forge/classify.py`
- Create: `tools/texture_forge/tests/test_classify.py`

- [ ] **RED** — write failing tests using the real measured cluster centers:
  - The custom weapon's gold clusters `(0.599,0.369,0.096)` and `(0.819,0.577,0.205)` classify as `metal`.
  - Its blue clusters `(0.009,0.193,0.420)` and `(0.038,0.301,0.593)` classify as `paint`.
  - Its near-black `(0.017,0.037,0.077)` classifies as `dark_rubber`.
  - **The shipped art's neutral-bright clusters `(0.917,0.913,0.946)` and `(0.835,0.831,0.867)` classify as `paint`, NOT metal.** This is the regression guard for the blocker above — a classifier that calls them metal is the bug.
  - An explicit `materials.json` override wins over the auto label.
- [ ] Run: `python -m pytest tools/texture_forge/tests/test_classify.py`. **Expected: fail.**
- [ ] **GREEN** — implement `classify(centers) -> list[MaterialClass]` with conservative rules:

| Class | Condition | metallic | roughness |
|---|---|---|---|
| `metal` | hue 20–70° **and** saturation > 0.30 (warm metals: gold, brass, copper) | 0.90 | 0.35 |
| `dark_rubber` | value < 0.10 | 0.00 | 0.85 |
| `glass` | high saturation, high value, small area share (< 3%) | 0.00 | 0.15 |
| `paint` | **everything else, including all neutral colors** | 0.00 | 0.55 |

  - `paint` is the default. Neutral/desaturated clusters are never auto-classified as metal regardless of brightness.
  - Emit `materials.json` next to the output listing every cluster with its center color, area share, auto label, and a preview swatch, so a wrong call is a one-line edit rather than a re-run with different flags.
- [ ] Run the test again. **Expected: pass.**

## Task 3: Map synthesis

**Files:**
- Create: `tools/texture_forge/synthesize.py`
- Create: `tools/texture_forge/tests/test_synthesize.py`

- [ ] **RED** — write failing tests asserting the synthesized maps land in the shipped band:

```python
GAME_ROUGHNESS = dict(mean=0.525, p25=0.357, p50=0.482, p75=0.694, mirror=0.003)
GAME_METALLIC = dict(mean=0.285, p25=0.129, p50=0.247)

def test_roughness_lands_in_shipped_band():
    maps = synthesize(SEGMENTED_WEAPON)
    r = channel_stats(maps.roughness)
    # The single hard requirement: no mirror surface. 57.2% of the shipped-broken
    # map was below 0.1 and that is what rendered as white chrome in game.
    assert r["mirror"] < 0.01
    assert 0.40 <= r["mean"] <= 0.65

def test_metallic_never_marks_the_whole_surface_metal():
    maps = synthesize(SEGMENTED_WEAPON)
    m = channel_stats(maps.metallic)
    # The broken map had p25 = 0.541, i.e. 75% of the gun was substantially metal.
    assert m["p25"] < 0.20
    assert m["mean"] < 0.45

def test_metallic_is_zero_wherever_the_class_is_not_metal():
    maps = synthesize(SEGMENTED_ALL_PAINT)
    assert maps.metallic.max() == 0
```

- [ ] Run: `python -m pytest tools/texture_forge/tests/test_synthesize.py`. **Expected: fail.**
- [ ] **GREEN** — implement per-map synthesis from the label map:
  - **roughness**: per-class constant, then modulate by a normalized edge/cavity term within ±0.12 so flat regions are not perfectly uniform. Never let any texel fall below 0.15.
  - **metallic**: per-class constant, hard zero for every non-metal class. No gradients — shipped metallic is 19.3% pure zero with a small strongly-metallic set, i.e. mask-like.
  - **ao**: cavity estimate from luminance treated as height (the same neighbourhood comparison texturewiz uses), scaled to a **mild** default. Document in the function that albedo luminance is not height and this term is partly fictional.
  - **normal**: Sobel gradient of luminance, strength-scaled, B forced to 255. Emit a warning that this cannot reach a high-poly bake (shipped R std 0.171 vs the achievable ~0.02).
- [ ] Run the test again. **Expected: pass.**

## Task 4: Encoding and packaging

**Files:**
- Create: `tools/texture_forge/encode.py`
- Create: `tools/texture_forge/tests/test_encode.py`

- [ ] **RED** — write failing tests:
  - The slot→format table maps `basecolor`/`emissive` to `BC7RgbaUnormSrgb` and `normal`/`roughness`/`metallic`/`ao` to `BC7RgbaUnorm`. A data map must never resolve to an sRGB format.
  - A non-power-of-two input (the real base color is **1408×1408**) is resized to 1024 or 2048 before encoding, and the choice is reported.
  - The nutexb footer name equals the output file stem, lowercase.
- [ ] Run: `python -m pytest tools/texture_forge/tests/test_encode.py`. **Expected: fail.**
- [ ] **GREEN** — implement encoding by shelling out to `tools/ultimate_tex_cli.exe <png> <nutexb> -f <format>`. Verify the footer by reading it back with `-i` rather than trusting the call succeeded.
- [ ] Run the test again. **Expected: pass.**

## Task 5: Material file wiring

**Files:**
- Create: `tools/texture_forge/numatb.py`
- Create: `tools/texture_forge/tests/test_numatb.py`

- [ ] **RED** — a `.numatb` whose material lacks `Texture1` gains it, pointed at the roughness map, inserted after `MetallicMap` in `__nust__` and after `NormalMap` in `__maya__` (the shipped ordering). A material that already has it is left untouched.
- [ ] Run: `python -m pytest tools/texture_forge/tests/test_numatb.py`. **Expected: fail.**
- [ ] **GREEN** — implement via the `tools/ssbh_lib_json.exe` round trip. Assert round-trip fidelity on load (it was verified byte-identical, SHA-256 `2D17394B…A2067AAE`, on these files) and abort rather than write if it ever differs.
- [ ] Run the test again. **Expected: pass.**

## Task 6: CLI

**Files:**
- Create: `tools/texture_forge/__main__.py`
- Create: `tools/texture_forge/README.md`

- [ ] Implement the single entry point:

```bash
python -m texture_forge build BaseColor.png --out <dir> --name wep_2004 [--numatb <path>...]
python -m texture_forge build BaseColor.png --out <dir> --name wep_2004 --materials materials.json
python -m texture_forge check <dir>          # measure an existing set, change nothing
```

  - `build` with no `--materials` is fully automatic: base color in, complete set out.
  - Always writes `materials.json` and a `report.md`, so the automatic run is inspectable and the next run is correctable.
  - Non-zero exit when validation finds an error-level issue.
- [ ] README documents the metallic limitation in the first section, not a footnote — an author who never reads past the usage block must still learn that neutral colors default to paint.

## Task 7: End-to-end acceptance

**Files:**
- Create: `tools/texture_forge/tests/test_end_to_end.py`

- [ ] Run the full pipeline on the real `D:\output\exvs2\wing_gundam_zero_rebellion\Wep_2004_color.png` (skip when absent, matching the repo's real-data test convention) and assert:
  - four `.nutexb` produced, all reporting a **linear** format from `ultimate_tex_cli -i` except the base color
  - roughness mirror fraction **< 1%** (the shipped-broken value was 57.2%)
  - metallic p25 **< 0.20** (the shipped-broken value was 0.541)
  - the gold clusters are non-zero in the metallic map and the blue clusters are exactly zero
- [ ] Compare the generated roughness against `_fix.png` (histogram-matched, mean 0.530 / p50 0.494 / mirror 0.0%) and record both in the report. The segment-derived map does not have to beat it — it has to be in the same safe band while being reproducible from the base color alone.

---

## Verification

- [ ] `python -m pytest tools/texture_forge/tests/`
- [ ] `python -m texture_forge build` on the real weapon, then `check` on the shipped `016gundmw_001wgzero_001_pbr1_*` set — the shipped art must pass `check` with zero errors, or the thresholds are wrong.
- [ ] Install the generated set into a copy of the package, confirm `scan_roots`-style stats match the shipped band.
- [ ] In-game visual check. **No automated test substitutes for this** — the pipeline guarantees the maps are in the right numeric band, not that the material reads correctly.

## Open questions

| Item | Status |
|---|---|
| Metal hue window (20–70°) | Tuned on one weapon. Needs checking against more shipped units before it is trusted as a default. |
| White-armored units | The classifier will call all white armor `paint`. For a unit that genuinely has bare-metal white/silver parts, `materials.json` is the only route. Accepted. |
| Cluster count `k` | Fixed at 8 initially. Whether it should adapt to image complexity is unresolved. |
| AO honesty | Cavity-from-albedo is partly fictional. Default mild; consider defaulting it fully flat, since a confirmed-working reference mod ships a flat AO. |

## Related docs

- Case write-up and all measured evidence: `docs/exvs2-custom-model-pbr-map-calibration.md`
- Editor-side lint and HDR environment plan: `docs/superpowers/plans/2026-08-09-pbr-map-calibration-lint-and-hdr-env.md`
