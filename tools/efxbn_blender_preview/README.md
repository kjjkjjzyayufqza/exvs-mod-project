# EFXBN Blender Preview

Offline, deterministic visual validation for an extracted EXVS2 effect folder.
The tool does not start Tauri and does not implement another game-format parser.

Data flow:

1. `rust_adapter` calls the existing `effect_folder` inventory and EFXBN parsers.
2. `scene_plan.ts` imports the existing frontend preview-plan and EFXBN simulation modules.
3. Local SSBH models use the existing model-bundle resolver and SSBH-to-DAE exporter.
4. Local NUTEXB effect textures use the existing NUTEXB-to-PNG decoder.
5. Blender 5.1 consumes only DAE, PNG, and deterministic `scene_plan.json` data.

## Run

From the repository root:

```powershell
python tools/efxbn_blender_preview/efxbn_blender_preview.py `
  --effect-root "E:\XB\mod\006effect\053gbftry_005tsient_001" `
  --structure "E:\XB\mod\006effect\053gbftry_005tsient_001_structure.json" `
  --efxbn "E:\XB\mod\006effect\053gbftry_005tsient_001\0\0\167.efxbn" `
  --output "tmp\efxbn-render\167-real"
```

Default frame selection is `auto`: frames 0 through 120 are sampled with the
existing deterministic simulator, then the earliest frame with the largest
active particle count is rendered. Use `--frame 30` for an exact frame.

Blender discovery prefers `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`.
If Blender is unavailable, the command still emits an importable
`blender_preview.py`, deterministic `scene_plan.json`, asset interchange, and
the bundled `scene_plan_runner.mjs`. Use `--no-render` to request this behavior.

## Outputs

All default outputs are under `tmp/efxbn-render/<efxbn-stem>/`:

- `inventory.json`: existing Rust parser output and selected EFXBN summary.
- `scene_plan.json`: deterministic frontend simulation result.
- `models/*.dae`: local SSBH model interchange, when resolved.
- `textures/*.png`: local EFXBN texture previews, when resolved.
- `blender_preview.py`: standalone Blender import/render script.
- `preview.blend`, `preview.png`, `blender.log`: Blender 5.1 results.

Paths are passed as native Unicode process arguments and JSON is always UTF-8
without ASCII escaping.

## Limits

- This validates authored timing, deterministic particle motion, scale, color,
  strip history, model references, texture references, and UV transforms. It is
  not a byte-for-byte recreation of the game renderer.
- Game blend states and shaders are approximated with emissive Blender materials.
- Missing or unresolved models/textures use neutral emissive billboards.
- Resolved NUANMB paths are recorded in the plan but animation sampling is not
  applied to imported DAE models.
- Mesh-emitter surface sampling is not exported; those emitters retain the
  existing simulator's neutral-origin fallback unless mesh points are supplied.

## Narrow verification

```powershell
python -m unittest tools.efxbn_blender_preview.tests.test_preview
```

This one test builds the thin Rust adapter, runs the existing TypeScript
simulation against a UTF-8 fixture path, and produces a real Blender 5.1 PNG.
