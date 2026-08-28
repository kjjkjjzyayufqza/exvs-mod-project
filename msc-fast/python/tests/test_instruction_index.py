"""Behavioral lock for MscScript.getIndexOfInstruction: first match wins."""
from __future__ import annotations

import sys

from conftest import FAST_DIR

sys.path.insert(0, str(FAST_DIR))
from mscdec_msc import Command, MscScript  # noqa: E402


def _script_with_positions(positions: list[int]) -> MscScript:
    script = MscScript()
    for position in positions:
        cmd = Command(0x0A, [position])
        cmd.commandPosition = position
        script.cmds.append(cmd)
    return script


def test_get_index_returns_first_match_when_positions_repeat():
    script = _script_with_positions([10, 20, 10, 30])
    assert script.getIndexOfInstruction(10) == 0
    assert script.getIndexOfInstruction(20) == 1
    assert script.getIndexOfInstruction(30) == 3
    assert script.getIndexOfInstruction(99) is None


def test_get_index_skips_objects_without_command_position():
    script = MscScript()
    missing = object()
    first = Command(0x0D, [1])
    first.commandPosition = 40
    second = Command(0x0D, [2])
    second.commandPosition = 50
    script.cmds = [missing, first, second]
    assert script.getIndexOfInstruction(40) == 1
    assert script.getIndexOfInstruction(50) == 2
