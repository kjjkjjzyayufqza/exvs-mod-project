use crate::msc_toolchain::compile::parse::{Expr, Function, Stmt, Unit};
use crate::msc_toolchain::ir::{Arg, Cmd, Item};
use crate::msc_toolchain::opcode as op;
use std::collections::HashMap;

struct FnCtx<'a> {
    out: Vec<Item>,
    locals: Vec<String>,
    local_index: HashMap<String, usize>,
    local_types: HashMap<String, String>,
    globals: &'a HashMap<String, usize>,
    global_types: &'a HashMap<String, String>,
    functions: &'a HashMap<String, String>,
    syscalls: &'a HashMap<String, u32>,
    push_short: bool,
    next_label: u32,
    is_not: bool,
    output_ab34: bool,
    binary_op_count: i32,
    force_or_ab34: bool,
}

impl<'a> FnCtx<'a> {
    fn label(&mut self) -> u32 {
        let id = self.next_label;
        self.next_label += 1;
        id
    }

    fn emit(&mut self, cmd: Cmd) {
        self.out.push(Item::Cmd(cmd));
    }

    fn emit_label(&mut self, id: u32) {
        self.out.push(Item::Label(id));
    }

    fn last_cmd(&self) -> Option<&Cmd> {
        self.out.iter().rev().find_map(|it| match it {
            Item::Cmd(c) => Some(c),
            Item::Label(_) => None,
        })
    }

    fn last_cmd_mut(&mut self) -> Option<&mut Cmd> {
        self.out.iter_mut().rev().find_map(|it| match it {
            Item::Cmd(c) => Some(c),
            Item::Label(_) => None,
        })
    }

    fn add_arg(&mut self) {
        let mut i = 1usize;
        let n = self.out.len();
        while i <= n {
            let item = &self.out[n - i];
            match item {
                Item::Label(_) => {
                    i += 1;
                    continue;
                }
                Item::Cmd(cmd) => {
                    if (0x38..0x3A).contains(&cmd.op) {
                        i += 1;
                        continue;
                    }
                    if !(0x2F..0x32).contains(&cmd.op) {
                        if let Item::Cmd(cmd) = &mut self.out[n - i] {
                            cmd.push = true;
                        }
                        return;
                    }
                    let mut depth = 0i32;
                    i += 1;
                    while i <= n {
                        if let Item::Cmd(inner) = &self.out[n - i] {
                            if inner.op == 0x2F {
                                depth += 1;
                            } else if inner.op == 0x2E {
                                if depth == 0 {
                                    if let Item::Cmd(inner) = &mut self.out[n - i] {
                                        inner.push = true;
                                    }
                                    return;
                                }
                                depth -= 1;
                            }
                        }
                        i += 1;
                    }
                    return;
                }
            }
        }
    }

    fn push_const(&mut self, v: u32, push: bool) {
        if self.push_short && v <= 0xFFFF {
            self.emit(Cmd::with_push(op::CMD_PUSH_SHORT, vec![Arg::U32(v)], push));
        } else {
            self.emit(Cmd::with_push(op::CMD_PUSH_INT, vec![Arg::U32(v)], push));
        }
    }

