import sys, os, logging, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
logging.basicConfig(level=logging.WARNING)

from msc_core import MscFile, EXVS2_FORMAT, Command
from disasmlib import ScriptRef

TEST_DIR = r'E:\XB\解包\com\file\0xBDBE6FEA_test'


def count_script_refs(msc_file):
    total = 0
    ref_map = {}
    for si, script in enumerate(msc_file.scripts):
        for cmd in script.cmds:
            if isinstance(cmd, Command) and cmd.command in (0x0A, 0x0D):
                val = cmd.parameters[0]
                if isinstance(val, (str, ScriptRef)):
                    total += 1
                    key = f'{script.name}:{cmd.commandPosition:#x}'
                    ref_map[key] = str(val)
    return total, ref_map


def load_and_resolve_cfg(path):
    from msc_cfg import resolve_script_refs_cfg, resolve_cross_script_refs, ScriptRefStr
    msc = MscFile()
    with open(path, 'rb') as f:
        msc.readFromFile(f, EXVS2_FORMAT)

    offset_to_name = {}
    for script in msc.scripts:
        offset_to_name[script.bounds[0]] = script.name

    called_vars = {}
    for script in msc.scripts:
        resolve_script_refs_cfg(script, offset_to_name, called_vars)
    resolve_cross_script_refs(msc, offset_to_name, called_vars)
    resolve_cross_script_refs(msc, offset_to_name, called_vars)

    for script in msc.scripts:
        for cmd in script.cmds:
            if isinstance(cmd, Command) and cmd.command in (0x0A, 0x0D):
                if isinstance(cmd.parameters[0], ScriptRefStr):
                    cmd.parameters[0] = ScriptRef(str(cmd.parameters[0]))

    return msc


def load_and_resolve_legacy(path):
    from disasmlib import disasm
    return disasm(path, use_cfg=False)


for fn in ['1.cscex', '0.bscex', '2.dscex']:
    path = os.path.join(TEST_DIR, fn)
    print(f'\n=== {fn} ===')

    cfg_msc = load_and_resolve_cfg(path)
    cfg_count, cfg_refs = count_script_refs(cfg_msc)

    legacy_msc = load_and_resolve_legacy(path)
    leg_count, leg_refs = count_script_refs(legacy_msc)

    print(f'  CFG refs: {cfg_count}, Legacy refs: {leg_count}')

    all_keys = set(cfg_refs.keys()) | set(leg_refs.keys())
    missing_in_cfg = 0
    missing_in_legacy = 0
    different = 0
    for k in sorted(all_keys):
        c = cfg_refs.get(k)
        l = leg_refs.get(k)
        if c is None and l is not None:
            missing_in_cfg += 1
            if missing_in_cfg <= 3:
                print(f'    MISSING in CFG: {k} -> legacy={l}')
        elif l is None and c is not None:
            missing_in_legacy += 1
            if missing_in_legacy <= 3:
                print(f'    EXTRA in CFG: {k} -> cfg={c}')
        elif c != l:
            different += 1
            if different <= 3:
                print(f'    DIFFER: {k} -> cfg={c} legacy={l}')

    if missing_in_cfg > 3:
        print(f'    ... {missing_in_cfg - 3} more missing in CFG')
    if missing_in_legacy > 3:
        print(f'    ... {missing_in_legacy - 3} more extra in CFG')
    if different > 3:
        print(f'    ... {different - 3} more different')

    if missing_in_cfg == 0 and missing_in_legacy == 0 and different == 0:
        print(f'  PERFECT MATCH: all {cfg_count} refs identical')
    else:
        print(f'  DIFF: missing_cfg={missing_in_cfg} extra_cfg={missing_in_legacy} different={different}')
