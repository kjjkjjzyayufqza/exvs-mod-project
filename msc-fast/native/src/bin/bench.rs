use std::env;
use std::fs;
use std::time::Instant;

fn main() {
    let path = env::args().nth(1).expect("usage: msc_fast_bench <file.c>");
    let src = fs::read_to_string(&path).expect("read");
    // Warm parse/codegen and the rayon pool so cold-start is not the metric.
    let _ = msc_fast::compile_c_msclang_dash_i(&src).expect("warm compile");
    let mut times = Vec::new();
    for _ in 0..50 {
        let t0 = Instant::now();
        let bytes = msc_fast::compile_c_msclang_dash_i(&src).expect("compile");
        times.push((t0.elapsed().as_secs_f64() * 1_000.0, bytes.len()));
    }
    let min = times.iter().map(|t| t.0).fold(f64::INFINITY, f64::min);
    let mean = times.iter().map(|t| t.0).sum::<f64>() / times.len() as f64;
    println!(
        "file={path} out_bytes={} warm_min_ms={min:.4} warm_mean_ms={mean:.4} target_0.1ms={}",
        times[0].1,
        if min <= 0.1 { "HIT" } else { "MISS" }
    );
}
