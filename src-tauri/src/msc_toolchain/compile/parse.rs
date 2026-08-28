//! Restricted MSC-C parser. Only the dialect mscdec emits.

#[derive(Clone, Debug)]
pub enum Expr {
    Int(u32),
    Ident(String),
    Unary {
        op: String,
        expr: Box<Expr>,
    },
    Binary {
        op: String,
        left: Box<Expr>,
        right: Box<Expr>,
    },
    Assign {
        op: String,
        left: Box<Expr>,
        right: Box<Expr>,
    },
    Call {
        callee: Box<Expr>,
        args: Vec<Expr>,
    },
}

#[derive(Clone, Debug)]
pub enum Stmt {
    Decl {
        ty: String,
        name: String,
        init: Option<Expr>,
    },
    Expr(Expr),
    If {
        cond: Expr,
        then_body: Vec<Stmt>,
        else_body: Option<Vec<Stmt>>,
    },
    While {
        cond: Expr,
        body: Vec<Stmt>,
    },
    Switch {
        cond: Expr,
        cases: Vec<(u32, Stmt)>,
        default: Option<Box<Stmt>>,
    },
    Return(Option<Expr>),
    Break,
    Continue,
}

#[derive(Clone, Debug)]
pub struct Function {
    pub ret: String,
    pub name: String,
    pub args: Vec<(String, String)>,
    pub body: Vec<Stmt>,
}

#[derive(Clone, Debug)]
pub struct Unit {
    pub globals: Vec<(String, String)>,
    pub functions: Vec<Function>,
}

#[derive(Clone, Debug)]
enum Tok {
    Ident(String),
    Int(u32),
    Punct(String),
    Eof,
}

struct Lexer<'a> {
    src: &'a [u8],
    i: usize,
}

impl<'a> Lexer<'a> {
    fn new(src: &'a str) -> Self {
        Self {
            src: src.as_bytes(),
            i: 0,
        }
    }

    fn peek_char(&self) -> Option<u8> {
        self.src.get(self.i).copied()
    }

    fn bump(&mut self) -> Option<u8> {
        let c = self.peek_char()?;
        self.i += 1;
        Some(c)
    }

    fn skip_ws(&mut self) {
        loop {
            match self.peek_char() {
                Some(b' ' | b'\t' | b'\r' | b'\n') => {
                    self.i += 1;
                }
                Some(b'/') if self.src.get(self.i + 1) == Some(&b'/') => {
                    self.i += 2;
                    while let Some(c) = self.peek_char() {
                        self.i += 1;
                        if c == b'\n' {
                            break;
                        }
                    }
                }
                Some(b'/') if self.src.get(self.i + 1) == Some(&b'*') => {
                    self.i += 2;
                    while self.i + 1 < self.src.len() {
                        if self.src[self.i] == b'*' && self.src[self.i + 1] == b'/' {
                            self.i += 2;
                            break;
                        }
                        self.i += 1;
                    }
                }
                _ => return,
            }
        }
    }

    fn next_tok(&mut self) -> Tok {
        self.skip_ws();
        let Some(c) = self.peek_char() else {
            return Tok::Eof;
        };
        if c == b'_' || c.is_ascii_alphabetic() {
            let start = self.i;
            self.i += 1;
            while matches!(self.peek_char(), Some(x) if x == b'_' || x.is_ascii_alphanumeric()) {
                self.i += 1;
            }
            return Tok::Ident(String::from_utf8_lossy(&self.src[start..self.i]).into_owned());
        }
        if c.is_ascii_digit() {
            return Tok::Int(self.lex_int());
        }
        // multi-char punct
        let two = if self.i + 1 < self.src.len() {
            &self.src[self.i..self.i + 2]
        } else {
            &self.src[self.i..self.i + 1]
        };
        for p in [
            "<<=", ">>=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "==", "!=", "<=", ">=",
            "&&", "||", "<<", ">>", "++", "--",
        ] {
            if two.starts_with(p.as_bytes()) {
                self.i += p.len();
                return Tok::Punct(p.to_string());
            }
        }
        self.i += 1;
        Tok::Punct((c as char).to_string())
    }

