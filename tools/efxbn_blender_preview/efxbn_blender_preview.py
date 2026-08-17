from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Sequence


TOOL_DIR = Path(__file__).resolve().parent
REPO_ROOT = TOOL_DIR.parents[1]
ADAPTER_MANIFEST = TOOL_DIR / "rust_adapter" / "Cargo.toml"
ADAPTER_NAME = "efxbn-preview-adapter.exe" if os.name == "nt" else "efxbn-preview-adapter"
SCENE_PLAN_SOURCE = TOOL_DIR / "scene_plan.ts"
BLENDER_SCRIPT_SOURCE = TOOL_DIR / "blender_preview.py"


class PreviewError(RuntimeError):
    pass


def run_process(
    command: Sequence[str],
    *,
    input_text: str | None = None,
    cwd: Path = REPO_ROOT,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        list(command),
        cwd=cwd,
        env=env,
        input=input_text,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "no process output"
        raise PreviewError(f"Command failed ({result.returncode}): {' '.join(command)}\n{detail}")
    return result


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def build_adapter() -> Path:
    target_dir = REPO_ROOT / "src-tauri" / "target"
    env = os.environ.copy()
    env["CARGO_TARGET_DIR"] = str(target_dir)
    run_process(
        [
            "cargo",
            "build",
            "--quiet",
            "--manifest-path",
            str(ADAPTER_MANIFEST),
        ],
        env=env,
    )
    adapter = target_dir / "debug" / ADAPTER_NAME
    if not adapter.is_file():
        raise PreviewError(f"Rust adapter build succeeded but executable is missing: {adapter}")
    return adapter


def run_adapter(adapter: Path, arguments: Sequence[str]) -> dict[str, Any]:
    result = run_process([str(adapter), *arguments])
    try:
        value = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise PreviewError(f"Rust adapter returned invalid JSON: {error}\n{result.stdout}") from error
    if not isinstance(value, dict):
        raise PreviewError("Rust adapter JSON root must be an object")
    return value


def compile_scene_runner(output_dir: Path) -> Path:
    node = shutil.which("node")
    esbuild_candidates = [
        REPO_ROOT / "node_modules" / "esbuild" / "bin" / "esbuild",
        *sorted(
            (REPO_ROOT / "node_modules" / ".pnpm").glob(
                "esbuild@*/node_modules/esbuild/bin/esbuild"
            )
        ),
    ]
    esbuild = next((candidate for candidate in esbuild_candidates if candidate.is_file()), None)
    if not node:
        raise PreviewError("Node.js is required to run the existing TypeScript EFXBN simulation")
    if esbuild is None:
        raise PreviewError("esbuild is missing from node_modules. Install repository dependencies first.")
    runner = output_dir / "scene_plan_runner.mjs"
    run_process(
        [
            node,
            str(esbuild),
            str(SCENE_PLAN_SOURCE),
            "--bundle",
            "--platform=node",
            "--format=esm",
            "--target=node22",
            f"--outfile={runner}",
            f"--tsconfig={REPO_ROOT / 'tsconfig.json'}",
            "--log-level=warning",
        ]
    )
    return runner


def build_scene_plan(
    envelope: dict[str, Any],
    output_dir: Path,
    frame: str,
    max_particles: int,
) -> dict[str, Any]:
    runner = compile_scene_runner(output_dir)
    node = shutil.which("node")
    if not node:
        raise PreviewError("Node.js disappeared after scene runner compilation")
    result = run_process(
        [node, str(runner), "--frame", frame, "--max-particles", str(max_particles)],
        input_text=json.dumps(envelope, ensure_ascii=False),
    )
    try:
        scene_plan = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise PreviewError(f"TypeScript scene planner returned invalid JSON: {error}") from error
    if not isinstance(scene_plan, dict):
        raise PreviewError("TypeScript scene plan root must be an object")
    return scene_plan


def _model_requests(scene_plan: dict[str, Any], output_dir: Path) -> list[dict[str, Any]]:
    requests: list[dict[str, Any]] = []
    for index, target in enumerate(scene_plan.get("previewPlan", {}).get("targets", [])):
        effect_index = target.get("effectIndex")
        label = "model" if effect_index is None else f"effect_{int(effect_index):03d}"
        requests.append(
            {
                "id": f"model-{index}",
                "sourcePath": target["modelPath"],
                "outputPath": str(output_dir / "models" / f"{label}.dae"),
                "effectIndices": [] if effect_index is None else [effect_index],
            }
        )
    return requests


def _texture_requests(scene_plan: dict[str, Any], output_dir: Path) -> list[dict[str, Any]]:
    by_source: dict[str, dict[str, Any]] = {}
    for group in scene_plan.get("particleGroups", []):
        binding = group.get("textureBinding")
        source = binding.get("sourcePath") if isinstance(binding, dict) else None
        if not source:
            continue
        key = os.path.normcase(os.path.normpath(source))
        request = by_source.get(key)
        if request is None:
            request = {
                "id": f"texture-{len(by_source)}",
                "sourcePath": source,
                "outputPath": str(output_dir / "textures" / f"texture_{len(by_source):03d}.png"),
                "effectIndices": [],
            }
            by_source[key] = request
        effect_index = group.get("targetEffectIndex")
        if effect_index not in request["effectIndices"]:
            request["effectIndices"].append(effect_index)
    return list(by_source.values())


def prepare_assets(
    adapter: Path,
    scene_plan: dict[str, Any],
    output_dir: Path,
) -> dict[str, Any]:
    model_requests = _model_requests(scene_plan, output_dir)
    texture_requests = _texture_requests(scene_plan, output_dir)
    manifest = {
        "models": [
            {key: request[key] for key in ("id", "sourcePath", "outputPath")}
            for request in model_requests
        ],
        "textures": [
            {key: request[key] for key in ("id", "sourcePath", "outputPath")}
            for request in texture_requests
        ],
    }
    manifest_path = output_dir / "asset_manifest.json"
    write_json(manifest_path, manifest)
    if not model_requests and not texture_requests:
        return {"models": [], "textures": []}

    report = run_adapter(adapter, ["export-assets", "--manifest", str(manifest_path)])

    def merge(
        requests: list[dict[str, Any]],
        rows: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        by_id = {row.get("id"): row for row in rows}
        merged: list[dict[str, Any]] = []
        for request in requests:
            row = by_id.get(request["id"], {})
            result = row.get("result") if isinstance(row, dict) else None
            merged.append({**request, **(result if isinstance(result, dict) else {"ok": False})})
        return merged

    return {
        "models": merge(model_requests, report.get("models", [])),
        "textures": merge(texture_requests, report.get("textures", [])),
    }


def discover_blender(explicit: str | None = None) -> Path | None:
    if explicit:
        candidate = Path(explicit).expanduser().resolve()
        if not candidate.is_file():
            raise PreviewError(f"Blender executable does not exist: {candidate}")
        return candidate

    preferred = Path("C:/Program Files/Blender Foundation/Blender 5.1/blender.exe")
    if preferred.is_file():
        return preferred
    on_path = shutil.which("blender")
    if on_path:
        return Path(on_path).resolve()
    foundation = Path("C:/Program Files/Blender Foundation")
    candidates = sorted(foundation.glob("Blender */blender.exe"), reverse=True)
    return candidates[0] if candidates else None


def install_blender_script(output_dir: Path) -> Path:
    target = output_dir / "blender_preview.py"
    shutil.copyfile(BLENDER_SCRIPT_SOURCE, target)
    return target


def render_preview(
    blender: Path,
    scene_plan_path: Path,
    blender_script: Path,
    output_png: Path,
    output_blend: Path,
    size: int,
) -> Path:
    command = [
        str(blender),
        "--background",
        "--factory-startup",
        "--python",
        str(blender_script),
        "--",
        "--scene-plan",
        str(scene_plan_path),
        "--output",
        str(output_png),
        "--blend",
        str(output_blend),
        "--size",
        str(size),
    ]
    result = run_process(command)
    log_path = output_png.parent / "blender.log"
    log_path.write_text(result.stdout + result.stderr, encoding="utf-8")
    if not output_png.is_file() or output_png.stat().st_size < 8:
        raise PreviewError(f"Blender completed without producing a PNG: {output_png}")
    return log_path


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a deterministic Blender preview from an extracted EXVS2 EFXBN effect folder."
    )
    parser.add_argument("--effect-root", required=True, help="Extracted effect folder")
    parser.add_argument("--structure", required=True, help="Sibling _structure.json")
    parser.add_argument("--efxbn", required=True, help="EFXBN file to preview")
    parser.add_argument("--output", help="Output directory; defaults under tmp/efxbn-render")
    parser.add_argument("--frame", default="auto", help="Simulation frame or 'auto'")
    parser.add_argument("--max-particles", type=int, default=512)
    parser.add_argument("--size", type=int, default=512, help="Square PNG size")
    parser.add_argument("--blender", help="Explicit Blender executable")
    parser.add_argument("--adapter", help="Prebuilt efxbn-preview-adapter executable")
    parser.add_argument("--no-render", action="store_true", help="Generate plan and script only")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    try:
        effect_root = Path(args.effect_root).expanduser().resolve(strict=True)
        structure = Path(args.structure).expanduser().resolve(strict=True)
        efxbn = Path(args.efxbn).expanduser().resolve(strict=True)
        output_dir = (
            Path(args.output).expanduser().resolve()
            if args.output
            else REPO_ROOT / "tmp" / "efxbn-render" / efxbn.stem
        )
        output_dir.mkdir(parents=True, exist_ok=True)
        adapter = Path(args.adapter).expanduser().resolve(strict=True) if args.adapter else build_adapter()
        envelope = run_adapter(
            adapter,
            [
                "inspect",
                "--effect-root",
                str(effect_root),
                "--structure",
                str(structure),
                "--efxbn",
                str(efxbn),
            ],
        )
        write_json(output_dir / "inventory.json", envelope)
        scene_plan = build_scene_plan(
            envelope,
            output_dir,
            args.frame,
            max(1, min(2_048, args.max_particles)),
        )
        scene_plan["assets"] = prepare_assets(adapter, scene_plan, output_dir)
        failed_assets = [
            asset
            for category in ("models", "textures")
            for asset in scene_plan["assets"][category]
            if not asset.get("ok")
        ]
        scene_plan.setdefault("warnings", []).extend(
            f"Offline asset conversion failed for {asset['sourcePath']}: {asset.get('error', 'unknown error')}"
            for asset in failed_assets
        )
        scene_plan_path = output_dir / "scene_plan.json"
        write_json(scene_plan_path, scene_plan)
        blender_script = install_blender_script(output_dir)
        result: dict[str, Any] = {
            "outputDir": str(output_dir),
            "scenePlan": str(scene_plan_path),
            "blenderScript": str(blender_script),
            "particleCount": scene_plan.get("summary", {}).get("particleCount", 0),
            "frame": scene_plan.get("timing", {}).get("frame"),
            "rendered": False,
        }
        if not args.no_render:
            blender = discover_blender(args.blender)
            if blender:
                output_png = output_dir / "preview.png"
                output_blend = output_dir / "preview.blend"
                log_path = render_preview(
                    blender,
                    scene_plan_path,
                    blender_script,
                    output_png,
                    output_blend,
                    max(128, min(2_048, args.size)),
                )
                result.update(
                    {
                        "rendered": True,
                        "blender": str(blender),
                        "png": str(output_png),
                        "blend": str(output_blend),
                        "blenderLog": str(log_path),
                    }
                )
            else:
                result["renderWarning"] = "Blender was not found; scene plan and import script are ready."
        sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        return 0
    except (OSError, PreviewError, ValueError) as error:
        sys.stderr.write(f"efxbn_blender_preview: {error}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
