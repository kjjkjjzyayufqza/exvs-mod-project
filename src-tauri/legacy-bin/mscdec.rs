use std::env;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut args = env::args().skip(1);
    let mut input = None;
    let mut output = None;
    let mut log = None;
    while let Some(a) = args.next() {
        match a.as_str() {
            "-o" => output = args.next(),
            "-log" | "--log" => log = args.next(),
            "-v" | "--verbose" | "-c" | "--assumeCharStd" => {}
            s if !s.starts_with('-') => input = Some(a),
            _ => {}
        }
    }
    let Some(input) = input else {
        eprintln!("usage: mscdec <file> -o <out.c> [-log <out.txt>]");
        return ExitCode::from(2);
    };
    let output = output.unwrap_or_else(|| {
        let p = std::path::Path::new(&input);
        p.file_stem()
            .map(|s| format!("{}.c", s.to_string_lossy()))
            .unwrap_or_else(|| "out.c".into())
    });
    let log = log.unwrap_or_else(|| {
        app_lib::msc_toolchain::default_decompile_log_path(std::path::Path::new(&output))
            .to_string_lossy()
            .into_owned()
    });
    match app_lib::msc_toolchain::decompile_file(input.as_ref(), output.as_ref(), log.as_ref()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::from(1)
        }
    }
}
