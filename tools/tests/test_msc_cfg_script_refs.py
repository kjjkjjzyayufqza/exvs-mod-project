import sys
import unittest
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parents[1]
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from msc_cfg import ScriptRefStr, resolve_cross_script_refs, resolve_script_refs_cfg
from mscdec_msc import COMMAND_STACKPOPS


class FakeCommand:
    def __init__(self, command, parameters=None, push_bit=False, position=0):
        self.command = command
        self.parameters = list(parameters or [])
        self.pushBit = push_bit
        self.commandPosition = position


class FakeScript:
    def __init__(self, name, start, commands):
        self.name = name
        self.bounds = [start, start + len(commands)]
        self.cmds = commands
        for index, command in enumerate(commands):
            command.commandPosition = start + index

    def getIndexOfInstruction(self, position):
        for index, command in enumerate(self.cmds):
            if command.commandPosition == position:
                return index
        return None


class FakeMscFile:
    def __init__(self, scripts):
        self.scripts = scripts


def run_cfg_resolution(scripts, offset_to_name):
    called_vars = {}
    for script in scripts:
        resolve_script_refs_cfg(
            script,
            offset_to_name,
            called_vars,
            stack_pops=COMMAND_STACKPOPS,
        )

    msc_file = FakeMscFile(scripts)
    resolve_cross_script_refs(
        msc_file,
        offset_to_name,
        called_vars,
        stack_pops=COMMAND_STACKPOPS,
    )
    resolve_cross_script_refs(
        msc_file,
        offset_to_name,
        called_vars,
        stack_pops=COMMAND_STACKPOPS,
    )
    return called_vars


class MscCfgScriptRefTests(unittest.TestCase):
    def test_literal_local_assignment_is_not_a_script_ref_without_pointer_sink(self):
        literal = FakeCommand(0x0A, [0x10], push_bit=True)
        script = FakeScript(
            "func_data",
            0x200,
            [
                literal,
                FakeCommand(0x1C, [0, 0]),
            ],
        )

        run_cfg_resolution(
            [script],
            {
                0x10: "func_0",
                0x200: "func_data",
            },
        )

        self.assertEqual(literal.parameters[0], 0x10)
        self.assertNotIsInstance(literal.parameters[0], ScriptRefStr)

    def test_sys2_callback_sink_resolves_direct_script_offset_even_when_value_is_small(self):
        callback = FakeCommand(0x0A, [0x10], push_bit=True)
        script = FakeScript(
            "func_register",
            0x200,
            [
                FakeCommand(0x0A, [0], push_bit=True),
                FakeCommand(0x0A, [0x2], push_bit=True),
                callback,
                FakeCommand(0x2D, [3, 2]),
            ],
        )

        run_cfg_resolution(
            [script],
            {
                0x10: "func_0",
                0x200: "func_register",
            },
        )

        self.assertIsInstance(callback.parameters[0], ScriptRefStr)
        self.assertEqual(callback.parameters[0], "func_0")

    def test_sys2_callback_sink_resolves_reaching_local_assignment(self):
        callback_assignment = FakeCommand(0x0A, [0x4438], push_bit=True)
        script = FakeScript(
            "func_action_dispatch",
            0x4000,
            [
                callback_assignment,
                FakeCommand(0x1C, [0, 1]),
                FakeCommand(0x0A, [0], push_bit=True),
                FakeCommand(0x0A, [0x2], push_bit=True),
                FakeCommand(0x0B, [0, 1], push_bit=True),
                FakeCommand(0x2D, [3, 2]),
            ],
        )

        run_cfg_resolution(
            [script],
            {
                0x4000: "func_action_dispatch",
                0x4438: "func_45",
            },
        )

        self.assertIsInstance(callback_assignment.parameters[0], ScriptRefStr)
        self.assertEqual(callback_assignment.parameters[0], "func_45")


if __name__ == "__main__":
    unittest.main()
