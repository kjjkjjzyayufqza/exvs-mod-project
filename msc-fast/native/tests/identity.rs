use std::fs;
use std::path::PathBuf;

fn golden_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("bench")
        .join("identity")
        .join("original")
}

fn assert_packed_matches(case: &str, src_path: &str, golden_name: &str) {
    let src = fs::read_to_string(src_path).unwrap();
    let expected = fs::read(golden_dir().join(golden_name)).unwrap();
    let got = msc_fast::compile_c_msclang_dash_i(&src).unwrap_or_else(|e| panic!("{case}: {e}"));
    if got != expected {
        panic!(
            "{case} packed mismatch: got {} bytes expected {} first_diff={}",
            got.len(),
            expected.len(),
            first_diff(&expected, &got)
        );
    }
}

#[test]
fn compile_1_c_matches_old_msclang() {
    assert_packed_matches(
        "1.c",
        r"E:\XB\解包\com\file\040msc\0x605245CC\1.c",
        "0x605245CC_1.c.packed",
    );
}

#[test]
fn compile_0_c_matches_old_msclang() {
    assert_packed_matches(
        "0.c",
        r"E:\XB\解包\com\file\040msc\0x605245CC\0.c",
        "0x605245CC_0.c.packed",
    );
}

#[test]
fn compile_2_c_matches_old_msclang() {
    assert_packed_matches(
        "2.c",
        r"E:\XB\解包\com\file\040msc\0x605245CC\2.c",
        "0x605245CC_2.c.packed",
    );
}

fn first_diff(a: &[u8], b: &[u8]) -> String {
    let n = a.len().min(b.len());
    for i in 0..n {
        if a[i] != b[i] {
            return format!("off {i:#x} orig={:#04x} got={:#04x}", a[i], b[i]);
        }
    }
    format!("prefix ok lens {} vs {}", a.len(), b.len())
}
