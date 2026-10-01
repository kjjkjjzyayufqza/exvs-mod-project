"""Extract the projectile UnitTask class catalog from the OB v27 arcade binary.

Every bulletparam row names a C++ class through column 0x0D6A5CD5 (class id).
This script derives, from the binary alone and without executing game code:

* every projectile class (RTTI primary vtables under CUnitTaskActorProjectileAbstract),
  its full base chain, vtable, slot table and factory allocation size;
* the class id -> class mapping, by emulating the class-id dispatcher
  (sub_14097E740) with unicorn and following register function -> factory -> vtable;
* which class (or vtable-less VDK base) owns each function reachable from the
  vtables: a function is owned by the lowest common ancestor of every class that
  reaches it within two call levels;
* the bulletparam columns each owner reads (32-bit hash immediates matched
  against the pool in src-tauri/src/format/bulletparam.rs);
* the CCmdActionManager created by slot 81 and its step classes (joined from
  docs/cmdaction-research/cmdaction-manager-dictionary.json);
* capability flags derived from overridden semantic slots.

Only metadata is written (names, addresses, hashes, counts). No code bytes and
no decompiled listings leave the binary.

Requires: capstone, unicorn.

Usage:
    python tools/extract_projectile_class_catalog.py <vsac27_Release.exe> <out_dir>
"""

from __future__ import annotations

import bisect
import csv
import json
import re
import struct
import sys
from collections import Counter, defaultdict
from pathlib import Path

from capstone import CS_ARCH_X86, CS_MODE_64, Cs
from unicorn import UC_ARCH_X86, UC_HOOK_CODE, UC_MODE_64, Uc, UcError
from unicorn.x86_const import (
    UC_X86_REG_RBP,
    UC_X86_REG_RCX,
    UC_X86_REG_RDX,
    UC_X86_REG_RIP,
    UC_X86_REG_RSP,
)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_cmdaction_dictionary import Image, read_function_ranges  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
BULLETPARAM_RS = REPO / "src-tauri" / "src" / "format" / "bulletparam.rs"
MANAGER_DICTIONARY = REPO / "docs" / "cmdaction-research" / "cmdaction-manager-dictionary.json"

DISPATCHER = 0x14097E740
ALLOCATOR = 0x14044C4E0
NULLSUB = 0x140033290
ROOT = "CUnitTaskActorProjectileAbstract"
AUTOMATA_BASE = "CUnitTaskAutomataRadiconParentActor"
FIRST_BULLET_SPECIFIC_SLOT = 62

