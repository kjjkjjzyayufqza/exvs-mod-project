//! Construct-level TDD against live `tools/mscdec.py` and `tools/msclang.py -i`.
//! Oracle processes are spawned read-only. All outputs stay in tempfile dirs;
//! fixture binaries and `tools/*.py` are never written.

use std::path::{Path, PathBuf};
use std::process::Command;

use app_lib::msc_roundtrip::{verify_c_source_against_original, verify_msc_roundtrip_from_c};
use app_lib::msc_toolchain::opcode::{format_of, stack_pops};
use app_lib::msc_toolchain::{
    compile_c_msclang_dash_i, compile_file, compile_in_process, decompile_bytes, decompile_file,
    decompile_in_process, default_decompile_log_path, resolve_decompile_log_path,
};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf()
}

fn tools_dir() -> PathBuf {
    repo_root().join("tools")
}

fn fixture_dir() -> PathBuf {
    PathBuf::from(r"E:\XB\解包\com\file\040msc\0x605245CC")
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

fn run_python(script: &str, args: &[&str]) -> Result<(), String> {
    let out = Command::new("python")
        .arg(tools_dir().join(script))
        .args(args)
        .current_dir(repo_root())
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!(
            "{script} failed: {}\n{}",
            String::from_utf8_lossy(&out.stderr),
            String::from_utf8_lossy(&out.stdout)
        ));
    }
    Ok(())
}

fn oracle_compile(src: &str, tmp: &Path) -> Vec<u8> {
    let c_path = tmp.join("in.c");
    let out_path = tmp.join("oracle.msc");
    std::fs::write(&c_path, src.replace('\n', "\r\n")).unwrap();
    run_python(
        "msclang.py",
        &[
            c_path.to_str().unwrap(),
            "-o",
            out_path.to_str().unwrap(),
            "-i",
        ],
    )
    .expect("oracle compile snippet");
    std::fs::read(&out_path).unwrap()
}

fn oracle_decompile(bin: &[u8], tmp: &Path) -> (Vec<u8>, Vec<u8>) {
    let bin_path = tmp.join("in.bin");
    let c_path = tmp.join("oracle.c");
    let log_path = tmp.join("oracle.log");
    std::fs::write(&bin_path, bin).unwrap();
    run_python(
        "mscdec.py",
        &[
            bin_path.to_str().unwrap(),
            "-o",
            c_path.to_str().unwrap(),
            "-log",
            log_path.to_str().unwrap(),
        ],
    )
    .expect("oracle decompile snippet");
    (
        std::fs::read(&c_path).unwrap(),
        std::fs::read(&log_path).unwrap(),
    )
}

fn assert_compile_identity(label: &str, src: &str) {
    let tmp = tempfile::tempdir().unwrap();
    let expected = oracle_compile(src, tmp.path());
    let got = compile_c_msclang_dash_i(src).unwrap_or_else(|e| panic!("{label} rust compile: {e}"));
    assert_eq!(
        expected,
        got,
        "{label} packed mismatch {}",
        first_diff(&expected, &got)
    );
    assert_eq!(&expected[..8], b"\xB2\xAC\xBC\xBA\xE6\x90\x32\x01");
}

fn assert_decompile_identity(label: &str, bin: &[u8]) {
    let tmp = tempfile::tempdir().unwrap();
    let (exp_c, exp_log) = oracle_decompile(bin, tmp.path());
    let (got_c, got_log) =
        decompile_bytes(bin).unwrap_or_else(|e| panic!("{label} rust decompile: {e}"));
    assert_eq!(
        exp_c,
        got_c.as_bytes(),
        "{label} C mismatch {}",
        first_diff(&exp_c, got_c.as_bytes())
    );
    assert_eq!(
        exp_log,
        got_log.as_bytes(),
        "{label} log mismatch {}",
        first_diff(&exp_log, got_log.as_bytes())
    );
}