    fn compile_expr(&mut self, e: &Expr) -> Result<(), String> {
        match e {
            Expr::Int(v) => {
                self.push_const(*v, false);
            }
            Expr::Ident(name) => {
                if let Some(&idx) = self.local_index.get(name) {
                    self.emit(Cmd::new(
                        op::CMD_PUSH_VAR,
                        vec![Arg::U32(0), Arg::U32(idx as u32)],
                    ));
                } else if let Some(&idx) = self.globals.get(name) {
                    self.emit(Cmd::new(
                        op::CMD_PUSH_VAR,
                        vec![Arg::U32(1), Arg::U32(idx as u32)],
                    ));
                } else if self.functions.contains_key(name) {
                    self.emit(Cmd::new(op::CMD_PUSH_INT, vec![Arg::Func(name.clone())]));
                } else {
                    return Err(format!("invalid reference {name}"));
                }
            }
            Expr::Assign {
                op: aop,
                left,
                right,
            } => {
                self.compile_expr(right)?;
                self.add_arg();
                let Expr::Ident(name) = left.as_ref() else {
                    return Err("assignment target must be ident".into());
                };
                let (scope, idx) = self.resolve_var(name)?;
                self.emit(Cmd::new(
                    op::assign_int(aop),
                    vec![Arg::U32(scope), Arg::U32(idx)],
                ));
            }
            Expr::Unary { op: uop, expr } => match uop.as_str() {
                "!" => {
                    self.is_not = true;
                    self.compile_expr(expr)?;
                    self.add_arg();
                    self.emit(Cmd::with_push(op::CMD_NOT, vec![], true));
                    self.is_not = false;
                    self.binary_op_count = 0;
                }
                "~" => {
                    self.compile_expr(expr)?;
                    self.add_arg();
                    self.emit(Cmd::new(0x18, vec![]));
                }
                "-" => {
                    if let Expr::Int(v) = expr.as_ref() {
                        self.push_const((0u32).wrapping_sub(*v), false);
                    } else {
                        self.compile_expr(expr)?;
                        self.add_arg();
                        self.emit(Cmd::new(0x13, vec![]));
                    }
                }
                "p++" | "++" => {
                    let Expr::Ident(name) = expr.as_ref() else {
                        return Err("++ needs var".into());
                    };
                    let (scope, idx) = self.resolve_var(name)?;
                    self.emit(Cmd::new(0x14, vec![Arg::U32(scope), Arg::U32(idx)]));
                }
                "p--" | "--" => {
                    let Expr::Ident(name) = expr.as_ref() else {
                        return Err("-- needs var".into());
                    };
                    let (scope, idx) = self.resolve_var(name)?;
                    self.emit(Cmd::new(0x15, vec![Arg::U32(scope), Arg::U32(idx)]));
                }
                "&" => {
                    if let Expr::Ident(name) = expr.as_ref() {
                        self.emit(Cmd::new(op::CMD_PUSH_INT, vec![Arg::Func(name.clone())]));
                    } else {
                        return Err("& of non-ident".into());
                    }
                }
                "*" => {
                    self.compile_expr(expr)?;
                }
                _ => return Err(format!("unary {uop} unsupported")),
            },
            Expr::Binary {
                op: bop,
                left,
                right,
            } => {
                if bop == "||" || bop == "&&" {
                    self.compile_logic(bop, left, right)?;
                } else {
                    self.compile_expr(left)?;
                    self.add_arg();
                    self.compile_expr(right)?;
                    self.add_arg();
                    self.emit(Cmd::new(op::binary_int(bop), vec![]));
                }
            }
            Expr::Call { callee, args } => self.compile_call(callee, args)?,
        }
        Ok(())
    }

    fn compile_logic(&mut self, bop: &str, left: &Expr, right: &Expr) -> Result<(), String> {
        let local_is_not = self.is_not;
        if local_is_not {
            self.binary_op_count += 1;
        }
        if bop == "||" {
            self.compile_expr(left)?;
            self.add_arg();
            let end = self.label();
            let true_l = self.label();
            let false_l = self.label();
            let mut is_first_or = false;
            let mut probe = Some(right);
            while let Some(Expr::Binary { op, right: r, .. }) = probe {
                if op == "&&" || op == "||" {
                    is_first_or = true;
                    break;
                }
                probe = Some(r);
            }
            let mut use_ab34 = self.output_ab34;
            if self.force_or_ab34 && !use_ab34 {
                self.emit(Cmd::with_push(op::CMD_NOT, vec![], true));
                use_ab34 = true;
            } else if local_is_not
                && (self.binary_op_count >= 2 || is_first_or)
                && !use_ab34
                && !is_comparison_only_or_tree(&Expr::Binary {
                    op: "||".into(),
                    left: Box::new(left.clone()),
                    right: Box::new(right.clone()),
                })
            {
                self.emit(Cmd::with_push(op::CMD_NOT, vec![], true));
                self.output_ab34 = true;
                use_ab34 = true;
            }
            if use_ab34 {
                self.emit(Cmd::new(op::CMD_IF, vec![Arg::Label(false_l)]));
            } else {
                self.emit(Cmd::new(op::CMD_IF_NOT, vec![Arg::Label(true_l)]));
            }
            self.compile_expr(right)?;
            self.add_arg();
            if use_ab34 {
                self.emit(Cmd::with_push(op::CMD_NOT, vec![], true));
            }
            self.emit(Cmd::new(op::CMD_IF, vec![Arg::Label(false_l)]));
            self.emit_label(true_l);
            self.push_const(1, false);
            self.add_arg();
            self.emit(Cmd::new(op::CMD_ELSE, vec![Arg::Label(end)]));
            self.emit_label(false_l);
            self.push_const(0, false);
            self.add_arg();
            self.emit_label(end);
        } else {
            self.compile_expr(left)?;
            self.add_arg();
            let end = self.label();
            let false_l = self.label();
            if self.output_ab34 {
                let last = self.last_cmd().map(|c| c.op);
                if last != Some(0x2B) {
                    self.emit(Cmd::with_push(op::CMD_NOT, vec![], true));
                }
            }
            self.emit(Cmd::new(op::CMD_IF, vec![Arg::Label(false_l)]));
            let saved = self.force_or_ab34;
            let forced = matches!(right, Expr::Binary { op, .. } if op == "||")
                && matches!(left, Expr::Unary { op, .. } if op == "!");
            if forced {
                self.force_or_ab34 = true;
            }
            self.compile_expr(right)?;
            self.force_or_ab34 = saved;
            self.add_arg();
            if forced {
                let last = self.last_cmd().map(|c| c.op);
                if last != Some(0x2B) {
                    self.emit(Cmd::with_push(op::CMD_NOT, vec![], true));
                }
            }
            self.emit(Cmd::new(op::CMD_IF, vec![Arg::Label(false_l)]));
            self.push_const(1, false);
            self.add_arg();
            self.emit(Cmd::new(op::CMD_ELSE, vec![Arg::Label(end)]));
            self.emit_label(false_l);
            self.push_const(0, false);
            self.add_arg();
            self.emit_label(end);
        }
        Ok(())
    }