    fn lex_int(&mut self) -> u32 {
        if self.peek_char() == Some(b'0') && matches!(self.src.get(self.i + 1), Some(b'x' | b'X')) {
            self.i += 2;
            let start = self.i;
            while matches!(self.peek_char(), Some(x) if x.is_ascii_hexdigit()) {
                self.i += 1;
            }
            u32::from_str_radix(
                std::str::from_utf8(&self.src[start..self.i]).unwrap_or("0"),
                16,
            )
            .unwrap_or(0)
        } else {
            let start = self.i;
            while matches!(self.peek_char(), Some(x) if x.is_ascii_digit()) {
                self.i += 1;
            }
            std::str::from_utf8(&self.src[start..self.i])
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0)
        }
    }
}

pub fn parse_unit(src: &str) -> Result<Unit, String> {
    let mut lx = Lexer::new(src);
    let mut tok = lx.next_tok();
    let mut unit = Unit {
        globals: Vec::new(),
        functions: Vec::new(),
    };
    loop {
        match &tok {
            Tok::Eof => break,
            Tok::Ident(ty) if matches!(ty.as_str(), "int" | "void" | "float") => {
                let ty = ty.clone();
                tok = lx.next_tok();
                let Tok::Ident(name) = tok else {
                    return Err("expected identifier after type".into());
                };
                tok = lx.next_tok();
                match &tok {
                    Tok::Punct(p) if p == ";" => {
                        unit.globals.push((ty, name));
                        tok = lx.next_tok();
                    }
                    Tok::Punct(p) if p == "(" => {
                        let mut args = Vec::new();
                        tok = lx.next_tok();
                        if !matches!(&tok, Tok::Punct(p) if p == ")") {
                            loop {
                                let Tok::Ident(aty) = &tok else {
                                    return Err("expected arg type".into());
                                };
                                let aty = aty.clone();
                                tok = lx.next_tok();
                                let Tok::Ident(aname) = &tok else {
                                    return Err("expected arg name".into());
                                };
                                args.push((aty, aname.clone()));
                                tok = lx.next_tok();
                                if matches!(&tok, Tok::Punct(p) if p == ",") {
                                    tok = lx.next_tok();
                                    continue;
                                }
                                break;
                            }
                        }
                        if !matches!(&tok, Tok::Punct(p) if p == ")") {
                            return Err("expected )".into());
                        }
                        tok = lx.next_tok();
                        if !matches!(&tok, Tok::Punct(p) if p == "{") {
                            return Err("expected {".into());
                        }
                        tok = lx.next_tok();
                        let body = parse_block(&mut lx, &mut tok)?;
                        unit.functions.push(Function {
                            ret: ty,
                            name,
                            args,
                            body,
                        });
                    }
                    _ => return Err(format!("unexpected token after {name}")),
                }
            }
            other => return Err(format!("unexpected top-level token {other:?}")),
        }
    }
    Ok(unit)
}

fn parse_block(lx: &mut Lexer, tok: &mut Tok) -> Result<Vec<Stmt>, String> {
    let mut body = Vec::new();
    while !matches!(tok, Tok::Punct(p) if p == "}") && !matches!(tok, Tok::Eof) {
        body.push(parse_stmt(lx, tok)?);
    }
    if matches!(tok, Tok::Punct(p) if p == "}") {
        *tok = lx.next_tok();
    }
    Ok(body)
}

