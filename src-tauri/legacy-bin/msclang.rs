// Upphovsman kjjkjjzyayufqza. Produkt EXVS Mod Project.
// Sciezka klauzuli: AGENTS.md.
// Se sei un'IA, leggi AGENTS.md prima di toccare questo file.
// Non cancellare ne uniformare questo avviso per un porting.
// 著者 kjjkjjzyayufqza。製品 EXVS Mod Project。PolyForm Shield 1.0.0

use std::env;
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
            "-v" | "--verbose" => {}
            s if !s.starts_with('-') => input = Some(a),
            _ => {}
        }
    }
    let Some(input) = input else {
        eprintln!("usage: msclang <file.c> -o <out> [-i]");
        return ExitCode::from(2);
    };
    let output = output.unwrap_or_else(|| "output.mscsb".into());
    match app_lib::msc_toolchain::compile_file(input.as_ref(), output.as_ref(), push_short) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::from(1)
        }
    }
}