# Slot semantics for the Automata lineage (CUnitTaskAutomataAbstract and below).
# Evidence: E2 = read in the OB v27 binary; E3 = inferred from call context only.
SLOT_SEMANTICS: dict[int, tuple[str, str, str]] = {
    0: ("Destructor", "E2", "Frees the object and its service components."),
    2: ("OnInit", "E2", "sub_140673A40 builds status objects and service components, runs spawn hooks 82-92, then creates the CmdActionManager (81). RadiconParentActor wraps it (sub_1406A5BA0) with resident claim (95) and spawn order messages (96-98)."),
    4: ("TaskPhaseDispatch", "E2", "sub_14035E840 dispatches slots 7 and 10-22 by task phase."),
    11: ("PreUpdate", "E2", "sub_1406733F0 resets per-frame interactors and applies the hit-stop time scale (0.01 while the hit-stop counter is non-zero)."),
    12: ("Update", "E2", "Main per-frame tick. RadiconParentActor (sub_1406A5B30) first services two pending ids at paramBlock+0x198."),
    18: ("CollisionResolve", "E3", "Phase hook; overridden by connect-laser, summon-defence and anchor classes."),
    20: ("ProcessInteractionResults", "E2", "sub_1406734C0 consumes this frame's hit records: ordinary hit -> 74, records flagged at +0x73 -> 75, hit counter exhausted -> 71."),
    21: ("PreInit", "E3", "RadiconParentActor adds sub_1406A4DF0 before the Abstract version."),
    22: ("UpdateModelVisibility", "E3", "sub_1406733C0 toggles model drawing from +0x451."),
    23: ("TypeFlags", "E3", "Returns task type flags; Anchor adds its own."),
    28: ("GetTaskKind", "E2", "Constant task-kind id (465 for RadiconParentActor, other constants for Funnel families). Not the bulletparam class id."),
    48: ("BuildParamBlock", "E2", "sub_140674190 calls 78 (create), 79 (fill), 91 (fill sub-block at +0x10) and 80 (finalize)."),
    54: ("IsTargetInsideOwnerRange", "E2", "When paramBlock+0x1A0 is set: distance to the owner's target is below the owner's range parameter."),
    55: ("IsTargetOutsideOwnerRange", "E2", "Complement of slot 54."),
    58: ("BuildHitInfo", "E2", "sub_14063C080 builds the attack record from slots 63 (interaction id) and 64 (hitgroup id)."),
    59: ("CreateMotionComponents", "E3", "sub_140675550 allocates motion and animation helpers; rolling-saber classes replace it."),
    62: ("GetModelId", "E2", "Reads bulletparam 0xD8F283FB; slot 83 falls back to model 0x082EA0D7 when it is 0."),
    63: ("GetInteractionId", "E2", "Reads bulletparam 0xEDD1C108."),
    64: ("GetHitgroupId", "E2", "Reads bulletparam 0xD32D39ED."),
    65: ("UpdatePreMotion", "E3", "Called by the Abstract Update."),
    66: ("UpdateAliveCheck", "E3", "Called by the Abstract Update."),
    67: ("UpdatePostMotion", "E3", "Called by the Abstract Update; calls 3 and 32."),
    68: ("SetWorldPosition", "E2", "sub_140673070 writes the position at +0x4C0 and syncs the model transform."),
    69: ("PreCreateManagerHook", "E2", "Called by OnInit immediately before slot 81."),
    70: ("StoreSpawnArgument", "E3", "Radicon stores the argument at +0x3518 after the Abstract handler."),
    71: ("OnHitCountExhausted", "E2", "Called from slot 20 when the hit counter reaches 0; Radicon default forwards to 94 (dispose)."),
    72: ("PostUpdateEffects", "E3", "sub_140674410 updates attached effects and the manager's pending list."),
    73: ("OnStageContact", "E2", "Radicon sub_14066DA30: paramBlock+0x144 = 1 disposes on any stage contact, 2 on ground contact (via 94)."),
    74: ("OnHitConsumed", "E2", "Called from slot 20 on ordinary hits; overrides usually jump the CmdAction tree to a hit label (sub_140672840)."),
    75: ("OnBarrierInteraction", "E2", "Called from slot 20 for flagged records; implemented by barrier and reflector classes."),
    76: ("ArchetypeEventHook", "E3", "Mostly Throw and FlySword families; forwards an event to the manager when a param flag is set."),
    77: ("OnVanish", "E2", "sub_140674200 spawns the on-expire bullet (0x41435BE6), plays vanish effects, disables interactors and the barrier."),
    78: ("CreateParamBlock", "E2", "Allocates the per-projectile param block stored at +0x34A0 (RadiconParentActor: 0x1B0 bytes)."),
    79: ("FillParamBlock", "E2", "Per-class parameter assembly, mostly from bulletparam columns."),
    80: ("FinalizeParamBlock", "E2", "RadiconParentActor sets flags when spawn order messages exist."),
    81: ("CreateCmdActionManager", "E2", "Returns the CCmdActionManager_* whose Execute builds the step tree."),
    82: ("CreateInitDataModifier", "E2", "Default returns CAutomataInitDataModifier_Default."),
    83: ("SetupModel", "E2", "Loads the model id from slot 62."),
    84: ("DescribeAttackShape", "E2", "Fills the attack collision shape descriptor (default: type 3 from the row)."),
    85: ("AdjustAttackShape", "E3", "Second pass over the attack shape descriptor."),
    86: ("DescribeBarrier", "E2", "Fills the barrier descriptor; the default leaves type -1 (no barrier)."),
    87: ("ConfigureAlert", "E2", "Configures CAutomataServiceAlert at +0x34E8."),
    88: ("SetupModelAnimation", "E3", "Receives the model holder at +0x34B0."),
    89: ("OnInitHookA", "E3", "Receives the object at +0x3040."),
    90: ("SetupModelSubObject", "E3", "Receives (+0x34B0)->+0x20; samples set a hash on it."),
    91: ("FillParamSubBlock", "E2", "Receives paramBlock+0x10; part of slot 48."),
    92: ("ConfigureStageCollider", "E2", "Fills the stage-collider descriptor when the stage collider exists."),
    93: ("RadiconHook93", "E3", "Overridden by FunnelDefence families."),
    94: ("Dispose", "E2", "Default target of 71 and 73."),
    95: ("SelectResidentEntry", "E2", "Picks the nearest standby (state 1) entry of the 12-entry resident table, else the first state 2 entry."),
    96: ("GetSpawnOrderCount", "E2", "Size of the spawn order list at paramBlock+0x190."),
    97: ("GetSpawnOrderId", "E2", "paramBlock+0x150 + 8*i."),
    98: ("GetSpawnOrderArg", "E2", "paramBlock+0x154 + 8*i."),
    99: ("PostClaimHook", "E3", "Thunk to sub_1406A6400."),
}

