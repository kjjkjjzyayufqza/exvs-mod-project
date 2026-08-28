use std::env;
use std::fs;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut args = env::args().skip(1);
    let mut input = None;
    let mut output = None;
    let mut push_short = true;
    while let Some(a) = args.next() {
        match a.as_str() {
            "-o" => output = args.next(),
            "-i" | "--pushInt" => push_short = false,
            s if !s.starts_with('-') => input = Some(a),
            _ => {}
        }
    }
    let Some(input) = input else {
        eprintln!("usage: msc_fast_msclang <file.c> -o <out> [-i]");
        return ExitCode::from(2);
    };
    let src = match fs::read_to_string(&input) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::from(1);
        }
    };
    match msc_fast::compile_c(&src, push_short) {
        Ok(bytes) => {
            let out = output.unwrap_or_else(|| "output.mscsb".into());
            if let Err(e) = fs::write(&out, bytes) {
                eprintln!("{e}");
                return ExitCode::from(1);
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("compile error: {e}");
            ExitCode::from(1)
        }
    }
}
