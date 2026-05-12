"""
EXVS UnitTaskAutomata Weapon Extractor (Version-Agnostic)
IDAPython script — run inside IDA Pro with any EXVS game binary loaded.

Dynamic discovery (no hardcoded addresses or mappings):
  - Auto-detects game namespace (EXVS2, EXVSFB, EXVSMBON, etc.) from RTTI
  - Finds VDK base vtable dynamically for override comparison
  - Extracts series IDs from class naming patterns
  - Detects archetypes from VDK base class RTTI hierarchy

Outputs (file prefix auto-detected from game namespace):
  - {game}-unit-weapons.csv          (one row per UTA class)
  - {game}-cmd-action-managers.csv   (one row per CCmdActionManager class)
  - {game}-unit-weapons-tree.md      (auto-generated tree view)
  - {game}-unit-callgraph.csv        (sub-functions called by each weapon's vtable methods)
  - {game}-unit-rtti-hierarchy.csv   (full RTTI hierarchy with visibility for every class)

Usage:
  IDA > File > Script File > select this file
  OR via ida-pro-mcp py_exec_file
"""

import idaapi
import idautils
import idc
import ida_bytes
import ida_name
import ida_funcs
import re
import csv
import os
import json
import time

# ── Config ──────────────────────────────────────────────────────────────

OUTPUT_DIR = None

PTR_SIZE = 8
IMAGE_BASE = idaapi.get_imagebase()
VTABLE_SLOT_COUNT = 100


def resolve_output_dir():
    global OUTPUT_DIR
    if OUTPUT_DIR and os.path.isdir(OUTPUT_DIR):
        return OUTPUT_DIR
    candidates = []
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        candidates.append(os.path.join(script_dir, "..", "docs"))
        candidates.append(script_dir)
    except NameError:
        pass
    idb_path = idc.get_idb_path()
    if idb_path:
        idb_dir = os.path.dirname(idb_path)
        candidates.append(os.path.join(idb_dir, "docs"))
        candidates.append(idb_dir)
    for path in candidates:
        path = os.path.normpath(path)
        if os.path.isdir(path):
            OUTPUT_DIR = path
            return OUTPUT_DIR
    OUTPUT_DIR = os.getcwd()
    return OUTPUT_DIR


# ── Helpers ─────────────────────────────────────────────────────────────

def read_qword(ea):
    return ida_bytes.get_qword(ea)

def read_dword(ea):
    return ida_bytes.get_dword(ea)

def read_byte(ea):
    return ida_bytes.get_byte(ea)

def rva_to_ea(rva):
    return IMAGE_BASE + rva

def get_vtable_func(vtable_ea, slot):
    return read_qword(vtable_ea + slot * PTR_SIZE)

def as_signed32(val):
    return val if val < 0x80000000 else val - 0x100000000

def get_func_name_safe(ea):
    name = idc.get_func_name(ea)
    if name:
        return name
    name = ida_name.get_name(ea)
    if name:
        return name
    return f"sub_{ea:X}"


# ── RTTI traversal ──────────────────────────────────────────────────────

def read_rtti_name(type_info_ea):
    """Read decorated name from type_info structure (x64: name at +0x10)."""
    name_ea = type_info_ea + 0x10
    result = []
    for i in range(512):
        b = read_byte(name_ea + i)
        if b == 0:
            break
        result.append(chr(b))
    return "".join(result) if result else None


