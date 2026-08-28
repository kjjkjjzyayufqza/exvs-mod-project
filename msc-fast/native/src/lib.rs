mod emit;
mod ir;
mod lower;
mod opcode;
mod parse;

use emit::emit_file;
use lower::lower_unit;
use parse::parse_unit;

/// Compile MSC-C the way `msclang.py -i` does (pushInt, no pushShort).
pub fn compile_c(src: &str, push_short: bool) -> Result<Vec<u8>, String> {
    let unit = parse_unit(src)?;
    let names: Vec<String> = unit.functions.iter().map(|f| f.name.clone()).collect();
    let scripts = lower_unit(&unit, push_short)?;
    Ok(emit_file(&scripts, &names, &[]))
}

pub fn compile_c_msclang_dash_i(src: &str) -> Result<Vec<u8>, String> {
    compile_c(src, false)
}
