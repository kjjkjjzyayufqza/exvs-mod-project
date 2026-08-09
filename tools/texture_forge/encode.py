"""Write generated maps to PNG and encode them to `.nutexb`.

Slot colour space is decided here and nowhere else. Every non-colour map in the shipped
art is linear, and an sRGB-tagged data map is invisible in the editor preview — the
preview picks colour space by slot role and never reads the file's own tag — so it only
surfaces in game. Four maps shipped wrong that way.
"""

import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

TOOLS_DIR = Path(__file__).resolve().parents[1]
ULTIMATE_TEX_CLI = TOOLS_DIR / "ultimate_tex_cli.exe"

#: sRGB only for slots the shader samples as colour. Everything else is linear.
SLOT_FORMATS: dict[str, str] = {
    "basecolor": "BC7RgbaUnormSrgb",
    "emissive": "BC7RgbaUnormSrgb",
    "normal": "BC7RgbaUnorm",
    "roughness": "BC7RgbaUnorm",
    "metallic": "BC7RgbaUnorm",
    "ao": "BC7RgbaUnorm",
}

MIN_RESOLUTION = 128
MAX_RESOLUTION = 4096


def format_for_slot(slot: str) -> str:
    if slot not in SLOT_FORMATS:
        raise ValueError(f"unknown texture slot {slot!r}; expected one of {sorted(SLOT_FORMATS)}")
    return SLOT_FORMATS[slot]


def is_power_of_two(value: int) -> bool:
    return value > 0 and (value & (value - 1)) == 0


def target_resolution(source: int, override: int | None = None) -> int:
    """Snap to the nearest power of two in log space.

    Rounding up cannot add detail the source does not have, and doubles memory; rounding
    to the nearest keeps the map close to its authored scale.
    """
    if override is not None:
        if not is_power_of_two(override):
            raise ValueError(f"resolution override {override} is not a power of two")
        return override
    if is_power_of_two(source):
        return source
    nearest = 2 ** round(math.log2(source))
    return int(min(max(nearest, MIN_RESOLUTION), MAX_RESOLUTION))


def write_channel_png(channel: np.ndarray, path: Path, resolution: int | None = None) -> Path:
    """Write a single-channel map as opaque greyscale RGBA."""
    if channel.ndim != 2:
        raise ValueError(f"expected a 2D channel, got shape {channel.shape}")
    grey = (np.clip(channel, 0.0, 1.0) * 255.0).round().astype(np.uint8)
    rgba = np.dstack([grey, grey, grey, np.full(grey.shape, 255, dtype=np.uint8)])
    return _save(Image.fromarray(rgba, "RGBA"), path, resolution)


def write_rgb_png(image: np.ndarray, path: Path, resolution: int | None = None) -> Path:
    """Write a 3-channel map (base colour, normal) as opaque RGBA."""
    if image.ndim != 3 or image.shape[2] != 3:
        raise ValueError(f"expected an (h, w, 3) image, got shape {image.shape}")
    rgb = (np.clip(image, 0.0, 1.0) * 255.0).round().astype(np.uint8)
    rgba = np.dstack([rgb, np.full(rgb.shape[:2], 255, dtype=np.uint8)])
    return _save(Image.fromarray(rgba, "RGBA"), path, resolution)


def _save(image: Image.Image, path: Path, resolution: int | None) -> Path:
    if resolution is not None and image.size != (resolution, resolution):
        image = image.resize((resolution, resolution), Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)
    return path


def encode_nutexb(png_path: Path, out_path: Path, slot: str) -> Path:
    """Encode a PNG to `.nutexb`.

    The footer name comes from the output stem, and the material references textures by
    that name, so `out_path` must already be the final lowercase file name.
    """
    if not ULTIMATE_TEX_CLI.is_file():
        raise FileNotFoundError(f"missing encoder: {ULTIMATE_TEX_CLI}")
    texture_format = format_for_slot(slot)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [str(ULTIMATE_TEX_CLI), str(png_path), str(out_path), "-f", texture_format],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 or not out_path.is_file():
        raise RuntimeError(
            f"encoding {png_path.name} as {texture_format} failed: "
            f"{(result.stderr or result.stdout).strip()}"
        )
    # A zero exit is not proof the format landed; the footer is.
    info = read_nutexb_info(out_path)
    expected = texture_format.replace("Rgba", "").replace("RgbaUnormSrgb", "Srgb")
    if texture_format.endswith("Srgb") != info["format"].endswith("Srgb"):
        raise RuntimeError(
            f"{out_path.name} was written as {info['format']} but {expected} was requested"
        )
    return out_path


def read_nutexb_info(path: Path) -> dict[str, object]:
    """Parse `ultimate_tex_cli -i` output into name / format / dimensions."""
    if not ULTIMATE_TEX_CLI.is_file():
        raise FileNotFoundError(f"missing encoder: {ULTIMATE_TEX_CLI}")
    result = subprocess.run(
        [str(ULTIMATE_TEX_CLI), "-i", str(path)], capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"reading {path.name} failed: {(result.stderr or result.stdout).strip()}")

    info: dict[str, object] = {}
    for line in result.stdout.splitlines():
        key, _, value = line.partition(":")
        key, value = key.strip(), value.strip()
        if key == "Name":
            info["name"] = value
        elif key == "NutexbFormat":
            info["format"] = value
        elif key == "Dimensions":
            width, height, *_ = value.split("x")
            info["width"] = int(width)
            info["height"] = int(height)
        elif key == "Mipmap Count":
            info["mipmaps"] = int(value)
        elif key == "Layer Count":
            info["layers"] = int(value)
    missing = {"name", "format", "width", "height"} - info.keys()
    if missing:
        raise RuntimeError(f"could not parse footer of {path.name}; missing {sorted(missing)}")
    return info