def get_base_classes_with_details(vtable_ea):
    """
    Walk MSVC x64 RTTI hierarchy from vtable to list all base classes
    with full visibility and displacement info.

    BCD layout (x64):
      +0x00  pTypeDescriptor  (RVA, 4B)
      +0x04  numContainedBases (4B)
      +0x08  mdisp            (signed 4B, member displacement)
      +0x0C  pdisp            (signed 4B, vbtable displacement)
      +0x10  vdisp            (signed 4B, displacement in vbtable)
      +0x14  attributes       (4B, BCD flags)

    Attribute flags:
      0x01  BCD_NOTVISIBLE        — not visible from most-derived class
      0x02  BCD_AMBIGUOUS         — ambiguous base
      0x04  BCD_PRIVORPROTBASE    — private or protected base
      0x08  BCD_PRIVORPROTINCOMPOBJ
      0x10  BCD_VBOFCONTOBJ       — virtual base
      0x20  BCD_NONPOLYMORPHIC    — non-polymorphic
    """
    col_ptr = read_qword(vtable_ea - PTR_SIZE)
    if col_ptr == 0 or col_ptr == 0xFFFFFFFFFFFFFFFF:
        return []

    sig = read_dword(col_ptr)
    if sig != 1:
        return []

    chd_rva = read_dword(col_ptr + 16)
    chd_ea = rva_to_ea(chd_rva)

    num_bases = read_dword(chd_ea + 8)
    if num_bases == 0 or num_bases > 64:
        return []

    bca_rva = read_dword(chd_ea + 12)
    bca_ea = rva_to_ea(bca_rva)

    entries = []
    for i in range(num_bases):
        bcd_rva = read_dword(bca_ea + i * 4)
        bcd_ea = rva_to_ea(bcd_rva)

        td_rva = read_dword(bcd_ea)
        td_ea = rva_to_ea(td_rva)
        name = read_rtti_name(td_ea)

        num_contained = read_dword(bcd_ea + 4)
        mdisp = as_signed32(read_dword(bcd_ea + 8))
        pdisp = as_signed32(read_dword(bcd_ea + 12))
        vdisp = as_signed32(read_dword(bcd_ea + 16))
        attributes = read_dword(bcd_ea + 20)

        vis_parts = []
        if attributes & 0x01:
            vis_parts.append("invisible")
        if attributes & 0x04:
            vis_parts.append("private/protected")
        if attributes & 0x10:
            vis_parts.append("virtual")
        visibility = " ".join(vis_parts) if vis_parts else "public"

        entries.append({
            "name": name or "",
            "mdisp": mdisp,
            "pdisp": pdisp,
            "vdisp": vdisp,
            "attributes": attributes,
            "visibility": visibility,
            "is_virtual": bool(attributes & 0x10),
            "num_contained": num_contained,
        })

    return entries


def get_base_class_names(vtable_ea):
    return [d["name"] for d in get_base_classes_with_details(vtable_ea) if d["name"]]


# ── Dynamic discovery ──────────────────────────────────────────────────

def scan_vtable_symbols():
    """
    Single pass over all ??_7 symbols to collect game-specific
    UTA/CAM classes and auto-detect the game namespace.
    """
    uta_by_class = {}
    cam_by_class = {}
    namespace_counts = {}

    for ea, sym in idautils.Names():
        if not sym.startswith("??_7"):
            continue

        if sym.startswith("??_7CUnitTaskAutomata_"):
            rest = sym[4:]
            idx = rest.find("@@6B")
            if idx < 0:
                continue
            class_key = rest[:idx]
            is_primary = rest[idx:].startswith("@@6B@")

            m = re.search(r"@(\w+)$", class_key)
            if m:
                ns = m.group(1)
                if ns not in ("GAM", "VDK", "FWK", "DEV"):
                    namespace_counts[ns] = namespace_counts.get(ns, 0) + 1

            if class_key not in uta_by_class or is_primary:
                uta_by_class[class_key] = (sym, ea)

        elif sym.startswith("??_7CCmdActionManager_"):
            rest = sym[4:]
            idx = rest.find("@@6B")
            if idx < 0:
                continue
            class_key = rest[:idx]
            is_primary = rest[idx:].startswith("@@6B@")
            if class_key not in cam_by_class or is_primary:
                cam_by_class[class_key] = (sym, ea)

    game_ns = max(namespace_counts, key=namespace_counts.get) if namespace_counts else None
    return uta_by_class, cam_by_class, game_ns


def find_vtable_by_class_name(class_name_fragment):
    target = "??_7" + class_name_fragment
    for ea, sym in idautils.Names():
        if sym.startswith(target) and "@@6B@" in sym:
            return ea
    return None


