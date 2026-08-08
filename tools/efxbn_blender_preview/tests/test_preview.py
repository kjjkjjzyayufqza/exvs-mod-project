from __future__ import annotations

import json
import unittest
from pathlib import Path

from tools.efxbn_blender_preview import efxbn_blender_preview as preview


TOOL_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = TOOL_DIR.parents[1]


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


if __name__ == "__main__":
    unittest.main()