fn snippet_cases() -> Vec<(&'static str, &'static str)> {
    vec![
        (
            "empty_main",
            "void main()\n{\n}\n",
        ),
        (
            "global_assign",
            "int global0;\nvoid main()\n{\n    global0 = 0x1;\n}\n",
        ),
        (
            "local_assign",
            "void main()\n{\n    int var0;\n    var0 = 0;\n}\n",
        ),
        (
            "if_then",
            "void main()\n{\n    int var0;\n    var0 = 0;\n    if (var0)\n    {\n        var0 = 0x1;\n    }\n}\n",
        ),
        (
            "if_else",
            "void main()\n{\n    int var0;\n    var0 = 0;\n    if (var0)\n    {\n        var0 = 0x1;\n    }\n    else\n    {\n        var0 = 0x2;\n    }\n}\n",
        ),
        (
            "else_if",
            "void main()\n{\n    int var0;\n    var0 = 0;\n    if (var0 == 0x1)\n    {\n        var0 = 0x1;\n    }\n    else if (var0 == 0x2)\n    {\n        var0 = 0x2;\n    }\n    else\n    {\n        var0 = 0x3;\n    }\n}\n",
        ),
        (
            "while_loop",
            "void main()\n{\n    int var0;\n    var0 = 0x1;\n    while (var0)\n    {\n        var0 = 0;\n    }\n}\n",
        ),
        (
            "while_break",
            "void main()\n{\n    int var0;\n    var0 = 0x1;\n    while (var0)\n    {\n        if (var0 == 0)\n        {\n            break;\n        }\n        var0 = 0;\n    }\n}\n",
        ),
        (
            "while_continue",
            "void main()\n{\n    int var0;\n    var0 = 0x1;\n    while (var0)\n    {\n        var0 = 0;\n        continue;\n    }\n}\n",
        ),
        (
            "logic_and",
            "void main()\n{\n    int var0;\n    var0 = 0x1 && 0x2;\n}\n",
        ),
        (
            "logic_or",
            "void main()\n{\n    int var0;\n    var0 = 0x1 || 0x2;\n}\n",
        ),
        (
            "logic_or_chain",
            "void main()\n{\n    int var0;\n    var0 = 0x1 || 0x2 || 0x3;\n}\n",
        ),
        (
            "logic_and_chain",
            "void main()\n{\n    int var0;\n    var0 = 0x1 && 0x2 && 0x3;\n}\n",
        ),
        (
            "logic_mixed_prec",
            "void main()\n{\n    int var0;\n    var0 = 0x1 || 0x2 && 0x3;\n}\n",
        ),
        (
            "not_or_compare",
            "int global0;\nvoid main()\n{\n    if (!(global0 == 0 || global0 == 0x1))\n    {\n        global0 = 0;\n    }\n}\n",
        ),
        (
            "not_or_noncompare",
            "int global0;\nint global1;\nvoid main()\n{\n    if (!(global0 || global1))\n    {\n        global0 = 0;\n    }\n}\n",
        ),
        (
            "bitops_arith",
            "void main()\n{\n    int var0;\n    var0 = 0x1 + 0x2 * 0x3;\n    var0 = var0 & 0xff;\n    var0 = var0 | 0x10;\n    var0 = var0 ^ 0x1;\n    var0 = var0 << 0x2;\n    var0 = var0 >> 0x1;\n}\n",
        ),
        (
            "unary_ops",
            "void main()\n{\n    int var0;\n    var0 = 0x1;\n    var0 = ~var0;\n    var0 = -var0;\n    var0 = !var0;\n    var0++;\n    var0--;\n}\n",
        ),
        (
            "assign_ops",
            "int global0;\nvoid main()\n{\n    global0 = 0x1;\n    global0 += 0x1;\n    global0 -= 0x1;\n    global0 *= 0x2;\n    global0 &= 0xff;\n    global0 |= 0x2;\n    global0 ^= 0x1;\n}\n",
        ),
        (
            "syscall",
            "void main()\n{\n    sys_0(0x1, 0x2);\n    sys_1(0x10001, 0x10, 0, 0);\n}\n",
        ),
        (
            "direct_call",
            "void func_1()\n{\n}\nvoid main()\n{\n    func_1();\n}\n",
        ),
        (
            "call_with_args",
            "int func_1(int arg0, int arg1)\n{\n    return arg0 + arg1;\n}\nvoid main()\n{\n    func_1(0x1, 0x2);\n}\n",
        ),
        (
            "callfunc3",
            "void func_2()\n{\n}\nvoid main()\n{\n    callFunc3(func_2);\n}\n",
        ),
        (
            "set_main",
            "void func_2()\n{\n}\nvoid main()\n{\n    set_main(func_2);\n}\n",
        ),
        (
            "return_int",
            "int func_1(int arg0)\n{\n    if (arg0)\n    {\n        return 0x1;\n    }\n    return 0;\n}\nvoid main()\n{\n}\n",
        ),
        (
            "return_void",
            "void main()\n{\n    if (0)\n    {\n        return;\n    }\n}\n",
        ),
        (
            "compare_ops",
            "void main()\n{\n    int var0;\n    var0 = 0x1 == 0x2;\n    var0 = 0x1 != 0x2;\n    var0 = 0x1 < 0x2;\n    var0 = 0x1 <= 0x2;\n    var0 = 0x1 > 0x2;\n    var0 = 0x1 >= 0x2;\n}\n",
        ),
        (
            "switch_cases",
            "int func_1(int arg0)\n{\n    int var1;\n    switch(arg0) {\n        case 0x1:\n            var1 = 0;\n            break;\n        case 0x2:\n            var1 = 0x1;\n            break;\n        default:\n            var1 = 0;\n            break;\n    }\n    return var1;\n}\nvoid main()\n{\n}\n",
        ),
        (
            "nested_if_while",
            "void main()\n{\n    int var0;\n    var0 = 0x3;\n    while (var0)\n    {\n        if (var0 == 0x1)\n        {\n            var0 = 0;\n        }\n        else\n        {\n            var0 -= 0x1;\n        }\n    }\n}\n",
        ),
        (
            "comments_ignored",
            "void main()\n{\n    // line comment\n    int var0; /* block */\n    var0 = 0x1;\n}\n",
        ),
        (
            "one_c_shape",
            "int global0;\n\nvoid main()\n{\n    func_1();\n    callFunc3(func_2);\n}\n\nvoid func_1()\n{\n    func_3();\n}\n\nvoid func_2()\n{\n    func_4();\n    func_5();\n}\n\nvoid func_3()\n{\n    \n}\n\nvoid func_4()\n{\n    \n}\n\nvoid func_5()\n{\n    \n}\n",
        ),
    ]
}

