//! In-process MSC decompile/compile library for the Tauri backend.
//!
//! Other `src-tauri` modules should call these functions directly
//! (`crate::msc_toolchain::decompile_in_process`,
//! `crate::msc_toolchain::compile_in_process`). The `mscdec` / `msclang`
//! binaries are optional thin CLI wrappers over the same API. This module
//! never spawns those binaries or Python.

pub mod ast;
pub mod binary;
pub mod cfg;
pub mod compile;
pub mod decompile;
pub mod ir;
pub mod opcode;
pub mod postprocess;

use std::fs;
use std::path::{Path, PathBuf};

use compile::emit::emit_file;
use compile::lower::lower_unit;
use compile::parse::parse_unit;

fn platform_text(s: &str) -> String {
    if cfg!(windows) {
        s.replace("\r\n", "\n").replace('\n', "\r\n")
    } else {
        s.replace("\r\n", "\n")
    }
}

/// Compile MSC-C the way the legacy dash-i packer does (pushInt, no pushShort).
pub fn compile_c(src: &str, push_short: bool) -> Result<Vec<u8>, String> {
    let unit = parse_unit(src)?;
    let names: Vec<String> = unit.functions.iter().map(|f| f.name.clone()).collect();
    let scripts = lower_unit(&unit, push_short)?;
    Ok(emit_file(&scripts, &names, &[]))
}

pub fn compile_c_msclang_dash_i(src: &str) -> Result<Vec<u8>, String> {
    compile_c(src, false)
}

/// In-process compile for Tauri backend callers (`msclang.py -i` semantics).
/// Does not spawn `msclang.exe`.
pub fn compile_in_process(src: &str) -> Result<Vec<u8>, String> {
    compile_c_msclang_dash_i(src)
}

pub fn compile_file(input: &Path, output: &Path, push_short: bool) -> Result<(), String> {
    let src = fs::read_to_string(input)
        .map_err(|e| format!("MSC compile: failed to read {}: {e}", input.display()))?;
    let bytes = compile_c(&src, push_short)?;
    fs::write(output, bytes)
        .map_err(|e| format!("MSC compile: failed to write {}: {e}", output.display()))
}

/// Named in-process decompile result (C source + sibling `.txt` log text).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecompileOutput {
    pub c_source: String,
    pub log_text: String,
}

/// Returns (C source, log text) using the same line endings as Python on this OS.
pub fn decompile_bytes(data: &[u8]) -> Result<(String, String), String> {
    let out = decompile_in_process(data)?;
    Ok((out.c_source, out.log_text))
}

/// In-process decompile for Tauri backend callers. Does not spawn `mscdec.exe`.
pub fn decompile_in_process(data: &[u8]) -> Result<DecompileOutput, String> {
    let mut file = binary::parse_msc(data)?;
    cfg::resolve_and_label(&mut file);
    let mut log = String::from("Analyzing...\n");
    log.push_str(&file.log);
    log.push_str("Decompiling...\n");
    let c = decompile::decompile_to_c(&file)?;
    let c = postprocess::postprocess_c(&c, &log)?;
    Ok(DecompileOutput {
        c_source: platform_text(&c),
        log_text: platform_text(&log),
    })
}

/// Sidecar disassembly log next to the C output (`0.c` -> `0.txt`).
pub fn default_decompile_log_path(output_c: &Path) -> PathBuf {
    output_c.with_extension("txt")
}

/// Empty or omitted log path falls back to the C sibling `.txt`.
pub fn resolve_decompile_log_path(output_c: &Path, log_path: Option<&Path>) -> PathBuf {
    match log_path {
        Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
        _ => default_decompile_log_path(output_c),
    }
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| {
                format!("MSC: failed to create directory {}: {e}", parent.display())
            })?;
        }
    }
    Ok(())
}

pub fn decompile_file(input: &Path, output_c: &Path, log_path: &Path) -> Result<(), String> {
    let data = fs::read(input)
        .map_err(|e| format!("MSC decompile: failed to read {}: {e}", input.display()))?;
    let (c, log) = decompile_bytes(&data)?;
    let log_path = resolve_decompile_log_path(output_c, Some(log_path));
    ensure_parent_dir(output_c)?;
    ensure_parent_dir(&log_path)?;
    fs::write(output_c, c)
        .map_err(|e| format!("MSC decompile: failed to write {}: {e}", output_c.display()))?;
    fs::write(&log_path, log)
        .map_err(|e| format!("MSC decompile: failed to write {}: {e}", log_path.display()))?;
    Ok(())
}

#[tauri::command]
pub fn decompile_msc(
    input_path: String,
    output_path: String,
    log_path: String,
) -> Result<(), String> {
    let output_c = PathBuf::from(&output_path);
    let log = resolve_decompile_log_path(&output_c, Some(Path::new(&log_path)));
    decompile_file(input_path.as_ref(), &output_c, &log)
}

#[tauri::command]
pub fn compile_msc(input_path: String, output_path: String) -> Result<(), String> {
    compile_file(input_path.as_ref(), output_path.as_ref(), false)
}

pub fn rust_entry_does_not_shell_python() -> bool {
    true
}
