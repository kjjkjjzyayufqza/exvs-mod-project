//! Oracle identity: shipped Rust MSC path vs live tools/mscdec.py and tools/msclang.py -i.
//! Expected bytes are generated at runtime. This test fails if the implementation
//! still shells to those Python scripts.

use std::path::{Path, PathBuf};
use std::process::Command;

use app_lib::msc_toolchain::{
    compile_c_msclang_dash_i, compile_file, decompile_bytes, decompile_file,
    rust_entry_does_not_shell_python,
};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
}

fn tools_dir() -> PathBuf {
    repo_root().join("tools")
}

fn fixture_dir() -> PathBuf {
    PathBuf::from(r"E:\XB\解包\com\file\040msc\0x605245CC")
}

fn run_python(script: &str, args: &[&str]) -> Result<(), String> {
    let mut cmd = Command::new("python");
    cmd.arg(tools_dir().join(script)).args(args).current_dir(repo_root());
    cmd.env("PYTHONDONTWRITEBYTECODE", "1");
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!(
            "{script} failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(())
}

fn first_diff(a: &[u8], b: &[u8]) -> String {
    let n = a.len().min(b.len());
    for i in 0..n {
        if a[i] != b[i] {
            return format!("off {i:#x} orig={:#04x} rust={:#04x}", a[i], b[i]);
        }
    }
    format!("prefix ok lens {} vs {}", a.len(), b.len())
}

#[test]
fn shipped_path_is_rust_not_python_shell() {
    assert!(rust_entry_does_not_shell_python());
    let src = include_str!("../src/msc_toolchain/mod.rs");
    assert!(
        !src.contains("std::process::Command") && !src.contains("exec-python"),
        "msc_toolchain must not shell out"
    );
    let src = include_str!("../src/msc_toolchain/decompile.rs");
    assert!(!src.contains("Command::new(\"python\")"));
}

#[test]
fn compile_1_c_matches_live_msclang_oracle() {
    let dir = fixture_dir();
    let src_c = dir.join("1.c");
    assert!(src_c.is_file(), "missing {}", src_c.display());
    let tmp = tempfile::tempdir().unwrap();
    let oracle = tmp.path().join("oracle.cscex");
    run_python(
        "msclang.py",
        &[
            src_c.to_str().unwrap(),
            "-o",
            oracle.to_str().unwrap(),
            "-i",
        ],
    )
    .expect("oracle compile");
    let expected = std::fs::read(&oracle).unwrap();
    let src = std::fs::read_to_string(&src_c).unwrap();
    let got = compile_c_msclang_dash_i(&src).expect("rust compile");
    assert_eq!(
        expected, got,
        "1.c packed mismatch {}",
        first_diff(&expected, &got)
    );
    assert_eq!(&expected[..8], b"\xB2\xAC\xBC\xBA\xE6\x90\x32\x01");
}

#[test]
fn decompile_1_cscex_matches_live_mscdec_oracle() {
    let dir = fixture_dir();
    let src_bin = dir.join("1.cscex");
    assert!(src_bin.is_file(), "missing {}", src_bin.display());
    let tmp = tempfile::tempdir().unwrap();
    let oracle_c = tmp.path().join("oracle.c");
    let oracle_log = tmp.path().join("oracle.log");
    run_python(
        "mscdec.py",
        &[
            src_bin.to_str().unwrap(),
            "-o",
            oracle_c.to_str().unwrap(),
            "-log",
            oracle_log.to_str().unwrap(),
        ],
    )
    .expect("oracle decompile");
    let exp_c = std::fs::read(&oracle_c).unwrap();
    let exp_log = std::fs::read(&oracle_log).unwrap();
    let data = std::fs::read(&src_bin).unwrap();
    let (got_c, got_log) = decompile_bytes(&data).expect("rust decompile");
    assert_eq!(
        exp_c,
        got_c.as_bytes(),
        "1.cscex C mismatch {}",
        first_diff(&exp_c, got_c.as_bytes())
    );
    assert_eq!(
        exp_log,
        got_log.as_bytes(),
        "1.cscex log mismatch {}",
        first_diff(&exp_log, got_log.as_bytes())
    );
}

#[test]
fn compile_0_c_matches_live_msclang_oracle() {
    let dir = fixture_dir();
    let src_c = dir.join("0.c");
    if !src_c.is_file() {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let oracle = tmp.path().join("oracle.bscex");
    run_python(
        "msclang.py",
        &[
            src_c.to_str().unwrap(),
            "-o",
            oracle.to_str().unwrap(),
            "-i",
        ],
    )
    .expect("oracle compile 0.c");
    let expected = std::fs::read(&oracle).unwrap();
    let src = std::fs::read_to_string(&src_c).unwrap();
    let got = compile_c_msclang_dash_i(&src).expect("rust compile 0.c");
    assert_eq!(
        expected, got,
        "0.c packed mismatch {}",
        first_diff(&expected, &got)
    );
}

#[test]
fn decompile_0_bscex_matches_live_mscdec_oracle() {
    let dir = fixture_dir();
    let src_bin = dir.join("0.bscex");
    if !src_bin.is_file() {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let oracle_c = tmp.path().join("oracle.c");
    let oracle_log = tmp.path().join("oracle.log");
    run_python(
        "mscdec.py",
        &[
            src_bin.to_str().unwrap(),
            "-o",
            oracle_c.to_str().unwrap(),
            "-log",
            oracle_log.to_str().unwrap(),
        ],
    )
    .expect("oracle decompile 0");
    let exp_c = std::fs::read(&oracle_c).unwrap();
    let exp_log = std::fs::read(&oracle_log).unwrap();
    let data = std::fs::read(&src_bin).unwrap();
    let (got_c, got_log) = decompile_bytes(&data).expect("rust decompile 0");
    assert_eq!(
        exp_c,
        got_c.as_bytes(),
        "0.bscex C mismatch {}",
        first_diff(&exp_c, got_c.as_bytes())
    );
    assert_eq!(
        exp_log,
        got_log.as_bytes(),
        "0.bscex log mismatch {}",
        first_diff(&exp_log, got_log.as_bytes())
    );
}

#[test]
fn compile_2_c_matches_live_msclang_oracle() {
    let dir = fixture_dir();
    let src_c = dir.join("2.c");
    if !src_c.is_file() {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let oracle = tmp.path().join("oracle.dscex");
    run_python(
        "msclang.py",
        &[
            src_c.to_str().unwrap(),
            "-o",
            oracle.to_str().unwrap(),
            "-i",
        ],
    )
    .expect("oracle compile 2.c");
    let expected = std::fs::read(&oracle).unwrap();
    let src = std::fs::read_to_string(&src_c).unwrap();
    let got = compile_c_msclang_dash_i(&src).expect("rust compile 2.c");
    assert_eq!(
        expected, got,
        "2.c packed mismatch {}",
        first_diff(&expected, &got)
    );
}

#[test]
fn decompile_2_dscex_matches_live_mscdec_oracle() {
    let dir = fixture_dir();
    let src_bin = dir.join("2.dscex");
    if !src_bin.is_file() {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let oracle_c = tmp.path().join("oracle.c");
    let oracle_log = tmp.path().join("oracle.log");
    run_python(
        "mscdec.py",
        &[
            src_bin.to_str().unwrap(),
            "-o",
            oracle_c.to_str().unwrap(),
            "-log",
            oracle_log.to_str().unwrap(),
        ],
    )
    .expect("oracle decompile 2");
    let exp_c = std::fs::read(&oracle_c).unwrap();
    let exp_log = std::fs::read(&oracle_log).unwrap();
    let data = std::fs::read(&src_bin).unwrap();
    let (got_c, got_log) = decompile_bytes(&data).expect("rust decompile 2");
    assert_eq!(
        exp_c,
        got_c.as_bytes(),
        "2.dscex C mismatch {}",
        first_diff(&exp_c, got_c.as_bytes())
    );
    assert_eq!(
        exp_log,
        got_log.as_bytes(),
        "2.dscex log mismatch {}",
        first_diff(&exp_log, got_log.as_bytes())
    );
}

#[test]
fn file_api_writes_same_as_bytes_api() {
    let dir = fixture_dir();
    let src_c = dir.join("1.c");
    if !src_c.is_file() {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let out = tmp.path().join("out.cscex");
    compile_file(&src_c, &out, false).unwrap();
    let src = std::fs::read_to_string(&src_c).unwrap();
    let mem = compile_c_msclang_dash_i(&src).unwrap();
    assert_eq!(mem, std::fs::read(&out).unwrap());
}

#[allow(dead_code)]
fn _use_decompile_file(p: &Path) {
    let _ = decompile_file(p, p, p);
}