#[test]
fn compile_snippets_match_live_msclang_dash_i() {
    let mut failures = Vec::new();
    for (label, src) in snippet_cases() {
        let tmp = tempfile::tempdir().unwrap();
        let expected = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            oracle_compile(src, tmp.path())
        })) {
            Ok(v) => v,
            Err(_) => {
                failures.push(format!("{label}: oracle compile panicked"));
                continue;
            }
        };
        match compile_c_msclang_dash_i(src) {
            Ok(got) => {
                if got != expected {
                    failures.push(format!("{label}: {}", first_diff(&expected, &got)));
                }
            }
            Err(e) => failures.push(format!("{label}: rust compile {e}")),
        }
    }
    assert!(
        failures.is_empty(),
        "compile snippet failures:\n{}",
        failures.join("\n")
    );
}

#[test]
fn decompile_snippets_match_live_mscdec() {
    let mut failures = Vec::new();
    for (label, src) in snippet_cases() {
        let tmp = tempfile::tempdir().unwrap();
        let packed = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            oracle_compile(src, tmp.path())
        })) {
            Ok(v) => v,
            Err(_) => {
                failures.push(format!("{label}: oracle compile panicked"));
                continue;
            }
        };
        let (exp_c, exp_log) = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            oracle_decompile(&packed, tmp.path())
        })) {
            Ok(v) => v,
            Err(_) => {
                failures.push(format!("{label}: oracle decompile panicked"));
                continue;
            }
        };
        match decompile_bytes(&packed) {
            Ok((got_c, got_log)) => {
                if got_c.as_bytes() != exp_c.as_slice() {
                    failures.push(format!(
                        "{label} C: {}",
                        first_diff(&exp_c, got_c.as_bytes())
                    ));
                }
                if got_log.as_bytes() != exp_log.as_slice() {
                    failures.push(format!(
                        "{label} log: {}",
                        first_diff(&exp_log, got_log.as_bytes())
                    ));
                }
            }
            Err(e) => failures.push(format!("{label}: rust decompile {e}")),
        }
    }
    assert!(
        failures.is_empty(),
        "decompile snippet failures:\n{}",
        failures.join("\n")
    );
}

