fn main() {
    match app_lib::mbon::stage_port::cli::run(std::env::args().skip(1)) {
        Ok(output) => println!("{output}"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