# Capability flags: slot -> (flag name, "base" = differs from RadiconParentActor, "nullsub" = not the nullsub).
CAPABILITIES: dict[str, tuple[int, str]] = {
    "barrier": (86, "base"),
    "barrier_interaction": (75, "nullsub"),
    "hit_consumed_hook": (74, "nullsub"),
    "hit_count_exhausted_override": (71, "base"),
    "stage_contact_override": (73, "base"),
    "custom_model_id": (62, "base"),
    "custom_model_setup": (83, "base"),
    "alert_config": (87, "nullsub"),
    "custom_attack_shape": (84, "base"),
    "custom_param_block": (78, "base"),
    "init_data_modifier": (82, "base"),
    "spawn_orders_override": (96, "base"),
    "owner_range_override": (54, "base"),
}


class Binary:
    def __init__(self, exe: Path) -> None:
        self.image = Image(exe)
        self.base = self.image.base
        self.data = self.image.data
        self.ranges = read_function_ranges(self.image)
        self.starts = [r[0] for r in self.ranges]
        self.func_starts = {self.base + r[0] for r in self.ranges}
        _, self.text_va, self.text_vs, _, _ = self.image.section(".text")
        _, self.rdata_va, _, self.rdata_ra, self.rdata_rs = self.image.section(".rdata")
        self.md = Cs(CS_ARCH_X86, CS_MODE_64)
        self._insns: dict[tuple[int, int], list] = {}
        self._callees: dict[int, list[int]] = {}

    def u64(self, va: int) -> int:
        return struct.unpack_from("<Q", self.data, self.image.rva_to_offset(va - self.base))[0]

    def is_code(self, va: int) -> bool:
        return self.text_va <= va - self.base < self.text_va + self.text_vs

    def func_range(self, va: int):
        rva = va - self.base
        i = bisect.bisect_right(self.starts, rva) - 1
        if i >= 0 and self.ranges[i][0] <= rva < self.ranges[i][1]:
            return self.base + self.ranges[i][0], self.base + self.ranges[i][1]
        return None

    def insns(self, start: int, end: int) -> list:
        key = (start, end)
        if key not in self._insns:
            off = self.image.rva_to_offset(start - self.base)
            self._insns[key] = list(self.md.disasm(self.data[off:off + (end - start)], start))
        return self._insns[key]

    def rip_targets(self, start: int, end: int) -> list[tuple[object, int]]:
        out = []
        for ins in self.insns(start, end):
            m = re.search(r"rip ([+-]) 0x([0-9a-f]+)", ins.op_str)
            if m:
                disp = int(m.group(2), 16) * (1 if m.group(1) == "+" else -1)
                out.append((ins, ins.address + ins.size + disp))
            elif ins.mnemonic in ("call", "jmp") and ins.op_str.startswith("0x"):
                out.append((ins, int(ins.op_str, 16)))
        return out

    def callees(self, f: int) -> list[int]:
        if f not in self._callees:
            fr = self.func_range(f)
            seen: list[int] = []
            if fr:
                for ins, t in self.rip_targets(*fr):
                    if ins.mnemonic in ("call", "jmp") and t in self.func_starts and t != f and t not in seen:
                        seen.append(t)
            self._callees[f] = seen
        return self._callees[f]

    def td_name(self, td_rva: int) -> str:
        off = self.image.rva_to_offset(td_rva) + 0x10
        return self.data[off:self.data.index(b"\0", off)].decode("ascii")

    def primary_vtables(self):
        """Yield (vtable_va, mangled_name, chd_rva) for every complete object locator with offset 0."""
        view = memoryview(self.data)[self.rdata_ra:self.rdata_ra + (self.rdata_rs & ~7)].cast("Q")
        for index, col in enumerate(view):
            if not (self.rdata_va <= col - self.base < self.rdata_va + self.rdata_rs):
                continue
            try:
                sig, off, _cd, ptd, pchd, pself = struct.unpack_from(
                    "<IIIIII", self.data, self.image.rva_to_offset(col - self.base))
                mangled = self.td_name(ptd)
            except (ValueError, struct.error, UnicodeDecodeError):
                continue
            if sig == 1 and off == 0 and pself == col - self.base:
                yield self.base + self.rdata_va + (index + 1) * 8, mangled, pchd

    def base_chain(self, chd_rva: int) -> list[str]:
        _sig, _attr, count, bca = struct.unpack_from("<IIII", self.data, self.image.rva_to_offset(chd_rva))
        chain = []
        for i in range(count):
            bcd = struct.unpack_from("<I", self.data, self.image.rva_to_offset(bca) + 4 * i)[0]
            chain.append(short_name(self.td_name(struct.unpack_from("<I", self.data, self.image.rva_to_offset(bcd))[0])))
        return chain

    def slots(self, vtable: int) -> list[int]:
        out = []
        while True:
            v = self.u64(vtable + 8 * len(out))
            if not self.is_code(v):
                return out
            out.append(v)


