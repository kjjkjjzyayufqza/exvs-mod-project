"""Wire generated textures into a `.numatb` material.

Edits go through a `ssbh_lib_json` round trip, which was verified byte-identical on these
files. Fidelity is re-checked per file before writing, because a lossy round trip would
silently rewrite the whole material rather than just the slot being added.
"""

import json
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parents[1]
SSBH_LIB_JSON = TOOLS_DIR / "ssbh_lib_json.exe"

#: Shipped materials list Texture1 right after MetallicMap in the runtime profile and
#: right after NormalMap in the authoring profile. Match them so a generated entry has
#: the same attribute order as a stock one.
ANCHOR_BY_PROFILE = {"nust": "MetallicMap", "maya": "NormalMap"}
DEFAULT_ANCHOR = "MetallicMap"


@dataclass(frozen=True)
class Texture1Result:
    changed: bool
    profile: str
    anchor: str


def _convert(source: Path, destination: Path) -> None:
    if not SSBH_LIB_JSON.is_file():
        raise FileNotFoundError(f"missing converter: {SSBH_LIB_JSON}")
    result = subprocess.run(
        [str(SSBH_LIB_JSON), str(source), str(destination)], capture_output=True, text=True
    )
    if result.returncode != 0 or not destination.is_file():
        raise RuntimeError(
            f"ssbh_lib_json {source.name} -> {destination.name} failed: "
            f"{(result.stderr or result.stdout).strip()}"
        )


def _load(path: Path) -> dict:
    with tempfile.TemporaryDirectory(prefix="texture_forge_matl_") as tmp:
        out = Path(tmp) / "matl.json"
        _convert(path, out)
        return json.loads(out.read_text(encoding="utf-8"))


def roundtrip_is_lossless(path: Path) -> bool:
    """True when binary -> JSON -> binary reproduces the file exactly."""
    with tempfile.TemporaryDirectory(prefix="texture_forge_rt_") as tmp:
        as_json = Path(tmp) / "matl.json"
        back = Path(tmp) / "matl.numatb"
        _convert(path, as_json)
        _convert(as_json, back)
        return back.read_bytes() == path.read_bytes()


def _entries(document: dict) -> list[dict]:
    matl = document["Matl"]
    version = next(iter(matl))
    return matl[version]["entries"]


def _entry(document: dict, material_label: str) -> dict:
    for entry in _entries(document):
        if entry["material_label"] == material_label:
            return entry
    labels = [e["material_label"] for e in _entries(document)]
    raise ValueError(f"material {material_label!r} not found; file has {labels}")


def profile_of(path: Path) -> str:
    for profile in ANCHOR_BY_PROFILE:
        if f"__{profile}__" in path.name:
            return profile
    return "unknown"


def texture_param_order(path: Path, material_label: str) -> list[str]:
    """Texture-valued parameter ids in the order the file stores them."""
    entry = _entry(_load(path), material_label)
    return [
        attribute["param_id"]
        for attribute in entry["attributes"]
        if "String1" in attribute["param"].get("data", {})
    ]


def texture_paths(path: Path, material_label: str) -> dict[str, str]:
    entry = _entry(_load(path), material_label)
    return {
        attribute["param_id"]: attribute["param"]["data"]["String1"]
        for attribute in entry["attributes"]
        if "String1" in attribute["param"].get("data", {})
    }


def ensure_texture1(
    source: Path,
    destination: Path,
    material_label: str,
    texture_name: str,
) -> Texture1Result:
    """Bind `Texture1` on `material_label` if it is unbound, writing to `destination`.

    A material that already binds it is copied through unchanged, so re-running never
    rewrites a file it does not need to touch.
    """
    profile = profile_of(source)
    anchor = ANCHOR_BY_PROFILE.get(profile, DEFAULT_ANCHOR)

    document = _load(source)
    attributes = _entry(document, material_label)["attributes"]
    if any(attribute["param_id"] == "Texture1" for attribute in attributes):
        destination.parent.mkdir(parents=True, exist_ok=True)
        if source.resolve() != destination.resolve():
            shutil.copyfile(source, destination)
        return Texture1Result(changed=False, profile=profile, anchor=anchor)

    if not roundtrip_is_lossless(source):
        raise RuntimeError(
            f"{source.name}: ssbh_lib_json round trip is not byte-identical, refusing to edit"
        )

    index = next(
        (i for i, attribute in enumerate(attributes) if attribute["param_id"] == anchor),
        None,
    )
    if index is None:
        raise ValueError(
            f"{source.name}: material {material_label!r} has no {anchor} to anchor Texture1 after"
        )
    attributes.insert(
        index + 1,
        {"param_id": "Texture1", "param": {"data": {"String1": texture_name}}},
    )

    with tempfile.TemporaryDirectory(prefix="texture_forge_write_") as tmp:
        as_json = Path(tmp) / "matl.json"
        as_json.write_text(json.dumps(document, indent=2), encoding="utf-8")
        destination.parent.mkdir(parents=True, exist_ok=True)
        _convert(as_json, destination)
    return Texture1Result(changed=True, profile=profile, anchor=anchor)
