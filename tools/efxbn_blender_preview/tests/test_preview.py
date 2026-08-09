from __future__ import annotations

import json
import unittest
from pathlib import Path

from tools.efxbn_blender_preview import efxbn_blender_preview as preview


TOOL_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = TOOL_DIR.parents[1]

# The only pack sample whose EFXBN resolves both models and textures inside its own folder:
# 5 of 5 model handles and 11 of 15 texture handles are pack-local. Rendering anything else
# exercises the neutral-billboard fallback and proves nothing about the asset path.
POSITIVE_EFFECT_ROOT = Path("E:/XB/mod/006effect/053gbftry_005tsient_001")
POSITIVE_STRUCTURE = Path("E:/XB/mod/006effect/053gbftry_005tsient_001_structure.json")
POSITIVE_EFXBN = POSITIVE_EFFECT_ROOT / "0" / "0" / "200.efxbn"


class EfxbnBlenderPreviewTest(unittest.TestCase):
    def test_utf8_scene_plan_and_blender_png(self) -> None:
        output_dir = REPO_ROOT / "tmp" / "efxbn-render" / "utf8-粒子-test"
        output_dir.mkdir(parents=True, exist_ok=True)
        adapter = preview.build_adapter()
        empty_manifest = output_dir / "empty_asset_manifest.json"
        preview.write_json(empty_manifest, {"models": [], "textures": []})
        adapter_report = preview.run_adapter(
            adapter,
            ["export-assets", "--manifest", str(empty_manifest)],
        )
        self.assertEqual([], adapter_report["models"])
        self.assertEqual([], adapter_report["textures"])

        envelope = json.loads(
            (TOOL_DIR / "tests" / "fixture_inventory.json").read_text(encoding="utf-8")
        )
        scene_plan = preview.build_scene_plan(envelope, output_dir, "12", 128)
        scene_plan["assets"] = {"models": [], "textures": []}
        self.assertGreater(scene_plan["summary"]["particleCount"], 0)
        self.assertIn("特效根目录", scene_plan["source"]["efxbnPath"])

        scene_plan_path = output_dir / "scene_plan.json"
        preview.write_json(scene_plan_path, scene_plan)
        blender_script = preview.install_blender_script(output_dir)
        blender = preview.discover_blender(
            "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe"
        )
        self.assertIsNotNone(blender)
        output_png = output_dir / "preview.png"
        output_blend = output_dir / "preview.blend"
        output_png.unlink(missing_ok=True)
        output_blend.unlink(missing_ok=True)
        preview.render_preview(
            blender,
            scene_plan_path,
            blender_script,
            output_png,
            output_blend,
            256,
        )
        self.assertEqual(b"\x89PNG\r\n\x1a\n", output_png.read_bytes()[:8])
        self.assertGreater(output_png.stat().st_size, 1_000)
        self.assertTrue(output_blend.is_file())


    def test_positive_sample_resolves_local_models_and_textures(self) -> None:
        """The asset path must actually convert local SSBH models and NUTEXB textures.

        Blender is deliberately not invoked here: the scene plan plus the converted assets are
        what prove the model and texture pipeline end to end, and skipping the render keeps the
        check fast enough to stay in the default suite.
        """
        if not POSITIVE_EFXBN.is_file() or not POSITIVE_STRUCTURE.is_file():
            self.skipTest(f"positive effect fixture is unavailable: {POSITIVE_EFXBN}")

        output_dir = REPO_ROOT / "tmp" / "efxbn-render" / "200-positive-test"
        output_dir.mkdir(parents=True, exist_ok=True)
        adapter = preview.build_adapter()
        envelope = preview.run_adapter(
            adapter,
            [
                "inspect",
                "--effect-root", str(POSITIVE_EFFECT_ROOT),
                "--structure", str(POSITIVE_STRUCTURE),
                "--efxbn", str(POSITIVE_EFXBN),
            ],
        )
        scene_plan = preview.build_scene_plan(envelope, output_dir, "auto", 512)
        assets = preview.prepare_assets(adapter, scene_plan, output_dir)

        self.assertGreater(len(assets["models"]), 0, "no local models were converted")
        self.assertGreater(len(assets["textures"]), 0, "no local textures were converted")
        self.assertTrue(all(asset.get("ok") for asset in assets["models"]), assets["models"])
        self.assertTrue(all(asset.get("ok") for asset in assets["textures"]), assets["textures"])

        groups = scene_plan["particleGroups"]
        self.assertTrue(any(group.get("modelParticle") for group in groups))
        textured = [
            group for group in groups
            if (group.get("textureBinding") or {}).get("sourcePath")
        ]
        self.assertGreater(len(textured), 0, "no particle group resolved a colour texture")
        # Every binding the plan hands to Blender must be the colour slot, never a
        # distortion map promoted by a slot-agnostic lookup.
        self.assertTrue(
            all(group["textureBinding"]["slot"] == "color0" for group in textured),
            [group["textureBinding"]["slot"] for group in textured],
        )


if __name__ == "__main__":
    unittest.main()