def discover_base_vtable(game_uta_classes):
    """
    Dynamically find the common VDK base vtable for override comparison.

    Strategy:
      1. Sample game-specific classes from different archetypes
      2. Walk each sample's RTTI hierarchy
      3. Find the most-derived base class shared by ALL samples
      4. Return that class's vtable
    """
    samples = list(game_uta_classes.values())[:min(20, len(game_uta_classes))]
    if not samples:
        print("  WARNING: No UTA classes to sample for base vtable discovery.")
        return None

    base_sets = []
    first_bases = None
    for sym, vtable_ea in samples:
        bases = get_base_class_names(vtable_ea)
        if not bases:
            continue
        base_sets.append(set(bases))
        if first_bases is None:
            first_bases = bases

    if not base_sets or not first_bases:
        print("  WARNING: Could not read RTTI for sampled classes.")
        return None

    common = base_sets[0]
    for s in base_sets[1:]:
        common = common & s

    if not common:
        all_flat = {}
        for bs in base_sets:
            for b in bs:
                all_flat[b] = all_flat.get(b, 0) + 1
        most_common = max(all_flat, key=all_flat.get)
        common = {most_common}
        print(f"  No universal common base; using most frequent: {most_common}")

    for base_name in first_bases[1:]:
        if base_name not in common:
            continue
        class_part = base_name
        if class_part.startswith(".?AV"):
            class_part = class_part[4:]
        if class_part.endswith("@@"):
            class_part = class_part[:-2]

        vtable_ea = find_vtable_by_class_name(class_part)
        if vtable_ea:
            print(f"  Common base: {base_name}")
            print(f"  Base vtable: 0x{vtable_ea:X}")
            return vtable_ea

    print("  WARNING: Could not locate vtable symbol for any common base.")
    return None


# ── Archetype detection (dynamic, no hardcoded list) ───────────────────

def determine_archetype(base_class_names):
    """Extract archetype from the most-derived VDK::GAM CUnitTaskAutomata base."""
    for name in base_class_names:
        if "@GAM@VDK" not in name:
            continue
        m = re.search(r"CUnitTaskAutomata(\w+)@GAM@VDK", name)
        if m:
            arch = m.group(1)
            if arch and arch != "Abstract":
                return arch
    return "Unknown"


# ── Value extraction from small functions ───────────────────────────────

def extract_class_id(func_ea):
    """
    Read the constant returned by GetClassId (slot 28).
    Patterns: mov eax, imm32; ret  OR  xor eax,eax; ret
    """
    if func_ea == 0:
        return None
    b0 = read_byte(func_ea)
    if b0 == 0xB8 and read_byte(func_ea + 5) == 0xC3:
        return read_dword(func_ea + 1)
    if b0 == 0x33 and read_byte(func_ea + 1) == 0xC0:
        return 0
    return None


def extract_object_size(factory_ea):
    """Scan first 48 bytes of Factory (slot 78) for `mov ecx, imm32` (alloc size)."""
    if factory_ea == 0:
        return None
    for off in range(48):
        if read_byte(factory_ea + off) == 0xB9:
            sz = read_dword(factory_ea + off + 1)
            if 0x100 < sz < 0x20000:
                return sz
    return None


# ── RTTI name parsing (version-agnostic) ────────────────────────────────

_UTA_RE = re.compile(
    r"^\.?\??AV"
    r"CUnitTaskAutomata_"
    r"(\d{3}[A-Z0-9]+)"    # series_id
    r"_(\d{3}[A-Z0-9]+)"   # unit_id
    r"(?:_(\d{3}))?"        # optional variant
    r"_([^@]+)"             # weapon_name
    r"@(.+)@@$"             # game namespace (any depth)
)

_CAM_RE = re.compile(
    r"^\.?\??AV"
    r"CCmdActionManager_"
    r"(\d{3}[A-Z0-9]+)"    # series_id
    r"_(\d{3}[A-Z0-9]+)"   # unit_id
    r"(?:_(\d{3}))?"        # optional variant
    r"_([^@]+)"             # name
    r"@(.+)@@$"             # game namespace (any depth)
)


def parse_uta_name(rtti):
    m = _UTA_RE.match(rtti)
    if m:
        return m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
    return None, None, None, rtti, None


def parse_cam_name(rtti):
    m = _CAM_RE.match(rtti)
    if m:
        return m.group(1), m.group(2), m.group(3) or "", m.group(4), m.group(5)
    return None, None, None, rtti, None


# ── RTTI string fallback ──────────────────────────────────────────────

def collect_rtti_strings(pattern_str, limit=2000):
    results = []
    for s in idautils.Strings():
        text = str(s)
        if pattern_str in text:
            results.append((text, s.ea))
            if len(results) >= limit:
                break
    return results


