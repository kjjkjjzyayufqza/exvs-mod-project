//! C AST printer matching `tools/ast2str.py`.

use std::fmt::{Display, Formatter, Result as FmtResult};

fn tabulate(text: &str) -> String {
    text.split('\n')
        .map(|i| format!("    {i}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn prec(op: &str) -> i32 {
    match op {
        "*" | "/" | "%" => 3,
        "+" | "-" => 4,
        "<<" | ">>" => 5,
        "<" | "<=" | ">" | ">=" => 6,
        "==" | "!=" => 7,
        "&" => 8,
        "^" => 9,
        "|" => 10,
        "&&" => 11,
        "||" => 12,
        _ => 99,
    }
}

#[derive(Clone, Debug)]
pub enum CExpr {
    Ident(String),
    ConstInt(u32),
    ConstFloat(f32),
    ConstStr(String),
    Binary {
        op: String,
        a: Box<CExpr>,
        b: Box<CExpr>,
    },
    Unary {
        op: String,
        inner: Box<CExpr>,
    },
    Assign {
        op: String,
        l: Box<CExpr>,
        r: Box<CExpr>,
    },
    Call {
        func: Box<CExpr>,
        args: Vec<CExpr>,
    },
    Cast {
        ty: String,
        inner: Box<CExpr>,
    },
    Ternary {
        cond: Box<CExpr>,
        t: Box<CExpr>,
        f: Box<CExpr>,
    },
    StructRef {
        name: Box<CExpr>,
        field: String,
    },
}

impl CExpr {
    fn needs_paren_as_bin_arg(&self) -> bool {
        matches!(
            self,
            CExpr::Binary { .. } | CExpr::Ternary { .. } | CExpr::Assign { .. }
        )
    }
}

impl Display for CExpr {
    fn fmt(&self, f: &mut Formatter<'_>) -> FmtResult {
        match self {
            CExpr::Ident(s) => write!(f, "{s}"),
            CExpr::ConstInt(0) => write!(f, "0"),
            CExpr::ConstInt(v) => write!(f, "0x{v:x}"),
            CExpr::ConstFloat(v) => write!(f, "{v}f"),
            CExpr::ConstStr(s) => write!(f, "\"{s}\""),
            CExpr::Binary { op, a, b } => {
                let left = if let CExpr::Binary { op: aop, .. } = a.as_ref() {
                    if prec(aop) <= prec(op) {
                        format!("{a}")
                    } else {
                        format!("({a})")
                    }
                } else if a.needs_paren_as_bin_arg() {
                    format!("({a})")
                } else {
                    format!("{a}")
                };
                let right = if let CExpr::Binary { op: bop, .. } = b.as_ref() {
                    if prec(bop) < prec(op) {
                        format!("{b}")
                    } else {
                        format!("({b})")
                    }
                } else if b.needs_paren_as_bin_arg() {
                    format!("({b})")
                } else {
                    format!("{b}")
                };
                write!(f, "{left} {op} {right}")
            }
            CExpr::Unary { op, inner } => {
                if op == "++" || op == "--" {
                    write!(f, "{inner}{op}")
                } else if op == "*" {
                    write!(f, "({op}{inner})")
                } else if inner.needs_paren_as_bin_arg() {
                    write!(f, "{op}({inner})")
                } else {
                    write!(f, "{op}{inner}")
                }
            }
            CExpr::Assign { op, l, r } => write!(f, "{l} {op} {r}"),
            CExpr::Call { func, args } => {
                let a = args
                    .iter()
                    .map(|x| x.to_string())
                    .collect::<Vec<_>>()
                    .join(", ");
                write!(f, "{func}({a})")
            }
            CExpr::Cast { ty, inner } => {
                if matches!(inner.as_ref(), CExpr::Binary { .. }) {
                    write!(f, "({ty})({inner})")
                } else {
                    write!(f, "({ty}){inner}")
                }
            }
            CExpr::Ternary { cond, t, f: ff } => {
                let cs = if cond.needs_paren_as_bin_arg() {
                    format!("({cond})")
                } else {
                    format!("{cond}")
                };
                let ts = if t.needs_paren_as_bin_arg() {
                    format!("({t})")
                } else {
                    format!("{t}")
                };
                let fs = if ff.needs_paren_as_bin_arg() {
                    format!("({ff})")
                } else {
                    format!("{ff}")
                };
                write!(f, "{cs} ? {ts} : {fs}")
            }
            CExpr::StructRef { name, field } => write!(f, "{name}.{field}"),
        }
    }
}

#[derive(Clone, Debug)]
pub enum CStmt {
    Raw(CExpr),
    Decl {
        ty: String,
        name: String,
        init: Option<CExpr>,
    },
    If {
        cond: CExpr,
        yes: Vec<CStmt>,
        no: Option<Vec<CStmt>>,
    },
    While {
        cond: CExpr,
        body: Vec<CStmt>,
    },
    DoWhile {
        cond: CExpr,
        body: Vec<CStmt>,
    },
    Return(Option<CExpr>),
    Break,
    Continue,
    Goto(String),
    Label(String),
    Comment(String),
}

fn no_semi(s: &CStmt) -> bool {
    matches!(
        s,
        CStmt::While { .. } | CStmt::If { .. } | CStmt::Comment(_)
    )
}

impl Display for CStmt {
    fn fmt(&self, f: &mut Formatter<'_>) -> FmtResult {
        match self {
            CStmt::Raw(e) => write!(f, "{e}"),
            CStmt::Decl {
                ty,
                name,
                init: None,
            } => write!(f, "{ty} {name}"),
            CStmt::Decl {
                ty,
                name,
                init: Some(v),
            } => write!(f, "{ty} {name} = {v}"),
            CStmt::If { cond, yes, no } => {
                let mut s = format!("if ({cond})\n{{\n{}\n}}", tabulate(&fmt_stmts(yes)));
                if let Some(no) = no {
                    if no.len() == 1 {
                        if let CStmt::If { .. } = &no[0] {
                            s.push_str(&format!("\nelse {}", no[0]));
                        } else {
                            s.push_str(&format!("\nelse\n{{\n{}\n}}", tabulate(&fmt_stmts(no))));
                        }
                    } else {
                        s.push_str(&format!("\nelse\n{{\n{}\n}}", tabulate(&fmt_stmts(no))));
                    }
                }
                write!(f, "{s}")
            }
            CStmt::While { cond, body } => {
                write!(f, "while ({cond})\n{{\n{}\n}}", tabulate(&fmt_stmts(body)))
            }
            CStmt::DoWhile { cond, body } => {
                write!(
                    f,
                    "do\n{{\n{}\n}} while({cond})",
                    tabulate(&fmt_stmts(body))
                )
            }
            CStmt::Return(None) => write!(f, "return"),
            CStmt::Return(Some(e)) => write!(f, "return {e}"),
            CStmt::Break => write!(f, "break"),
            CStmt::Continue => write!(f, "continue"),
            CStmt::Goto(n) => write!(f, "goto {n}"),
            CStmt::Label(n) => write!(f, "{n}:"),
            CStmt::Comment(t) => write!(f, "/*{t}*/"),
        }
    }
}

fn fmt_stmts(ss: &[CStmt]) -> String {
    if ss.is_empty() {
        return String::new();
    }
    let mut temp = ss[0].to_string();
    if !no_semi(&ss[0]) {
        temp.push(';');
    }
    for s in &ss[1..] {
        temp.push('\n');
        temp.push_str(&s.to_string());
        if !no_semi(s) {
            temp.push(';');
        }
    }
    temp
}

#[derive(Clone, Debug)]
pub struct CFunc {
    pub ty: String,
    pub name: String,
    pub args: Vec<(String, String)>,
    pub body: Vec<CStmt>,
}

impl Display for CFunc {
    fn fmt(&self, f: &mut Formatter<'_>) -> FmtResult {
        let args = self
            .args
            .iter()
            .map(|(t, n)| format!("{t} {n}"))
            .collect::<Vec<_>>()
            .join(", ");
        write!(
            f,
            "{} {}({})\n{{\n{}\n}}",
            self.ty,
            self.name,
            args,
            tabulate(&fmt_stmts(&self.body))
        )
    }
}

pub fn print_c(globals: &[(String, String)], funcs: &[CFunc]) -> String {
    let mut out = String::new();
    for (ty, name) in globals {
        out.push_str(&format!("{ty} {name};\n"));
    }
    out.push('\n');
    for func in funcs {
        out.push_str(&format!("{func}\n\n"));
    }
    out
}