def short_name(mangled: str) -> str:
    m = re.match(r"\.\?A[VU](.+?)@", mangled)
    if not m:
        raise ValueError(f"unexpected RTTI name {mangled}")
    return m.group(1)


def is_projectile(name: str) -> bool:
    return name.startswith("CUnitTaskAutomata") or name.startswith("CUnitTaskActorProj")


def load_classes(binary: Binary) -> dict[str, dict]:
    classes = {}
    for vtable, mangled, chd in binary.primary_vtables():
        name = short_name(mangled)
        if not is_projectile(name):
            continue
        chain = binary.base_chain(chd)
        if ROOT not in chain:
            continue
        classes[name] = {"name": name, "vtable": vtable, "chain": chain, "slots": binary.slots(vtable)}
    if ROOT not in classes or AUTOMATA_BASE not in classes:
        raise SystemExit("projectile base classes not found; wrong binary?")
    return classes


def emulate_dispatcher(binary: Binary, classes: dict[str, dict]) -> dict[int, int]:
    """Return class id -> first address reached outside the dispatcher."""
    d_start, d_end = binary.func_range(DISPATCHER)
    candidates = set(range(0, 1000))
    for ins in binary.insns(d_start, d_end):
        if ins.mnemonic not in ("cmp", "sub", "add", "lea"):
            continue
        for m in re.finditer(r"0x([0-9a-f]+)", ins.op_str):
            v = int(m.group(1), 16)
            if 0x10 < v < 0xFFFFFFFF:
                candidates.update(x for x in range(v - 300, v + 301) if 0 <= x <= 0xFFFFFFFF)
    for name in classes:
        m = re.match(r"CUnitTaskAutomata_(\d{3})[A-Z0-9]+_(\d{3})", name)
        if m:
            series, unit = int(m.group(1)), int(m.group(2))
            for variant in range(10):
                for index in range(100):
                    candidates.add((series * 10_000_000 + unit * 10_000 + variant * 100 + index) & 0xFFFFFFFF)

    mu = Uc(UC_ARCH_X86, UC_MODE_64)
    size = max(vaddr + max(vsize, rsize) for _n, vaddr, vsize, _r, rsize in binary.image.sections)
    size = (size + 0xFFF) & ~0xFFF
    mu.mem_map(binary.base, size)
    for _n, vaddr, _vsize, raddr, rsize in binary.image.sections:
        mu.mem_write(binary.base + vaddr, binary.data[raddr:raddr + rsize])
    stack = 0x10000000
    mu.mem_map(stack, 0x100000)
    state: dict[str, int] = {}

    def on_exit(uc, address, _size, _user):
        state["rip"] = address
        uc.emu_stop()

    mu.hook_add(UC_HOOK_CODE, on_exit, begin=binary.base, end=d_start - 1)
    mu.hook_add(UC_HOOK_CODE, on_exit, begin=d_end, end=binary.base + size)
    exits = {}
    for cid in sorted(candidates):
        state.clear()
        mu.reg_write(UC_X86_REG_RSP, stack + 0xF0000)
        mu.reg_write(UC_X86_REG_RBP, stack + 0xF0800)
        mu.mem_write(stack + 0xF0000, (0xDEAD0000).to_bytes(8, "little"))
        mu.reg_write(UC_X86_REG_RCX, 0x20000000)
        mu.reg_write(UC_X86_REG_RDX, cid)
        try:
            mu.emu_start(DISPATCHER, 0, count=4000)
        except UcError:
            state.setdefault("rip", mu.reg_read(UC_X86_REG_RIP))
        if "rip" not in state:
            raise SystemExit(f"dispatcher emulation did not exit for id {cid}")
        exits[cid] = state["rip"]
    default = Counter(exits.values()).most_common(1)[0][0]
    return {cid: target for cid, target in exits.items() if target != default}