def find_vtables_for_rtti_class(type_info_ea):
    name = read_rtti_name(type_info_ea)
    if not name:
        return []
    class_part = name
    if class_part.startswith(".?AV"):
        class_part = class_part[4:]
    if class_part.endswith("@@"):
        class_part = class_part[:-2]
    target_prefix = "??_7" + class_part + "@@6B"
    vtables = []
    for ea, sym in idautils.Names():
        if sym.startswith(target_prefix):
            vtables.append(ea)
    return vtables


# ── Call graph extraction ──────────────────────────────────────────────

def get_function_callees(func_ea):
    """
    Get all direct callees (sub-functions called) by the function at func_ea.
    Excludes intra-function branches; includes calls and tail jumps.
    """
    callees = []
    seen = set()

    func = ida_funcs.get_func(func_ea)
    if not func:
        return callees

    func_addrs = set(idautils.FuncItems(func_ea))

    for head in func_addrs:
        for ref in idautils.CodeRefsFrom(head, 0):
            if ref in seen or ref in func_addrs:
                continue
            seen.add(ref)
            callees.append((ref, get_func_name_safe(ref)))

    return callees


# ── Series names (optional external mapping) ───────────────────────────

def load_series_names(output_dir):
    path = os.path.join(output_dir, "series_names.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"  Warning: Could not load {path}: {e}")
    return {}


def save_series_names_template(series_ids, output_dir):
    path = os.path.join(output_dir, "series_names.json")
    if os.path.exists(path):
        return
    template = {sid: "" for sid in sorted(series_ids)}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(template, f, indent=2, ensure_ascii=False)
    print(f"  Series name template saved: {path}")
    print(f"  Edit this file to add human-readable names for the tree view.")


# ── Main ────────────────────────────────────────────────────────────────

SLOT_NAMES = {
    0: "destructor", 2: "oninit", 3: "constructor_helper",
    12: "onupdate", 21: "preinit", 23: "type_flags",
    28: "classid", 54: "canhit", 55: "cancel",
    70: "param_changed", 73: "collision_check",
    78: "factory", 79: "configdmg", 81: "createcam", 84: "config",
}


def main():
    t0 = time.time()
    print("=" * 72)
    print("  EXVS UnitTaskAutomata Weapon Extractor (Version-Agnostic)")
    print("=" * 72)

    out_dir = resolve_output_dir()
    print(f"\n  Output directory: {out_dir}")

    # ── 1. Scan symbols & detect game ──────────────────────────────────
    print("\n[1/8] Scanning ??_7 symbols and detecting game namespace...")
    uta_by_class, cam_by_class, game_ns = scan_vtable_symbols()

    if game_ns:
        print(f"  Detected game namespace: {game_ns}")
    else:
        game_ns = "UNKNOWN"
        print(f"  WARNING: Could not detect namespace, using '{game_ns}'")

    print(f"  Found {len(uta_by_class)} UTA classes, {len(cam_by_class)} CAM classes.")

    # ── 2. Fallback if ??_7 count is low ───────────────────────────────
    if len(uta_by_class) < 50:
        print("[1b] ??_7 count low, scanning RTTI strings as fallback...")
        rtti_hits = collect_rtti_strings("CUnitTaskAutomata_")
        print(f"  Found {len(rtti_hits)} RTTI strings.")
        for rtti_str, str_ea in rtti_hits:
            ti_ea = str_ea - 0x10
            vtables = find_vtables_for_rtti_class(ti_ea)
            if vtables:
                class_part = rtti_str
                if class_part.startswith(".?AV"):
                    class_part = class_part[4:]
                if class_part.endswith("@@"):
                    class_part = class_part[:-2]
                if class_part not in uta_by_class:
                    uta_by_class[class_part] = (rtti_str, vtables[0])
        print(f"  After fallback: {len(uta_by_class)} UTA classes total.")

    # ── 3. Discover base vtable dynamically ────────────────────────────
    print("[2/8] Discovering VDK base vtable for override comparison...")
    base_vtable_ea = discover_base_vtable(uta_by_class)

    base_vtable = {}
    if base_vtable_ea:
        for slot in range(VTABLE_SLOT_COUNT):
            base_vtable[slot] = get_vtable_func(base_vtable_ea, slot)
    else:
        print("  Override detection will be disabled (no base vtable found).")

    # ── 4. Load optional series names ──────────────────────────────────
    series_names = load_series_names(out_dir)

    # ── 5. Analyze each UTA vtable ─────────────────────────────────────
    print(f"[3/8] Analyzing {len(uta_by_class)} UTA vtables...")
    uta_rows = []
    hierarchy_rows = []
    all_series_ids = set()
    count = 0

    for class_key, (sym, vtable_ea) in sorted(uta_by_class.items()):
        count += 1
        if count % 200 == 0:
            print(f"  {count}/{len(uta_by_class)}...")

        rtti_name = ".?AV" + class_key + "@@"
        series, unit, variant, weapon, ns = parse_uta_name(rtti_name)
        if series:
            all_series_ids.add(series)

        slot_funcs = {}
        override_slots = []
        for slot in range(VTABLE_SLOT_COUNT):
            fa = get_vtable_func(vtable_ea, slot)
            slot_funcs[slot] = fa
            if base_vtable and fa != base_vtable.get(slot, 0):
                override_slots.append(slot)

        class_id = extract_class_id(slot_funcs.get(28, 0))
        obj_size = extract_object_size(slot_funcs.get(78, 0))

        base_details = get_base_classes_with_details(vtable_ea)
        base_names = [d["name"] for d in base_details]
        archetype = determine_archetype(base_names)

        for bd in base_details:
            hierarchy_rows.append({
                "class_series":  series or "",
                "class_unit":    unit or "",
                "class_variant": variant or "",
                "class_weapon":  weapon or "",
                "base_class":    bd["name"],
                "visibility":    bd["visibility"],
                "is_virtual":    bd["is_virtual"],
                "mdisp":         bd["mdisp"],
                "pdisp":         bd["pdisp"],
                "vdisp":         bd["vdisp"],
                "attributes":    f"0x{bd['attributes']:02X}",
            })

        uta_rows.append({
            "series_id":          series or "",
            "unit_id":            unit or "",
            "variant":            variant or "",
            "weapon_name":        weapon or "",
            "game_namespace":     ns or game_ns,
            "archetype":          archetype,
            "vtable_addr":        f"0x{vtable_ea:X}",
            "class_id":           str(class_id) if class_id is not None else "",
            "object_size":        f"0x{obj_size:X}" if obj_size else "",
            "override_count":     len(override_slots),
            "overridden_slots":   ";".join(str(s) for s in override_slots),
            "slot_0_destructor":  f"0x{slot_funcs[0]:X}",
            "slot_2_oninit":      f"0x{slot_funcs[2]:X}",
            "slot_12_onupdate":   f"0x{slot_funcs[12]:X}",
            "slot_28_classid_fn": f"0x{slot_funcs[28]:X}",
            "slot_54_canhit":     f"0x{slot_funcs[54]:X}",
            "slot_55_cancel":     f"0x{slot_funcs[55]:X}",
            "slot_78_factory":    f"0x{slot_funcs[78]:X}",
            "slot_79_configdmg":  f"0x{slot_funcs[79]:X}",
            "slot_81_createcam":  f"0x{slot_funcs[81]:X}",
            "slot_84_config":     f"0x{slot_funcs[84]:X}",
            "base_classes":       "|".join(base_names[:8]),
        })

    uta_rows.sort(key=lambda r: (r["series_id"], r["unit_id"], r["variant"], r["weapon_name"]))

    # ── 6. Analyze each CAM vtable ─────────────────────────────────────
    print(f"[4/8] Analyzing {len(cam_by_class)} CAM vtables...")
    cam_rows = []
    for class_key, (sym, vtable_ea) in sorted(cam_by_class.items()):
        rtti_name = ".?AV" + class_key + "@@"
        series, unit, variant, name, ns = parse_cam_name(rtti_name)
        execute_fn = get_vtable_func(vtable_ea, 1)
        cam_rows.append({
            "series_id":      series or "",
            "unit_id":        unit or "",
            "variant":        variant or "",
            "cam_name":       name or "",
            "game_namespace": ns or game_ns,
            "vtable_addr":    f"0x{vtable_ea:X}",
            "slot1_execute":  f"0x{execute_fn:X}",
        })
    cam_rows.sort(key=lambda r: (r["series_id"], r["unit_id"], r["variant"], r["cam_name"]))

    # ── 7. Extract call graphs ─────────────────────────────────────────
    print(f"[5/8] Extracting call graphs for overridden vtable functions...")
    callgraph_rows = []
    analyzed_funcs = {}
    cg_count = 0

    for row in uta_rows:
        cg_count += 1
        if cg_count % 200 == 0:
            print(f"  {cg_count}/{len(uta_rows)}...")

        override_str = row["overridden_slots"]
        if not override_str:
            continue

        override_list = [int(s) for s in override_str.split(";")]
        vtable_ea = int(row["vtable_addr"], 16)

        for slot in override_list:
            func_ea = get_vtable_func(vtable_ea, slot)

            if func_ea in analyzed_funcs:
                callees = analyzed_funcs[func_ea]
            else:
                callees = get_function_callees(func_ea)
                analyzed_funcs[func_ea] = callees

            for callee_ea, callee_name in callees:
                callgraph_rows.append({
                    "series_id":   row["series_id"],
                    "unit_id":     row["unit_id"],
                    "variant":     row["variant"],
                    "weapon_name": row["weapon_name"],
                    "slot":        slot,
                    "slot_name":   SLOT_NAMES.get(slot, f"slot_{slot}"),
                    "func_addr":   f"0x{func_ea:X}",
                    "callee_addr": f"0x{callee_ea:X}",
                    "callee_name": callee_name,
                })

    # ── 8. Write all outputs ───────────────────────────────────────────
    game_prefix = game_ns.lower()
    CSV_UTA       = os.path.join(out_dir, f"{game_prefix}-unit-weapons.csv")
    CSV_CAM       = os.path.join(out_dir, f"{game_prefix}-cmd-action-managers.csv")
    MD_TREE       = os.path.join(out_dir, f"{game_prefix}-unit-weapons-tree.md")
    CSV_CALLGRAPH = os.path.join(out_dir, f"{game_prefix}-unit-callgraph.csv")
    CSV_HIERARCHY = os.path.join(out_dir, f"{game_prefix}-unit-rtti-hierarchy.csv")

    print(f"[6/8] Writing CSV files...")

    uta_fields = [
        "series_id", "unit_id", "variant", "weapon_name", "game_namespace",
        "archetype", "vtable_addr", "class_id", "object_size",
        "override_count", "overridden_slots",
        "slot_0_destructor", "slot_2_oninit", "slot_12_onupdate",
        "slot_28_classid_fn", "slot_54_canhit", "slot_55_cancel",
        "slot_78_factory", "slot_79_configdmg", "slot_81_createcam",
        "slot_84_config", "base_classes",
    ]
    with open(CSV_UTA, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=uta_fields)
        w.writeheader()
        w.writerows(uta_rows)
    print(f"  {CSV_UTA}  ({len(uta_rows)} rows)")

    cam_fields = [
        "series_id", "unit_id", "variant", "cam_name", "game_namespace",
        "vtable_addr", "slot1_execute",
    ]
    with open(CSV_CAM, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cam_fields)
        w.writeheader()
        w.writerows(cam_rows)
    print(f"  {CSV_CAM}  ({len(cam_rows)} rows)")

    cg_fields = [
        "series_id", "unit_id", "variant", "weapon_name",
        "slot", "slot_name", "func_addr", "callee_addr", "callee_name",
    ]
    with open(CSV_CALLGRAPH, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cg_fields)
        w.writeheader()
        w.writerows(callgraph_rows)
    print(f"  {CSV_CALLGRAPH}  ({len(callgraph_rows)} rows)")

    print(f"[7/8] Writing RTTI hierarchy CSV...")
    hier_fields = [
        "class_series", "class_unit", "class_variant", "class_weapon",
        "base_class", "visibility", "is_virtual",
        "mdisp", "pdisp", "vdisp", "attributes",
    ]
    with open(CSV_HIERARCHY, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=hier_fields)
        w.writeheader()
        w.writerows(hierarchy_rows)
    print(f"  {CSV_HIERARCHY}  ({len(hierarchy_rows)} rows)")

    print("[8/8] Generating weapon tree markdown...")
    generate_tree_md(uta_rows, cam_rows, MD_TREE, series_names, game_ns)

    if all_series_ids:
        save_series_names_template(all_series_ids, out_dir)

    elapsed = time.time() - t0
    print(f"\n{'=' * 72}")
    print(f"  DONE in {elapsed:.1f}s")
    print(f"  Game namespace:     {game_ns}")
    print(f"  UTA classes:        {len(uta_rows)}")
    print(f"  CAM classes:        {len(cam_rows)}")
    print(f"  Callgraph entries:  {len(callgraph_rows)}")
    print(f"  Hierarchy entries:  {len(hierarchy_rows)}")
    print(f"  Unique functions:   {len(analyzed_funcs)}")
    print(f"{'=' * 72}")

    print_summary(uta_rows, series_names)


# ── Tree MD generation ──────────────────────────────────────────────────

def generate_tree_md(uta_rows, cam_rows, md_path, series_names, game_ns):
    tree = {}
    for r in uta_rows:
        sid = r["series_id"] or "UNKNOWN"
        uid = r["unit_id"] or "UNKNOWN"
        key = (sid, uid)
        if key not in tree:
            tree[key] = []
        tree[key].append(r)

    lines = []
    lines.append(f"# {game_ns} Unit Weapons Tree (Auto-Generated)")
    lines.append("")
    lines.append(f"Generated from RTTI scan — {len(uta_rows)} weapon classes across {len(tree)} units.")
    lines.append("")
    lines.append("| Stat | Count |")
    lines.append("|------|-------|")

    arch_counts = {}
    for r in uta_rows:
        a = r["archetype"]
        arch_counts[a] = arch_counts.get(a, 0) + 1
    for a, c in sorted(arch_counts.items(), key=lambda x: -x[1]):
        lines.append(f"| Archetype: {a} | {c} |")
    lines.append("")
    lines.append("---")
    lines.append("")

    series_groups = {}
    for (sid, uid), weapons in sorted(tree.items()):
        if sid not in series_groups:
            series_groups[sid] = {}
        series_groups[sid][uid] = weapons

    for sid in sorted(series_groups.keys()):
        series_title = series_names.get(sid, sid)
        units = series_groups[sid]
        total_weapons = sum(len(ws) for ws in units.values())

        lines.append(f"## {sid} — {series_title} ({total_weapons} weapons)")
        lines.append("")

        for uid in sorted(units.keys()):
            weapons = units[uid]
            lines.append(f"### {uid}")
            lines.append("")
            lines.append("| Weapon | Variant | Archetype | ClassId | ObjSize | Overrides | CreateCAM |")
            lines.append("|--------|---------|-----------|---------|---------|-----------|-----------|")

            for w in sorted(weapons, key=lambda x: (x["variant"], x["weapon_name"])):
                lines.append(
                    f"| {w['weapon_name']} "
                    f"| {w['variant']} "
                    f"| {w['archetype']} "
                    f"| {w['class_id']} "
                    f"| {w['object_size']} "
                    f"| {w['override_count']} "
                    f"| {w['slot_81_createcam']} |"
                )

            lines.append("")

        lines.append("---")
        lines.append("")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"  {md_path}")


