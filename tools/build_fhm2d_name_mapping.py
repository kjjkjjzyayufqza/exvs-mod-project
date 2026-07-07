#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import zlib
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ASCII_RE = re.compile(rb"[\x20-\x7e]{4,}")
META_HASH_RE = re.compile(r"^(0x[0-9a-fA-F]{8})(?:_meta\.bin|\.fhm2d_metabody\.bin)$")
AI_CHR_RE = re.compile(r"^ai_CHR_([0-9]{3})([A-Z0-9]+)_([0-9]{3})([A-Z0-9]+)_([0-9]{3})\s*\|\s*(true|false)", re.I)
UNIT_ID_RE = re.compile(r"(?:^|/)([0-9]{3})([a-z0-9]+)_([0-9]{3})([a-z0-9]+)_([0-9]{3})(?:$|/)", re.I)
INTERNAL_UNIT_STEM_RE = re.compile(
    r"(?i)([0-9]{3}[a-z][a-z0-9]*_[0-9]{3}[a-z][a-z0-9]*_[0-9]{3})(?:_|$)"
)
FHM2D_FILE_RE = re.compile(r"^(0x[0-9a-fA-F]{8})\.fhm2d$", re.I)
FHM2D_MAGIC_OB = b"\xB9\xB7\xB2\xCD"
FHM2D_PAGE_SIZE = 0x10000
NUTEXB_GENERIC_BASES = {"img", "image", "tex", "texture"}
GUI_FLASH_GENERIC_FOLDER_NAMES = {
    "009gui",
    "base",
    "battle",
    "common",
    "custom",
    "flash",
    "font",
    "image",
    "ingamehud",
    "layout",
    "lm",
    "navi",
    "pilot",
    "player",
    "ser",
    "source",
    "texture",
    "textures",
    "window",
}


ROUTE_BY_DOMAIN = {
    "001stage": "stage.model",
    "002chara": "unit.model",
    "003motion": "unit.motion",
    "004ragdoll": "unit.model",
    "006effect": "unit.effect",
    "040msc": "unit.msc",
    "041cpm": "unit.param",
    "090sound": "unit.sound",
    "091waveform": "unit.sound",
}

OB_UNIT_FIELD_ROUTES = {
    "modelFileName": ("002chara", "unit.model"),
    "aleoFileName": ("006effect", "unit.effect"),
    "nu3bankFileName": ("090sound", "unit.sound"),
    "ammoFileName": ("041cpm", "unit.param"),
    "mscFileName": ("040msc", "unit.msc"),
    "animeFileName": ("003motion", "unit.motion"),
}

GENERIC_EXACT_NAMES_BY_ROUTE = {
    "041cpm": {
        "arms_param",
        "armsparam",
        "bullet_param",
        "bulletparam",
        "character_param",
        "characterparam",
        "chrsysparam",
        "grap_param",
        "grapparam",
        "hitgroup",
        "hitgroupiddef",
        "interaction",
        "interactionid",
        "projectile_depiction_table",
        "speed_param",
        "speedparam",
    },
    "090sound": {"voicetable", "se_chara", "sound", "table"},
    "091waveform": {"chara", "pilot", "navi", "voice", "se"},
    "060navi": {"acttable", "lipsync", "subtitles", "voicetable"},
}

FHM2D_FILE_TYPE_BY_ID = {
    0x0A: ".nushdb",
    0x0B: ".nutexb",
    0x0C: ".nusktb",
    0x0D: ".numatb",
    0x0E: ".numshb",
    0x0F: ".numdlb",
    0x11: ".nuanmb",
    0x13: ".nuhlpb",
    0x14: ".nus3bank",
    0x17: ".nudnbb",
    0x18: ".nufxlb",
    0x19: ".nurpdb",
}


def normalize_slashes(value: str) -> str:
    return re.sub(r"/+", "/", value.replace("\\", "/")).strip("/")


def normalize_hash_name(value: str) -> str | None:
    match = re.search(r"(?:0x)?([0-9a-fA-F]{8})", value)
    return f"0x{match.group(1).upper()}" if match else None