#[test]
fn python_packed_then_rust_compile_of_decompiled_c_matches_oracle_pack() {
    let src =
        "int global0;\nvoid func_1()\n{\n    global0 = 0x1;\n}\nvoid main()\n{\n    func_1();\n}\n";
    let tmp = tempfile::tempdir().unwrap();
    let packed = oracle_compile(src, tmp.path());
    let (c_text, _) = decompile_bytes(&packed).unwrap();
    let rust_repack = compile_c_msclang_dash_i(&c_text).unwrap();
    let py_c = tmp.path().join("py.c");
    std::fs::write(&py_c, &c_text).unwrap();
    let py_pack = tmp.path().join("py.msc");
    run_python(
        "msclang.py",
        &[
            py_c.to_str().unwrap(),
            "-o",
            py_pack.to_str().unwrap(),
            "-i",
        ],
    )
    .unwrap();
    let expected = std::fs::read(&py_pack).unwrap();
    assert_eq!(
        expected,
        rust_repack,
        "repack of rust-decompiled C {}",
        first_diff(&expected, &rust_repack)
    );
}

#[test]
fn unsorted_script_table_decompile_matches_oracle() {
    let src = "void func_1()\n{\n}\nvoid main()\n{\n    func_1();\n}\n";
    let tmp = tempfile::tempdir().unwrap();
    let mut packed = oracle_compile(src, tmp.path());
    let mut table =
        u32::from_le_bytes(packed[0x10..0x14].try_into().unwrap()).wrapping_add(0x30) as usize;
    if table % 0x10 != 0 {
        table += 0x10 - (table % 0x10);
    }
    let count = u32::from_le_bytes(packed[0x18..0x1C].try_into().unwrap()) as usize;
    assert!(count >= 2, "need two scripts to swap");
    let a = packed[table..table + 4].to_vec();
    let b = packed[table + 4..table + 8].to_vec();
    packed[table..table + 4].copy_from_slice(&b);
    packed[table + 4..table + 8].copy_from_slice(&a);
    assert_decompile_identity("unsorted_table", &packed);
}

#[test]
fn dash_i_never_emits_push_short() {
    let src = "void main()\n{\n    int var0;\n    var0 = 0x7;\n}\n";
    let got = compile_c_msclang_dash_i(src).unwrap();
    let body_end =
        u32::from_le_bytes(got[0x10..0x14].try_into().unwrap()).wrapping_add(0x30) as usize;
    let body = &got[0x40..body_end.min(got.len())];
    assert!(
        !body.contains(&0x0D) && !body.contains(&0x8D),
        "dash-i packed body contains pushShort"
    );
    assert!(body.contains(&0x8A) || body.contains(&0x0A));
}

#[test]
fn file_api_does_not_write_beside_oracle_tools() {
    let tmp = tempfile::tempdir().unwrap();
    let src = tmp.path().join("x.c");
    let out = tmp.path().join("x.msc");
    std::fs::write(&src, "void main()\n{\n}\n").unwrap();
    compile_file(&src, &out, false).unwrap();
    assert!(out.is_file());
    let tools = tools_dir();
    let before: Vec<_> = std::fs::read_dir(&tools)
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .collect();
    compile_file(&src, &out, false).unwrap();
    let after: Vec<_> = std::fs::read_dir(&tools)
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .collect();
    assert_eq!(before, after, "compile must not touch tools/");
}

#[test]
fn toolchain_sources_do_not_shell_python() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/msc_toolchain");
    let mut bad = Vec::new();
    fn walk(dir: &Path, bad: &mut Vec<String>) {
        for ent in std::fs::read_dir(dir).unwrap() {
            let ent = ent.unwrap();
            let path = ent.path();
            if path.is_dir() {
                walk(&path, bad);
                continue;
            }
            if path.extension().and_then(|s| s.to_str()) != Some("rs") {
                continue;
            }
            let text = std::fs::read_to_string(&path).unwrap();
            if text.contains("Command::new(\"python\")") || text.contains("exec-python") {
                bad.push(path.display().to_string());
            }
        }
    }
    walk(&root, &mut bad);
    assert!(
        bad.is_empty(),
        "msc_toolchain must not mention python oracles: {bad:?}"
    );
}

