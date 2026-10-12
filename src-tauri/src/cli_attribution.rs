//! Attribution banner for standalone CLI help text.

pub const BANNER: &str = "\
EXVS Mod Project
By kjjkjjzyayufqza
https://github.com/kjjkjjzyayufqza/exvs-mod-project
License: PolyForm Shield 1.0.0";

pub fn with_banner(body: &str) -> String {
    let trimmed = body.trim_start();
    if trimmed.starts_with(BANNER) {
        trimmed.to_string()
    } else {
        format!("{BANNER}\n\n{trimmed}")
    }
}

pub fn is_help_request(args: &[String]) -> bool {
    args.is_empty()
        || matches!(
            args.first().map(String::as_str),
            Some("-h" | "--help" | "help")
        )
        || args
            .iter()
            .any(|arg| matches!(arg.as_str(), "-h" | "--help"))
}

pub fn print_help(usage: &str) -> ! {
    println!("{}", with_banner(usage));
    std::process::exit(0);
}
