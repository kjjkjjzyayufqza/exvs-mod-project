//! Script-reference resolution matching `tools/msc_cfg.py` + `disasmlib.disasm(use_cfg=True)`.

use crate::msc_toolchain::binary::{Command, Item, MscFile, Param, Script};
use crate::msc_toolchain::opcode::stack_pops;
use std::collections::{HashMap, HashSet};

struct BasicBlock {
    start: usize,
    end: usize,
    successors: Vec<usize>,
}

fn is_cmd(item: &Item) -> bool {
    matches!(item, Item::Cmd(_))
}

fn cmd_at(script: &Script, idx: usize) -> Option<&Command> {
    match script.items.get(idx) {
        Some(Item::Cmd(c)) => Some(c),
        _ => None,
    }
}

fn index_of_pos(script: &Script, pos: u32) -> Option<usize> {
    script
        .items
        .iter()
        .enumerate()
        .find_map(|(i, item)| match item {
            Item::Cmd(c) if c.pos == pos => Some(i),
            _ => None,
        })
}

fn build_cfg(script: &Script) -> Vec<BasicBlock> {
    let n = script.items.len();
    if n == 0 {
        return Vec::new();
    }
    let mut starts = HashSet::from([0usize]);
    for (i, item) in script.items.iter().enumerate() {
        let Item::Cmd(cmd) = item else { continue };
        if matches!(cmd.op, 0x04 | 0x05 | 0x36 | 0x34 | 0x35) {
            if let Some(Param::U32(target)) = cmd.params.first() {
                if let Some(ti) = index_of_pos(script, *target) {
                    starts.insert(ti);
                }
            }
            if i + 1 < n {
                starts.insert(i + 1);
            }
        } else if cmd.op == 0x03 && i + 1 < n {
            starts.insert(i + 1);
        }
    }
    let mut sorted: Vec<usize> = starts.into_iter().collect();
    sorted.sort_unstable();
    let mut blocks: Vec<BasicBlock> = sorted
        .iter()
        .enumerate()
        .map(|(si, &start)| BasicBlock {
            start,
            end: if si + 1 < sorted.len() {
                sorted[si + 1] - 1
            } else {
                n - 1
            },
            successors: Vec::new(),
        })
        .collect();
    let start_to_block: HashMap<usize, usize> = blocks
        .iter()
        .enumerate()
        .map(|(i, b)| (b.start, i))
        .collect();

    for bi in 0..blocks.len() {
        let mut last = None;
        for idx in (blocks[bi].start..=blocks[bi].end).rev() {
            if is_cmd(&script.items[idx]) {
                last = Some(idx);
                break;
            }
        }
        let Some(last_idx) = last else {
            let fall = blocks[bi].end + 1;
            if let Some(&sbi) = start_to_block.get(&fall) {
                blocks[bi].successors.push(sbi);
            }
            continue;
        };
        let last_cmd = cmd_at(script, last_idx).unwrap();
        if matches!(last_cmd.op, 0x04 | 0x05 | 0x36) {
            if let Some(Param::U32(t)) = last_cmd.params.first() {
                if let Some(ti) = index_of_pos(script, *t) {
                    if let Some(&sbi) = start_to_block.get(&ti) {
                        blocks[bi].successors.push(sbi);
                    }
                }
            }
        } else if matches!(last_cmd.op, 0x34 | 0x35) {
            if let Some(Param::U32(t)) = last_cmd.params.first() {
                if let Some(ti) = index_of_pos(script, *t) {
                    if let Some(&sbi) = start_to_block.get(&ti) {
                        blocks[bi].successors.push(sbi);
                    }
                }
            }
            let fall = blocks[bi].end + 1;
            if let Some(&sbi) = start_to_block.get(&fall) {
                blocks[bi].successors.push(sbi);
            }
        } else if matches!(last_cmd.op, 0x03 | 0x4D) {
        } else {
            let fall = blocks[bi].end + 1;
            if let Some(&sbi) = start_to_block.get(&fall) {
                blocks[bi].successors.push(sbi);
            }
        }
    }
    blocks
}

fn try_resolve(cmd: &mut Command, valid: &HashSet<u32>, names: &HashMap<u32, String>) {
    if !matches!(cmd.op, 0x0A | 0x0D) {
        return;
    }
    if let Some(Param::U32(v)) = cmd.params.first() {
        if valid.contains(v) {
            if let Some(name) = names.get(v) {
                cmd.params[0] = Param::ScriptRef(name.clone());
            }
        }
    }
}