#[test]
fn opcode_formats_match_python_command_format() {
    let expected: &[(u8, &str)] = &[
        (0x02, "HH"),
        (0x04, "I"),
        (0x05, "I"),
        (0x0A, "I"),
        (0x0B, "BH"),
        (0x0D, "H"),
        (0x14, "BH"),
        (0x15, "BH"),
        (0x1C, "BH"),
        (0x2C, "B"),
        (0x2D, "BB"),
        (0x2E, "I"),
        (0x2F, "B"),
        (0x30, "B"),
        (0x31, "B"),
        (0x34, "I"),
        (0x35, "I"),
        (0x36, "I"),
        (0x38, "B"),
        (0x39, "B"),
        (0x3F, "BH"),
        (0x41, "BH"),
    ];
    for (op, fmt) in expected {
        assert_eq!(
            std::str::from_utf8(format_of(*op)).unwrap(),
            *fmt,
            "format_of({op:#x})"
        );
    }
}

#[test]
fn opcode_stack_pops_match_python_table() {
    let cases: &[(u8, &[u32], i32)] = &[
        (0x06, &[], 1),
        (0x07, &[], 0),
        (0x0A, &[1], 0),
        (0x0E, &[], 2),
        (0x13, &[], 1),
        (0x1C, &[], 1),
        (0x25, &[], 2),
        (0x2B, &[], 1),
        (0x2C, &[3], 3),
        (0x2D, &[2, 1], 2),
        (0x2E, &[0], 0),
        (0x2F, &[2], 3),
        (0x30, &[1], 2),
        (0x31, &[0], 1),
        (0x32, &[], -1),
        (0x34, &[], 1),
        (0x35, &[], 1),
        (0x36, &[], 0),
    ];
    for (op, params, pops) in cases {
        assert_eq!(stack_pops(*op, params), *pops, "stack_pops({op:#x})");
    }
}

#[test]
fn header_endian_and_padding_on_snippet() {
    let src = "void main()\n{\n}\n";
    assert_compile_identity("empty_header", src);
    let packed = compile_c_msclang_dash_i(src).unwrap();
    assert_eq!(&packed[0x08..0x0C], &[0x0A, 0x21, 0xAF, 0x16]);
    assert_eq!(&packed[0x30..0x40], &[0u8; 16]);
    let count = u32::from_le_bytes(packed[0x18..0x1C].try_into().unwrap());
    assert_eq!(count, 1);
    let entries = u32::from_le_bytes(packed[0x10..0x14].try_into().unwrap());
    assert!(entries > 0);
}

#[test]
fn decompile_0_log_matches_oracle() {
    let src_bin = fixture_dir().join("0.bscex");
    if !src_bin.is_file() {
        return;
    }
    let data = std::fs::read(&src_bin).unwrap();
    let tmp = tempfile::tempdir().unwrap();
    let (_, exp_log) = oracle_decompile(&data, tmp.path());
    let (_, got_log) = decompile_bytes(&data).unwrap();
    assert_eq!(
        exp_log,
        got_log.as_bytes(),
        "0.bscex log {}",
        first_diff(&exp_log, got_log.as_bytes())
    );
}

#[test]
fn decompile_2_log_matches_oracle() {
    let src_bin = fixture_dir().join("2.dscex");
    if !src_bin.is_file() {
        return;
    }
    let data = std::fs::read(&src_bin).unwrap();
    let tmp = tempfile::tempdir().unwrap();
    let (_, exp_log) = oracle_decompile(&data, tmp.path());
    let (_, got_log) = decompile_bytes(&data).unwrap();
    assert_eq!(
        exp_log,
        got_log.as_bytes(),
        "2.dscex log {}",
        first_diff(&exp_log, got_log.as_bytes())
    );
}

