import json
import re
from argparse import ArgumentParser
from typing import Dict, List


def parse_bind_action_hash_handlers(file_text: str) -> List[Dict[str, str]]:
    pattern = re.compile(
        r"bindActionHashHandler\(\s*(0x[0-9a-fA-F]+)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)"
    )
    results: List[Dict[str, str]] = []
    for line_number, line in enumerate(file_text.splitlines(), start=1):
        match = pattern.search(line)
        if not match:
            continue
        results.append(
            {
                "action_hash": match.group(1).lower(),
                "registration_function": "bindActionHashHandler",
                "callback_symbol_hint": match.group(2),
                "evidence": f"2.c:{line_number}",
            }
        )
    return results


def parse_func83_offsets(file_text: str) -> List[Dict[str, int]]:
    pattern = re.compile(r"func_83\(\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*\)")
    entries: List[Dict[str, int]] = []
    for line_number, line in enumerate(file_text.splitlines(), start=1):
        match = pattern.search(line)
        if not match:
            continue
        action_slot = int(match.group(1), 0)
        target_value = int(match.group(2), 0)
        entries.append(
            {
                "action_slot": action_slot,
                "target_value": target_value,
                "evidence_line": line_number,
            }
        )
    return entries


def main() -> None:
    parser = ArgumentParser(description="Generate EXVS native truth seed data from decompiled C files")
    parser.add_argument("--script0", required=True, help="Path to 0.c or 0_bak.c")
    parser.add_argument("--script2", required=True, help="Path to 2.c")
    parser.add_argument("--output", required=True, help="Output JSON path")
    args = parser.parse_args()

    with open(args.script0, "r", encoding="utf-8") as f:
        script0_text = f.read()
    with open(args.script2, "r", encoding="utf-8") as f:
        script2_text = f.read()

    callback_bindings_seed = parse_bind_action_hash_handlers(script2_text)
    func83_seed = parse_func83_offsets(script0_text)

    result = {
        "schema_version": 1,
        "generator": "extract_exvs_native_truth_seed.py",
        "sources": {"script0": args.script0, "script2": args.script2},
        "callback_bindings_seed": callback_bindings_seed,
        "func83_seed": func83_seed,
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
        f.write("\n")

    print(f"Wrote seed mapping data to {args.output}")


if __name__ == "__main__":
    main()
