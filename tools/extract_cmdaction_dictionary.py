"""Extract the VDK::GAM CmdAction dictionary from the OB v27 arcade binary.

The CmdAction framework is compiled C++, not a data file: every weapon /
projectile behaviour is a `CCmdActionManager_<series>_<unit>_<variant>_<weapon>`
subclass that builds a tree of `CCmdAction_*` step objects. None of that is
editable through the game's archives, but the binary still carries the full
RTTI surface plus a pool of Japanese designer labels that the release build no
longer references.

This script derives metadata only:

  * manager class names, parsed into series / unit / variant / weapon
  * which `CCmdAction_*` step types each manager constructs
  * the leaf step class list
  * the Japanese `<description>(<helper>)` label pool

It emits no disassembly, no decompiler output, and no binary content.

Usage:
    python tools/extract_cmdaction_dictionary.py <path-to-exe> <output-dir>
"""

from __future__ import annotations

import bisect
import json
import re
import struct
import sys
from collections import defaultdict
from pathlib import Path

# Complete object locator signature for x64 MSVC RTTI.
COL_SIGNATURE_X64 = 1

# RIP-relative ModRM bytes for `lea <reg>, [rip+disp32]`.
MODRM_RIP = frozenset({0x05, 0x0D, 0x15, 0x1D, 0x25, 0x2D, 0x35, 0x3D})

# REX prefixes that select a 64-bit destination register for the lea above.
REX_W = frozenset({0x48, 0x4C})

TYPE_DESCRIPTOR_RE = re.compile(rb"\.\?A[VU][A-Za-z0-9_@$?<>\-]{3,400}@@")

MANAGER_RE = re.compile(
    r"^CCmdActionManager_(\d{3}[A-Z0-9]+)_(\d{3}[A-Z0-9]+)_(\d{3})_(.+)$"
)

# "<japanese description>（<CppIdentifier>）"
LABEL_RE = re.compile(r"^(.+)（([A-Za-z_][A-Za-z0-9_]*)）$")

FULLWIDTH_LPAREN = "（".encode("utf-8")


class Image:
    """Minimal PE view: section table plus RVA/offset translation."""

    def __init__(self, path: Path) -> None:
        self.data = path.read_bytes()
        pe = struct.unpack_from("<I", self.data, 0x3C)[0]
        if self.data[pe:pe + 4] != b"PE\0\0":
            raise ValueError(f"{path} is not a PE image")
        section_count = struct.unpack_from("<H", self.data, pe + 6)[0]
        opt_size = struct.unpack_from("<H", self.data, pe + 20)[0]
        self.base = struct.unpack_from("<Q", self.data, pe + 24 + 24)[0]
        self.sections = []
        for index in range(section_count):
            off = pe + 24 + opt_size + index * 40
            name = self.data[off:off + 8].rstrip(b"\0").decode("ascii")
            vsize, vaddr, rsize, raddr = struct.unpack_from("<IIII", self.data, off + 8)
            self.sections.append((name, vaddr, vsize, raddr, rsize))

    def section(self, name: str):
        for entry in self.sections:
            if entry[0] == name:
                return entry
        raise KeyError(f"section {name} not present")

    def rva_to_offset(self, rva: int) -> int:
        for _, vaddr, vsize, raddr, rsize in self.sections:
            if vaddr <= rva < vaddr + max(vsize, rsize):
                return raddr + (rva - vaddr)
        raise ValueError(f"rva 0x{rva:08X} is outside every section")

    def offset_to_rva(self, offset: int) -> int:
        for _, vaddr, _vsize, raddr, rsize in self.sections:
            if raddr <= offset < raddr + rsize:
                return vaddr + (offset - raddr)
        raise ValueError(f"file offset 0x{offset:08X} is outside every section")

    def maybe_offset_to_rva(self, offset: int):
        for _, vaddr, _vsize, raddr, rsize in self.sections:
            if raddr <= offset < raddr + rsize:
                return vaddr + (offset - raddr)
        return None


def read_type_descriptors(image: Image) -> dict[int, str]:
    """Map type-descriptor RVA to its mangled class name."""
    result = {}
    for match in TYPE_DESCRIPTOR_RE.finditer(image.data):
        rva = image.maybe_offset_to_rva(match.start() - 16)
        if rva is not None:
            result[rva] = match.group(0).decode("ascii")
    return result