#[test]
fn extra_unit_2_dscex_text_roundtrip_when_present() {
    let src_bin = PathBuf::from(r"E:\XB\解包\com\file\040msc\0x18AF7533\2.dscex");
    if !src_bin.is_file() {
        return;
    }
    let data = std::fs::read(&src_bin).unwrap();
    assert_decompile_identity("0x18AF7533/2.dscex", &data);
}

#[test]
fn fixture_files_are_not_rewritten() {
    let dir = fixture_dir();
    let paths = ["0.bscex", "1.cscex", "2.dscex", "0.c", "1.c", "2.c"];
    let before: Vec<(String, u64, std::time::SystemTime)> = paths
        .iter()
        .filter_map(|n| {
            let p = dir.join(n);
            let meta = std::fs::metadata(&p).ok()?;
            Some((n.to_string(), meta.len(), meta.modified().ok()?))
        })
        .collect();
    let _ = compile_c_msclang_dash_i("void main()\n{\n}\n");
    if dir.join("1.cscex").is_file() {
        let data = std::fs::read(dir.join("1.cscex")).unwrap();
        let _ = decompile_bytes(&data);
    }
    for (name, len, mtime) in before {
        let meta = std::fs::metadata(dir.join(&name)).unwrap();
        assert_eq!(meta.len(), len, "fixture {name} size changed");
        assert_eq!(
            meta.modified().unwrap(),
            mtime,
            "fixture {name} mtime changed"
        );
    }
}

#[test]
fn parse_rejects_unknown_top_level() {
    let err = compile_c_msclang_dash_i("hello world").unwrap_err();
    assert!(err.contains("unexpected"), "{err}");
}