    fn compile_call(&mut self, callee: &Expr, args: &[Expr]) -> Result<(), String> {
        if let Expr::Ident(name) = callee {
            if let Some(&sys) = self.syscalls.get(name) {
                for a in args {
                    self.compile_expr(a)?;
                    self.add_arg();
                }
                self.emit(Cmd::new(
                    op::CMD_SYS,
                    vec![Arg::U32(args.len() as u32), Arg::U32(sys)],
                ));
                return Ok(());
            }
            if name == "callFunc3" {
                if args.is_empty() {
                    return Err("callFunc3 needs a pointer".into());
                }
                for a in &args[1..] {
                    self.compile_expr(a)?;
                    self.add_arg();
                }
                self.compile_expr(&args[0])?;
                self.add_arg();
                self.emit(Cmd::new(
                    op::CMD_CALL3,
                    vec![Arg::U32((args.len() - 1) as u32)],
                ));
                return Ok(());
            }
            if name == "set_main" {
                if args.is_empty() {
                    return Err("set_main needs a pointer".into());
                }
                for a in &args[1..] {
                    self.compile_expr(a)?;
                    self.add_arg();
                }
                self.compile_expr(&args[0])?;
                self.add_arg();
                self.emit(Cmd::new(
                    op::CMD_SET_MAIN,
                    vec![Arg::U32((args.len() - 1) as u32)],
                ));
                return Ok(());
            }
            if name == "printf" {
                for a in args {
                    self.compile_expr(a)?;
                    self.add_arg();
                }
                self.emit(Cmd::new(op::CMD_PRINTF, vec![Arg::U32(args.len() as u32)]));
                return Ok(());
            }
            if !self.functions.contains_key(name) {
                return Err(format!("function {name} does not exist"));
            }
            let end = self.label();
            self.emit(Cmd::new(op::CMD_TRY, vec![Arg::Label(end)]));
            for a in args {
                self.compile_expr(a)?;
                self.add_arg();
            }
            self.emit(Cmd::with_push(
                op::CMD_PUSH_INT,
                vec![Arg::Func(name.clone())],
                true,
            ));
            self.add_arg();
            self.emit(Cmd::new(op::CMD_CALL, vec![Arg::U32(args.len() as u32)]));
            self.emit_label(end);
            return Ok(());
        }
        if let Expr::Unary { op: uop, expr } = callee {
            if uop == "*" {
                let end = self.label();
                self.emit(Cmd::new(op::CMD_TRY, vec![Arg::Label(end)]));
                for a in args {
                    self.compile_expr(a)?;
                    self.add_arg();
                }
                self.compile_expr(expr)?;
                self.add_arg();
                self.emit(Cmd::new(op::CMD_CALL, vec![Arg::U32(args.len() as u32)]));
                self.emit_label(end);
                return Ok(());
            }
        }
        Err("unsupported call callee".into())
    }

    fn compile_stmt(&mut self, s: &Stmt) -> Result<(), String> {
        self.compile_stmt_in(s, None, None)
    }