fn parse_stmt(lx: &mut Lexer, tok: &mut Tok) -> Result<Stmt, String> {
    match tok {
        Tok::Ident(w) if w == "if" => {
            *tok = lx.next_tok();
            expect_punct(tok, "(")?;
            *tok = lx.next_tok();
            let cond = parse_expr(lx, tok)?;
            expect_punct(tok, ")")?;
            *tok = lx.next_tok();
            let then_body = parse_stmt_or_block(lx, tok)?;
            let mut else_body = None;
            if matches!(tok, Tok::Ident(w) if w == "else") {
                *tok = lx.next_tok();
                else_body = Some(parse_stmt_or_block(lx, tok)?);
            }
            Ok(Stmt::If {
                cond,
                then_body,
                else_body,
            })
        }
        Tok::Ident(w) if w == "while" => {
            *tok = lx.next_tok();
            expect_punct(tok, "(")?;
            *tok = lx.next_tok();
            let cond = parse_expr(lx, tok)?;
            expect_punct(tok, ")")?;
            *tok = lx.next_tok();
            let body = parse_stmt_or_block(lx, tok)?;
            Ok(Stmt::While { cond, body })
        }
        Tok::Ident(w) if w == "switch" => parse_switch(lx, tok),
        Tok::Ident(w) if w == "return" => {
            *tok = lx.next_tok();
            if matches!(tok, Tok::Punct(p) if p == ";") {
                *tok = lx.next_tok();
                Ok(Stmt::Return(None))
            } else {
                let e = parse_expr(lx, tok)?;
                expect_punct(tok, ";")?;
                *tok = lx.next_tok();
                Ok(Stmt::Return(Some(e)))
            }
        }
        Tok::Ident(w) if w == "break" => {
            *tok = lx.next_tok();
            expect_punct(tok, ";")?;
            *tok = lx.next_tok();
            Ok(Stmt::Break)
        }
        Tok::Ident(w) if w == "continue" => {
            *tok = lx.next_tok();
            expect_punct(tok, ";")?;
            *tok = lx.next_tok();
            Ok(Stmt::Continue)
        }
        Tok::Ident(w) if matches!(w.as_str(), "int" | "void" | "float") => {
            let ty = w.clone();
            *tok = lx.next_tok();
            let Tok::Ident(name) = tok else {
                return Err("expected name in decl".into());
            };
            let name = name.clone();
            *tok = lx.next_tok();
            let mut init = None;
            if matches!(tok, Tok::Punct(p) if p == "=") {
                *tok = lx.next_tok();
                init = Some(parse_expr(lx, tok)?);
            }
            expect_punct(tok, ";")?;
            *tok = lx.next_tok();
            Ok(Stmt::Decl { ty, name, init })
        }
        Tok::Punct(p) if p == "{" => {
            *tok = lx.next_tok();
            Ok(Stmt::If {
                // dummy unused; block-as-stmt is handled via parse_stmt_or_block
                cond: Expr::Int(0),
                then_body: parse_block(lx, tok)?,
                else_body: None,
            })
        }
        _ => {
            let e = parse_expr(lx, tok)?;
            expect_punct(tok, ";")?;
            *tok = lx.next_tok();
            Ok(Stmt::Expr(e))
        }
    }
}

fn parse_stmt_or_block(lx: &mut Lexer, tok: &mut Tok) -> Result<Vec<Stmt>, String> {
    if matches!(tok, Tok::Punct(p) if p == "{") {
        *tok = lx.next_tok();
        parse_block(lx, tok)
    } else {
        Ok(vec![parse_stmt(lx, tok)?])
    }
}

fn parse_switch(lx: &mut Lexer, tok: &mut Tok) -> Result<Stmt, String> {
    *tok = lx.next_tok();
    expect_punct(tok, "(")?;
    *tok = lx.next_tok();
    let cond = parse_expr(lx, tok)?;
    expect_punct(tok, ")")?;
    *tok = lx.next_tok();
    expect_punct(tok, "{")?;
    *tok = lx.next_tok();
    let mut cases = Vec::new();
    let mut default = None;
    while !matches!(tok, Tok::Punct(p) if p == "}") {
        match tok {
            Tok::Ident(w) if w == "case" => {
                *tok = lx.next_tok();
                let Tok::Int(v) = tok else {
                    return Err("case needs int".into());
                };
                let v = *v;
                *tok = lx.next_tok();
                expect_punct(tok, ":")?;
                *tok = lx.next_tok();
                let stmt = parse_stmt(lx, tok)?;
                if matches!(tok, Tok::Ident(w) if w == "break") {
                    *tok = lx.next_tok();
                    expect_punct(tok, ";")?;
                    *tok = lx.next_tok();
                }
                cases.push((v, stmt));
            }
            Tok::Ident(w) if w == "default" => {
                *tok = lx.next_tok();
                expect_punct(tok, ":")?;
                *tok = lx.next_tok();
                let stmt = parse_stmt(lx, tok)?;
                if matches!(tok, Tok::Ident(w) if w == "break") {
                    *tok = lx.next_tok();
                    expect_punct(tok, ";")?;
                    *tok = lx.next_tok();
                }
                default = Some(Box::new(stmt));
            }
            _ => return Err(format!("bad switch token {tok:?}")),
        }
    }
    *tok = lx.next_tok();
    Ok(Stmt::Switch {
        cond,
        cases,
        default,
    })
}