#[test]
fn decompile_file_writes_only_requested_outputs() {
    let dir = fixture_dir();
    let src = dir.join("1.cscex");
    if !src.is_file() {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let out_c = tmp.path().join("out.c");
    let out_log = tmp.path().join("out.txt");
    decompile_file(&src, &out_c, &out_log).unwrap();
    assert!(out_c.is_file() && out_log.is_file());
    assert!(std::fs::read(&out_c).unwrap().starts_with(b"int global"));
    let log = std::fs::read_to_string(&out_log).unwrap();
    assert!(log.contains("Analyzing..."), "txt missing Analyzing header");
    assert!(log.contains("[func_name:"), "txt missing func_name table");
    assert!(
        log.contains("Decompiling..."),
        "txt missing Decompiling footer"
    );
}

#[test]
fn default_log_path_is_sibling_txt_of_c_output() {
    let c = PathBuf::from(r"E:\msc\unit\0.c");
    assert_eq!(
        default_decompile_log_path(&c),
        PathBuf::from(r"E:\msc\unit\0.txt")
    );
    assert_eq!(
        resolve_decompile_log_path(&c, None),
        PathBuf::from(r"E:\msc\unit\0.txt")
    );
    assert_eq!(
        resolve_decompile_log_path(&c, Some(Path::new(""))),
        PathBuf::from(r"E:\msc\unit\0.txt")
    );
    let explicit = PathBuf::from(r"E:\msc\unit\custom.log");
    assert_eq!(resolve_decompile_log_path(&c, Some(&explicit)), explicit);
}

#[test]
fn decompile_file_writes_txt_beside_c_in_nested_temp_dir() {
    let dir = fixture_dir();
    let src = dir.join("1.cscex");
    if !src.is_file() {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let nested = tmp.path().join("slot");
    let out_c = nested.join("1.c");
    let out_txt = resolve_decompile_log_path(&out_c, None);
    decompile_file(&src, &out_c, &out_txt).unwrap();
    assert!(out_c.is_file(), "missing {}", out_c.display());
    assert!(
        out_txt.is_file(),
        "missing sidecar txt {}",
        out_txt.display()
    );
    assert_eq!(out_txt.file_name().unwrap(), "1.txt");
    let oracle_tmp = tempfile::tempdir().unwrap();
    let data = std::fs::read(&src).unwrap();
    let (_, exp_log) = oracle_decompile(&data, oracle_tmp.path());
    let got_log = std::fs::read(&out_txt).unwrap();
    assert_eq!(exp_log, got_log, "1.txt {}", first_diff(&exp_log, &got_log));
}

#[test]
fn lib_rs_exports_msc_toolchain_as_public_backend_module() {
    let lib = include_str!("../src/lib.rs");
    assert!(
        lib.contains("pub mod msc_toolchain"),
        "Tauri backend must expose crate::msc_toolchain as a public module"
    );
    assert!(
        lib.contains("pub mod msc_roundtrip"),
        "msc_roundtrip must be public so other backend code and tests can call in-process verify"
    );
    assert!(
        lib.contains("msc_roundtrip::verify_msc_roundtrip_from_c"),
        "in-process verify command must be registered on the Tauri backend"
    );
}

#[test]
fn cli_bins_are_thin_wrappers_over_app_lib() {
    let mscdec = include_str!("../src/bin/mscdec.rs");
    let msclang = include_str!("../src/bin/msclang.rs");
    assert!(
        mscdec.contains("app_lib::msc_toolchain::decompile_file"),
        "mscdec.exe must call the library, not reimplement decompile"
    );
    assert!(
        msclang.contains("app_lib::msc_toolchain::compile_file"),
        "msclang.exe must call the library, not reimplement compile"
    );
    assert!(
        !mscdec.contains("std::process::Command") && !msclang.contains("std::process::Command"),
        "CLI bins must not spawn another process to decompile/compile"
    );
    assert!(
        !mscdec.contains("emit_file") && !msclang.contains("parse_unit"),
        "CLI bins must stay thin wrappers"
    );
}

#[test]
fn backend_module_msc_roundtrip_compiles_via_crate_msc_toolchain() {
    let src = include_str!("../src/msc_roundtrip.rs");
    assert!(
        src.contains("crate::msc_toolchain::compile_in_process"),
        "msc_roundtrip must compile in-process through crate::msc_toolchain, not spawn msclang.exe"
    );
    assert!(
        !src.contains("Command::new") && !src.contains("std::process"),
        "msc_roundtrip must not spawn mscdec/msclang binaries"
    );
}

#[test]
fn in_process_library_api_decompiles_and_compiles_without_bins() {
    let src = "void main()\n{\n    int var0;\n    var0 = 0x1;\n}\n";
    let packed = compile_in_process(src).expect("compile_in_process");
    assert_eq!(&packed[..8], b"\xB2\xAC\xBC\xBA\xE6\x90\x32\x01");
    let dash_i = compile_c_msclang_dash_i(src).unwrap();
    assert_eq!(packed, dash_i, "compile_in_process must match dash-i");

    let out = decompile_in_process(&packed).expect("decompile_in_process");
    assert!(
        out.c_source.contains("void main"),
        "c_source missing main: {}",
        out.c_source
    );
    assert!(
        out.log_text.contains("Analyzing...") && out.log_text.contains("Decompiling..."),
        "log_text missing sidecar sections: {}",
        out.log_text
    );
    let (tuple_c, tuple_log) = decompile_bytes(&packed).unwrap();
    assert_eq!(out.c_source, tuple_c);
    assert_eq!(out.log_text, tuple_log);
}

#[test]
fn in_process_roundtrip_verify_matches_self_compiled_snippet() {
    let src = "void main()\n{\n    int var0;\n    var0 = 0x2;\n}\n";
    let original = compile_in_process(src).unwrap();
    let report = verify_c_source_against_original(src, &original).expect("verify");
    assert!(
        report.is_match,
        "self-compiled snippet must match: {report:?}"
    );
    assert_eq!(report.original_size, original.len() as u64);
    assert_eq!(report.recompiled_size, original.len() as u64);
    assert_eq!(report.first_divergence_offset, None);
}

#[test]
fn in_process_roundtrip_verify_detects_divergence() {
    let src_a = "void main()\n{\n    int var0;\n    var0 = 0x1;\n}\n";
    let src_b = "void main()\n{\n    int var0;\n    var0 = 0x2;\n}\n";
    let original = compile_in_process(src_a).unwrap();
    let report = verify_c_source_against_original(src_b, &original).expect("verify");
    assert!(!report.is_match);
    assert!(report.first_divergence_offset.is_some());
}

#[test]
fn in_process_roundtrip_verify_1_c_against_1_cscex() {
    let dir = fixture_dir();
    let src_c = dir.join("1.c");
    let orig = dir.join("1.cscex");
    if !src_c.is_file() || !orig.is_file() {
        return;
    }
    let src = std::fs::read_to_string(&src_c).unwrap();
    let original = std::fs::read(&orig).unwrap();
    let report = verify_c_source_against_original(&src, &original).expect("verify 1.c");
    assert!(
        report.is_match,
        "1.c in-process compile must match 1.cscex {:?}",
        report
    );
}

#[test]
fn verify_msc_roundtrip_from_c_reads_files_in_process() {
    let tmp = tempfile::tempdir().unwrap();
    let src = "void main()\n{\n    int var0;\n    var0 = 0x3;\n}\n";
    let packed = compile_in_process(src).unwrap();
    let c_path = tmp.path().join("1.c");
    let orig_path = tmp.path().join("1.cscex");
    std::fs::write(&c_path, src.replace('\n', "\r\n")).unwrap();
    std::fs::write(&orig_path, &packed).unwrap();
    let report = verify_msc_roundtrip_from_c(
        c_path.to_string_lossy().into_owned(),
        orig_path.to_string_lossy().into_owned(),
    )
    .expect("file verify");
    assert!(report.is_match);
}

#[test]
fn verify_msc_roundtrip_from_c_missing_c_is_explicit_error() {
    let tmp = tempfile::tempdir().unwrap();
    let orig_path = tmp.path().join("1.cscex");
    std::fs::write(&orig_path, [1u8, 2, 3]).unwrap();
    let missing = tmp.path().join("missing.c");
    let err = verify_msc_roundtrip_from_c(
        missing.to_string_lossy().into_owned(),
        orig_path.to_string_lossy().into_owned(),
    )
    .expect_err("missing C");
    assert!(err.contains("C file not found"), "{err}");
}

#[test]
fn unit_msc_workspace_decompile_repack_verify_all_slots() {
    let dir = fixture_dir();
    let slots = [
        ("0.bscex", "0.c", "0.txt"),
        ("1.cscex", "1.c", "1.txt"),
        ("2.dscex", "2.c", "2.txt"),
    ];
    let tmp = tempfile::tempdir().unwrap();
    for (bin_name, c_name, txt_name) in slots {
        let src = dir.join(bin_name);
        if !src.is_file() {
            return;
        }
        let out_c = tmp.path().join(c_name);
        let out_txt = tmp.path().join(txt_name);
        decompile_file(&src, &out_c, &out_txt).expect(bin_name);
        assert!(
            out_c.is_file() && out_txt.is_file(),
            "{bin_name} must write C and sibling txt"
        );
        let data = std::fs::read(&src).unwrap();
        let (exp_c, exp_log) = oracle_decompile(&data, tmp.path());
        let got_c = std::fs::read(&out_c).unwrap();
        let got_log = std::fs::read(&out_txt).unwrap();
        assert_eq!(
            exp_c,
            got_c,
            "Convert {bin_name} C {}",
            first_diff(&exp_c, &got_c)
        );
        assert_eq!(
            exp_log,
            got_log,
            "Convert {bin_name} txt {}",
            first_diff(&exp_log, &got_log)
        );

        let c_src = std::fs::read_to_string(&out_c).unwrap();
        let packed = compile_in_process(&c_src).expect(c_name);
        let oracle_pack_path = tmp.path().join(format!("{c_name}.oracle.pack"));
        run_python(
            "msclang.py",
            &[
                out_c.to_str().unwrap(),
                "-o",
                oracle_pack_path.to_str().unwrap(),
                "-i",
            ],
        )
        .expect("oracle pack of workspace C");
        let oracle_pack = std::fs::read(&oracle_pack_path).unwrap();
        assert_eq!(
            oracle_pack,
            packed,
            "Repack {c_name} {}",
            first_diff(&oracle_pack, &packed)
        );
        let report = verify_c_source_against_original(&c_src, &packed).expect(c_name);
        assert!(
            report.is_match,
            "Verify {c_name} after in-process repack {:?}",
            report
        );
    }
}
