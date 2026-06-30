#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ASCII_RE = re.compile(rb"[\x20-\x7e]{4,}")
META_HASH_RE = re.compile(r"^(0x[0-9a-fA-F]{8})(?:_meta\.bin|\.fhm2d_metabody\.bin)$")
AI_CHR_RE = re.compile(r"^ai_CHR_([0-9]{3})([A-Z0-9]+)_([0-9]{3})([A-Z0-9]+)_([0-9]{3})\s*\|\s*(true|false)", re.I)
UNIT_ID_RE = re.compile(r"(?:^|/)([0-9]{3})([a-z0-9]+)_([0-9]{3})([a-z0-9]+)_([0-9]{3})(?:$|/)", re.I)


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
}


def normalize_slashes(value: str) -> str:
    return re.sub(r"/+", "/", value.replace("\\", "/")).strip("/")


def normalize_hash_name(value: str) -> str | None:
    match = re.search(r"(?:0x)?([0-9a-fA-F]{8})", value)
    return f"0x{match.group(1).upper()}" if match else None


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

    source = counts if counts else fallback_counts
    if not source:
        return None, 0
    package_path, count = max(source.items(), key=lambda item: (item[1], len(item[0].split("/"))))
    return package_path, count


def domain_from_package(package_path: str) -> str:
    return package_path.split("/", 1)[0].lower()


def entry_name_from_package(package_path: str) -> str:
    return sanitize_name(package_path.rsplit("/", 1)[-1].lower())


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
        entries.append(
            {
                "hashName": hash_name,
                "name": entry_name_from_package(package_path),
                "routeId": ROUTE_BY_DOMAIN.get(domain),
                "routePrefix": domain,
                "source": "exvs2-meta",
                "confidence": "exact-meta-path",
                "packagePath": package_path,
                "gameRelativePath": game_path,
                "categoryPath": category_path_from_package(package_path),
                "aliases": sorted({package_path.rsplit("/", 1)[-1], entry_name_from_package(package_path)}),
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


def unit_name_for_character_id(
    character_id: int,
    ai_by_character_id: dict[int, dict[str, Any]],
    character_rows: dict[int, dict[str, Any]],
) -> tuple[str, list[str]]:
    ai_match = ai_by_character_id.get(character_id)
    if ai_match:
        return sanitize_name(ai_match["name"]), [ai_match["fullId"], sanitize_name(ai_match["name"])]
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
    for param_dir in sorted((ob_file_root / route_prefix).glob("0x*")):
        if not param_dir.is_dir():
            continue
        hash_name = normalize_hash_name(param_dir.name)
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


def build_ob_structure_entries(
    ob_file_root: Path | None,
    ai_names: dict[str, dict[str, Any]],
    existing_hashes: set[str],
) -> list[dict[str, Any]]:
    if not ob_file_root or not ob_file_root.exists():
        return []
    entries: list[dict[str, Any]] = []
    for structure_path in sorted(ob_file_root.glob("*/*_structure.json")):
        hash_name = normalize_hash_name(structure_path.name)
        if not hash_name or hash_name in existing_hashes:
            continue
        route_prefix = structure_path.parent.name.lower()
        try:
            text = structure_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        ai_match = best_ai_name_from_text(text, ai_names)
        if not ai_match:
            continue
        name = sanitize_name(ai_match["name"])
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
                "aliases": sorted({ai_match["fullId"], name}),
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
    for structure_path in sorted(ob_file_root.glob("*/*_structure*.json")):
        hash_name = normalize_hash_name(structure_path.name)
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
        "inferred-ob-ai-string": 1,
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
        parts = package_path.split("/")[1:]
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
    entries = make_route_names_unique(
        dedupe_entries([*meta_entries, *ob_unit_entries, *ob_param_entries, *manual_entries, *ob_entries])
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
