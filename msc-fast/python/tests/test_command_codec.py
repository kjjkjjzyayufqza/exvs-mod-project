"""Lock Command decode/encode bytes against the unmodified original module."""
from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

from conftest import FAST_DIR, ORIGINAL_DIR, SAMPLE_DIRS


def _load_module(module_name: str, path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise AssertionError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _first_sample_binary() -> Path:
    for sample_dir in SAMPLE_DIRS:
        for name in ("2.dscex", "0.bscex", "1.cscex"):
            path = sample_dir / name
            if path.is_file():
                return path
    raise RuntimeError("no MSC binary fixture found")


def test_mscdec_disassemble_commands_match_original():
    original = _load_module("orig_mscdec_msc", ORIGINAL_DIR / "mscdec_msc.py")
    fast = _load_module("fast_mscdec_msc", FAST_DIR / "mscdec_msc.py")
    data = _first_sample_binary().read_bytes()
    entries_offset = int.from_bytes(data[0x10:0x14], "little")
    body = data[0x40 : 0x30 + entries_offset]
    original_cmds = original.disassembleCommands(body, 0x10)
    fast_cmds = fast.disassembleCommands(body, 0x10)
    original_view = [
        (cmd.command, cmd.pushBit, list(cmd.parameters), cmd.commandPosition, cmd.paramSize)
        for cmd in original_cmds
    ]
    fast_view = [
        (cmd.command, cmd.pushBit, list(cmd.parameters), cmd.commandPosition, cmd.paramSize)
        for cmd in fast_cmds
    ]
    assert original_view == fast_view
    assert original_view, "fixture produced no commands"


def test_msclang_command_write_match_original():
    original = _load_module("orig_msclang_msc", ORIGINAL_DIR / "msclang_msc.py")
    fast = _load_module("fast_msclang_msc", FAST_DIR / "msclang_msc.py")
    cases = [
        (0x0A, [0x12345678], False),
        (0x0D, [0x10], True),
        (0x2D, [0x04, 0x01], False),
        (0x1C, [0x00, 0x03], True),
        (0x03, [], False),
        (0x2F, [0x02], True),
    ]
    for command, parameters, push_bit in cases:
        original_bytes = original.Command(command, list(parameters), push_bit).write()
        fast_bytes = fast.Command(command, list(parameters), push_bit).write()
        assert original_bytes == fast_bytes, (
            f"command 0x{command:x} pushBit={push_bit} parameters={parameters}: "
            f"original={original_bytes!r} fast={fast_bytes!r}"
        )
