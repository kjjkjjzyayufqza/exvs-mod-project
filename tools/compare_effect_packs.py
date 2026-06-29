#!/usr/bin/env python3
"""Compare two effect folder packs on disk (structure JSON + files)."""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path


def load_structure(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def resolve_entries(struct_path: Path) -> list[dict]:
    data = load_structure(struct_path)
    json_dir = struct_path.parent
    entries: list[dict] = []
    for entry in data.get("SubFileData", []):
        url = entry.get("fileUrl", "")
        rel = url.replace("\\", "/").lstrip("./")
        file_path = json_dir / rel.replace("/", os.sep)
        exists = file_path.is_file()
        entries.append(
            {
                "fileIndex": entry.get("fileIndex"),
                "fileType": entry.get("fileType"),
                "fileUrl": url,
                "fileBaseName": entry.get("fileBaseName", ""),
                "path": file_path,
                "exists": exists,
                "size": file_path.stat().st_size if exists else None,
            }
        )
    return entries


def structure_item_count(data: dict) -> int:
    count = 0
    for entry in data.get("SubFileStructure", []):
        if isinstance(entry, dict) and "fileIndex" in entry:
            count += 1
    return count


def md5_file(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def validate_structure_json(data: dict, label: str) -> list[str]:
    issues: list[str] = []
    required = ["SubFileData", "SubFileStructure"]
    for key in required:
        if key not in data:
            issues.append(f"{label}: missing top-level key {key}")
    sub_data = data.get("SubFileData")
    if not isinstance(sub_data, list):
        issues.append(f"{label}: SubFileData is not an array")
    else:
        indices = [e.get("fileIndex") for e in sub_data if isinstance(e, dict)]
        if len(indices) != len(set(indices)):
            issues.append(f"{label}: duplicate fileIndex in SubFileData")
        fhm = data.get("Fhm2dTotalCount")
        if isinstance(fhm, int) and fhm != len(sub_data):
            issues.append(f"{label}: Fhm2dTotalCount={fhm} but SubFileData len={len(sub_data)}")
    sub_struct = data.get("SubFileStructure")
    if not isinstance(sub_struct, list):
        issues.append(f"{label}: SubFileStructure is not an array")
    return issues


def main() -> int:
    src_json = Path(r"E:\XB\解包\com\file\006effect\0xF6954689_structure.json")
    dst_json = Path(r"E:\XB\解包\com\file\006effect\0xB0476F04_structure.json")

    if not src_json.is_file() or not dst_json.is_file():
        print("Structure JSON missing.", file=sys.stderr)
        return 1

    src_data = load_structure(src_json)
    dst_data = load_structure(dst_json)
    src_entries = resolve_entries(src_json)
    dst_entries = resolve_entries(dst_json)

    print("=== PACK SUMMARY ===")
    print(f"Source: {src_json.parent.name}")
    print(f"  SubFileData entries: {len(src_entries)}")
    print(f"  Fhm2dTotalCount: {src_data.get('Fhm2dTotalCount')}")
    print(f"  SubFileStructure item nodes: {structure_item_count(src_data)}")
    print(f"  On-disk files under folder: {sum(1 for _ in src_json.parent.rglob('*') if _.is_file())}")

    print(f"Dest: {dst_json.parent.name}")
    print(f"  SubFileData entries: {len(dst_entries)}")
    print(f"  Fhm2dTotalCount: {dst_data.get('Fhm2dTotalCount')}")
    print(f"  SubFileStructure item nodes: {structure_item_count(dst_data)}")
    print(f"  On-disk files under folder: {sum(1 for _ in dst_json.parent.rglob('*') if _.is_file())}")

    print("\n=== JSON VALIDATION ===")
    for label, data in [("source", src_data), ("dest", dst_data)]:
        issues = validate_structure_json(data, label)
        if issues:
            for issue in issues:
                print(f"  FAIL: {issue}")
        else:
            print(f"  {label}: basic structure OK")

    # Try strict JSON re-parse
    for label, path in [("source", src_json), ("dest", dst_json)]:
        try:
            json.loads(path.read_text(encoding="utf-8"))
            print(f"  {label}: valid JSON syntax")
        except json.JSONDecodeError as exc:
            print(f"  {label}: JSON parse error: {exc}")

    src_missing = [e for e in src_entries if not e["exists"]]
    dst_missing = [e for e in dst_entries if not e["exists"]]
    print(f"\n=== MISSING ON DISK ===")
    print(f"  source: {len(src_missing)}")
    for e in src_missing[:10]:
        print(f"    - {e['path']}")
    print(f"  dest: {len(dst_missing)}")
    for e in dst_missing[:10]:
        print(f"    - {e['path']}")

    src_by_name: dict[str, list[dict]] = {}
    for entry in src_entries:
        name = entry["path"].name.lower()
        src_by_name.setdefault(name, []).append(entry)

    dst_by_name: dict[str, list[dict]] = {}
    for entry in dst_entries:
        name = entry["path"].name.lower()
        dst_by_name.setdefault(name, []).append(entry)

    not_in_dst = sorted(name for name in src_by_name if name not in dst_by_name)
    same_content: list[str] = []
    diff_content: list[tuple[str, str, str]] = []

    for name in sorted(src_by_name):
        if name not in dst_by_name:
            continue
        sp = src_by_name[name][0]["path"]
        dp = dst_by_name[name][0]["path"]
        if sp.is_file() and dp.is_file():
            sh = md5_file(sp)
            dh = md5_file(dp)
            if sh == dh:
                same_content.append(name)
            else:
                diff_content.append((name, sh[:12], dh[:12]))

    print(f"\n=== SOURCE -> DEST (by filename in SubFileData) ===")
    print(f"  Source unique filenames: {len(src_by_name)}")
    print(f"  Present in dest with same content: {len(same_content)}")
    print(f"  Present in dest but different content: {len(diff_content)}")
    print(f"  Not referenced in dest SubFileData: {len(not_in_dst)}")

    if not_in_dst:
        print("\n  Not in dest:")
        for name in not_in_dst:
            print(f"    - {name}")

    if diff_content:
        print("\n  Content differs:")
        for name, sh, dh in diff_content:
            print(f"    - {name}: src={sh} dst={dh}")

    # unk3 hash match for items in structure
    def structure_hashes(data: dict) -> set[int]:
        out: set[int] = set()
        for entry in data.get("SubFileStructure", []):
            if isinstance(entry, dict):
                if "unk3" in entry and "fileIndex" in entry:
                    out.add(int(entry["unk3"]))
                if "unk5" in entry:
                    out.add(int(entry["unk5"]))
        return out

    src_hashes = structure_hashes(src_data)
    dst_hashes = structure_hashes(dst_data)
    missing_hashes = sorted(src_hashes - dst_hashes)
    print(f"\n=== STRUCTURE HASH COVERAGE (unk3/unk5) ===")
    print(f"  Source structure hashes: {len(src_hashes)}")
    print(f"  Also in dest structure: {len(src_hashes & dst_hashes)}")
    print(f"  Missing from dest structure: {len(missing_hashes)}")
    for h in missing_hashes[:20]:
        print(f"    - {h} (0x{h & 0xFFFFFFFF:08X})")

    all_copied = len(not_in_dst) == 0 and len(diff_content) == 0 and len(src_missing) == 0
    print(f"\n=== VERDICT ===")
    if all_copied and len(missing_hashes) == 0:
        print("All source SubFileData files appear copied to dest with matching content.")
    else:
        print("NOT a complete 1:1 copy of source pack into dest (see gaps above).")
        print("Note: Copy only adds SELECTED entries + dependencies; dest may also have pre-existing files.")

    # Deep check: each source file on dest disk by basename
    src_dir = Path(r"E:\XB\解包\com\file\006effect\0xF6954689")
    dst_dir = Path(r"E:\XB\解包\com\file\006effect\0xB0476F04")
    base = Path(r"E:\XB\解包\com\file\006effect")

    print(f"\n=== PER-FILE DISK CHECK (source -> dest folder) ===")
    print(f"  Source pack on-disk file count: {sum(1 for _ in src_dir.rglob('*') if _.is_file())}")
    print(f"  Dest pack on-disk file count: {sum(1 for _ in dst_dir.rglob('*') if _.is_file())}")

    missing_disk: list[str] = []
    on_disk_not_in_json: list[str] = []
    content_diff: list[str] = []
    content_same: list[str] = []

    for entry in src_data.get("SubFileData", []):
        rel = entry.get("fileUrl", "").replace("\\", "/").lstrip("./")
        sp = base / rel.replace("/", os.sep)
        fn = sp.name
        matches = list(dst_dir.rglob(fn))
        in_dst_json = any(
            entry.get("fileBaseName", "") == d.get("fileBaseName", "")
            or fn in d.get("fileUrl", "")
            for d in dst_data.get("SubFileData", [])
        )
        if not matches:
            missing_disk.append(fn)
            print(f"  MISSING on dest disk: {fn} (fileIndex={entry.get('fileIndex')})")
            continue
        dp = matches[0]
        if sp.is_file() and dp.is_file():
            if md5_file(sp) == md5_file(dp):
                content_same.append(fn)
            else:
                content_diff.append(fn)
                print(f"  CONTENT DIFF: {fn}")
        if not in_dst_json:
            on_disk_not_in_json.append(fn)
            print(f"  ON DISK but NOT in dest JSON: {fn} -> {dp.relative_to(base)}")

    print(f"\n  same_content={len(content_same)} content_diff={len(content_diff)}")
    print(f"  missing_on_dest_disk={len(missing_disk)} on_disk_not_in_json={len(on_disk_not_in_json)}")

    # Check 25.efxbn specifically
    efx = src_dir / "0" / "0" / "25.efxbn"
    print(f"\n=== 25.efxbn detail ===")
    print(f"  Source path: {efx} exists={efx.is_file()}")
    if efx.is_file():
        print(f"  Source size={efx.stat().st_size} md5={md5_file(efx)[:16]}")
    dst_efx = list(dst_dir.rglob("25.efxbn"))
    print(f"  Dest matches for 25.efxbn: {[str(p.relative_to(base)) for p in dst_efx]}")
    # Check by hash unk3=318410415 (0x12F5E2EF?)
    h = 318410415
    print(f"  unk3 hash: {h} (0x{h & 0xFFFFFFFF:08X}, int32={h if h < 2**31 else h - 2**32})")
    for d in dst_data.get("SubFileData", []):
        if d.get("fileType") == ".efxbn" and "25" in d.get("fileUrl", ""):
            print(f"  dest efxbn ref: {d}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
