"""Compose segment → classify → synthesize → validate → encode for one base color.

The CLI and any future callers share this path so acceptance is “entry point +
composition,” not a second algorithm.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from . import classify as cls
from . import encode as enc
from . import numatb as nm
from . import segment as seg
from . import synthesize as syn
from . import validate as val

Image.MAX_IMAGE_PIXELS = None

MAP_SUFFIXES = {
    "roughness": "roughnessmap",
    "metallic": "metallicmap",
    "ao": "aomap",
    "normal": "normalmap",
}


@dataclass(frozen=True)
class ChannelStats:
    mean: float
    p25: float
    p50: float
    p75: float
    mirror: float
    std: float
    min: float
    max: float


@dataclass
class BuildResult:
    out_dir: Path
    name: str
    materials_path: Path
    report_path: Path
    png_paths: dict[str, Path]
    nutexb_paths: dict[str, Path]
    findings: list[val.Finding]
    resolution: int
    numatb_results: list[dict]
    error_count: int


def load_basecolor(path: Path) -> np.ndarray:
    image = Image.open(path).convert("RGB")
    return np.asarray(image, dtype=np.float64) / 255.0


def channel_stats(channel: np.ndarray) -> ChannelStats:
    return ChannelStats(
        mean=float(channel.mean()),
        p25=float(np.percentile(channel, 25)),
        p50=float(np.percentile(channel, 50)),
        p75=float(np.percentile(channel, 75)),
        mirror=float((channel < 0.1).mean()),
        std=float(channel.std()),
        min=float(channel.min()),
        max=float(channel.max()),
    )


def load_material_overrides(path: Path | None) -> dict[int, str]:
    """Read cluster-index overrides from a materials.json written by a previous run."""
    if path is None:
        return {}
    document = json.loads(path.read_text(encoding="utf-8"))
    overrides: dict[int, str] = {}
    for cluster in document.get("clusters", []):
        if cluster.get("override"):
            overrides[int(cluster["index"])] = str(cluster["override"])
        elif cluster.get("source") == "override" and cluster.get("material"):
            # Allow hand-editing the material field and re-feeding the file.
            overrides[int(cluster["index"])] = str(cluster["material"])
    return overrides


def materials_document(
    assignments: list[cls.MaterialAssignment],
    seed: int,
    k: int,
) -> dict:
    return {
        "version": 1,
        "seed": seed,
        "k": k,
        "limitation": (
            "Neutral / desaturated colors always default to paint. White paint and bare "
            "silver metal are the same color; only warm-hue clusters (gold/brass/copper) "
            "auto-label as metal. Override a cluster with "
            '{"index": N, "override": "metal"} when the unit genuinely has bare metal.'
        ),
        "clusters": [
            {
                "index": a.cluster_index,
                "center_rgb": [round(c, 6) for c in a.center_rgb],
                "share": round(a.share, 6),
                "material": a.material,
                "source": a.source,
                "metallic": a.properties.metallic,
                "roughness": a.properties.roughness,
                "override": None,
            }
            for a in assignments
        ],
    }


def validate_texture_set(texture_set: syn.TextureSet) -> list[val.Finding]:
    findings: list[val.Finding] = []
    findings.extend(val.validate_channel("roughness", texture_set.roughness))
    findings.extend(val.validate_channel("metallic", texture_set.metallic))
    findings.extend(val.validate_channel("ao", texture_set.ao))
    findings.extend(val.validate_normal(texture_set.normal))
    return findings


def write_report(
    path: Path,
    *,
    name: str,
    source: Path,
    resolution: int,
    assignments: list[cls.MaterialAssignment],
    texture_set: syn.TextureSet,
    findings: list[val.Finding],
    nutexb_paths: dict[str, Path],
    numatb_results: list[dict],
) -> None:
    r = channel_stats(texture_set.roughness)
    m = channel_stats(texture_set.metallic)
    ao = channel_stats(texture_set.ao)
    n_std = float(texture_set.normal[..., 0].std())

    lines = [
        f"# texture_forge report — `{name}`",
        "",
        f"- source: `{source}`",
        f"- resolution: {resolution}",
        "",
        "## Metallic limitation",
        "",
        "Neutral / desaturated colors always default to **paint**. White paint and bare",
        "silver metal are the same color and cannot be separated from the base color alone.",
        "Only warm-hue clusters (gold / brass / copper) auto-label as metal. Edit",
        "`materials.json` and re-run with `--materials` to force a cluster to metal.",
        "",
        "## Clusters",
        "",
        "| index | share | material | source | center RGB |",
        "|------:|------:|----------|--------|------------|",
    ]
    for a in assignments:
        rgb = ", ".join(f"{c:.3f}" for c in a.center_rgb)
        lines.append(
            f"| {a.cluster_index} | {a.share:.1%} | {a.material} | {a.source} | ({rgb}) |"
        )

    lines.extend(
        [
            "",
            "## Map stats",
            "",
            f"| map | mean | p25 | p50 | mirror | std |",
            f"|-----|-----:|----:|----:|-------:|----:|",
            f"| roughness | {r.mean:.3f} | {r.p25:.3f} | {r.p50:.3f} | {r.mirror:.1%} | {r.std:.3f} |",
            f"| metallic | {m.mean:.3f} | {m.p25:.3f} | {m.p50:.3f} | {m.mirror:.1%} | {m.std:.3f} |",
            f"| ao | {ao.mean:.3f} | {ao.p25:.3f} | {ao.p50:.3f} | {ao.mirror:.1%} | {ao.std:.3f} |",
            f"| normal R | — | — | — | — | {n_std:.4f} |",
            "",
            "## Validation",
            "",
        ]
    )
    if not findings:
        lines.append("No findings.")
    else:
        for f in findings:
            lines.append(
                f"- **{f.severity}** `{f.rule}` ({f.slot}): {f.message} "
                f"[measured {f.measured}; ref {f.reference}]"
            )

    if nutexb_paths:
        lines.extend(["", "## Encoded nutexb", ""])
        for slot, nutexb in nutexb_paths.items():
            info = enc.read_nutexb_info(nutexb)
            lines.append(
                f"- `{nutexb.name}`: format={info['format']} "
                f"{info['width']}x{info['height']} name={info['name']}"
            )

    if numatb_results:
        lines.extend(["", "## numatb", ""])
        for item in numatb_results:
            lines.append(
                f"- `{item['path']}`: changed={item['changed']} "
                f"profile={item['profile']} anchor={item['anchor']}"
            )

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build(
    basecolor: Path,
    out_dir: Path,
    name: str,
    *,
    materials: Path | None = None,
    numatb_paths: list[Path] | None = None,
    material_label: str = "Wep_2004",
    encode_nutexb: bool = True,
    resolution: int | None = None,
    seed: int = 0,
    k: int = 8,
) -> BuildResult:
    """Run the full pipeline and write outputs under `out_dir`."""
    basecolor = basecolor.resolve()
    out_dir = out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    stem = name.strip().lower()
    if not stem:
        raise ValueError("name must be a non-empty texture stem")

    image = load_basecolor(basecolor)
    segmentation = seg.segment(image, k=k, seed=seed)
    overrides = load_material_overrides(materials)
    assignments = cls.classify(
        segmentation.centers_rgb, segmentation.shares, overrides=overrides
    )
    texture_set = syn.synthesize(image, segmentation, assignments)
    findings = validate_texture_set(texture_set)

    source_side = max(image.shape[0], image.shape[1])
    target = enc.target_resolution(source_side, override=resolution)

    png_paths: dict[str, Path] = {}
    for slot, suffix in MAP_SUFFIXES.items():
        png_path = out_dir / f"{stem}_{suffix}.png"
        if slot == "normal":
            enc.write_rgb_png(texture_set.normal, png_path, resolution=target)
        else:
            channel = getattr(texture_set, slot)
            enc.write_channel_png(channel, png_path, resolution=target)
        png_paths[slot] = png_path
        findings.extend(val.validate_dimensions(slot, target, target))

    materials_path = out_dir / "materials.json"
    materials_path.write_text(
        json.dumps(materials_document(assignments, seed=seed, k=k), indent=2) + "\n",
        encoding="utf-8",
    )

    nutexb_paths: dict[str, Path] = {}
    if encode_nutexb:
        for slot, png_path in png_paths.items():
            nutexb = out_dir / f"{stem}_{MAP_SUFFIXES[slot]}.nutexb"
            enc.encode_nutexb(png_path, nutexb, slot)
            nutexb_paths[slot] = nutexb
            info = enc.read_nutexb_info(nutexb)
            findings.extend(val.validate_format(slot, str(info["format"])))

    roughness_name = f"{stem}_roughnessmap"
    numatb_results: list[dict] = []
    for source in numatb_paths or []:
        dest = out_dir / source.name
        result = nm.ensure_texture1(source, dest, material_label, roughness_name)
        numatb_results.append(
            {
                "path": str(dest),
                "source": str(source),
                "changed": result.changed,
                "profile": result.profile,
                "anchor": result.anchor,
            }
        )

    report_path = out_dir / "report.md"
    write_report(
        report_path,
        name=stem,
        source=basecolor,
        resolution=target,
        assignments=assignments,
        texture_set=texture_set,
        findings=findings,
        nutexb_paths=nutexb_paths,
        numatb_results=numatb_results,
    )

    error_count = sum(1 for f in findings if f.severity == "error")
    return BuildResult(
        out_dir=out_dir,
        name=stem,
        materials_path=materials_path,
        report_path=report_path,
        png_paths=png_paths,
        nutexb_paths=nutexb_paths,
        findings=findings,
        resolution=target,
        numatb_results=numatb_results,
        error_count=error_count,
    )


def check_directory(directory: Path, name: str | None = None) -> list[val.Finding]:
    """Measure PNG maps already on disk. Does not write anything."""
    directory = directory.resolve()
    if not directory.is_dir():
        raise FileNotFoundError(f"not a directory: {directory}")

    stem = (name or _infer_stem(directory) or "").lower()
    if not stem:
        raise ValueError("could not infer texture name; pass --name")

    findings: list[val.Finding] = []
    for slot, suffix in MAP_SUFFIXES.items():
        path = directory / f"{stem}_{suffix}.png"
        if not path.is_file():
            findings.append(
                val.Finding(
                    rule="missing-map",
                    severity="error",
                    slot=slot,
                    measured=str(path.name),
                    reference="expected PNG beside materials.json",
                    message=f"Missing map file {path.name}",
                )
            )
            continue
        array = np.asarray(Image.open(path).convert("RGBA"), dtype=np.float64) / 255.0
        if slot == "normal":
            findings.extend(val.validate_normal(array[..., :3]))
        else:
            channel = array[..., 0]
            findings.extend(val.validate_channel(slot, channel))
        findings.extend(val.validate_dimensions(slot, array.shape[1], array.shape[0]))
    return findings


def _infer_stem(directory: Path) -> str | None:
    for path in sorted(directory.glob("*_roughnessmap.png")):
        return path.name[: -len("_roughnessmap.png")]
    return None


def findings_to_dicts(findings: list[val.Finding]) -> list[dict]:
    return [asdict(f) for f in findings]
