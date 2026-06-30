#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


HASH_RE = re.compile(r"(?:0x)?([0-9a-fA-F]{8})")
FHM2D_FILE_RE = re.compile(r"^(0x[0-9a-fA-F]{8})\.fhm2d$", re.IGNORECASE)
HASH_SUFFIX_RE = re.compile(r"_[0-9a-f]{8}$", re.IGNORECASE)
GENERIC_GUI_HASH_NAME_RE = re.compile(r"^(?:image|flash|font)_[0-9a-f]{8}$", re.IGNORECASE)
VALID_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")

CONFIDENCE_SCORE = {
    "exact-meta-path": 5,
    "ob-unit-list": 4,
    "ob-param-unit-id": 3,
    "manual-research-note": 3,
    "manual-override": 3,
    "ob-dplcache-internal": 2,
    "inferred-ob-ai-string": 1,
    "ob-dplcache-fallback": 0,
}


def normalize_hash_name(value: str | None) -> str | None:
    if not value:
        return None
    match = HASH_RE.search(value)
    if not match:
        return None
    return f"0x{match.group(1).upper()}"


def load_mapping(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def build_mapping_index(entries: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    by_hash: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in entries:
        hash_name = normalize_hash_name(str(entry.get("hashName") or ""))
        if hash_name:
            by_hash[hash_name].append(entry)
    return by_hash


def iter_fhm2d_files(root: Path, recursive: bool) -> list[dict[str, Any]]:
    pattern = "**/*.fhm2d" if recursive else "*.fhm2d"
    files: list[dict[str, Any]] = []
    for path in sorted(root.glob(pattern), key=lambda item: str(item).lower()):
        if not path.is_file():
            continue
        match = FHM2D_FILE_RE.match(path.name)
        if not match:
            continue
        files.append(
            {
                "hashName": normalize_hash_name(match.group(1)),
                "path": str(path),
                "relativePath": str(path.relative_to(root)),
                "sizeBytes": path.stat().st_size,
            }
        )
    return files


def confidence_score(entry: dict[str, Any]) -> int:
    return CONFIDENCE_SCORE.get(str(entry.get("confidence") or ""), 0)


def best_entry(entries: list[dict[str, Any]]) -> dict[str, Any]:
    return max(
        entries,
        key=lambda entry: (
            confidence_score(entry),
            int(entry.get("matchedPathCount") or 0),
            int(entry.get("sourcePathCount") or 0),
            str(entry.get("name") or ""),
        ),
    )


def compact_entry(entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "hashName": entry.get("hashName"),
        "name": entry.get("name"),
        "routePrefix": entry.get("routePrefix"),
        "routeId": entry.get("routeId"),
        "source": entry.get("source"),
        "confidence": entry.get("confidence"),
        "packagePath": entry.get("packagePath"),
        "sourcePathCount": entry.get("sourcePathCount"),
        "matchedPathCount": entry.get("matchedPathCount"),
    }


def fallback_reason(entry: dict[str, Any]) -> str:
    evidence = entry.get("evidence") if isinstance(entry.get("evidence"), dict) else {}
    error = str(evidence.get("error") or "")
    if error:
        return f"parse-error: {error}"
    file_count = evidence.get("fileCount")
    type_counts = evidence.get("typeCounts") if isinstance(evidence.get("typeCounts"), dict) else {}
    if file_count == 0:
        return "empty-package"
    if type_counts and set(type_counts) == {".bin"}:
        return f"pure-bin:{file_count}"
    return "no-usable-internal-name"


def compact_fallback_entry(entry: dict[str, Any]) -> dict[str, Any]:
    evidence = entry.get("evidence") if isinstance(entry.get("evidence"), dict) else {}
    return {
        **compact_entry(entry),
        "fallbackReason": fallback_reason(entry),
        "fileCount": evidence.get("fileCount"),
        "typeCounts": evidence.get("typeCounts"),
        "sizeBytes": evidence.get("sizeBytes"),
    }


def is_hash_suffix_name(entry: dict[str, Any]) -> bool:
    name = str(entry.get("name") or "")
    return bool(HASH_SUFFIX_RE.search(name))


def is_generic_gui_hash_name(entry: dict[str, Any]) -> bool:
    if str(entry.get("routePrefix") or "").lower() != "009gui":
        return False
    return bool(GENERIC_GUI_HASH_NAME_RE.match(str(entry.get("name") or "")))


def has_valid_name(entry: dict[str, Any]) -> bool:
    return bool(VALID_NAME_RE.match(str(entry.get("name") or "")))


def duplicate_route_names(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for entry in entries:
        route = str(entry.get("routeId") or entry.get("routePrefix") or "")
        name = str(entry.get("name") or "")
        if route and name:
            grouped[(route, name)].append(entry)
    duplicates: list[dict[str, Any]] = []
    for (route, name), items in sorted(grouped.items()):
        if len(items) <= 1:
            continue
        duplicates.append(
            {
                "route": route,
                "name": name,
                "count": len(items),
                "hashes": [item.get("hashName") for item in items],
            }
        )
    return duplicates


def count_metadata_source_paths(
    meta_root: Path | None,
    mapping_index: dict[str, list[dict[str, Any]]] | None,
) -> dict[str, Any] | None:
    if not meta_root:
        return None
    if not meta_root.exists():
        return {"path": str(meta_root), "exists": False}
    meta_file_re = re.compile(r"^0x[0-9a-fA-F]{8}(?:_meta\.bin|\.fhm2d_metabody\.bin)$")
    ascii_re = re.compile(rb"[\x20-\x7e]{4,}")
    total = 0
    with_source_paths = 0
    source_path_string_count = 0
    unique_source_paths: set[str] = set()
    without_source_path_samples: list[str] = []
    with_source_path_no_mapping_samples: list[dict[str, Any]] = []
    with_source_path_no_exact_samples: list[dict[str, Any]] = []
    with_source_path_no_mapping_count = 0
    with_source_path_no_exact_count = 0
    for path in sorted(meta_root.iterdir(), key=lambda item: item.name.lower()):
        if not path.is_file():
            continue
        match = meta_file_re.match(path.name)
        if not match:
            continue
        total += 1
        try:
            data = path.read_bytes()
        except OSError:
            continue
        hash_name = normalize_hash_name(match.group(0))
        source_paths: list[str] = []
        for match in ascii_re.finditer(data):
            text = match.group(0).decode("ascii", errors="ignore").replace("\\", "/")
            lower = text.lower()
            if "/app/data/" in lower or lower.startswith("x64/"):
                source_paths.append(text)
        if source_paths:
            with_source_paths += 1
            source_path_string_count += len(source_paths)
            unique_source_paths.update(source_paths)
            mapped_entries = mapping_index.get(hash_name, []) if mapping_index and hash_name else []
            if mapping_index is not None and not mapped_entries:
                with_source_path_no_mapping_count += 1
                if len(with_source_path_no_mapping_samples) < 20:
                    with_source_path_no_mapping_samples.append(
                        {
                            "metadata": path.name,
                            "hashName": hash_name,
                            "sourcePathSamples": source_paths[:3],
                        }
                    )
            elif mapping_index is not None and not any(
                str(entry.get("confidence") or "") == "exact-meta-path" for entry in mapped_entries
            ):
                with_source_path_no_exact_count += 1
                if len(with_source_path_no_exact_samples) < 20:
                    with_source_path_no_exact_samples.append(
                        {
                            "metadata": path.name,
                            "hashName": hash_name,
                            "mappedEntries": [compact_entry(entry) for entry in mapped_entries],
                            "sourcePathSamples": source_paths[:3],
                        }
                    )
        elif len(without_source_path_samples) < 20:
            without_source_path_samples.append(path.name)
    return {
        "path": str(meta_root),
        "exists": True,
        "metadataFileCount": total,
        "metadataWithSourcePathCount": with_source_paths,
        "metadataWithoutSourcePathCount": total - with_source_paths,
        "metadataSourcePathStringCount": source_path_string_count,
        "metadataUniqueSourcePathCount": len(unique_source_paths),
        "metadataWithSourcePathNoMappingCount": with_source_path_no_mapping_count,
        "metadataWithSourcePathNoExactMetaEntryCount": with_source_path_no_exact_count,
        "metadataWithoutSourcePathSamples": without_source_path_samples,
        "metadataWithSourcePathNoMappingSamples": with_source_path_no_mapping_samples,
        "metadataWithSourcePathNoExactMetaEntrySamples": with_source_path_no_exact_samples,
    }


def sample(items: list[Any], limit: int) -> list[Any]:
    return items[: max(0, limit)]


def load_generator_parser() -> Any:
    parser_path = Path(__file__).with_name("build_fhm2d_name_mapping.py")
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec = importlib.util.spec_from_file_location("build_fhm2d_name_mapping_for_validation", parser_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Failed to load parser module: {parser_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.dont_write_bytecode = previous


def audit_ob_fhm2d_parse(ob_files: list[dict[str, Any]], verify_record_data: bool, sample_limit: int) -> dict[str, Any]:
    parser = load_generator_parser()
    type_counts: Counter[str] = Counter()
    parsed_count = 0
    parse_failures: list[dict[str, Any]] = []
    record_data_failures: list[dict[str, Any]] = []
    total_records = 0
    total_named_records = 0

    for ob_file in ob_files:
        path = Path(ob_file["path"])
        try:
            type_list, records, body = parser.parse_ob_fhm2d_records(path)
        except Exception as exc:
            if len(parse_failures) < sample_limit:
                parse_failures.append({**ob_file, "error": str(exc)})
            continue

        parsed_count += 1
        total_records += len(records)
        type_counts.update(type_list)
        total_named_records += sum(1 for record in records if str(record.get("fileType") or "") != ".bin")

        if verify_record_data:
            for record in records:
                try:
                    parser.extract_ob_record_data(record, body)
                except Exception as exc:
                    if len(record_data_failures) < sample_limit:
                        record_data_failures.append(
                            {
                                **ob_file,
                                "recordIndex": record.get("index"),
                                "fileIndex": record.get("fileIndex"),
                                "fileType": record.get("fileType"),
                                "error": str(exc),
                            }
                        )
                    break

    return {
        "enabled": True,
        "verifyRecordData": verify_record_data,
        "parsedFileCount": parsed_count,
        "parseFailureCount": len(ob_files) - parsed_count,
        "totalRecordCount": total_records,
        "totalNonBinRecordCount": total_named_records,
        "typeCounts": dict(sorted(type_counts.items())),
        "parseFailureSamples": parse_failures,
        "recordDataFailureCount": len(record_data_failures),
        "recordDataFailureSamples": record_data_failures,
    }


def build_report(args: argparse.Namespace) -> dict[str, Any]:
    mapping_path = Path(args.mapping)
    ob_root = Path(args.ob_root)
    mapping = load_mapping(mapping_path)
    entries = mapping.get("entries")
    if not isinstance(entries, list):
        raise ValueError(f"Mapping file has no entries array: {mapping_path}")

    index = build_mapping_index(entries)
    ob_files = iter_fhm2d_files(ob_root, recursive=not args.no_recursive)
    duplicate_ob_hashes = [
        {"hashName": hash_name, "paths": [item["relativePath"] for item in items]}
        for hash_name, items in sorted(group_by_hash(ob_files).items())
        if len(items) > 1
    ]

    missing_files: list[dict[str, Any]] = []
    mapped_hashes: set[str] = set()
    mapped_best_entries: list[dict[str, Any]] = []
    mapped_all_entries: list[dict[str, Any]] = []

    for ob_file in ob_files:
        hash_name = ob_file["hashName"]
        mapped_entries = index.get(hash_name, [])
        if not mapped_entries:
            missing_files.append(ob_file)
            continue
        mapped_hashes.add(hash_name)
        mapped_best_entries.append(best_entry(mapped_entries))
        mapped_all_entries.extend(mapped_entries)

    hash_suffix_entries = [entry for entry in mapped_all_entries if is_hash_suffix_name(entry)]
    generic_gui_entries = [entry for entry in mapped_all_entries if is_generic_gui_hash_name(entry)]
    invalid_name_entries = [entry for entry in mapped_all_entries if not has_valid_name(entry)]
    dplcache_fallback_entries = [
        entry for entry in mapped_best_entries if str(entry.get("confidence") or "") == "ob-dplcache-fallback"
    ]
    route_name_duplicates = duplicate_route_names(entries)

    source_counts = Counter(str(entry.get("source") or "") for entry in mapped_best_entries)
    confidence_counts = Counter(str(entry.get("confidence") or "") for entry in mapped_best_entries)
    route_counts = Counter(str(entry.get("routePrefix") or "") for entry in mapped_best_entries)

    report = {
        "mappingPath": str(mapping_path),
        "obRoot": str(ob_root),
        "mappingStats": mapping.get("stats", {}),
        "obFileCount": len(ob_files),
        "obUniqueHashCount": len({item["hashName"] for item in ob_files}),
        "obDuplicateHashCount": len(duplicate_ob_hashes),
        "mappedHashCount": len(mapped_hashes),
        "missingHashCount": len(missing_files),
        "mappedCoveragePercent": round((len(mapped_hashes) / len(ob_files) * 100), 2) if ob_files else 0.0,
        "hashSuffixEntryCount": len(hash_suffix_entries),
        "genericGuiHashNameCount": len(generic_gui_entries),
        "invalidNameEntryCount": len(invalid_name_entries),
        "duplicateRouteNameGroupCount": len(route_name_duplicates),
        "sourceCounts": dict(sorted(source_counts.items())),
        "confidenceCounts": dict(sorted(confidence_counts.items())),
        "routeCounts": dict(sorted(route_counts.items())),
        "dplcacheFallbackReasonCounts": dict(
            sorted(Counter(fallback_reason(entry) for entry in dplcache_fallback_entries).items())
        ),
        "missingSamples": sample(missing_files, args.sample_limit),
        "hashSuffixSamples": sample([compact_entry(entry) for entry in hash_suffix_entries], args.sample_limit),
        "genericGuiHashNameSamples": sample([compact_entry(entry) for entry in generic_gui_entries], args.sample_limit),
        "invalidNameSamples": sample([compact_entry(entry) for entry in invalid_name_entries], args.sample_limit),
        "dplcacheFallbackSamples": sample(
            [compact_fallback_entry(entry) for entry in dplcache_fallback_entries],
            args.sample_limit,
        ),
        "duplicateRouteNameSamples": sample(route_name_duplicates, args.sample_limit),
        "duplicateObHashSamples": sample(duplicate_ob_hashes, args.sample_limit),
        "metadataAudit": count_metadata_source_paths(Path(args.meta_root) if args.meta_root else None, index),
    }
    if args.verify_ob_parse or args.verify_ob_record_data:
        report["obFhm2dParseAudit"] = audit_ob_fhm2d_parse(
            ob_files,
            verify_record_data=args.verify_ob_record_data,
            sample_limit=args.sample_limit,
        )
    return report


def group_by_hash(ob_files: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in ob_files:
        grouped[item["hashName"]].append(item)
    return grouped


def print_counter(title: str, values: dict[str, int], limit: int = 20) -> None:
    print(f"{title}:")
    for key, count in sorted(values.items(), key=lambda item: (-item[1], item[0]))[:limit]:
        print(f"  {key or '<none>'}: {count}")


def print_report(report: dict[str, Any], sample_limit: int) -> None:
    print("FHM2D name mapping validation")
    print(f"  mapping: {report['mappingPath']}")
    print(f"  obRoot:  {report['obRoot']}")
    print(f"  OB files: {report['obFileCount']}")
    print(f"  mapped hashes: {report['mappedHashCount']} ({report['mappedCoveragePercent']}%)")
    print(f"  missing hashes: {report['missingHashCount']}")
    print(f"  hash-suffix mapped entries: {report['hashSuffixEntryCount']}")
    print(f"  generic GUI hash names: {report['genericGuiHashNameCount']}")
    print(f"  invalid mapped names: {report['invalidNameEntryCount']}")
    print(f"  duplicate route/name groups: {report['duplicateRouteNameGroupCount']}")
    print()
    print_counter("Sources for mapped OB hashes", report["sourceCounts"])
    print_counter("Routes for mapped OB hashes", report["routeCounts"])
    fallback_reasons = report.get("dplcacheFallbackReasonCounts") or {}
    if fallback_reasons:
        print_counter("OB dplcache fallback reasons", fallback_reasons)
    print()

    for title, key in (
        ("Missing samples", "missingSamples"),
        ("Hash-suffix name samples", "hashSuffixSamples"),
        ("Generic GUI hash-name samples", "genericGuiHashNameSamples"),
        ("Invalid name samples", "invalidNameSamples"),
        ("OB dplcache fallback samples", "dplcacheFallbackSamples"),
    ):
        values = report.get(key) or []
        if not values:
            continue
        print(f"{title} (first {min(sample_limit, len(values))}):")
        for item in values:
            print(f"  {json.dumps(item, ensure_ascii=False)}")
        print()

    metadata_audit = report.get("metadataAudit")
    if metadata_audit:
        print("Metadata audit:")
        print(f"  path: {metadata_audit.get('path')}")
        if not metadata_audit.get("exists"):
            print("  exists: false")
        else:
            print(f"  files: {metadata_audit.get('metadataFileCount')}")
            print(f"  with source paths: {metadata_audit.get('metadataWithSourcePathCount')}")
            print(f"  without source paths: {metadata_audit.get('metadataWithoutSourcePathCount')}")
            print(f"  source path strings: {metadata_audit.get('metadataSourcePathStringCount')}")
            print(f"  unique source paths: {metadata_audit.get('metadataUniqueSourcePathCount')}")
            print(
                "  source-path files without any generated mapping: "
                f"{metadata_audit.get('metadataWithSourcePathNoMappingCount')}"
            )
            print(
                "  source-path files mapped by non-exact sources: "
                f"{metadata_audit.get('metadataWithSourcePathNoExactMetaEntryCount')}"
            )
            without_source_samples = metadata_audit.get("metadataWithoutSourcePathSamples") or []
            if without_source_samples:
                print(f"  without-source samples: {', '.join(without_source_samples[:sample_limit])}")

    parse_audit = report.get("obFhm2dParseAudit")
    if parse_audit:
        print()
        print("OB FHM2D parse audit:")
        print(f"  parsed files: {parse_audit.get('parsedFileCount')}")
        print(f"  parse failures: {parse_audit.get('parseFailureCount')}")
        print(f"  total records: {parse_audit.get('totalRecordCount')}")
        print(f"  non-bin records: {parse_audit.get('totalNonBinRecordCount')}")
        print(f"  record data verification: {parse_audit.get('verifyRecordData')}")
        if parse_audit.get("recordDataFailureCount") is not None:
            print(f"  record data failures: {parse_audit.get('recordDataFailureCount')}")
        type_counts = parse_audit.get("typeCounts") or {}
        if type_counts:
            print_counter("OB FHM2D parsed record types", type_counts)


def threshold_failures(report: dict[str, Any], args: argparse.Namespace) -> list[str]:
    failures: list[str] = []
    if args.fail_on_missing and report["missingHashCount"] > 0:
        failures.append(f"missing hashes: {report['missingHashCount']}")
    if args.fail_on_hash_suffix and report["hashSuffixEntryCount"] > 0:
        failures.append(f"hash-suffix names: {report['hashSuffixEntryCount']}")
    if args.fail_on_generic_gui and report["genericGuiHashNameCount"] > 0:
        failures.append(f"generic GUI hash names: {report['genericGuiHashNameCount']}")
    if args.max_missing is not None and report["missingHashCount"] > args.max_missing:
        failures.append(f"missing hashes {report['missingHashCount']} > {args.max_missing}")
    if args.max_hash_suffix is not None and report["hashSuffixEntryCount"] > args.max_hash_suffix:
        failures.append(f"hash-suffix names {report['hashSuffixEntryCount']} > {args.max_hash_suffix}")
    if args.max_generic_gui is not None and report["genericGuiHashNameCount"] > args.max_generic_gui:
        failures.append(f"generic GUI hash names {report['genericGuiHashNameCount']} > {args.max_generic_gui}")
    if args.max_invalid_names is not None and report["invalidNameEntryCount"] > args.max_invalid_names:
        failures.append(f"invalid names {report['invalidNameEntryCount']} > {args.max_invalid_names}")
    parse_audit = report.get("obFhm2dParseAudit") or {}
    if args.max_ob_parse_failures is not None and parse_audit.get("parseFailureCount", 0) > args.max_ob_parse_failures:
        failures.append(f"OB parse failures {parse_audit.get('parseFailureCount')} > {args.max_ob_parse_failures}")
    if (
        args.max_ob_record_data_failures is not None
        and parse_audit.get("recordDataFailureCount", 0) > args.max_ob_record_data_failures
    ):
        failures.append(
            f"OB record data failures {parse_audit.get('recordDataFailureCount')} > "
            f"{args.max_ob_record_data_failures}"
        )
    return failures


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Validate the generated FHM2D name mapping against real OB .fhm2d files.")
    parser.add_argument("--mapping", default="src/assets/fhm2d-name-map.generated.json", help="Generated mapping JSON path.")
    parser.add_argument("--ob-root", required=True, help="Real OB dplcache_release root containing 0xHASH.fhm2d files.")
    parser.add_argument("--meta-root", help="Optional EXVS2 metadata root to audit for source-path coverage.")
    parser.add_argument("--report-json", help="Optional JSON report output path.")
    parser.add_argument("--sample-limit", type=int, default=30, help="Maximum sample rows printed or written per issue type.")
    parser.add_argument("--no-recursive", action="store_true", help="Only scan .fhm2d files directly under --ob-root.")
    parser.add_argument("--fail-on-missing", action="store_true", help="Exit non-zero when any OB hash is missing from the mapping.")
    parser.add_argument("--fail-on-hash-suffix", action="store_true", help="Exit non-zero when mapped names still end in an 8-hex hash suffix.")
    parser.add_argument("--fail-on-generic-gui", action="store_true", help="Exit non-zero when GUI names are still image_HASH/flash_HASH/font_HASH.")
    parser.add_argument("--max-missing", type=int, help="Exit non-zero when missing hashes exceed this count.")
    parser.add_argument("--max-hash-suffix", type=int, help="Exit non-zero when hash-suffix names exceed this count.")
    parser.add_argument("--max-generic-gui", type=int, help="Exit non-zero when generic GUI hash names exceed this count.")
    parser.add_argument("--max-invalid-names", type=int, help="Exit non-zero when invalid mapped names exceed this count.")
    parser.add_argument(
        "--verify-ob-parse",
        action="store_true",
        help="Parse every real OB .fhm2d metadata/record table with the generator parser.",
    )
    parser.add_argument(
        "--verify-ob-record-data",
        action="store_true",
        help="Also decompress/copy every parsed OB subfile payload. This implies --verify-ob-parse and can be slow.",
    )
    parser.add_argument("--max-ob-parse-failures", type=int, help="Exit non-zero when OB parser failures exceed this count.")
    parser.add_argument(
        "--max-ob-record-data-failures",
        type=int,
        help="Exit non-zero when OB record payload verification failures exceed this count.",
    )
    args = parser.parse_args()

    report = build_report(args)
    print_report(report, args.sample_limit)

    if args.report_json:
        output = Path(args.report_json)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote report JSON: {output}")

    failures = threshold_failures(report, args)
    if failures:
        print("Validation failed:")
        for failure in failures:
            print(f"  {failure}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