def read_vtables(image: Image, type_descriptors: dict[int, str]) -> dict[int, str]:
    """Map vtable RVA to mangled class name via complete object locators."""
    _, rdata_va, _, rdata_ra, rdata_rs = image.section(".rdata")
    data = image.data

    locators = {}
    cursor = rdata_ra
    limit = rdata_ra + rdata_rs
    needle = struct.pack("<I", COL_SIGNATURE_X64)
    while True:
        cursor = data.find(needle, cursor, limit)
        if cursor < 0:
            break
        if cursor % 4 == 0 and cursor + 24 <= limit:
            _sig, _off, _cd, ptd, _pchd, pself = struct.unpack_from("<IIIIII", data, cursor)
            if ptd in type_descriptors and pself == image.maybe_offset_to_rva(cursor):
                locators[image.base + pself] = type_descriptors[ptd]
        cursor += 4

    vtables = {}
    view = memoryview(data)[rdata_ra:rdata_ra + (rdata_rs & ~7)].cast("Q")
    for index, value in enumerate(view):
        name = locators.get(value)
        if name is not None:
            vtables[rdata_va + (index + 1) * 8] = name
    return vtables


def read_function_ranges(image: Image) -> list[tuple[int, int]]:
    """Function [begin, end) RVAs from the .pdata exception table."""
    _, _, pdata_vs, pdata_ra, pdata_rs = image.section(".pdata")
    data = image.data
    ranges = []
    for off in range(pdata_ra, pdata_ra + min(pdata_vs, pdata_rs) - 11, 12):
        begin, stop, _unwind = struct.unpack_from("<III", data, off)
        if begin and stop > begin:
            ranges.append((begin, stop))
    ranges.sort()
    return ranges


def demangled_identifier(mangled: str) -> str:
    return mangled[4:].split("@", 1)[0]


def collect_slots(image: Image, vtable_rva: int, text_lo: int, text_hi: int) -> list[int]:
    """Virtual slots of one vtable, stopping at the first non-code entry."""
    offset = image.rva_to_offset(vtable_rva)
    slots = []
    for index in range(64):
        value = struct.unpack_from("<Q", image.data, offset + index * 8)[0]
        rva = value - image.base
        if not text_lo <= rva < text_hi:
            break
        slots.append(rva)
    return slots


def constructed_action_types(
    image: Image,
    ranges: list[tuple[int, int]],
    action_vtables: dict[int, str],
) -> list[str]:
    """Action classes a function instantiates, found via vtable stores."""
    data = image.data
    found = set()
    for begin, stop in ranges:
        base_off = image.rva_to_offset(begin)
        length = stop - begin
        cursor = 0
        while cursor < length - 7:
            if (
                data[base_off + cursor] in REX_W
                and data[base_off + cursor + 1] == 0x8D
                and data[base_off + cursor + 2] in MODRM_RIP
            ):
                disp = struct.unpack_from("<i", data, base_off + cursor + 3)[0]
                name = action_vtables.get(begin + cursor + 7 + disp)
                if name is not None:
                    found.add(name)
            cursor += 1
    return sorted(found)


def extract_labels(image: Image) -> list[dict]:
    """Japanese designer labels shaped '<description>（<helper>）' in .rdata."""
    _, _, _, rdata_ra, rdata_rs = image.section(".rdata")
    data = image.data
    labels = []
    cursor = rdata_ra
    limit = rdata_ra + rdata_rs
    while cursor < limit:
        if data[cursor] == 0:
            cursor += 1
            continue
        stop = data.index(b"\0", cursor)
        raw = data[cursor:stop]
        if 6 <= len(raw) <= 300 and FULLWIDTH_LPAREN in raw:
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                text = None
            if text is not None:
                match = LABEL_RE.match(text)
                if match is not None:
                    labels.append(
                        {
                            "rva": f"0x{image.offset_to_rva(cursor):08X}",
                            "text": text,
                            "description": match.group(1),
                            "helper": match.group(2),
                        }
                    )
        cursor = stop + 1
    return labels