const SYS1: &[(u32, u32, u32)] = &[
    (0x10001, 0x02, 3),
    (0x10001, 0x0A, 3),
    (0x10002, 0x00, 3),
    (0x10002, 0x02, 3),
];
const SYS2: &[(u32, u32, u32)] = &[
    (0x00, 0x02, 2),
    (0x00, 0x03, 2),
    (0x00, 0x04, 2),
    (0x00, 0x06, 2),
    (0x00, 0x07, 2),
    (0x00, 0x08, 2),
];

fn const_int(cmd: Option<&Command>) -> Option<u32> {
    let c = cmd?;
    if matches!(c.op, 0x0A | 0x0D) {
        c.u32_at(0)
    } else {
        None
    }
}

fn resolve_exvs_sys(cmd: &Command, popped: &[Option<Command>], resolve: &mut dyn FnMut(usize)) {
    if cmd.op != 0x2D {
        return;
    }
    let Some(kind) = cmd.u32_at(1) else { return };
    let indices: Option<u32> = if kind == 1 {
        let table = const_int(
            popped
                .get(popped.len().wrapping_sub(1))
                .and_then(|x| x.as_ref()),
        );
        // popped[0] is last popped = last arg? Python: popped.append(stack.pop()) so popped[0] is last pushed = last arg
        // _source_arg_int(popped, 0) -> index = len-1-0 = last element of popped?
        // _popped_index_for_source_arg: index = len(popped)-1-source_arg_index
        // source 0 -> last in popped list = first pop = top of stack = last arg
        // For sys_1(table, method, ...): args pushed in order, last pop is last arg.
        // Wait Python getArgs reverses. Stack: first arg pushed first, last arg on top.
        // pop_count times: first pop is last arg. popped[0] = last arg.
        // source_arg_index 0 -> index = len-1-0 = last of popped array = first popped = last arg. That's wrong for table_id.
        //
        // _source_arg_int(popped, 0) for table_id as first syscall argument.
        // First arg is deepest, popped last. index = len-1-0 = last element = first pushed = first arg. YES.
        // popped is built by popping so popped[0]=top=last arg, popped[-1]=first arg.
        // index = len-1-source = last index for source 0 = first arg. Good.
        let method = const_int(popped_at(popped, 1));
        let table = const_int(popped_at(popped, 0));
        match (table, method) {
            (Some(t), Some(m)) => SYS1
                .iter()
                .find(|(a, b, _)| *a == t && *b == m)
                .map(|x| x.2),
            _ => None,
        }
    } else if kind == 2 {
        let rec = const_int(popped_at(popped, 0));
        let slot = const_int(popped_at(popped, 1));
        match (rec, slot) {
            (Some(r), Some(s)) => SYS2
                .iter()
                .find(|(a, b, _)| *a == r && *b == s)
                .map(|x| x.2),
            _ => None,
        }
    } else {
        None
    };
    if let Some(src) = indices {
        if let Some(idx) = popped_index(popped, src) {
            resolve(idx);
        }
    }
}

fn popped_index(popped: &[Option<Command>], source_arg_index: u32) -> Option<usize> {
    let index = popped.len() as i32 - 1 - source_arg_index as i32;
    if index >= 0 && (index as usize) < popped.len() {
        Some(index as usize)
    } else {
        None
    }
}

fn popped_at(popped: &[Option<Command>], source_arg_index: u32) -> Option<&Command> {
    popped_index(popped, source_arg_index).and_then(|i| popped[i].as_ref())
}

fn resolve_source(
    cmd: Option<&mut Command>,
    valid: &HashSet<u32>,
    names: &HashMap<u32, String>,
    script_name: &str,
    called: &mut HashMap<String, Vec<u32>>,
    local_defs: &HashMap<u32, Command>,
) {
    let Some(cmd) = cmd else { return };
    if matches!(cmd.op, 0x0A | 0x0D) {
        try_resolve(cmd, valid, names);
        return;
    }
    if cmd.op == 0x0B {
        if cmd.u32_at(0) == Some(0) {
            if let Some(li) = cmd.u32_at(1) {
                if let Some(def) = local_defs.get(&li) {
                    let mut tmp = def.clone();
                    try_resolve(&mut tmp, valid, names);
                    return;
                }
                called.entry(script_name.to_string()).or_default();
                let e = called.get_mut(script_name).unwrap();
                if !e.contains(&li) {
                    e.push(li);
                }
            }
        }
    }
}