fn expect_punct(tok: &Tok, s: &str) -> Result<(), String> {
    match tok {
        Tok::Punct(p) if p == s => Ok(()),
        _ => Err(format!("expected {s}, got {tok:?}")),
    }
}

fn parse_expr(lx: &mut Lexer, tok: &mut Tok) -> Result<Expr, String> {
    parse_assign(lx, tok)
}

fn parse_assign(lx: &mut Lexer, tok: &mut Tok) -> Result<Expr, String> {
    let left = parse_or(lx, tok)?;
    if let Tok::Punct(op) = tok {
        if matches!(
            op.as_str(),
            "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "&=" | "|=" | "^="
        ) {
            let op = op.clone();
            *tok = lx.next_tok();
            let right = parse_assign(lx, tok)?;
            return Ok(Expr::Assign {
                op,
                left: Box::new(left),
                right: Box::new(right),
            });
        }
    }
    Ok(left)
}

fn parse_or(lx: &mut Lexer, tok: &mut Tok) -> Result<Expr, String> {
    let mut e = parse_and(lx, tok)?;
    while matches!(tok, Tok::Punct(p) if p == "||") {
        *tok = lx.next_tok();
        let r = parse_and(lx, tok)?;
        e = Expr::Binary {
            op: "||".into(),
            left: Box::new(e),
            right: Box::new(r),
        };
    }
    Ok(e)
}

fn parse_and(lx: &mut Lexer, tok: &mut Tok) -> Result<Expr, String> {
    let mut e = parse_bit_or(lx, tok)?;
    while matches!(tok, Tok::Punct(p) if p == "&&") {
        *tok = lx.next_tok();
        let r = parse_bit_or(lx, tok)?;
        e = Expr::Binary {
            op: "&&".into(),
            left: Box::new(e),
            right: Box::new(r),
        };
    }
    Ok(e)
}

fn parse_bit_or(lx: &mut Lexer, tok: &mut Tok) -> Result<Expr, String> {
    let mut e = parse_bit_xor(lx, tok)?;
    while matches!(tok, Tok::Punct(p) if p == "|") {
        *tok = lx.next_tok();
        let r = parse_bit_xor(lx, tok)?;
        e = Expr::Binary {
            op: "|".into(),
            left: Box::new(e),
            right: Box::new(r),
        };
    }
    Ok(e)
}

fn parse_bit_xor(lx: &mut Lexer, tok: &mut Tok) -> Result<Expr, String> {
    let mut e = parse_bit_and(lx, tok)?;
    while matches!(tok, Tok::Punct(p) if p == "^") {
        *tok = lx.next_tok();
        let r = parse_bit_and(lx, tok)?;
        e = Expr::Binary {
            op: "^".into(),
            left: Box::new(e),
            right: Box::new(r),
        };
    }
    Ok(e)
}

fn parse_bit_and(lx: &mut Lexer, tok: &mut Tok) -> Result<Expr, String> {
    let mut e = parse_eq(lx, tok)?;
    while matches!(tok, Tok::Punct(p) if p == "&") {
        *tok = lx.next_tok();
        let r = parse_eq(lx, tok)?;
        e = Expr::Binary {
            op: "&".into(),
            left: Box::new(e),
            right: Box::new(r),
        };
    }
    Ok(e)
}

fn parse_eq(lx: &mut Lexer, tok: &mut Tok) -> Result<Expr, String> {
    let mut e = parse_rel(lx, tok)?;
    while matches!(tok, Tok::Punct(p) if p == "==" || p == "!=") {
        let op = if let Tok::Punct(p) = tok {
            p.clone()
        } else {
            unreachable!()
        };
        *tok = lx.next_tok();
        let r = parse_rel(lx, tok)?;
        e = Expr::Binary {
            op,
            left: Box::new(e),
            right: Box::new(r),
        };
    }
    Ok(e)
}

fn parse_rel(lx: &mut Lexer, tok: &mut Tok) -> Result<Expr, String> {
    let mut e = parse_shift(lx, tok)?;
    while matches!(tok, Tok::Punct(p) if matches!(p.as_str(), "<" | "<=" | ">" | ">=")) {
        let op = if let Tok::Punct(p) = tok {
            p.clone()
        } else {
            unreachable!()
        };
        *tok = lx.next_tok();
        let r = parse_shift(lx, tok)?;
        e = Expr::Binary {
            op,
            left: Box::new(e),
            right: Box::new(r),
        };
    }
    Ok(e)
}

