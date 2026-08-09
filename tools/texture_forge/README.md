# texture_forge

One base-color PNG in → complete game-conforming PBR set out (roughness, metallic,
AO, normal as PNG + `.nutexb`, plus optional `.numatb` Texture1 wiring).

## Metallic limitation (read this first)

**Neutral / desaturated colors always default to paint, not metal.**

White paint and bare silver metal are the same color in a base-color map. No
hue/saturation rule can separate them — shipped body art is mostly bright neutral
clusters that the shipped metallic map treats as non-metal.

A false **metal** is catastrophic: metals have no diffuse response and render as a
mirror of the HDR environment (the white chrome blowout that started this tool).
A false **dielectric** only looks flatter than intended.

Therefore the classifier only auto-labels **warm-hue** clusters (gold / brass /
copper, hue ≈ 20–70° with saturation > 0.3) as metal. Everything else is paint
or dark rubber. To force bare-metal white/silver regions, edit `materials.json`
and re-run with `--materials`.

## Usage

`texture_forge` lives under `tools/`. Put that directory on `PYTHONPATH`:

```powershell
# from repo root
$env:PYTHONPATH = "tools"
python -m texture_forge build path\to\BaseColor.png --out out\wep --name wep_2004
python -m texture_forge check out\wep --name wep_2004
python -m texture_forge build --help
```

Outputs under `--out`:

| file | purpose |
|------|---------|
| `{name}_roughnessmap.png` / `.nutexb` | linear roughness |
| `{name}_metallicmap.png` / `.nutexb` | linear metallic mask |
| `{name}_aomap.png` / `.nutexb` | mild cavity AO |
| `{name}_normalmap.png` / `.nutexb` | luminance-gradient normal |
| `materials.json` | cluster listing + override hooks |
| `report.md` | stats + validation findings |

Optional:

```powershell
python -m texture_forge build BaseColor.png --out out --name wep_2004 `
  --numatb path\to\model__nust__.numatb `
  --material-label Wep_2004
```

`--png-only` skips nutexb encoding (useful for quick distribution checks).

Non-zero exit when validation reports any **error**-level finding (mirror roughness,
everything-metal, sRGB data maps, missing maps on `check`).

## Pipeline

segment (CIELAB k-means) → classify → synthesize → validate → encode → optional numatb

See `docs/superpowers/plans/2026-08-09-basecolor-to-pbr-texture-forge.md` and
`docs/exvs2-custom-model-pbr-map-calibration.md`.