def build_manager_dictionary(image: Image) -> tuple[list[dict], list[str]]:
    type_descriptors = read_type_descriptors(image)
    vtables = read_vtables(image, type_descriptors)
    ranges = read_function_ranges(image)
    starts = [entry[0] for entry in ranges]

    _, text_va, text_vs, _, _ = image.section(".text")
    text_lo, text_hi = text_va, text_va + text_vs

    action_vtables = {}
    for rva, mangled in vtables.items():
        identifier = demangled_identifier(mangled)
        if identifier.startswith("CCmdAction"):
            action_vtables[rva] = identifier

    slots_by_vtable = {}
    owners_by_slot = defaultdict(set)
    for rva, identifier in action_vtables.items():
        slots = collect_slots(image, rva, text_lo, text_hi)
        slots_by_vtable[rva] = slots
        for slot in set(slots):
            owners_by_slot[slot].add(identifier)

    def range_of(rva: int):
        index = bisect.bisect_right(starts, rva) - 1
        if index >= 0 and ranges[index][0] <= rva < ranges[index][1]:
            return ranges[index]
        return None

    merged: dict[str, dict] = {}
    for rva, identifier in action_vtables.items():
        if not identifier.startswith("CCmdActionManager_"):
            continue
        entry = merged.get(identifier)
        if entry is None:
            entry = {"class": identifier, "vtables": [], "own_methods": 0, "constructs": set()}
            match = MANAGER_RE.match(identifier)
            if match is not None:
                entry["series"] = match.group(1)
                entry["unit"] = match.group(2)
                entry["variant"] = match.group(3)
                entry["weapon"] = match.group(4)
            merged[identifier] = entry
        entry["vtables"].append(f"0x{rva:08X}")

        own = set()
        for slot in slots_by_vtable[rva]:
            if owners_by_slot[slot] != {identifier}:
                continue
            found = range_of(slot)
            if found is not None:
                own.add(found)
        entry["own_methods"] += len(own)
        entry["constructs"].update(
            constructed_action_types(image, sorted(own), action_vtables)
        )

    managers = []
    for identifier in sorted(merged):
        entry = merged[identifier]
        entry["vtables"] = sorted(set(entry["vtables"]))
        entry["constructs"] = sorted(entry["constructs"])
        managers.append(entry)

    steps = sorted(
        name for name in set(action_vtables.values())
        if not name.startswith("CCmdActionManager")
    )
    return managers, steps


def write_json(path: Path, payload) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )


def write_glossary(path: Path, labels: list[dict], binary: Path) -> None:
    """Render the label pool as a markdown glossary grouped by helper."""
    grouped: dict[str, list[dict]] = defaultdict(list)
    for label in labels:
        grouped[label["helper"]].append(label)

    lines = [
        "<!-- Generated by tools/extract_cmdaction_dictionary.py. Do not edit by hand. -->",
        "",
        "# CmdAction Step Glossary",
        "",
        f"**Binary:** `{binary.name}` (OB v27)",
        f"**Labels:** {len(labels)} across {len(grouped)} registration helpers",
        "",
        "Designer-facing step descriptions recovered from `.rdata`. Every label is",
        "shaped `<japanese description>（<registration helper>）`. The release build",
        "references none of them: the description argument was compiled out while the",
        "literals stayed in the object's `.rdata` contribution.",
        "",
        "The binding between a label and the exact `CCmdAction_*` node it named is not",
        "recoverable; labels are listed in `.rdata` order, which tracks source order",
        "within a translation unit.",
        "",
    ]
    for helper in sorted(grouped):
        entries = sorted(grouped[helper], key=lambda item: item["rva"])
        lines.append(f"## {helper}")
        lines.append("")
        lines.append("| RVA | 説明 |")
        lines.append("| --- | --- |")
        for entry in entries:
            description = entry["description"].replace("|", "\\|")
            lines.append(f"| `{entry['rva']}` | {description} |")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        raise SystemExit(f"usage: {argv[0]} <path-to-exe> <output-dir>")
    binary = Path(argv[1])
    if not binary.is_file():
        raise SystemExit(f"binary not found: {binary}")
    out_dir = Path(argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    image = Image(binary)
    managers, steps = build_manager_dictionary(image)
    labels = extract_labels(image)

    write_json(out_dir / "cmdaction-manager-dictionary.json", managers)
    write_json(out_dir / "cmdaction-step-classes.json", steps)
    write_json(out_dir / "cmdaction-step-labels.json", labels)
    write_glossary(out_dir / "cmdaction-step-glossary.md", labels, binary)

    with_fingerprint = sum(1 for entry in managers if entry["constructs"])
    series = {entry["series"] for entry in managers if "series" in entry}
    units = {entry["unit"] for entry in managers if "unit" in entry}
    helpers = {entry["helper"] for entry in labels}
    print(f"managers          : {len(managers)}")
    print(f"  with fingerprint: {with_fingerprint}")
    print(f"  series / units  : {len(series)} / {len(units)}")
    print(f"step classes      : {len(steps)}")
    print(f"labels / helpers  : {len(labels)} / {len(helpers)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