fn parse_shift(lx: &mut Lexer, tok: &mut Tok) -> Result<Expr, String> {
    let mut e = parse_add(lx, tok)?;
    while matches!(tok, Tok::Punct(p) if p == "<<" || p == ">>") {
        let op = if let Tok::Punct(p) = tok {
            p.clone()
        } else {
            unreachable!()
        };
        *tok = lx.next_tok();
        let r = parse_add(lx, tok)?;
        e = Expr::Binary {
            op,
            left: Box::new(e),
            right: Box::new(r),
        };
    }
    Ok(e)
}

fn parse_add(lx: &mut Lexer, tok: &mut Tok) -> Result<Expr, String> {
    let mut e = parse_mul(lx, tok)?;
    while matches!(tok, Tok::Punct(p) if p == "+" || p == "-") {
        let op = if let Tok::Punct(p) = tok {
            p.clone()
        } else {
            unreachable!()
        };
        *tok = lx.next_tok();
        let r = parse_mul(lx, tok)?;
        e = Expr::Binary {
            op,
            left: Box::new(e),
            right: Box::new(r),
        };
    }
    Ok(e)
}

fn parse_mul(lx: &mut Lexer, tok: &mut Tok) -> Result<Expr, String> {
    let mut e = parse_unary(lx, tok)?;
    while matches!(tok, Tok::Punct(p) if matches!(p.as_str(), "*" | "/" | "%")) {
        let op = if let Tok::Punct(p) = tok {
            p.clone()
        } else {
            unreachable!()
        };
        *tok = lx.next_tok();
        let r = parse_unary(lx, tok)?;
        e = Expr::Binary {
            op,
            left: Box::new(e),
            right: Box::new(r),
        };
    }
    Ok(e)
}

fn parse_unary(lx: &mut Lexer, tok: &mut Tok) -> Result<Expr, String> {
    if let Tok::Punct(op) = tok {
        if matches!(op.as_str(), "!" | "~" | "-" | "+" | "*" | "&" | "++" | "--") {
            let op = op.clone();
            *tok = lx.next_tok();
            let expr = parse_unary(lx, tok)?;
            return Ok(Expr::Unary {
                op,
                expr: Box::new(expr),
            });
        }
    }
    parse_postfix(lx, tok)
}

fn parse_postfix(lx: &mut Lexer, tok: &mut Tok) -> Result<Expr, String> {
    let mut e = parse_primary(lx, tok)?;
    loop {
        match tok {
            Tok::Punct(p) if p == "(" => {
                *tok = lx.next_tok();
                let mut args = Vec::new();
                if !matches!(tok, Tok::Punct(p) if p == ")") {
                    loop {
                        args.push(parse_expr(lx, tok)?);
                        if matches!(tok, Tok::Punct(p) if p == ",") {
                            *tok = lx.next_tok();
                            continue;
                        }
                        break;
                    }
                }
                expect_punct(tok, ")")?;
                *tok = lx.next_tok();
                e = Expr::Call {
                    callee: Box::new(e),
                    args,
                };
            }
            Tok::Punct(p) if p == "++" || p == "--" => {
                let op = if p == "++" { "p++" } else { "p--" };
                *tok = lx.next_tok();
                e = Expr::Unary {
                    op: op.into(),
                    expr: Box::new(e),
                };
            }
            _ => break,
        }
    }
    Ok(e)
}

fn parse_primary(lx: &mut Lexer, tok: &mut Tok) -> Result<Expr, String> {
    match tok {
        Tok::Int(v) => {
            let v = *v;
            *tok = lx.next_tok();
            Ok(Expr::Int(v))
        }
        Tok::Ident(s) => {
            let s = s.clone();
            *tok = lx.next_tok();
            Ok(Expr::Ident(s))
        }
        Tok::Punct(p) if p == "(" => {
            *tok = lx.next_tok();
            let e = parse_expr(lx, tok)?;
            expect_punct(tok, ")")?;
            *tok = lx.next_tok();
            Ok(e)
        }
        _ => Err(format!("expected expression, got {tok:?}")),
    }
}