    fn compile_stmt_in(
        &mut self,
        s: &Stmt,
        loop_end: Option<u32>,
        loop_cond: Option<u32>,
    ) -> Result<(), String> {
        match s {
            Stmt::Decl { name, init, ty } => {
                if !self.local_index.contains_key(name) {
                    let idx = self.locals.len();
                    self.local_index.insert(name.clone(), idx);
                    self.locals.push(name.clone());
                    self.local_types.insert(name.clone(), ty.clone());
                }
                if let Some(init) = init {
                    self.compile_expr(init)?;
                    self.add_arg();
                    let idx = self.local_index[name];
                    self.emit(Cmd::new(0x1C, vec![Arg::U32(0), Arg::U32(idx as u32)]));
                }
            }
            Stmt::Expr(e) => {
                self.compile_expr(e)?;
            }
            Stmt::If {
                cond,
                then_body,
                else_body,
            } => {
                let cond = normalize_condition_expr(cond);
                self.compile_expr(&cond)?;
                if let Some(last) = self.last_cmd() {
                    if last.op == 0x2B && self.output_ab34 {
                        // remove last not, matching Python
                        let n = self.out.len();
                        for i in (0..n).rev() {
                            if let Item::Cmd(c) = &self.out[i] {
                                if c.op == 0x2B {
                                    self.out.remove(i);
                                    break;
                                }
                            }
                        }
                        self.output_ab34 = false;
                    }
                }
                self.add_arg();
                let false_l = self.label();
                let end_l = self.label();
                self.emit(Cmd::new(op::CMD_IF, vec![Arg::Label(false_l)]));
                for st in then_body {
                    self.compile_stmt_in(st, loop_end, loop_cond)?;
                }
                if else_body.is_some() {
                    self.emit(Cmd::new(op::CMD_ELSE, vec![Arg::Label(end_l)]));
                }
                self.emit_label(false_l);
                if let Some(eb) = else_body {
                    for st in eb {
                        self.compile_stmt_in(st, loop_end, loop_cond)?;
                    }
                    self.emit_label(end_l);
                }
            }
            Stmt::While { cond, body } => {
                let cond = normalize_condition_expr(cond);
                let loop_top = self.label();
                let end_l = self.label();
                let cond_l = self.label();
                self.emit(Cmd::new(op::CMD_ELSE, vec![Arg::Label(cond_l)]));
                self.emit_label(loop_top);
                for st in body {
                    self.compile_stmt_in(st, Some(end_l), Some(cond_l))?;
                }
                self.emit_label(cond_l);
                self.compile_expr(&cond)?;
                self.add_arg();
                self.emit(Cmd::new(op::CMD_IF_NOT, vec![Arg::Label(loop_top)]));
                self.emit_label(end_l);
            }
            Stmt::Switch {
                cond,
                cases,
                default,
            } => {
                let block_end = self.label();
                for (val, stmt) in cases {
                    self.push_const(*val, false);
                    self.add_arg();
                    self.compile_expr(cond)?;
                    self.add_arg();
                    self.emit(Cmd::with_push(0x25, vec![], true));
                    let next = self.label();
                    self.emit(Cmd::new(op::CMD_IF, vec![Arg::Label(next)]));
                    self.compile_stmt_in(stmt, Some(block_end), loop_cond)?;
                    self.emit(Cmd::new(op::CMD_JUMP, vec![Arg::Label(block_end)]));
                    self.emit_label(next);
                }
                if let Some(stmt) = default {
                    self.compile_stmt_in(stmt, Some(block_end), loop_cond)?;
                    self.emit(Cmd::new(op::CMD_JUMP, vec![Arg::Label(block_end)]));
                }
                self.emit_label(block_end);
            }
            Stmt::Return(None) => self.emit(Cmd::new(op::CMD_RETURN_VOID, vec![])),
            Stmt::Return(Some(e)) => {
                self.compile_expr(e)?;
                self.add_arg();
                self.emit(Cmd::new(op::CMD_RETURN, vec![]));
            }
            Stmt::Break => {
                let Some(end) = loop_end else {
                    return Err("break outside loop".into());
                };
                self.emit(Cmd::new(op::CMD_JUMP, vec![Arg::Label(end)]));
            }
            Stmt::Continue => {
                let Some(cond) = loop_cond else {
                    return Err("continue outside loop".into());
                };
                self.emit(Cmd::new(op::CMD_JUMP5, vec![Arg::Label(cond)]));
            }
        }
        Ok(())
    }