fn walk_script(
    script: &mut Script,
    names: &HashMap<u32, String>,
    called: &mut HashMap<String, Vec<u32>>,
    pass: u8,
) {
    let valid: HashSet<u32> = names.keys().copied().collect();
    let bounds0 = script.start;
    let script_name = names
        .get(&bounds0)
        .cloned()
        .unwrap_or_else(|| script.name.clone());
    let blocks = build_cfg(script);
    for bb in blocks {
        let mut stack: Vec<Command> = Vec::new();
        let mut local_defs: HashMap<u32, Command> = HashMap::new();
        for idx in bb.start..=bb.end {
            let Some(Item::Cmd(cmd)) = script.items.get(idx).cloned() else {
                continue;
            };
            let params: Vec<u32> = cmd
                .params
                .iter()
                .filter_map(|p| match p {
                    Param::U32(v) => Some(*v),
                    _ => None,
                })
                .collect();
            let pop = stack_pops(cmd.op, &params);
            let mut popped: Vec<Option<Command>> = Vec::new();
            for _ in 0..pop.max(0) {
                popped.push(stack.pop());
            }
            if pass == 0 {
                if matches!(cmd.op, 0x2F | 0x30 | 0x31) {
                    if let Some(Some(mut p0)) = popped.first().cloned() {
                        resolve_source(
                            Some(&mut p0),
                            &valid,
                            names,
                            &script_name,
                            called,
                            &local_defs,
                        );
                        if let Some(Item::Cmd(orig)) = script.items.get_mut(
                            // can't easily map back; mutate popped clone then copy params onto matching command by pos
                            idx,
                        ) {
                            // apply by scanning items for commandPosition match of p0
                        }
                        apply_resolved(&mut script.items, &p0);
                    }
                }
                if cmd.op == 0x2D {
                    let popped_ref: Vec<Option<Command>> = popped.clone();
                    let mut to_apply = Vec::new();
                    resolve_exvs_sys(&cmd, &popped_ref, &mut |i| {
                        if let Some(Some(p)) = popped.get(i) {
                            let mut c = p.clone();
                            resolve_source(
                                Some(&mut c),
                                &valid,
                                names,
                                &script_name,
                                called,
                                &local_defs,
                            );
                            to_apply.push(c);
                        }
                    });
                    for c in to_apply {
                        apply_resolved(&mut script.items, &c);
                    }
                }
                if cmd.op == 0x1C && cmd.u32_at(0) == Some(1) {
                    if let Some(Some(mut p0)) = popped.first().cloned() {
                        resolve_source(
                            Some(&mut p0),
                            &valid,
                            names,
                            &script_name,
                            called,
                            &local_defs,
                        );
                        apply_resolved(&mut script.items, &p0);
                    }
                }
            }
            if matches!(cmd.op, 0x1C | 0x41) && cmd.u32_at(0) == Some(0) {
                if let Some(li) = cmd.u32_at(1) {
                    if let Some(Some(p0)) = popped.first() {
                        if matches!(p0.op, 0x0A | 0x0D) {
                            local_defs.insert(li, p0.clone());
                        } else {
                            local_defs.remove(&li);
                        }
                    } else {
                        local_defs.remove(&li);
                    }
                }
            }
            if cmd.op == 0x32 {
                if idx > 0 {
                    if let Some(Item::Cmd(prev)) = script.items.get(idx - 1) {
                        stack.push(prev.clone());
                    }
                }
            }
            if cmd.push {
                if let Some(Item::Cmd(c)) = script.items.get(idx) {
                    stack.push(c.clone());
                }
            }
        }
    }
}

fn apply_resolved(items: &mut [Item], resolved: &Command) {
    for item in items.iter_mut() {
        if let Item::Cmd(c) = item {
            if c.pos == resolved.pos {
                c.params = resolved.params.clone();
            }
        }
    }
}

