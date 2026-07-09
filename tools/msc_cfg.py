from msc_core import Command, COMMAND_STACKPOPS, MscScript, MscFile
import logging

class BasicBlock:
    __slots__ = ('start_idx', 'end_idx', 'successors', 'predecessors')

    def __init__(self, start_idx):
        self.start_idx = start_idx
        self.end_idx = start_idx
        self.successors = []
        self.predecessors = []


def build_cfg(script):
    cmds = script.cmds
    if not cmds:
        return []

    block_starts = {0}
    for i, cmd in enumerate(cmds):
        if not _is_command_like(cmd):
            continue
        if cmd.command in (0x04, 0x05, 0x36):
            target = cmd.parameters[0]
            target_idx = script.getIndexOfInstruction(target)
            if target_idx is not None:
                block_starts.add(target_idx)
            if i + 1 < len(cmds):
                block_starts.add(i + 1)
        elif cmd.command in (0x34, 0x35):
            target = cmd.parameters[0]
            target_idx = script.getIndexOfInstruction(target)
            if target_idx is not None:
                block_starts.add(target_idx)
            if i + 1 < len(cmds):
                block_starts.add(i + 1)
        elif cmd.command == 0x03:
            if i + 1 < len(cmds):
                block_starts.add(i + 1)

    sorted_starts = sorted(block_starts)
    blocks = []
    start_to_block = {}
    for si, start in enumerate(sorted_starts):
        bb = BasicBlock(start)
        if si + 1 < len(sorted_starts):
            bb.end_idx = sorted_starts[si + 1] - 1
        else:
            bb.end_idx = len(cmds) - 1
        blocks.append(bb)
        start_to_block[start] = bb

    for bb in blocks:
        last_cmd = None
        for idx in range(bb.end_idx, bb.start_idx - 1, -1):
            if _is_command_like(cmds[idx]):
                last_cmd = cmds[idx]
                break

        if last_cmd is None:
            fallthrough = bb.end_idx + 1
            if fallthrough in start_to_block:
                bb.successors.append(start_to_block[fallthrough])
                start_to_block[fallthrough].predecessors.append(bb)
            continue

        if last_cmd.command in (0x04, 0x05, 0x36):
            target = last_cmd.parameters[0]
            target_idx = script.getIndexOfInstruction(target)
            if target_idx is not None and target_idx in start_to_block:
                bb.successors.append(start_to_block[target_idx])
                start_to_block[target_idx].predecessors.append(bb)
        elif last_cmd.command in (0x34, 0x35):
            target = last_cmd.parameters[0]
            target_idx = script.getIndexOfInstruction(target)
            if target_idx is not None and target_idx in start_to_block:
                bb.successors.append(start_to_block[target_idx])
                start_to_block[target_idx].predecessors.append(bb)
            fallthrough = bb.end_idx + 1
            if fallthrough in start_to_block:
                bb.successors.append(start_to_block[fallthrough])
                start_to_block[fallthrough].predecessors.append(bb)
        elif last_cmd.command in (0x03, 0x4D):
            pass
        else:
            fallthrough = bb.end_idx + 1
            if fallthrough in start_to_block:
                bb.successors.append(start_to_block[fallthrough])
                start_to_block[fallthrough].predecessors.append(bb)

    return blocks


class ScriptRefStr(str):
    pass


EXVS_SYS1_SCRIPT_CALLBACK_SIGNATURES = {
    (0x10001, 0x02): (3,),
    (0x10001, 0x0A): (3,),
    (0x10002, 0x02): (3,),
}


def _is_command_like(cmd_obj):
    return hasattr(cmd_obj, "command") and hasattr(cmd_obj, "parameters")


def _constant_int_from_command(cmd_obj):
    if not _is_command_like(cmd_obj):
        return None
    if cmd_obj.command not in (0x0A, 0x0D):
        return None
    val = cmd_obj.parameters[0]
    return val if isinstance(val, int) else None


def _popped_index_for_source_arg(popped, source_arg_index):
    index = len(popped) - 1 - source_arg_index
    return index if 0 <= index < len(popped) else None


def _source_arg_int(popped, source_arg_index):
    index = _popped_index_for_source_arg(popped, source_arg_index)
    if index is None:
        return None
    return _constant_int_from_command(popped[index])


def resolve_exvs_syscall_script_refs(cmd, popped, resolve_popped_index):
    if not _is_command_like(cmd):
        return
    if cmd.command != 0x2D or cmd.parameters[1] != 0x01:
        return

    table_id = _source_arg_int(popped, 0)
    method_id = _source_arg_int(popped, 1)
    if table_id is None or method_id is None:
        return

    callback_arg_indices = EXVS_SYS1_SCRIPT_CALLBACK_SIGNATURES.get((table_id, method_id))
    if callback_arg_indices is None:
        return

    for source_arg_index in callback_arg_indices:
        popped_index = _popped_index_for_source_arg(popped, source_arg_index)
        if popped_index is not None:
            resolve_popped_index(popped_index)