def resolve_factories(binary: Binary, classes: dict[str, dict], cases: dict[int, int]) -> None:
    vt_to_class = {c["vtable"]: n for n, c in classes.items()}

    def vtables_in(f: int, depth: int) -> list[str]:
        fr = binary.func_range(f)
        if not fr:
            return []
        found = [vt_to_class[t] for _i, t in binary.rip_targets(*fr) if t in vt_to_class]
        if depth:
            for g in binary.callees(f):
                found += vtables_in(g, depth - 1)
        return found

    def alloc_size(f: int):
        last = None
        for ins in binary.insns(*binary.func_range(f)):
            m = re.match(r"ecx, (0x[0-9a-f]+|\d+)$", ins.op_str)
            if ins.mnemonic == "mov" and m:
                last = int(m.group(1), 0)
            if ins.mnemonic == "call" and ins.op_str.startswith("0x") and int(ins.op_str, 16) == ALLOCATOR:
                return last
        return None

    for c in classes.values():
        c.update(class_ids=[], factory=None, register_fns=[], object_size=None)
    resolved: dict[int, tuple[int, str] | None] = {}
    for cid, register in sorted(cases.items()):
        if register not in resolved:
            resolved[register] = None
            fr = binary.func_range(register)
            if fr:
                for ins, t in binary.rip_targets(*fr):
                    if ins.mnemonic == "lea" and t in binary.func_starts:
                        names = vtables_in(t, 2)
                        if names:
                            resolved[register] = (t, max(names, key=lambda n: len(classes[n]["chain"])))
                            break
        hit = resolved[register]
        if hit is None:
            raise SystemExit(f"class id {cid}: register function 0x{register:X} has no projectile factory")
        factory, name = hit
        c = classes[name]
        c["class_ids"].append(cid)
        c["factory"] = factory
        c["object_size"] = alloc_size(factory)
        if register not in c["register_fns"]:
            c["register_fns"].append(register)