    fn resolve_var(&self, name: &str) -> Result<(u32, u32), String> {
        if let Some(&idx) = self.local_index.get(name) {
            Ok((0, idx as u32))
        } else if let Some(&idx) = self.globals.get(name) {
            Ok((1, idx as u32))
        } else {
            Err(format!("var {name} not found"))
        }
    }
}

fn is_comparison_only_or_tree(e: &Expr) -> bool {
    match e {
        Expr::Binary { op, left, right } if op == "||" => {
            is_comparison_only_or_tree(left) && is_comparison_only_or_tree(right)
        }
        Expr::Binary { op, .. } if matches!(op.as_str(), "==" | "!=" | "<" | "<=" | ">" | ">=") => {
            true
        }
        _ => false,
    }
}

/// Match `msclang.py` `normalizeConditionExpr` on if/while/ternary conditions.
fn normalize_condition_expr(node: &Expr) -> Expr {
    match node {
        Expr::Unary { op, expr } if op == "!" => {
            let inner = normalize_condition_expr(expr);
            match &inner {
                Expr::Unary { op, expr } if op == "!" => normalize_condition_expr(expr),
                Expr::Binary { op, left, right }
                    if op == "||" && !is_comparison_only_or_tree(&inner) =>
                {
                    Expr::Binary {
                        op: "&&".into(),
                        left: Box::new(normalize_condition_expr(&Expr::Unary {
                            op: "!".into(),
                            expr: left.clone(),
                        })),
                        right: Box::new(normalize_condition_expr(&Expr::Unary {
                            op: "!".into(),
                            expr: right.clone(),
                        })),
                    }
                }
                _ => Expr::Unary {
                    op: "!".into(),
                    expr: Box::new(inner),
                },
            }
        }
        Expr::Binary { op, left, right } if op == "&&" || op == "||" => Expr::Binary {
            op: op.clone(),
            left: Box::new(normalize_condition_expr(left)),
            right: Box::new(normalize_condition_expr(right)),
        },
        other => other.clone(),
    }
}

pub fn lower_unit(unit: &Unit, push_short: bool) -> Result<Vec<Vec<Item>>, String> {
    let mut globals = HashMap::new();
    let mut global_types = HashMap::new();
    for (i, (ty, name)) in unit.globals.iter().enumerate() {
        globals.insert(name.clone(), i);
        global_types.insert(name.clone(), ty.clone());
    }
    let mut functions = HashMap::new();
    for f in &unit.functions {
        functions.insert(f.name.clone(), f.ret.clone());
    }
    let mut syscalls = HashMap::new();
    for i in 0..=0x75u32 {
        syscalls.insert(format!("sys_{:X}", i), i);
    }

    let compile_one = |f: &Function| -> Result<Vec<Item>, String> {
        let mut ctx = FnCtx {
            out: Vec::new(),
            locals: f.args.iter().map(|(_, n)| n.clone()).collect(),
            local_index: f
                .args
                .iter()
                .enumerate()
                .map(|(i, (_, n))| (n.clone(), i))
                .collect(),
            local_types: f.args.iter().map(|(t, n)| (n.clone(), t.clone())).collect(),
            globals: &globals,
            global_types: &global_types,
            functions: &functions,
            syscalls: &syscalls,
            push_short,
            next_label: 1,
            is_not: false,
            output_ab34: false,
            binary_op_count: 0,
            force_or_ab34: false,
        };
        let argc = f.args.len() as u32;
        for st in &f.body {
            // Python compileScript resets these globals before each top-level stmt.
            ctx.output_ab34 = false;
            ctx.is_not = false;
            ctx.binary_op_count = 0;
            ctx.force_or_ab34 = false;
            ctx.compile_stmt(st)?;
        }
        let varc = ctx.locals.len() as u32;
        let mut items = Vec::with_capacity(ctx.out.len() + 2);
        items.push(Item::Cmd(Cmd::new(
            op::CMD_BEGIN,
            vec![Arg::U32(argc), Arg::U32(varc)],
        )));
        items.extend(ctx.out);
        items.push(Item::Cmd(Cmd::new(op::CMD_END, vec![])));
        Ok(items)
    };

    // Tiny units stay serial: rayon pool warmup can exceed a 0.1ms budget.
    if unit.functions.len() >= 32 {
        use rayon::prelude::*;
        unit.functions.par_iter().map(compile_one).collect()
    } else {
        unit.functions.iter().map(compile_one).collect()
    }
}