def read_json_object(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def structure_hash_name(path: Path, data: dict[str, Any] | None = None) -> str | None:
    hash_name = normalize_hash_name(path.name)
    if hash_name:
        return hash_name
    if data is None:
        data = read_json_object(path)
    if not data:
        return None
    value = data.get("HashName")
    return normalize_hash_name(str(value)) if isinstance(value, str) else None


def sanitize_name(value: str) -> str:
    normalized = re.sub(r"\s+", "_", value.strip())
    normalized = re.sub(r"[.()[\]]+", "_", normalized)
    normalized = re.sub(r"[^A-Za-z0-9_-]", "", normalized)
    normalized = re.sub(r"[_-]{2,}", "_", normalized).strip("_-")
    return normalized or "fhm2d_pack"


def to_unsigned_hash(value: Any) -> str | None:
    if not isinstance(value, int) or value == 0:
        return None
    return f"0x{(value & 0xFFFFFFFF):08X}"


def read_ascii_strings(path: Path) -> list[str]:
    data = path.read_bytes()
    return [match.group(0).decode("ascii", errors="ignore") for match in ASCII_RE.finditer(data)]


def game_relative_path(raw: str) -> str | None:
    normalized = normalize_slashes(raw)
    lower = normalized.lower()
    marker = "/app/data/"
    idx = lower.find(marker)
    if idx >= 0:
        return normalized[idx + len(marker) :]
    if lower.startswith("x64/"):
        return normalized
    return None


def domain_relative_path(game_rel: str) -> str:
    normalized = normalize_slashes(game_rel)
    parts = normalized.split("/")
    if parts and parts[0].lower() == "x64":
        return "/".join(parts[1:])
    return normalized


def iter_reference_dirs(reference_roots: list[Path]) -> dict[str, str]:
    dirs: dict[str, str] = {}
    for root in reference_roots:
        if not root.exists():
            continue
        for dirpath, _dirnames, _filenames in os.walk(root):
            rel = normalize_slashes(os.path.relpath(dirpath, root))
            if rel == ".":
                continue
            dirs.setdefault(rel.lower(), rel)
    return dirs


def semantic_package_candidate(domain_rel_file: str) -> str | None:
    rel = normalize_slashes(domain_rel_file)
    parts = rel.split("/")
    if len(parts) < 2:
        return None
    domain = parts[0].lower()
    dir_parts = parts[:-1]
    if len(dir_parts) < 2:
        return None

    if domain in {"001stage", "002chara", "004ragdoll", "040msc"}:
        return "/".join(dir_parts[:2])
    if domain == "003motion":
        return "/".join(dir_parts[:4]) if len(dir_parts) >= 4 else "/".join(dir_parts)
    if domain == "006effect":
        if len(dir_parts) >= 4 and dir_parts[1].lower() == "chara":
            return "/".join(dir_parts[:4])
        if len(dir_parts) >= 3 and dir_parts[1].lower() == "stage":
            return "/".join(dir_parts[:3])
        return "/".join(dir_parts[:2])
    if domain in {"009gui", "010localizedtext", "011camera", "012list", "020common", "051mission", "060navi", "090sound", "100system", "800etcetera"}:
        return "/".join(dir_parts[:2])
    if domain == "041cpm":
        return "/".join(dir_parts[:3]) if len(dir_parts) >= 3 else "/".join(dir_parts)
    if domain == "091waveform":
        return "/".join(dir_parts[:3]) if len(dir_parts) >= 3 else "/".join(dir_parts)
    return "/".join(dir_parts[:2])


def fallback_package_candidate(domain_rel_file: str, reference_dirs: dict[str, str]) -> str | None:
    parts = normalize_slashes(domain_rel_file).split("/")[:-1]
    candidates: list[str] = []
    for i in range(1, len(parts) + 1):
        candidate = "/".join(parts[:i])
        if candidate.lower() in reference_dirs:
            candidates.append(reference_dirs[candidate.lower()])
    if not candidates:
        return None
    return max(candidates, key=lambda item: (len(item.split("/")), item))


def common_reference_parent(domain_rel_paths: list[str], reference_dirs: dict[str, str]) -> str | None:
    parent_parts = [normalize_slashes(path).split("/")[:-1] for path in domain_rel_paths]
    parent_parts = [parts for parts in parent_parts if parts]
    if not parent_parts:
        return None

    common: list[str] = []
    for segments in zip(*parent_parts):
        if len({segment.lower() for segment in segments}) != 1:
            break
        common.append(segments[0])

    while common:
        candidate = "/".join(common)
        resolved = reference_dirs.get(candidate.lower())
        if resolved:
            return resolved
        common.pop()
    return None


def infer_package_path(paths: list[str], reference_dirs: dict[str, str]) -> tuple[str | None, int]:
    domain_rel_paths: list[str] = []
    counts: Counter[str] = Counter()
    fallback_counts: Counter[str] = Counter()
    for raw in paths:
        game_rel = game_relative_path(raw)
        if not game_rel:
            continue
        domain_rel = domain_relative_path(game_rel)
        domain_rel_paths.append(domain_rel)
        semantic = semantic_package_candidate(domain_rel)
        if semantic and semantic.lower() in reference_dirs:
            counts[reference_dirs[semantic.lower()]] += 1
            continue
        fallback = fallback_package_candidate(domain_rel, reference_dirs)
        if fallback:
            fallback_counts[fallback] += 1

    unique_files = sorted(set(domain_rel_paths))
    if len(unique_files) == 1:
        only_file = unique_files[0]
        stem = Path(only_file).stem
        parent = normalize_slashes(str(Path(only_file).parent))
        if parent and parent != "." and stem:
            return f"{parent}/{stem}", 1

    if unique_files:
        first_domain = unique_files[0].split("/", 1)[0].lower()
        if first_domain == "009gui":
            common_parent = common_reference_parent(unique_files, reference_dirs)
            if common_parent and len(common_parent.split("/")) > 2:
                return common_parent, len(unique_files)
        if first_domain == "003motion" and counts:
            specific_counts = Counter(
                {
                    package: count
                    for package, count in counts.items()
                    if "/000common/000common_000common_001" not in package.lower()
                }
            )
            if specific_counts:
                counts = specific_counts

    source = counts if counts else fallback_counts
    if not source:
        return None, 0
    package_path, count = max(source.items(), key=lambda item: (item[1], len(item[0].split("/"))))
    return package_path, count


def domain_from_package(package_path: str) -> str:
    return package_path.split("/", 1)[0].lower()


def entry_name_from_package(package_path: str) -> str:
    return sanitize_name(package_path.rsplit("/", 1)[-1].lower())


def source_stems_for_package(source_paths: list[str], package_path: str) -> list[str]:
    stems: set[str] = set()
    normalized_package = normalize_slashes(package_path).lower()
    for raw in source_paths:
        game_rel = game_relative_path(raw)
        if not game_rel:
            continue
        domain_rel = domain_relative_path(game_rel)
        normalized_domain_rel = normalize_slashes(domain_rel)
        if not normalized_domain_rel.lower().startswith(f"{normalized_package}/"):
            continue
        stem = Path(normalized_domain_rel).stem
        if stem:
            stems.add(sanitize_name(stem.lower()))
    return sorted(stems)


def gui_flash_bundle_name_from_source_paths(source_paths: list[str]) -> str | None:
    counts: Counter[str] = Counter()
    for raw in source_paths:
        game_rel = game_relative_path(raw)
        if not game_rel:
            continue
        domain_rel = domain_relative_path(game_rel)
        parts = normalize_slashes(domain_rel).split("/")
        if len(parts) < 4 or parts[0].lower() != "009gui" or parts[1].lower() != "flash":
            continue
        for folder in reversed(parts[2:-1]):
            name = sanitize_name(folder.lower().replace("-", "_"))
            if name in GUI_FLASH_GENERIC_FOLDER_NAMES:
                continue
            if name.startswith(("font_", "img_", "tex_")):
                continue
            if not any(char.isdigit() for char in name):
                continue
            counts[name] += 1
            break
    if not counts:
        return None
    name, _count = max(counts.items(), key=lambda item: (item[1], len(item[0]), item[0]))
    return name


def source_stem_specific_name(stems: list[str]) -> str | None:
    unique = sorted({sanitize_name(stem.lower()) for stem in stems if stem})
    if not unique:
        return None
    if len(unique) == 1:
        return unique[0]
    prefix = os.path.commonprefix(unique).rstrip("_-")
    if prefix and len(prefix) >= 4 and prefix not in NUTEXB_GENERIC_BASES:
        return sanitize_name(prefix)
    if len(unique) <= 4:
        return sanitize_name("_".join(unique))
    return sanitize_name(f"{unique[0]}_{unique[-1]}_{len(unique)}files")


def entry_name_from_source_paths(package_path: str, source_paths: list[str]) -> str:
    base_name = entry_name_from_package(package_path)
    package_parts = normalize_slashes(package_path).split("/")
    if (
        domain_from_package(package_path) == "009gui"
        and len(package_parts) >= 2
        and package_parts[1].lower() == "flash"
    ):
        flash_bundle_name = gui_flash_bundle_name_from_source_paths(source_paths)
        if flash_bundle_name:
            return flash_bundle_name

    stems = source_stems_for_package(source_paths, package_path)
    generic_names = GENERIC_EXACT_NAMES_BY_ROUTE.get(domain_from_package(package_path), set())
    if base_name.lower() in generic_names or any(base_name.lower().startswith(f"{name}_") for name in generic_names):
        specific_name = source_stem_specific_name(stems)
        if specific_name:
            return specific_name

    if (
        domain_from_package(package_path) != "009gui"
        or len(package_parts) < 2
        or package_parts[1].lower() != "image"
    ):
        return base_name

    if len(stems) <= 1:
        return base_name

    prefix = f"{base_name}_"
    if all(stem.startswith(prefix) for stem in stems):
        suffixes = [stem[len(prefix) :] for stem in stems]
        if len(stems) >= 8:
            return base_name
        if len(stems) <= 4:
            return sanitize_name(f"{base_name}_{'_'.join(suffixes)}")
        return sanitize_name(f"{base_name}_{suffixes[0]}_{suffixes[-1]}_{len(stems)}files")

    if len(stems) <= 4:
        return sanitize_name(f"{base_name}_{'_'.join(stems)}")
    return sanitize_name(f"{base_name}_{stems[0]}_{stems[-1]}_{len(stems)}files")


def category_path_from_package(package_path: str) -> str | None:
    parts = package_path.split("/")
    if len(parts) <= 2:
        return None
    return "/".join(parts[1:-1])


def build_meta_entries(meta_root: Path, reference_dirs: dict[str, str]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    seen_hashes: set[str] = set()
    if not meta_root.exists():
        return entries

    for path in sorted(meta_root.iterdir(), key=lambda item: item.name.lower()):
        if not path.is_file():
            continue
        match = META_HASH_RE.match(path.name)
        if not match:
            continue
        hash_name = normalize_hash_name(match.group(1))
        if not hash_name or hash_name in seen_hashes:
            continue
        seen_hashes.add(hash_name)

        strings = read_ascii_strings(path)
        source_paths = [value for value in strings if game_relative_path(value)]
        package_path, matched_count = infer_package_path(source_paths, reference_dirs)
        if not package_path:
            continue

        domain = domain_from_package(package_path)
        game_path = f"x64/{package_path}"
        entry_name = entry_name_from_source_paths(package_path, source_paths)
        entries.append(
            {
                "hashName": hash_name,
                "name": entry_name,
                "routeId": ROUTE_BY_DOMAIN.get(domain),
                "routePrefix": domain,
                "source": "exvs2-meta",
                "confidence": "exact-meta-path",
                "packagePath": package_path,
                "gameRelativePath": game_path,
                "categoryPath": category_path_from_package(package_path),
                "aliases": sorted({package_path.rsplit("/", 1)[-1], entry_name_from_package(package_path), entry_name}),
                "sourcePathCount": len(source_paths),
                "matchedPathCount": matched_count,
                "character": None,
            }
        )
    return entries


def parse_ai_character_names(ai_string_paths: list[Path]) -> dict[str, dict[str, Any]]:
    names: dict[str, dict[str, Any]] = {}
    for ai_string_path in ai_string_paths:
        if not ai_string_path.exists():
            continue
        for line in ai_string_path.read_text(encoding="utf-8", errors="replace").splitlines():
            match = AI_CHR_RE.match(line.strip())
            if not match:
                continue
            series_num, series_code, unit_num, unit_code, variant, enabled = match.groups()
            full_id = f"{series_num}{series_code}_{unit_num}{unit_code}_{variant}".lower()
            short_base = f"{series_code}_{unit_num}{unit_code}".lower()
            names[full_id] = {
                "fullId": full_id,
                "characterId": character_id_from_parts(series_num, unit_num, variant),
                "name": short_base if variant == "001" else f"{short_base}_{variant.lower()}",
                "seriesCode": series_code.lower(),
                "unitCode": unit_code.lower(),
                "variant": variant,
                "enabled": enabled.lower() == "true",
                "sourcePath": str(ai_string_path),
            }
    return names


def ai_names_by_character_id(ai_names: dict[str, dict[str, Any]]) -> dict[int, dict[str, Any]]:
    by_id: dict[int, dict[str, Any]] = {}
    for info in ai_names.values():
        character_id = info["characterId"]
        current = by_id.get(character_id)
        if not current or (info["enabled"] and not current["enabled"]):
            by_id[character_id] = info
    return by_id


def character_id_from_parts(series_num: str, unit_num: str, variant: str) -> int:
    return int(series_num) * 1_000_000 + int(unit_num) * 1_000 + int(variant)


def character_id_from_text(text: str) -> int | None:
    match = UNIT_ID_RE.search(text.replace("\\", "/"))
    if not match:
        return None
    series_num, _series_code, unit_num, _unit_code, variant = match.groups()
    return character_id_from_parts(series_num, unit_num, variant)


def load_character_list(character_list_path: Path | None) -> dict[int, dict[str, Any]]:
    if not character_list_path or not character_list_path.exists():
        return {}
    data = json.loads(character_list_path.read_text(encoding="utf-8"))
    rows: dict[int, dict[str, Any]] = {}
    for row in data:
        character_id = row.get("CharacterId") or row.get("id")
        if not isinstance(character_id, int):
            continue
        rows[character_id] = {
            "characterId": character_id,
            "characterName": row.get("CharacterNameOffset"),
            "pilotName": row.get("UnkStringOffset6"),
            "seriesId": to_unsigned_hash(row.get("SeriesId")),
        }
    return rows


def apply_character_list(entries: list[dict[str, Any]], character_rows: dict[int, dict[str, Any]]) -> None:
    if not character_rows:
        return
    for entry in entries:
        character_id = character_id_from_text(str(entry.get("packagePath") or ""))
        if character_id is None:
            for alias in entry.get("aliases") or []:
                character_id = character_id_from_text(str(alias))
                if character_id is not None:
                    break
        if character_id is None:
            continue
        character = character_rows.get(character_id)
        if character:
            entry["character"] = character


def best_ai_name_from_text(text: str, ai_names: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    lower = text.lower()
    matches = [info for full_id, info in ai_names.items() if full_id in lower]
    if not matches:
        return None
    return max(matches, key=lambda info: (len(info["fullId"]), info["enabled"]))


def fallback_unit_name(character_id: int, character_rows: dict[int, dict[str, Any]]) -> str:
    character = character_rows.get(character_id)
    if character:
        for key in ("characterName", "pilotName"):
            value = character.get(key)
            if isinstance(value, str) and re.search(r"[A-Za-z0-9]", value):
                return sanitize_name(value.lower())
    return f"unit_{character_id}"


def ai_unit_name_and_aliases(ai_match: dict[str, Any]) -> tuple[str, list[str]]:
    full_name = sanitize_name(str(ai_match["fullId"]))
    short_name = sanitize_name(str(ai_match["name"]))
    aliases = [full_name]
    if short_name and short_name != full_name:
        aliases.append(short_name)
    return full_name, aliases


def unit_name_for_character_id(
    character_id: int,
    ai_by_character_id: dict[int, dict[str, Any]],
    character_rows: dict[int, dict[str, Any]],
) -> tuple[str, list[str]]:
    ai_match = ai_by_character_id.get(character_id)
    if ai_match:
        return ai_unit_name_and_aliases(ai_match)
    name = fallback_unit_name(character_id, character_rows)
    return sanitize_name(name), [name]


def character_payload(character_id: int, character_rows: dict[int, dict[str, Any]]) -> dict[str, Any]:
    return character_rows.get(character_id) or {"characterId": character_id}


def ob_unit_entry(
    hash_name: str,
    route_prefix: str,
    route_id: str,
    character_id: int,
    name: str,
    aliases: list[str],
    source: str,
    confidence: str,
    character_rows: dict[int, dict[str, Any]],
    evidence: dict[str, Any] | None = None,
) -> dict[str, Any]:
    entry = {
        "hashName": hash_name,
        "name": name,
        "routeId": route_id,
        "routePrefix": route_prefix,
        "source": source,
        "confidence": confidence,
        "packagePath": f"{route_prefix}/{name}",
        "gameRelativePath": None,
        "categoryPath": None,
        "aliases": sorted(set([*aliases, name])),
        "sourcePathCount": 0,
        "matchedPathCount": 0,
        "character": character_payload(character_id, character_rows),
    }
    if evidence:
        entry["evidence"] = evidence
    return entry


def build_ob_unit_entries(
    ob_unit_path: Path | None,
    ai_by_character_id: dict[int, dict[str, Any]],
    character_rows: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    if not ob_unit_path or not ob_unit_path.exists():
        return []
    data = json.loads(ob_unit_path.read_text(encoding="utf-8"))
    entries: list[dict[str, Any]] = []
    for row in data:
        character_id = row.get("unitId")
        if not isinstance(character_id, int):
            continue
        name, aliases = unit_name_for_character_id(character_id, ai_by_character_id, character_rows)
        for field_name, (route_prefix, route_id) in OB_UNIT_FIELD_ROUTES.items():
            hash_name = normalize_hash_name(str(row.get(field_name) or ""))
            if not hash_name:
                continue
            entries.append(
                ob_unit_entry(
                    hash_name=hash_name,
                    route_prefix=route_prefix,
                    route_id=route_id,
                    character_id=character_id,
                    name=name,
                    aliases=aliases,
                    source="ob-unit-list",
                    confidence="ob-unit-list",
                    character_rows=character_rows,
                    evidence={"path": str(ob_unit_path), "field": field_name},
                )
            )
    return entries


def read_csyspm_character_id(path: Path) -> int | None:
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if len(data) < 12:
        return None
    return int.from_bytes(data[8:12], "little")


def build_ob_param_csyspm_entries(
    ob_file_root: Path | None,
    ai_by_character_id: dict[int, dict[str, Any]],
    character_rows: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    if not ob_file_root or not ob_file_root.exists():
        return []
    entries: list[dict[str, Any]] = []
    route_prefix = "041cpm"
    route_id = "unit.param"
    param_root = ob_file_root / route_prefix
    if not param_root.exists():
        return []
    for param_dir in sorted(param_root.iterdir(), key=lambda path: path.name.lower()):
        if not param_dir.is_dir():
            continue
        hash_name = normalize_hash_name(param_dir.name)
        if not hash_name:
            structure_path = param_root / f"{param_dir.name}_structure.json"
            hash_name = structure_hash_name(structure_path) if structure_path.exists() else None
        if not hash_name:
            continue
        csyspm_path = param_dir / "chrsysparam.csyspm"
        character_id = read_csyspm_character_id(csyspm_path)
        if not character_id:
            continue
        name, aliases = unit_name_for_character_id(character_id, ai_by_character_id, character_rows)
        entries.append(
            ob_unit_entry(
                hash_name=hash_name,
                route_prefix=route_prefix,
                route_id=route_id,
                character_id=character_id,
                name=name,
                aliases=aliases,
                source="ob-param-csyspm",
                confidence="ob-param-unit-id",
                character_rows=character_rows,
                evidence={"path": str(csyspm_path), "unitIdOffset": 8},
            )
        )
    return entries


def build_manual_override_entries(
    override_path: Path | None,
    character_rows: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    if not override_path or not override_path.exists():
        return []
    data = json.loads(override_path.read_text(encoding="utf-8"))
    entries: list[dict[str, Any]] = []
    for raw in data.get("entries", []):
        hash_name = normalize_hash_name(str(raw.get("hashName") or ""))
        route_prefix = str(raw.get("routePrefix") or "").lower()
        name = sanitize_name(str(raw.get("name") or ""))
        character_id = raw.get("characterId")
        if not hash_name or not route_prefix or not name or not isinstance(character_id, int):
            continue
        aliases = [str(alias) for alias in raw.get("aliases", []) if isinstance(alias, str)]
        entries.append(
            ob_unit_entry(
                hash_name=hash_name,
                route_prefix=route_prefix,
                route_id=raw.get("routeId") or ROUTE_BY_DOMAIN.get(route_prefix),
                character_id=character_id,
                name=name,
                aliases=aliases,
                source=raw.get("source") or "manual-override",
                confidence=raw.get("confidence") or "manual-override",
                character_rows=character_rows,
                evidence={
                    "path": str(override_path),
                    "notes": raw.get("notes"),
                    "references": raw.get("references", []),
                },
            )
        )
    return entries


def read_u32_le(data: bytes, offset: int) -> int:
    if offset < 0 or offset + 4 > len(data):
        raise ValueError(f"read_u32 out of range at 0x{offset:X}")
    return int.from_bytes(data[offset : offset + 4], "little", signed=False)


def read_i32_le(data: bytes, offset: int) -> int:
    if offset < 0 or offset + 4 > len(data):
        raise ValueError(f"read_i32 out of range at 0x{offset:X}")
    return int.from_bytes(data[offset : offset + 4], "little", signed=True)


def read_i16_le(data: bytes, offset: int) -> int:
    if offset < 0 or offset + 2 > len(data):
        raise ValueError(f"read_i16 out of range at 0x{offset:X}")
    return int.from_bytes(data[offset : offset + 2], "little", signed=True)


def read_c_string_utf8(data: bytes, offset: int, max_len: int = 4096) -> str:
    if offset < 0 or offset >= len(data):
        raise ValueError(f"CString offset out of range at 0x{offset:X}")
    end = offset
    end_limit = min(len(data), offset + max_len)
    while end < end_limit and data[end] != 0:
        end += 1
    return data[offset:end].decode("utf-8", errors="ignore")


def strip_extension(value: str) -> str:
    return value.rsplit(".", 1)[0] if "." in value else value


def clean_internal_stem(value: str) -> str:
    basename = normalize_slashes(value).rsplit("/", 1)[-1]
    stem = strip_extension(basename)
    return sanitize_name(stem.replace("-", "_").lower())


def parse_nutexb_internal_name(data: bytes) -> str | None:
    size = len(data)
    if size < 8 or data[size - 8 : size - 4] != b" XET":
        return None
    major = read_i16_le(data, size - 4)
    minor = read_i16_le(data, size - 2)
    if (major, minor) == (1, 1):
        name_offset = size - 0x86C
    elif (major, minor) in {(2, 0), (1, 2)}:
        name_offset = size - 0x70
    else:
        return None
    if name_offset < 0 or data[name_offset : name_offset + 4] != b"46XT":
        return None
    raw = read_c_string_utf8(data, name_offset + 4)
    return clean_internal_stem(raw)


def parse_nus3bank_internal_name(data: bytes) -> str | None:
    if len(data) <= 0x7D:
        return None
    raw = read_c_string_utf8(data, 0x7D)
    return clean_internal_stem(raw)


def parse_nuanmb_internal_name(data: bytes) -> str | None:
    if len(data) <= 0x50:
        return None
    raw = read_c_string_utf8(data, 0x50)
    if raw.lower().endswith(".nuanmx.scaled"):
        raw = f"{raw[:-len('.nuanmx.scaled')]}.nuanmb"
    return clean_internal_stem(raw)


def parse_numdlb_internal_name(data: bytes) -> str | None:
    strings = [match.group(0).decode("ascii", errors="ignore") for match in ASCII_RE.finditer(data)]
    candidates: list[str] = []
    for value in strings:
        normalized = normalize_slashes(value)
        lower = normalized.lower()
        if lower.endswith((".numdlb", ".numdlx")):
            candidates.append(clean_internal_stem(normalized))
    candidates = [candidate for candidate in candidates if candidate]
    return max(candidates, key=len) if candidates else None


def unit_stem_from_internal_names(stems: list[str]) -> str | None:
    counts: Counter[str] = Counter()
    for stem in stems:
        match = INTERNAL_UNIT_STEM_RE.search(stem)
        if match:
            counts[sanitize_name(match.group(1).lower())] += 1
    if not counts:
        return None
    name, _count = max(counts.items(), key=lambda item: (item[1], len(item[0]), item[0]))
    return name


def common_internal_name(stems: list[str]) -> str | None:
    unit_stem = unit_stem_from_internal_names(stems)
    if unit_stem:
        return unit_stem

    unique = sorted({sanitize_name(stem.replace("-", "_").lower()) for stem in stems if stem})
    if not unique:
        return None
    if len(unique) == 1:
        return unique[0]

    prefix = os.path.commonprefix(unique).rstrip("_-")
    if "_" in prefix:
        prefix = prefix.rsplit("_", 1)[0].rstrip("_-")
    if prefix and len(prefix) >= 4 and prefix not in NUTEXB_GENERIC_BASES:
        return sanitize_name(prefix)

    if len(unique) <= 4:
        if prefix and prefix in NUTEXB_GENERIC_BASES:
            suffixes = [name[len(prefix) :].strip("_-") or name for name in unique]
            return sanitize_name(f"{prefix}_{'_'.join(suffixes)}")
        return sanitize_name("_".join(unique))

    first = unique[0]
    last = unique[-1]
    if prefix:
        return sanitize_name(f"{prefix}_{first}_{last}_{len(unique)}files")
    return sanitize_name(f"{first}_{last}_{len(unique)}files")


def parse_ob_fhm2d_records(path: Path) -> tuple[list[str], list[dict[str, Any]], bytes]:
    data = path.read_bytes()
    if data[:4] != FHM2D_MAGIC_OB:
        raise ValueError("Unsupported FHM2D magic")
    meta_comp_size = read_u32_le(data, 0x20)
    meta_start = 0x30
    meta_end = meta_start + meta_comp_size
    if meta_end > len(data):
        raise ValueError("Meta compressed range out of bounds")
    meta = zlib.decompress(data[meta_start:meta_end], -15)
    body = data[meta_end:]
    file_type_count = read_u32_le(meta, 0x18)
    file_count = read_u32_le(meta, 0x1C)
    type_list: list[str] = []
    type_cursor = 0x24
    for index in range(file_type_count):
        offset = type_cursor + index * 0x20
        file_type = read_u32_le(meta, offset)
        count = read_u32_le(meta, offset + 0x1C)
        type_list.extend([FHM2D_FILE_TYPE_BY_ID.get(file_type, ".bin")] * count)

    sub_cursor = 0x24 + file_type_count * 0x20 + file_count * 0x0C
    records: list[dict[str, Any]] = []
    for index in range(file_count):
        file_size = read_u32_le(meta, sub_cursor + 0x08)
        chunk_count = read_u32_le(meta, sub_cursor + 0x1C)
        start_offset = read_u32_le(meta, sub_cursor + 0x20)
        file_index = read_u32_le(meta, sub_cursor + 0x28)
        page_count = (file_size + FHM2D_PAGE_SIZE - 1) // FHM2D_PAGE_SIZE if file_size else 0
        bitmap = b""
        bitmap_len = 0
        chunk_sizes: list[int] = []
        if chunk_count:
            bitmap_len = (page_count + 7) // 8 if page_count else 0
            bitmap_start = sub_cursor + 0x2C
            bitmap_end = bitmap_start + bitmap_len
            if bitmap_end > len(meta):
                raise ValueError("Bitmap range out of bounds")
            bitmap = meta[bitmap_start:bitmap_end]
            table_start = bitmap_end
            table_end = table_start + chunk_count * 0x08
            if table_end > len(meta):
                raise ValueError("Chunk size table out of bounds")
            for chunk_index in range(chunk_count):
                chunk_sizes.append(read_i32_le(meta, table_start + chunk_index * 0x08))
        used_len = 0x2C + bitmap_len + chunk_count * 0x08
        records.append(
            {
                "index": index,
                "fileType": type_list[index] if index < len(type_list) else ".bin",
                "fileSize": file_size,
                "chunkCount": chunk_count,
                "startOffset": start_offset,
                "fileIndex": file_index,
                "pageCount": page_count,
                "bitmap": bitmap,
                "chunkSizes": chunk_sizes,
            }
        )
        sub_cursor += used_len
    return type_list, records, body


def extract_ob_record_data(record: dict[str, Any], body: bytes) -> bytes:
    file_size = int(record["fileSize"])
    chunk_count = int(record["chunkCount"])
    start_offset = int(record["startOffset"])
    if chunk_count == 0:
        end = start_offset + file_size
        if end > len(body):
            raise ValueError("Raw file range out of body")
        return body[start_offset:end]

    output = bytearray()
    data_cursor = start_offset
    compressed_index = 0
    bitmap = record["bitmap"]
    chunk_sizes = record["chunkSizes"]
    page_count = int(record["pageCount"])
    for page_index in range(page_count):
        flag = bitmap[page_index >> 3]
        is_compressed = ((flag >> (page_index & 7)) & 1) == 1
        if is_compressed:
            compressed_size = chunk_sizes[compressed_index]
            if compressed_size <= 0:
                raise ValueError("Invalid compressed chunk size")
            end = data_cursor + compressed_size
            if end > len(body):
                raise ValueError("Compressed chunk range out of body")
            output.extend(zlib.decompress(body[data_cursor:end], -15))
            data_cursor = end
            compressed_index += 1
        else:
            raw_size = min(FHM2D_PAGE_SIZE, file_size - page_index * FHM2D_PAGE_SIZE)
            end = data_cursor + raw_size
            if end > len(body):
                raise ValueError("Raw chunk range out of body")
            output.extend(body[data_cursor:end])
            data_cursor = end
    return bytes(output[:file_size])


def internal_name_for_record(record: dict[str, Any], body: bytes) -> str | None:
    file_type = str(record.get("fileType") or "").lower()
    if file_type not in {".nutexb", ".nus3bank", ".nuanmb", ".numdlb"}:
        return None
    data = extract_ob_record_data(record, body)
    if file_type == ".nutexb":
        return parse_nutexb_internal_name(data)
    if file_type == ".nus3bank":
        return parse_nus3bank_internal_name(data)
    if file_type == ".nuanmb":
        return parse_nuanmb_internal_name(data)
    if file_type == ".numdlb":
        return parse_numdlb_internal_name(data)
    return None


def infer_dplcache_route(type_counts: Counter[str]) -> tuple[str | None, str | None]:
    if type_counts.get(".numdlb") or type_counts.get(".numshb") or type_counts.get(".nusktb"):
        return "002chara", "unit.model"
    if type_counts.get(".nuanmb"):
        return "003motion", "unit.motion"
    if type_counts.get(".nus3bank"):
        return "090sound", "unit.sound"
    if type_counts.get(".nutexb"):
        return "009gui", None
    return None, None


def inspect_ob_dplcache_file(path: Path, max_name_records: int = 24) -> dict[str, Any]:
    type_list, records, body = parse_ob_fhm2d_records(path)
    type_counts = Counter(type_list)
    internal_names: list[str] = []
    for record in records:
        if len(internal_names) >= max_name_records:
            break
        try:
            name = internal_name_for_record(record, body)
        except Exception:
            continue
        if name:
            internal_names.append(name)
    name = common_internal_name(internal_names)
    route_prefix, route_id = infer_dplcache_route(type_counts)
    return {
        "name": name,
        "routePrefix": route_prefix,
        "routeId": route_id,
        "typeCounts": dict(sorted(type_counts.items())),
        "fileCount": len(records),
        "internalNames": sorted(set(internal_names)),
    }


def build_ob_dplcache_entries(
    ob_dplcache_root: Path | None,
    existing_hashes: set[str],
) -> list[dict[str, Any]]:
    if not ob_dplcache_root or not ob_dplcache_root.exists():
        return []
    entries: list[dict[str, Any]] = []
    for path in sorted(ob_dplcache_root.glob("0x*.fhm2d"), key=lambda item: item.name.lower()):
        if not path.is_file():
            continue
        match = FHM2D_FILE_RE.match(path.name)
        if not match:
            continue
        hash_name = normalize_hash_name(match.group(1))
        if not hash_name or hash_name in existing_hashes:
            continue
        try:
            info = inspect_ob_dplcache_file(path)
            name = info["name"]
            confidence = "ob-dplcache-internal" if name else "ob-dplcache-fallback"
            source = "ob-dplcache-internal" if name else "ob-dplcache-fallback"
            error = None
        except Exception as exc:
            info = {
                "routePrefix": None,
                "routeId": None,
                "typeCounts": {},
                "fileCount": None,
                "internalNames": [],
            }
            name = None
            confidence = "ob-dplcache-fallback"
            source = "ob-dplcache-fallback"
            error = str(exc)

        if not name:
            name = f"ob_{hash_name[2:].lower()}"
        route_prefix = info.get("routePrefix")
        package_path = f"{route_prefix}/{name}" if route_prefix else name
        evidence = {
            "path": str(path),
            "sizeBytes": path.stat().st_size,
            "fileCount": info.get("fileCount"),
            "typeCounts": info.get("typeCounts", {}),
            "internalNames": info.get("internalNames", [])[:24],
        }
        if error:
            evidence["error"] = error
        entries.append(
            {
                "hashName": hash_name,
                "name": sanitize_name(name),
                "routeId": info.get("routeId"),
                "routePrefix": route_prefix,
                "source": source,
                "confidence": confidence,
                "packagePath": package_path,
                "gameRelativePath": None,
                "categoryPath": route_prefix,
                "aliases": sorted({sanitize_name(name), hash_name}),
                "sourcePathCount": 1,
                "matchedPathCount": len(info.get("internalNames", [])),
                "character": None,
                "evidence": evidence,
            }
        )
    return entries


def build_ob_structure_entries(
    ob_file_root: Path | None,
    ai_names: dict[str, dict[str, Any]],
    existing_hashes: set[str],
) -> list[dict[str, Any]]:
    if not ob_file_root or not ob_file_root.exists():
        return []
    entries: list[dict[str, Any]] = []
    for structure_path in sorted(ob_file_root.glob("*/*_structure.json")):
        data = read_json_object(structure_path)
        hash_name = structure_hash_name(structure_path, data)
        if not hash_name or hash_name in existing_hashes:
            continue
        route_prefix = structure_path.parent.name.lower()
        text = json.dumps(data, ensure_ascii=False) if data else ""
        ai_match = best_ai_name_from_text(text, ai_names)
        if not ai_match:
            continue
        raw_name = data.get("Name") if data else None
        name, ai_aliases = ai_unit_name_and_aliases(ai_match)
        aliases = set(ai_aliases)
        if isinstance(raw_name, str):
            aliases.add(sanitize_name(raw_name))
        entries.append(
            {
                "hashName": hash_name,
                "name": name,
                "routeId": ROUTE_BY_DOMAIN.get(route_prefix),
                "routePrefix": route_prefix,
                "source": "ob-structure-ai-string",
                "confidence": "inferred-ob-ai-string",
                "packagePath": f"{route_prefix}/{name}",
                "gameRelativePath": None,
                "categoryPath": None,
                "aliases": sorted(aliases),
                "sourcePathCount": 0,
                "matchedPathCount": 0,
                "character": {"characterId": ai_match["characterId"]},
            }
        )
    return entries


def collect_ob_structure_hashes(ob_file_root: Path | None) -> list[dict[str, str]]:
    if not ob_file_root or not ob_file_root.exists():
        return []
    structures: dict[tuple[str, str], dict[str, str]] = {}
    for structure_path in sorted(ob_file_root.glob("*/*_structure.json")):
        data = read_json_object(structure_path)
        hash_name = structure_hash_name(structure_path, data)
        if not hash_name:
            continue
        route_prefix = structure_path.parent.name.lower()
        structures[(route_prefix, hash_name)] = {
            "routePrefix": route_prefix,
            "hashName": hash_name,
            "structureJsonPath": str(structure_path),
        }
    return sorted(structures.values(), key=lambda item: (item["routePrefix"], item["hashName"]))


def build_character_list_summary(character_list_path: Path | None) -> dict[str, Any] | None:
    if not character_list_path or not character_list_path.exists():
        return None
    data = json.loads(character_list_path.read_text(encoding="utf-8"))
    hash_field_counts: defaultdict[str, int] = defaultdict(int)
    nonzero_rows = 0
    for row in data:
        row_has_hash = False
        for key, value in row.items():
            if not isinstance(value, int):
                continue
            if to_unsigned_hash(value):
                hash_field_counts[key] += 1
                row_has_hash = True
        if row_has_hash:
            nonzero_rows += 1
    return {
        "path": str(character_list_path),
        "rowCount": len(data),
        "rowsWithNonzeroIntegers": nonzero_rows,
        "integerFieldCount": len(hash_field_counts),
    }


def dedupe_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_key: dict[tuple[str, str | None], dict[str, Any]] = {}
    rank = {
        "exact-meta-path": 5,
        "ob-unit-list": 4,
        "ob-param-unit-id": 3,
        "manual-override": 3,
        "manual-research-note": 3,
        "ob-dplcache-internal": 2,
        "inferred-ob-ai-string": 1,
        "ob-dplcache-fallback": 0,
    }
    for entry in entries:
        key = (entry["hashName"], entry.get("routeId") or entry.get("routePrefix"))
        current = by_key.get(key)
        if not current or should_replace_entry(current, entry, rank):
            by_key[key] = entry
    return sorted(by_key.values(), key=lambda item: (item.get("routePrefix") or "", item["hashName"]))


def is_generic_exact_entry(entry: dict[str, Any]) -> bool:
    if entry.get("confidence") != "exact-meta-path":
        return False
    route_prefix = str(entry.get("routePrefix") or "").lower()
    generic_names = GENERIC_EXACT_NAMES_BY_ROUTE.get(route_prefix)
    if not generic_names:
        return False
    name = str(entry.get("name") or "").lower()
    return name in generic_names or any(name.startswith(f"{generic}_") for generic in generic_names)


def should_replace_entry(
    current: dict[str, Any],
    candidate: dict[str, Any],
    rank: dict[str, int],
) -> bool:
    if (
        is_generic_exact_entry(current)
        and candidate.get("confidence") in {"ob-unit-list", "ob-param-unit-id"}
    ):
        return True
    return rank.get(candidate["confidence"], 0) > rank.get(current["confidence"], 0)


def route_name_key(entry: dict[str, Any]) -> tuple[str, str]:
    return (entry.get("routeId") or entry.get("routePrefix") or "", entry["name"])


def unique_name_from_package(entry: dict[str, Any]) -> str:
    package_path = entry.get("packagePath")
    if isinstance(package_path, str) and "/" in package_path:
        package_parts = package_path.split("/")
        if package_parts[0].lower() == "003motion" and len(package_parts) >= 4:
            parts = [package_parts[1], package_parts[3]]
        else:
            parts = package_parts[1:]
        candidate = sanitize_name("_".join(parts).lower())
        if candidate:
            return candidate
    return entry["name"]


def make_route_names_unique(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: defaultdict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for entry in entries:
        grouped[route_name_key(entry)].append(entry)

    for duplicates in grouped.values():
        if len(duplicates) <= 1:
            continue
        for entry in duplicates:
            original_name = entry["name"]
            candidate = unique_name_from_package(entry)
            aliases = set(entry.get("aliases") or [])
            aliases.add(original_name)
            entry["aliases"] = sorted(aliases)
            entry["name"] = candidate

    grouped.clear()
    for entry in entries:
        grouped[route_name_key(entry)].append(entry)

    for duplicates in grouped.values():
        if len(duplicates) <= 1:
            continue
        for entry in duplicates:
            base_name = entry["name"]
            hash_suffix = str(entry["hashName"]).replace("0x", "").lower()
            aliases = set(entry.get("aliases") or [])
            aliases.add(base_name)
            entry["aliases"] = sorted(aliases)
            entry["name"] = sanitize_name(f"{base_name}_{hash_suffix}")

    return sorted(entries, key=lambda item: (item.get("routePrefix") or "", item["name"], item["hashName"]))


def build_mapping(args: argparse.Namespace) -> dict[str, Any]:
    reference_roots = [Path(root) for root in args.reference_root]
    reference_dirs = iter_reference_dirs(reference_roots)
    character_list_path = Path(args.character_list) if args.character_list else None
    character_rows = load_character_list(character_list_path)
    meta_entries = build_meta_entries(Path(args.meta_root), reference_dirs)
    ai_string_paths = [Path(path) for path in args.ai_string or []]
    ai_names = parse_ai_character_names(ai_string_paths)
    ai_by_character_id = ai_names_by_character_id(ai_names)
    ob_file_root = Path(args.ob_file_root) if args.ob_file_root else None
    ob_unit_entries = build_ob_unit_entries(
        Path(args.ob_unit) if args.ob_unit else None,
        ai_by_character_id,
        character_rows,
    )
    ob_param_entries = build_ob_param_csyspm_entries(
        ob_file_root,
        ai_by_character_id,
        character_rows,
    )
    manual_entries = build_manual_override_entries(
        Path(args.manual_overrides) if args.manual_overrides else None,
        character_rows,
    )
    ob_entries = build_ob_structure_entries(
        ob_file_root,
        ai_names,
        {entry["hashName"] for entry in meta_entries},
    )
    pre_dplcache_entries = [*meta_entries, *ob_unit_entries, *ob_param_entries, *manual_entries, *ob_entries]
    ob_dplcache_entries = build_ob_dplcache_entries(
        Path(args.ob_dplcache_root) if args.ob_dplcache_root else None,
        {entry["hashName"] for entry in pre_dplcache_entries},
    )
    entries = make_route_names_unique(
        dedupe_entries([*pre_dplcache_entries, *ob_dplcache_entries])
    )
    apply_character_list(entries, character_rows)
    ob_structures = collect_ob_structure_hashes(ob_file_root)
    entry_route_hashes = {(entry.get("routePrefix"), entry["hashName"]) for entry in entries}
    entry_hashes = {entry["hashName"] for entry in entries}
    unresolved_ob_structures = [
        {
            **structure,
            "reason": "No EXVS2 meta match and no usable OB structure token was found",
        }
        for structure in ob_structures
        if (structure["routePrefix"], structure["hashName"]) not in entry_route_hashes
        and structure["hashName"] not in entry_hashes
    ]
    source_counts = Counter(entry["source"] for entry in entries)
    confidence_counts = Counter(entry["confidence"] for entry in entries)
    character_matched_count = sum(1 for entry in entries if entry.get("character"))
    return {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "nameStyle": "lower-snake",
        "sources": {
            "referenceRoots": [str(root) for root in reference_roots],
            "metaRoot": args.meta_root,
            "obFileRoot": args.ob_file_root,
            "obDplcacheRoot": args.ob_dplcache_root,
            "aiString": [str(path) for path in ai_string_paths],
            "obUnit": args.ob_unit,
            "manualOverrides": args.manual_overrides,
            "characterList": build_character_list_summary(character_list_path),
        },
        "stats": {
            "referenceDirectoryCount": len(reference_dirs),
            "entryCount": len(entries),
            "characterListRowCount": len(character_rows),
            "characterMatchedEntryCount": character_matched_count,
            "obStructureHashCount": len(ob_structures),
            "obStructureMappedCount": len(ob_structures) - len(unresolved_ob_structures),
            "obStructureUnresolvedCount": len(unresolved_ob_structures),
            "sourceCounts": dict(sorted(source_counts.items())),
            "confidenceCounts": dict(sorted(confidence_counts.items())),
        },
        "unresolvedObStructures": unresolved_ob_structures,
        "entries": entries,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build FHM2D hash-to-readable-name mapping JSON.")
    parser.add_argument("--reference-root", action="append", required=True, help="EXVS2 unpacked root, e.g. vs2/x64 or vs2/bak.")
    parser.add_argument("--meta-root", required=True, help="EXVS2 meta directory containing 0xHASH_meta.bin files.")
    parser.add_argument("--ob-file-root", help="Optional OB extracted file root, e.g. com/file.")
    parser.add_argument("--ob-dplcache-root", help="Optional real OB dplcache_release root containing 0xHASH.fhm2d files.")
    parser.add_argument("--ai-string", action="append", help="Optional ai_string_*.txt path for OB-only name inference.")
    parser.add_argument("--character-list", help="Optional character_list.json path recorded in mapping sources.")
    parser.add_argument("--ob-unit", help="Optional OB unit hash table JSON, e.g. tools/ob_unit.json.")
    parser.add_argument("--manual-overrides", help="Optional manual mapping overrides JSON.")
    parser.add_argument("--output", required=True, help="Output mapping JSON path.")
    args = parser.parse_args()

    mapping = build_mapping(args)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(mapping['entries'])} entries to {output}")
    print(json.dumps(mapping["stats"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
