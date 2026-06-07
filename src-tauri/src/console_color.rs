//! ANSI-colored stderr helpers for operator-visible log lines.

const RESET: &str = "\x1b[0m";
const BOLD: &str = "\x1b[1m";
const RED: &str = "\x1b[91m";
const GREEN: &str = "\x1b[92m";
const YELLOW: &str = "\x1b[93m";
const CYAN: &str = "\x1b[96m";

pub fn eprint_info(tag: &str, msg: &str) {
    eprintln!("{BOLD}{CYAN}[{tag}]{RESET} {msg}");
}

pub fn eprint_success(tag: &str, msg: &str) {
    eprintln!("{BOLD}{GREEN}[{tag}]{RESET} {GREEN}{msg}{RESET}");
}

pub fn eprint_warn(tag: &str, msg: &str) {
    eprintln!("{BOLD}{YELLOW}[{tag}]{RESET} {YELLOW}{msg}{RESET}");
}

pub fn eprint_error(tag: &str, msg: &str) {
    eprintln!("{BOLD}{RED}[{tag}]{RESET} {RED}{msg}{RESET}");
}
