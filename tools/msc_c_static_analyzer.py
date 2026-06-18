from __future__ import annotations

from argparse import ArgumentParser
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import re
from typing import Iterable


FUNCTION_RE = re.compile(r"^(void|int)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*$")
CALL_RE = re.compile(r"\b(func_\d+|ACTION_[A-Z0-9_]+)\s*\(")
SYSCALL_RE = re.compile(r"\b(sys_[0-9A-Fa-f]+)\s*\(")
GLOBAL_WRITE_RE = re.compile(
    r"\b(global\d+)\s*(\+=|-=|\*=|/=|%=|\|=|&=|\^=|(?<![=!<>])=(?!=))\s*([^;]+);"
)
GLOBAL_READ_RE = re.compile(r"\b(global\d+)\b")
HEX_RE = re.compile(r"\b0x[0-9A-Fa-f]+\b")
FUNC241_RE = re.compile(r"\bfunc_241\s*\(\s*([^,]+?)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)")
SYS1_REGISTRY_RE = re.compile(
    r"\bsys_1\s*\(\s*(0x10001)\s*,\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*([^)]+?)\s*\)"
)


@dataclass
class FunctionBlock:
    return_type: str
    name: str
    signature: str
    start_line: int
    end_line: int
    body: list[str]


def read_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8", errors="replace").splitlines()


def split_args(arg_text: str) -> list[str]:
    args: list[str] = []
    current: list[str] = []
    depth = 0
    for char in arg_text:
        if char == "(":
            depth += 1
        elif char == ")" and depth:
            depth -= 1
        if char == "," and depth == 0:
            args.append("".join(current).strip())
            current = []
        else:
            current.append(char)
    tail = "".join(current).strip()
    if tail:
        args.append(tail)
    return args


def find_matching_call_args(text: str, start: int) -> tuple[str, int] | None:
    open_pos = text.find("(", start)
    if open_pos < 0:
        return None
    depth = 0
    for index in range(open_pos, len(text)):
        char = text[index]
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return text[open_pos + 1 : index], index + 1
    return None


def iter_function_blocks(lines: list[str]) -> Iterable[FunctionBlock]:
    starts: list[tuple[int, re.Match[str]]] = []
    for line_number, line in enumerate(lines, start=1):
        match = FUNCTION_RE.match(line.strip())
        if match:
            starts.append((line_number, match))
    for index, (start_line, match) in enumerate(starts):
        end_line = starts[index + 1][0] - 1 if index + 1 < len(starts) else len(lines)
        yield FunctionBlock(
            return_type=match.group(1),
            name=match.group(2),
            signature=match.group(0),
            start_line=start_line,
            end_line=end_line,
            body=lines[start_line - 1 : end_line],
        )


def collect_syscalls(body_text: str) -> dict[str, dict]:
    calls: dict[str, dict] = {}
    for match in SYSCALL_RE.finditer(body_text):
        name = match.group(1)
        arg_result = find_matching_call_args(body_text, match.start())
        if not arg_result:
            continue
        args = split_args(arg_result[0])
        subcmd = args[0] if args else ""
        entry = calls.setdefault(name, {"count": 0, "subcommands": Counter(), "examples": []})
        entry["count"] += 1
        entry["subcommands"][subcmd] += 1
        if len(entry["examples"]) < 8:
            entry["examples"].append({"subcmd": subcmd, "args": args})
    return {
        name: {
            "count": entry["count"],
            "subcommands": dict(sorted(entry["subcommands"].items(), key=lambda item: (-item[1], item[0]))),
            "examples": entry["examples"],
        }
        for name, entry in sorted(calls.items())
    }


def collect_registry(body_text: str) -> dict[str, list[dict[str, str]]]:
    action_handlers = [
        {"hash": hash_text.strip(), "callback": callback.strip()}
        for hash_text, callback in FUNC241_RE.findall(body_text)
    ]
    sys1_entries = [
        {
            "domain": domain.strip(),
            "group": group.strip(),
            "slot": slot.strip(),
            "value": value.strip(),
        }
        for domain, group, slot, value in SYS1_REGISTRY_RE.findall(body_text)
    ]
    return {"actionHandlers": action_handlers, "sys1_10001": sys1_entries}


def analyze_function(block: FunctionBlock) -> dict:
    body_text = "\n".join(block.body[1:])
    calls = sorted(set(CALL_RE.findall(body_text)))
    syscalls = collect_syscalls(body_text)
    writes = [
        {"global": global_name, "operator": operator, "value": value.strip()}
        for global_name, operator, value in GLOBAL_WRITE_RE.findall(body_text)
    ]
    written_globals = {entry["global"] for entry in writes}
    read_globals = sorted(set(GLOBAL_READ_RE.findall(body_text)) - written_globals)
    constants = sorted(set(HEX_RE.findall(body_text)), key=lambda value: int(value, 16))
    registry = collect_registry(body_text)
    return {
        "name": block.name,
        "returnType": block.return_type,
        "signature": block.signature,
        "startLine": block.start_line,
        "endLine": block.end_line,
        "lineCount": block.end_line - block.start_line + 1,
        "calls": calls,
        "syscalls": syscalls,
        "globalWrites": writes,
        "globalReads": read_globals,
        "constants": constants,
        "registry": registry,
    }