def resolve_script_refs_cfg(
    script,
    script_offset_to_name,
    script_called_vars=None,
    stack_pops=COMMAND_STACKPOPS,
):
    cmds = script.cmds
    if not cmds:
        return
    if script_called_vars is None:
        script_called_vars = {}

    script_name = script_offset_to_name.get(script.bounds[0], script.name)
    valid_offsets = set(script_offset_to_name.keys())

    blocks = build_cfg(script)

    for bb in blocks:
        stack = []
        for idx in range(bb.start_idx, bb.end_idx + 1):
            item = cmds[idx]
            if not _is_command_like(item):
                continue
            cmd = item

            pop_count = stack_pops[cmd.command](cmd.parameters)
            popped = []
            for _ in range(pop_count):
                if stack:
                    popped.append(stack.pop())
                else:
                    popped.append(None)

            if cmd.command in (0x2f, 0x30, 0x31):
                if popped and popped[0] is not None:
                    _try_resolve_ref(popped[0], valid_offsets, script_offset_to_name)
                for p in popped:
                    if p is not None and _is_command_like(p) and p.command in (0x0A, 0x0D):
                        val = p.parameters[0]
                        if isinstance(val, int) and val > 0x50 and val in valid_offsets:
                            p.parameters[0] = ScriptRefStr(script_offset_to_name[val])

            if cmd.command == 0x2c and popped:
                last_pop = popped[-1]
                if last_pop is not None and _is_command_like(last_pop) and last_pop.command in (0x0A, 0x0D):
                    val = last_pop.parameters[0]
                    if isinstance(val, int) and not isinstance(val, str):
                        pass

            if cmd.command in (0x1C, 0x41) and cmd.parameters[0] == 0x1:
                if popped and popped[0] is not None:
                    _try_resolve_ref(popped[0], valid_offsets, script_offset_to_name)

            if cmd.command in (0x1C, 0x41) and cmd.parameters[0] == 0x0:
                if popped and popped[0] is not None:
                    p = popped[0]
                    if _is_command_like(p) and p.command in (0x0A, 0x0D):
                        val = p.parameters[0]
                        if isinstance(val, int) and val in valid_offsets:
                            if script_name not in script_called_vars:
                                script_called_vars[script_name] = []
                            var_idx = cmd.parameters[1]
                            if var_idx not in script_called_vars[script_name]:
                                script_called_vars[script_name].append(var_idx)

            resolve_exvs_syscall_script_refs(
                cmd,
                popped,
                lambda popped_index: _try_resolve_ref(
                    popped[popped_index],
                    valid_offsets,
                    script_offset_to_name,
                ),
            )

            if cmd.command == 0x32:
                if idx > 0 and _is_command_like(cmds[idx - 1]):
                    stack.append(cmds[idx - 1])

            if cmd.pushBit:
                stack.append(cmd)


def _try_resolve_ref(cmd_obj, valid_offsets, offset_to_name):
    if cmd_obj is None:
        return
    if not _is_command_like(cmd_obj):
        return
    if cmd_obj.command not in (0x0A, 0x0D):
        return
    val = cmd_obj.parameters[0]
    if isinstance(val, int) and val in valid_offsets:
        cmd_obj.parameters[0] = ScriptRefStr(offset_to_name[val])


def resolve_cross_script_refs(
    msc_file,
    script_offset_to_name,
    script_called_vars,
    stack_pops=COMMAND_STACKPOPS,
):
    valid_offsets = set(script_offset_to_name.keys())

    for script in msc_file.scripts:
        script_name = script_offset_to_name.get(script.bounds[0], script.name)
        cmds = script.cmds
        blocks = build_cfg(script)

        for bb in blocks:
            stack = []
            for idx in range(bb.start_idx, bb.end_idx + 1):
                item = cmds[idx]
                if not _is_command_like(item):
                    continue
                cmd = item

                pop_count = stack_pops[cmd.command](cmd.parameters)
                popped = []
                for _ in range(pop_count):
                    if stack:
                        popped.append(stack.pop())
                    else:
                        popped.append(None)

                if cmd.command in (0x1C, 0x41) and script_name in script_called_vars:
                    if cmd.parameters[0] == 0 and cmd.parameters[1] in script_called_vars[script_name]:
                        if popped and popped[0] is not None:
                            _try_resolve_ref(popped[0], valid_offsets, script_offset_to_name)

                if cmd.command in (0x2f, 0x30, 0x31):
                    if popped and popped[0] is not None:
                        p0 = popped[0]
                        jump_name = None
                        if _is_command_like(p0) and p0.command in (0x0A, 0x0D):
                            val = p0.parameters[0]
                            if isinstance(val, int) and val in script_offset_to_name:
                                jump_name = script_offset_to_name[val]
                            elif isinstance(val, (str, ScriptRefStr)):
                                jump_name = str(val)
                        if jump_name and jump_name in script_called_vars:
                            for local_var_num in script_called_vars[jump_name]:
                                arg_idx = -(local_var_num + 1)
                                if abs(arg_idx) <= len(popped) and popped[arg_idx] is not None:
                                    _try_resolve_ref(popped[arg_idx], valid_offsets, script_offset_to_name)

                if cmd.command == 0x32:
                    if idx > 0 and _is_command_like(cmds[idx - 1]):
                        stack.append(cmds[idx - 1])
                if cmd.pushBit:
                    stack.append(cmd)