# ── Summary ─────────────────────────────────────────────────────────────

def print_summary(uta_rows, series_names):
    unit_counts = {}
    for r in uta_rows:
        key = f"{r['series_id']}_{r['unit_id']}"
        unit_counts[key] = unit_counts.get(key, 0) + 1

    print(f"\n  Unique series+unit combos: {len(unit_counts)}")
    print(f"\n  Top 30 units by weapon count:")
    for unit, cnt in sorted(unit_counts.items(), key=lambda x: -x[1])[:30]:
        series = unit.split("_")[0] if "_" in unit else ""
        title = series_names.get(series, "")
        print(f"    {unit}: {cnt} weapons  ({title})")

    arch_counts = {}
    for r in uta_rows:
        a = r["archetype"]
        arch_counts[a] = arch_counts.get(a, 0) + 1
    print(f"\n  Archetype distribution:")
    for a, c in sorted(arch_counts.items(), key=lambda x: -x[1]):
        print(f"    {a}: {c}")

    series_counts = {}
    for r in uta_rows:
        s = r["series_id"] or "?"
        series_counts[s] = series_counts.get(s, 0) + 1
    print(f"\n  Series distribution:")
    for s, c in sorted(series_counts.items(), key=lambda x: -x[1]):
        title = series_names.get(s, "")
        print(f"    {s} ({title}): {c}")


# ── Entry point ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    main()
else:
    main()
