//! Multithreaded IEEE CRC32 (UTF-8) suffix brute-force for resource registry seeds.
//!
//! Run:
//!   cargo run --release --bin crc32_brute_seed
//!   cargo run --release --bin crc32_brute_seed -- --length 10 --timeout 0 --target 318410415
//!
//! `--timeout 0` means no time limit.

use crc32fast::Hasher;
use rayon::prelude::*;
use std::io::{self, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const DEFAULT_BASE: &str = "eff_001gundam_002chrgel_001";
const DEFAULT_TARGET: u32 = 318_410_415;
const DEFAULT_SUFFIX_LENGTH: u32 = 10;
const DEFAULT_TIMEOUT_SECS: u64 = 0;
const CHARS: &[u8; 63] = b"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_";
const RADIX: u64 = 63;

struct Args {
    base: String,
    target: u32,
    suffix_length: u32,
    timeout: Option<Duration>,
}

#[derive(Clone)]
struct MatchRecord {
    index: u64,
    suffix: Vec<u8>,
}

fn print_usage() {
    eprintln!("Usage: crc32_brute_seed [OPTIONS]");
    eprintln!();
    eprintln!("Options:");
    eprintln!("  --base <prefix>       Seed prefix (default: {DEFAULT_BASE})");
    eprintln!("  --target <u32>        Target CRC32 value (default: {DEFAULT_TARGET})");
    eprintln!("  --length <n>          Fixed suffix length (default: {DEFAULT_SUFFIX_LENGTH})");
    eprintln!("  --timeout <secs>      Wall-clock timeout; 0 = unlimited (default: {DEFAULT_TIMEOUT_SECS})");
}

fn parse_args() -> Result<Args, String> {
    let mut base = DEFAULT_BASE.to_string();
    let mut target = DEFAULT_TARGET;
    let mut suffix_length = DEFAULT_SUFFIX_LENGTH;
    let mut timeout_secs = DEFAULT_TIMEOUT_SECS;
    let mut args = std::env::args().skip(1);

    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--base" => {
                base = args.next().ok_or("--base requires a value")?;
            }
            "--target" => {
                let raw = args.next().ok_or("--target requires a value")?;
                target = raw
                    .parse::<u32>()
                    .map_err(|_| format!("Invalid --target: {raw}"))?;
            }
            "--length" => {
                let raw = args.next().ok_or("--length requires a value")?;
                suffix_length = raw
                    .parse::<u32>()
                    .map_err(|_| format!("Invalid --length: {raw}"))?;
                if suffix_length == 0 {
                    return Err("--length must be >= 1".to_string());
                }
            }
            "--timeout" => {
                let raw = args.next().ok_or("--timeout requires a value")?;
                timeout_secs = raw
                    .parse::<u64>()
                    .map_err(|_| format!("Invalid --timeout: {raw}"))?;
            }
            "--help" | "-h" => {
                print_usage();
                std::process::exit(0);
            }
            other => return Err(format!("Unknown argument: {other}")),
        }
    }

    if base.is_empty() {
        return Err("Base prefix must not be empty.".to_string());
    }

    let timeout = if timeout_secs == 0 {
        None
    } else {
        Some(Duration::from_secs(timeout_secs))
    };

    Ok(Args {
        base,
        target,
        suffix_length,
        timeout,
    })
}

fn pow_radix(exp: u32) -> u64 {
    RADIX.pow(exp)
}

fn crc32_base_and_suffix(base: &[u8], suffix: &[u8]) -> u32 {
    let mut hasher = Hasher::new();
    hasher.update(base);
    hasher.update(suffix);
    hasher.finalize()
}

fn index_to_digits(index: u64, length: usize, digits: &mut [u8]) {
    let mut idx = index;
    for pos in (0..length).rev() {
        digits[pos] = (idx % RADIX) as u8;
        idx /= RADIX;
    }
}

fn increment_digits(digits: &mut [u8], length: usize) {
    for pos in (0..length).rev() {
        if digits[pos] + 1 < RADIX as u8 {
            digits[pos] += 1;
            return;
        }
        digits[pos] = 0;
    }
}

fn digits_to_suffix(digits: &[u8], length: usize, suffix: &mut [u8]) {
    for i in 0..length {
        suffix[i] = CHARS[digits[i] as usize];
    }
}

fn split_ranges(total: u64, workers: usize) -> Vec<(u64, u64)> {
    let workers = workers.max(1) as u64;
    let chunk = (total / workers).max(1);
    let mut ranges = Vec::new();
    let mut start = 0;
    while start < total {
        let end = (start + chunk).min(total);
        ranges.push((start, end));
        start = end;
    }
    ranges
}

fn is_past_deadline(deadline: Option<Instant>, timed_out: &AtomicBool) -> bool {
    if timed_out.load(Ordering::Relaxed) {
        return true;
    }
    if let Some(deadline) = deadline {
        if Instant::now() >= deadline {
            timed_out.store(true, Ordering::Relaxed);
            return true;
        }
    }
    false
}