def bucket_for_function(name: str) -> str:
    if name == "main":
        return "main"
    if name.startswith("ACTION_"):
        return "ACTION_*"
    if name.startswith("func_"):
        number = int(name.split("_", 1)[1])
        if number < 100:
            return "func_1..99"
        if number < 200:
            return "func_100..199"
        if number < 300:
            return "func_200..299"
        if number < 400:
            return "func_300..399"
        if number < 500:
            return "func_400..499"
        if number < 600:
            return "func_500..599"
        if number < 700:
            return "func_600..699"
        if number < 800:
            return "func_700..799"
        if number < 850:
            return "func_800..849"
        if number < 900:
            return "func_850..899"
        if number < 1000:
            return "func_900..999"
        return "func_1000..1046"
    return "other"


def build_summary(functions: list[dict]) -> dict:
    bucket_counts: dict[str, dict] = {}
    syscall_totals: Counter[str] = Counter()
    syscall_subcommands: dict[str, Counter[str]] = defaultdict(Counter)
    global_writes: Counter[str] = Counter()
    function_lengths = []
    syscall_hotspots: dict[str, list[dict]] = defaultdict(list)

    for function in functions:
        bucket = bucket_for_function(function["name"])
        bucket_entry = bucket_counts.setdefault(
            bucket,
            {
                "functionCount": 0,
                "lineCount": 0,
                "startLine": function["startLine"],
                "endLine": function["endLine"],
                "syscalls": Counter(),
            },
        )
        bucket_entry["functionCount"] += 1
        bucket_entry["lineCount"] += function["lineCount"]
        bucket_entry["startLine"] = min(bucket_entry["startLine"], function["startLine"])
        bucket_entry["endLine"] = max(bucket_entry["endLine"], function["endLine"])
        function_lengths.append(
            {
                "name": function["name"],
                "lineCount": function["lineCount"],
                "startLine": function["startLine"],
            }
        )
        for syscall_name, syscall_info in function["syscalls"].items():
            syscall_totals[syscall_name] += syscall_info["count"]
            bucket_entry["syscalls"][syscall_name] += syscall_info["count"]
            syscall_hotspots[syscall_name].append(
                {
                    "function": function["name"],
                    "line": function["startLine"],
                    "count": syscall_info["count"],
                    "topSubcommands": dict(list(syscall_info["subcommands"].items())[:5]),
                }
            )
            for subcmd, count in syscall_info["subcommands"].items():
                syscall_subcommands[syscall_name][subcmd] += count
        for write in function["globalWrites"]:
            global_writes[write["global"]] += 1

    normalized_buckets = {
        name: {
            "functionCount": entry["functionCount"],
            "lineCount": entry["lineCount"],
            "startLine": entry["startLine"],
            "endLine": entry["endLine"],
            "syscalls": dict(sorted(entry["syscalls"].items())),
        }
        for name, entry in bucket_counts.items()
    }
    return {
        "buckets": normalized_buckets,
        "syscallTotals": dict(sorted(syscall_totals.items())),
        "syscallSubcommands": {
            name: dict(sorted(counter.items(), key=lambda item: (-item[1], item[0])))
            for name, counter in sorted(syscall_subcommands.items())
        },
        "syscallHotspots": {
            name: sorted(entries, key=lambda entry: entry["count"], reverse=True)[:20]
            for name, entries in sorted(syscall_hotspots.items())
        },
        "globalWriteHotspots": dict(global_writes.most_common(60)),
        "longestFunctions": sorted(function_lengths, key=lambda entry: entry["lineCount"], reverse=True)[:40],
    }


def analyze(path: Path) -> dict:
    lines = read_lines(path)
    blocks = list(iter_function_blocks(lines))
    functions = [analyze_function(block) for block in blocks]
    file_bytes = path.read_bytes()
    stats = {
        "lineCount": len(lines),
        "functionCount": len(functions),
        "voidFunctionCount": sum(1 for function in functions if function["returnType"] == "void"),
        "intFunctionCount": sum(1 for function in functions if function["returnType"] == "int"),
        "actionFunctionCount": sum(1 for function in functions if function["name"].startswith("ACTION_")),
        "sha256": hashlib.sha256(file_bytes).hexdigest().upper(),
        "byteLength": len(file_bytes),
    }
    return {
        "schema": "exvs.msc.c_static_analysis.v0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourcePath": str(path),
        "stats": stats,
        "summary": build_summary(functions),
        "functions": functions,
    }


def main() -> None:
    parser = ArgumentParser(description="Static analyzer for decompiled EXVS MSC C-like output.")
    parser.add_argument("source", help="Path to decompiled C file.")
    parser.add_argument("--output", required=True, help="Path to write JSON analysis.")
    args = parser.parse_args()

    result = analyze(Path(args.source))
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