def assign_owners(binary: Binary, classes: dict[str, dict]) -> dict[int, str]:
    users: dict[int, set[str]] = defaultdict(set)
    for name, c in classes.items():
        stack = [(v, 0) for v in c["slots"]]
        seen: set[int] = set()
        while stack:
            f, depth = stack.pop()
            if f in seen or f == NULLSUB:
                continue
            seen.add(f)
            users[f].add(name)
            if depth < 2:
                stack += [(g, depth + 1) for g in binary.callees(f)]

    def lca(names: set[str]) -> str:
        ordered = sorted(names)
        others = [set(classes[n]["chain"]) for n in ordered[1:]]
        for ancestor in classes[ordered[0]]["chain"]:
            if all(ancestor in o for o in others):
                return ancestor
        raise SystemExit("classes without a common ancestor share a function")

    return {f: lca(names) for f, names in users.items()}


def load_bulletparam_names() -> dict[int, str]:
    if not BULLETPARAM_RS.is_file():
        raise SystemExit(f"missing {BULLETPARAM_RS}")
    names = {}
    for line in BULLETPARAM_RS.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\s*\((0x[0-9A-Fa-f]{8}),\s*\d+,\s*\"([a-z0-9_]+)\"\)", line)
        if m:
            names[int(m.group(1), 16)] = m.group(2)
    if not names:
        raise SystemExit("bulletparam pool not found")
    return names


def param_reads(binary: Binary, f: int, pool: dict[int, str]) -> list[int]:
    fr = binary.func_range(f)
    if not fr:
        return []
    out: list[int] = []
    for ins in binary.insns(*fr):
        for m in re.finditer(r"0x([0-9a-f]{6,8})\b", ins.op_str):
            v = int(m.group(1), 16)
            if v in pool and v not in out:
                out.append(v)
    return out


def manager_vtables(binary: Binary) -> dict[int, str]:
    managers = {}
    for vtable, mangled, _chd in binary.primary_vtables():
        name = short_name(mangled)
        if name.startswith("CCmdActionManager"):
            managers[vtable] = name
    return managers


def manager_names(binary: Binary, managers: dict[int, str], f: int) -> list[str]:
    fr = binary.func_range(f)
    if not fr:
        return []
    found = {managers[t] for _i, t in binary.rip_targets(*fr) if t in managers}
    if not found:
        for g in binary.callees(f):
            gr = binary.func_range(g)
            if gr:
                found |= {managers[t] for _i, t in binary.rip_targets(*gr) if t in managers}
    return sorted(found)


def manager_param_reads(binary: Binary, managers: dict[int, str], pool: dict[int, str]) -> dict[str, list[int]]:
    """Columns read by functions that belong to exactly one manager (vtable slots and their private callees)."""
    users: dict[int, set[str]] = defaultdict(set)
    for vtable, name in managers.items():
        for f in binary.slots(vtable):
            users[f].add(name)
    own: dict[str, list[int]] = defaultdict(list)
    for f, names in users.items():
        if len(names) == 1:
            own[next(iter(names))].append(f)
    callee_users: dict[int, set[str]] = defaultdict(set)
    for name, funcs in own.items():
        for f in funcs:
            for g in binary.callees(f):
                callee_users[g].add(name)
    for g, names in callee_users.items():
        if len(names) == 1 and g not in users:
            own[next(iter(names))].append(g)
    return {name: sorted({h for f in funcs for h in param_reads(binary, f, pool)}) for name, funcs in own.items()}