fn search_range(
    base: &[u8],
    base_prefix: &str,
    length: usize,
    start: u64,
    end: u64,
    target: u32,
    deadline: Option<Instant>,
    timed_out: &AtomicBool,
    checked: &AtomicU64,
    matches: &Mutex<Vec<MatchRecord>>,
    match_count: &AtomicU64,
) {
    let mut digits = vec![0u8; length];
    let mut suffix = vec![0u8; length];
    index_to_digits(start, length, &mut digits);

    let mut idx = start;
    while idx < end {
        if is_past_deadline(deadline, timed_out) {
            return;
        }

        digits_to_suffix(&digits, length, &mut suffix);
        if crc32_base_and_suffix(base, &suffix) == target {
            let candidate = format!(
                "{}{}",
                base_prefix,
                std::str::from_utf8(&suffix).unwrap_or("<invalid utf-8>")
            );
            let crc = crc32_base_and_suffix(base, &suffix);
            let ordinal = match_count.fetch_add(1, Ordering::Relaxed) + 1;
            matches
                .lock()
                .expect("match list mutex poisoned")
                .push(MatchRecord {
                    index: idx,
                    suffix: suffix.clone(),
                });
            println!(
                "[MATCH #{ordinal}] {candidate} (index={idx}, suffix_len={length}, crc={crc}, hex=0x{crc:08X})"
            );
            let _ = io::stdout().flush();
        }

        idx += 1;
        checked.fetch_add(1, Ordering::Relaxed);
        if idx < end {
            increment_digits(&mut digits, length);
        }
    }
}

fn wait_for_exit() {
    let mut line = String::new();
    let _ = writeln!(io::stdout(), "\nPress Enter to exit...");
    let _ = io::stdout().flush();
    let _ = io::stdin().read_line(&mut line);
}

fn main() {
    let exit_code = run();
    wait_for_exit();
    std::process::exit(exit_code);
}

fn run() -> i32 {
    let args = match parse_args() {
        Ok(value) => value,
        Err(err) => {
            eprintln!("Error: {err}");
            print_usage();
            return 2;
        }
    };

    let base_bytes = args.base.as_bytes();
    let started_at = Instant::now();
    let deadline = args.timeout.map(|timeout| started_at + timeout);
    let timed_out = Arc::new(AtomicBool::new(false));
    let checked = Arc::new(AtomicU64::new(0));
    let match_count = Arc::new(AtomicU64::new(0));
    let matches = Arc::new(Mutex::new(Vec::<MatchRecord>::new()));
    let workers = rayon::current_num_threads();
    let length = args.suffix_length;
    let space = pow_radix(length);

    println!("Base: {}", args.base);
    println!("Target CRC32: {} (0x{:08X})", args.target, args.target);
    println!(
        "Charset ({}): {}",
        CHARS.len(),
        std::str::from_utf8(CHARS).unwrap_or("<invalid>")
    );
    println!("Suffix length: {length}");
    println!("Search space: {space}");
    println!("Workers: {workers}");
    match args.timeout {
        Some(timeout) => println!("Timeout: {}s", timeout.as_secs()),
        None => println!("Timeout: unlimited"),
    }
    println!();

    let ranges = split_ranges(space, workers);
    println!("Chunks: {}", ranges.len());

    let base = Arc::new(base_bytes.to_vec());
    let base_prefix = Arc::new(args.base.clone());
    let target = args.target;
    let timed_out_ref = Arc::clone(&timed_out);
    let checked_ref = Arc::clone(&checked);
    let match_count_ref = Arc::clone(&match_count);
    let matches_ref = Arc::clone(&matches);

    ranges.into_par_iter().for_each(|(start, end)| {
        if is_past_deadline(deadline, timed_out_ref.as_ref()) {
            return;
        }
        search_range(
            base.as_slice(),
            base_prefix.as_str(),
            length as usize,
            start,
            end,
            target,
            deadline,
            timed_out_ref.as_ref(),
            checked_ref.as_ref(),
            matches_ref.as_ref(),
            match_count_ref.as_ref(),
        );
    });

    let total_checked = checked.load(Ordering::Relaxed);
    let total_matches = match_count.load(Ordering::Relaxed);
    let elapsed = started_at.elapsed();

    let mut all_matches = matches.lock().expect("match list mutex poisoned").clone();
    all_matches.sort_by_key(|record| record.index);

    println!();
    println!("=== Summary ===");
    println!("Checked: {total_checked}");
    println!("Matches: {total_matches}");
    println!("Elapsed: {:.2}s", elapsed.as_secs_f64());

    if total_matches > 0 {
        println!();
        println!("All matches (sorted by flat index):");
        for (ordinal, record) in all_matches.iter().enumerate() {
            let candidate = format!(
                "{}{}",
                args.base,
                std::str::from_utf8(&record.suffix).unwrap_or("<invalid utf-8>")
            );
            let crc = crc32_base_and_suffix(base_bytes, &record.suffix);
            println!(
                "  #{:>4} index={} suffix_len={} crc={} hex=0x{:08X} value={candidate}",
                ordinal + 1,
                record.index,
                length,
                crc,
                crc
            );
        }
    }

    if timed_out.load(Ordering::Relaxed) {
        println!();
        println!("Stopped: timeout reached before exhausting suffix length {length}.");
        return 1;
    }

    if total_matches == 0 {
        println!("No matches found in the full suffix-length-{length} search space.");
        return 2;
    }

    0
}
