"""CLI entry: `python -m texture_forge` (requires `tools/` on PYTHONPATH).

Metallic limitation (read this first)
-------------------------------------
Neutral / desaturated colors always default to **paint**. White paint and bare
silver metal are the same color in a base-color map, so the classifier will not
auto-mark them as metal. Only warm-hue clusters (gold / brass / copper) become
metal automatically. Edit `materials.json` and re-run with `--materials` when a
unit genuinely has bare-metal white or silver parts. A false metal is catastrophic
(white chrome blowout); a false dielectric only looks flatter.

Examples
--------
  set PYTHONPATH=tools
  python -m texture_forge build BaseColor.png --out out --name wep_2004
  python -m texture_forge check out --name wep_2004
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _ensure_tools_on_path() -> None:
    """Allow `python -m texture_forge` when the package lives under tools/."""
    tools_dir = Path(__file__).resolve().parents[1]
    tools_str = str(tools_dir)
    if tools_str not in sys.path:
        sys.path.insert(0, tools_str)


_ensure_tools_on_path()

from texture_forge import pipeline  # noqa: E402
from texture_forge import validate as val  # noqa: E402


def _print_findings(findings: list[val.Finding]) -> None:
    if not findings:
        print("validation: no findings")
        return
    for finding in findings:
        print(
            f"[{finding.severity}] {finding.rule} ({finding.slot}): {finding.message} "
            f"(measured {finding.measured}; ref {finding.reference})"
        )


def cmd_build(args: argparse.Namespace) -> int:
    result = pipeline.build(
        basecolor=Path(args.basecolor),
        out_dir=Path(args.out),
        name=args.name,
        materials=Path(args.materials) if args.materials else None,
        numatb_paths=[Path(p) for p in (args.numatb or [])],
        material_label=args.material_label,
        encode_nutexb=not args.png_only,
        resolution=args.resolution,
        seed=args.seed,
        k=args.k,
    )
    print(f"wrote materials: {result.materials_path}")
    print(f"wrote report:    {result.report_path}")
    for slot, path in result.png_paths.items():
        print(f"wrote png[{slot}]: {path}")
    for slot, path in result.nutexb_paths.items():
        print(f"wrote nutexb[{slot}]: {path}")
    for item in result.numatb_results:
        print(
            f"numatb {item['path']}: changed={item['changed']} "
            f"profile={item['profile']}"
        )
    _print_findings(result.findings)
    if result.error_count:
        print(f"error-level findings: {result.error_count}", file=sys.stderr)
        return 1
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    findings = pipeline.check_directory(Path(args.directory), name=args.name)
    _print_findings(findings)
    if args.json_out:
        Path(args.json_out).write_text(
            json.dumps(pipeline.findings_to_dicts(findings), indent=2) + "\n",
            encoding="utf-8",
        )
    error_count = sum(1 for f in findings if f.severity == "error")
    if error_count:
        print(f"error-level findings: {error_count}", file=sys.stderr)
        return 1
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="texture_forge",
        description=(
            "Generate a complete game-conforming PBR texture set from one base color PNG. "
            "IMPORTANT: neutral colors default to paint, not metal — white paint cannot be "
            "distinguished from bare silver; only warm-hue clusters auto-label as metal. "
            "See materials.json / README.md."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Metallic limitation: neutral/desaturated clusters always default to paint. "
            "Override via materials.json when the unit has genuine bare-metal white/silver. "
            "Docs: docs/superpowers/plans/2026-08-09-basecolor-to-pbr-texture-forge.md"
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True)

    build_p = sub.add_parser(
        "build",
        help="segment → classify → synthesize → validate → encode (optional numatb)",
        description=(
            "One base color in, full derived set out. Neutral colors default to paint "
            "(not metal); only warm-hue clusters auto-label as metal."
        ),
    )
    build_p.add_argument("basecolor", help="path to base color PNG")
    build_p.add_argument("--out", required=True, help="output directory")
    build_p.add_argument(
        "--name",
        required=True,
        help="texture stem used for outputs (e.g. wep_2004 → wep_2004_roughnessmap)",
    )
    build_p.add_argument(
        "--materials",
        help="optional materials.json from a previous run (cluster overrides)",
    )
    build_p.add_argument(
        "--numatb",
        action="append",
        default=[],
        help="optional .numatb to wire Texture1 → roughness map (repeatable)",
    )
    build_p.add_argument(
        "--material-label",
        default="Wep_2004",
        help="material label inside the .numatb (default: Wep_2004)",
    )
    build_p.add_argument(
        "--png-only",
        action="store_true",
        help="skip .nutexb encoding (still writes PNG + materials.json + report.md)",
    )
    build_p.add_argument(
        "--resolution",
        type=int,
        default=None,
        help="force power-of-two encode size (default: nearest POT of source)",
    )
    build_p.add_argument("--seed", type=int, default=0)
    build_p.add_argument("--k", type=int, default=8, help="k-means cluster budget")
    build_p.set_defaults(func=cmd_build)

    check_p = sub.add_parser(
        "check",
        help="measure an existing set of map PNGs; write nothing",
    )
    check_p.add_argument("directory", help="directory containing {name}_*map.png")
    check_p.add_argument("--name", help="texture stem (inferred from *_roughnessmap.png)")
    check_p.add_argument("--json-out", help="optional path for machine-readable findings")
    check_p.set_defaults(func=cmd_check)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