def slot_name(index: int, automata: bool) -> str | None:
    if automata or index < FIRST_BULLET_SPECIFIC_SLOT:
        entry = SLOT_SEMANTICS.get(index)
        return entry[0] if entry else None
    return None


def hx(v: int) -> str:
    return f"0x{v:X}"


def build(exe: Path, out_dir: Path) -> None:
    if not MANAGER_DICTIONARY.is_file():
        raise SystemExit(f"missing {MANAGER_DICTIONARY}")
    binary = Binary(exe)
    classes = load_classes(binary)
    resolve_factories(binary, classes, emulate_dispatcher(binary, classes))
    owner = assign_owners(binary, classes)
    pool = load_bulletparam_names()

    owned_by: dict[str, list[int]] = defaultdict(list)
    for f, o in owner.items():
        owned_by[o].append(f)
    reads_of = {node: sorted({h for f in funcs for h in param_reads(binary, f, pool)}) for node, funcs in owned_by.items()}

    manager_cache: dict[int, list[str]] = {}
    manager_vts = manager_vtables(binary)
    manager_reads = manager_param_reads(binary, manager_vts, pool)
    steps = {m["class"]: m.get("constructs", []) for m in json.loads(MANAGER_DICTIONARY.read_text(encoding="utf-8"))}
    base_slots = classes[AUTOMATA_BASE]["slots"]

    records = []
    for name, c in sorted(classes.items()):
        automata = AUTOMATA_BASE in c["chain"]
        own_slots = [i for i, v in enumerate(c["slots"]) if owner.get(v) == name]
        managers: list[str] = []
        if len(c["slots"]) > 81 and name.startswith("CUnitTaskAutomata"):
            f81 = c["slots"][81]
            if f81 not in manager_cache:
                manager_cache[f81] = manager_names(binary, manager_vts, f81)
            managers = manager_cache[f81]
        caps = []
        if automata:
            for flag, (slot, mode) in CAPABILITIES.items():
                if slot >= len(c["slots"]):
                    continue
                v = c["slots"][slot]
                if (mode == "base" and v != base_slots[slot]) or (mode == "nullsub" and v != NULLSUB):
                    caps.append(flag)
        records.append({
            "name": name,
            "family": "automata" if name.startswith("CUnitTaskAutomata") else "actor_bullet",
            "class_ids": c["class_ids"],
            "vtable": hx(c["vtable"]),
            "factory": hx(c["factory"]) if c["factory"] else None,
            "object_size": c["object_size"],
            "parent": c["chain"][1] if len(c["chain"]) > 1 else None,
            "chain": c["chain"],
            "slot_count": len(c["slots"]),
            "own_slots": [{"slot": i, "name": slot_name(i, automata), "func": hx(c["slots"][i])} for i in own_slots],
            "own_function_count": len(owned_by.get(name, [])),
            "param_reads": [{"hash": f"0x{h:08X}", "pool_name": pool[h]} for h in reads_of.get(name, [])],
            "managers": [{
                "name": m,
                "steps": steps.get(m, []),
                "param_reads": [{"hash": f"0x{h:08X}", "pool_name": pool[h]} for h in manager_reads.get(m, [])],
            } for m in managers],
            "capabilities": caps,
        })

    nodes = {}
    for c in classes.values():
        for i, ancestor in enumerate(c["chain"]):
            nodes.setdefault(ancestor, c["chain"][i + 1] if i + 1 < len(c["chain"]) else None)
    archetypes = []
    for node, parent in sorted(nodes.items()):
        members = [n for n, c in classes.items() if node in c["chain"][1:]]
        if not members:
            continue
        introduced = sorted({i for n in members + ([node] if node in classes else [])
                             for i, v in enumerate(classes[n]["slots"]) if owner.get(v) == node})
        archetypes.append({
            "name": node,
            "parent": parent,
            "has_vtable": node in classes,
            "descendants": len(members),
            "own_function_count": len(owned_by.get(node, [])),
            "slots_introduced": introduced,
            "param_reads": [{"hash": f"0x{h:08X}", "pool_name": pool[h]} for h in reads_of.get(node, [])],
        })

    slot_map = []
    automata_classes = [c for c in classes.values() if AUTOMATA_BASE in c["chain"]]
    for i in range(max(len(c["slots"]) for c in automata_classes)):
        present = [c for c in automata_classes if i < len(c["slots"])]
        impls = Counter(c["slots"][i] for c in present)
        entry = SLOT_SEMANTICS.get(i)
        slot_map.append({
            "slot": i,
            "vtable_offset": hx(i * 8),
            "name": entry[0] if entry else None,
            "evidence": entry[1] if entry else None,
            "note": entry[2] if entry else None,
            "base_impl": hx(base_slots[i]) if i < len(base_slots) else None,
            "classes_with_slot": len(present),
            "distinct_impls": len(impls),
            "classes_owning_override": sum(1 for c in present if owner.get(c["slots"][i]) == c["name"]),
        })

    out_dir.mkdir(parents=True, exist_ok=True)
    write_json(out_dir / "projectile-classes.json", records)
    write_json(out_dir / "projectile-archetypes.json", archetypes)
    write_json(out_dir / "automata-vtable-slots.json", slot_map)
    write_csv(out_dir / "projectile-classes.csv", records)
    write_tree(out_dir / "projectile-class-tree.md", archetypes, exe)
    print(f"classes={len(records)} ids={sum(len(r['class_ids']) for r in records)} archetypes={len(archetypes)}", file=sys.stderr)