fn resolve_cross(
    file: &mut MscFile,
    names: &HashMap<u32, String>,
    called: &HashMap<String, Vec<u32>>,
) {
    let valid: HashSet<u32> = names.keys().copied().collect();
    for script in &mut file.scripts {
        let bounds0 = script.start;
        let script_name = names
            .get(&bounds0)
            .cloned()
            .unwrap_or_else(|| script.name.clone());
        let blocks = build_cfg(script);
        for bb in blocks {
            let mut stack: Vec<Command> = Vec::new();
            for idx in bb.start..=bb.end {
                let Some(Item::Cmd(cmd)) = script.items.get(idx).cloned() else {
                    continue;
                };
                let params: Vec<u32> = cmd
                    .params
                    .iter()
                    .filter_map(|p| match p {
                        Param::U32(v) => Some(*v),
                        _ => None,
                    })
                    .collect();
                let pop = stack_pops(cmd.op, &params);
                let mut popped: Vec<Option<Command>> = Vec::new();
                for _ in 0..pop.max(0) {
                    popped.push(stack.pop());
                }
                if matches!(cmd.op, 0x1C | 0x41) {
                    if let Some(vars) = called.get(&script_name) {
                        if cmd.u32_at(0) == Some(0) {
                            if let Some(li) = cmd.u32_at(1) {
                                if vars.contains(&li) {
                                    if let Some(Some(mut p0)) = popped.first().cloned() {
                                        try_resolve(&mut p0, &valid, names);
                                        apply_resolved(&mut script.items, &p0);
                                    }
                                }
                            }
                        }
                    }
                }
                if matches!(cmd.op, 0x2F | 0x30 | 0x31) {
                    if let Some(Some(p0)) = popped.first() {
                        let jump_name = match p0.params.first() {
                            Some(Param::U32(v)) if names.contains_key(v) => names.get(v).cloned(),
                            Some(Param::ScriptRef(s)) => Some(s.clone()),
                            _ => None,
                        };
                        if let Some(jn) = jump_name {
                            if let Some(vars) = called.get(&jn) {
                                for &local_var in vars {
                                    let arg_idx = -(local_var as i32 + 1);
                                    let idx = popped.len() as i32 + arg_idx;
                                    if idx >= 0 {
                                        if let Some(Some(mut arg)) =
                                            popped.get(idx as usize).cloned()
                                        {
                                            try_resolve(&mut arg, &valid, names);
                                            apply_resolved(&mut script.items, &arg);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                if cmd.op == 0x32 && idx > 0 {
                    if let Some(Item::Cmd(prev)) = script.items.get(idx - 1) {
                        stack.push(prev.clone());
                    }
                }
                if cmd.push {
                    if let Some(Item::Cmd(c)) = script.items.get(idx) {
                        stack.push(c.clone());
                    }
                }
            }
        }
    }
}

pub fn resolve_and_label(file: &mut MscFile) {
    let mut names: HashMap<u32, String> = HashMap::new();
    for s in &file.scripts {
        names.insert(s.start, s.name.clone());
    }
    let mut called = HashMap::new();
    for i in 0..file.scripts.len() {
        walk_script(&mut file.scripts[i], &names, &mut called, 0);
    }
    resolve_cross(file, &names, &called);
    resolve_cross(file, &names, &called);

    for script in &mut file.scripts {
        for item in &mut script.items {
            if let Item::Cmd(cmd) = item {
                if matches!(cmd.op, 0x0A | 0x0D) {
                    if let Some(Param::ScriptRef(s)) = cmd.params.first() {
                        cmd.params[0] = Param::ScriptRef(s.clone());
                    }
                }
            }
        }
        let mut jump_labels: HashMap<u32, String> = HashMap::new();
        for item in &script.items {
            if let Item::Cmd(cmd) = item {
                if matches!(cmd.op, 0x04 | 0x05 | 0x2E | 0x34 | 0x35 | 0x36) {
                    if let Some(Param::U32(p)) = cmd.params.first() {
                        jump_labels
                            .entry(*p)
                            .or_insert_with(|| format!("loc_{p:X}"));
                    }
                }
            }
        }
        for item in &mut script.items {
            if let Item::Cmd(cmd) = item {
                if matches!(cmd.op, 0x04 | 0x05 | 0x2E | 0x34 | 0x35 | 0x36) {
                    if let Some(Param::U32(p)) = cmd.params.first().cloned() {
                        if let Some(name) = jump_labels.get(&p) {
                            cmd.params[0] = Param::Label {
                                pos: p,
                                name: name.clone(),
                            };
                        }
                    }
                }
            }
        }
        let mut inserts: Vec<(usize, Item)> = Vec::new();
        for (j, item) in script.items.iter().enumerate() {
            if let Item::Cmd(cmd) = item {
                if let Some(name) = jump_labels.get(&cmd.pos) {
                    inserts.push((
                        j,
                        Item::Label {
                            pos: cmd.pos,
                            name: name.clone(),
                        },
                    ));
                }
            }
        }
        for (offset, (j, lab)) in inserts.into_iter().enumerate() {
            script.items.insert(j + offset, lab);
        }
    }
}
