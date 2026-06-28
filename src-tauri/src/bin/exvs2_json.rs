fn main() {
    match app_lib::exvs2_json_cli::run_cli_with_args(std::env::args().skip(1)) {
        Ok(output) => println!("{output}"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