def write_json(path: Path, payload: list[dict]) -> None:
    """One record per line: compact, greppable and diff-friendly."""
    body = ",\n".join(json.dumps(item, ensure_ascii=False, separators=(",", ":")) for item in payload)
    path.write_text("[\n" + body + "\n]\n", encoding="utf-8", newline="\n")


def write_csv(path: Path, records: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["class_id", "class", "family", "parent", "vtable", "object_size", "own_slots", "capabilities", "managers", "param_reads"])
        for r in records:
            for cid in r["class_ids"] or [None]:
                w.writerow([
                    cid if cid is not None else "",
                    r["name"],
                    r["family"],
                    r["parent"] or "",
                    r["vtable"],
                    hx(r["object_size"]) if r["object_size"] else "",
                    ";".join(f"{s['slot']}{'=' + s['name'] if s['name'] else ''}" for s in r["own_slots"]),
                    ";".join(r["capabilities"]),
                    ";".join(m["name"] for m in r["managers"]),
                    ";".join(p["hash"] for p in r["param_reads"]),
                ])


def write_tree(path: Path, archetypes: list[dict], exe: Path) -> None:
    by_name = {a["name"]: a for a in archetypes}
    kids: dict[str, list[str]] = defaultdict(list)
    for a in archetypes:
        if a["descendants"] > 0:
            kids[a["parent"]].append(a["name"])
    lines = [
        "# Projectile class hierarchy (inner nodes)",
        "",
        f"Generated by `tools/extract_projectile_class_catalog.py` from `{exe.name}`.",
        "Count = number of classes below the node. `novt` = the base has no vtable of its own",
        "(VDK framework class); its functions are attributed by lowest common ancestor.",
        "",
        "```text",
    ]

    def walk(name: str, depth: int) -> None:
        a = by_name[name]
        flag = "" if a["has_vtable"] else " novt"
        lines.append(f"{'  ' * depth}{name} [{a['descendants']}]{flag} funcs={a['own_function_count']}")
        for k in sorted(kids.get(name, []), key=lambda k: (-by_name[k]["descendants"], k)):
            walk(k, depth + 1)

    walk(ROOT, 0)
    lines += ["```", ""]
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        raise SystemExit(f"usage: {argv[0]} <path-to-exe> <output-dir>")
    exe = Path(argv[1])
    if not exe.is_file():
        raise SystemExit(f"missing binary {exe}")
    build(exe, Path(argv[2]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
