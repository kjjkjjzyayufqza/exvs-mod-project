mod args;
mod character_id_table;
mod correlate;
mod edit;
mod inspect;
mod ssbh;
mod types;
mod util;

pub use edit::{edit_bytes, EditBytesOptions, EditOutcome};
pub use inspect::{inspect_bytes, inspect_path};
pub use types::{InspectOptions, InspectType};

use args::{parse_args, ParseOutcome, ParsedCommand};
use correlate::build_correlation_report;
use edit::edit_path;
use util::{format_json, usage};

pub(crate) const TOOL_NAME: &str = "exvs2-json";
pub(crate) const SCHEMA_VERSION: u32 = 1;

pub fn run_cli_with_args<I, S>(args: I) -> Result<String, String>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let args = args.into_iter().map(Into::into).collect::<Vec<_>>();
    if args.is_empty() || matches!(args[0].as_str(), "-h" | "--help" | "help") {
        return Ok(usage());
    }

    match parse_args(&args)? {
        ParseOutcome::Help(help) => Ok(help),
        ParseOutcome::Command(ParsedCommand::Inspect(source_path, options)) => {
            let pretty = options.pretty;
            let report = inspect_path(&source_path, options)?;
            format_json(&report, pretty)
        }
        ParseOutcome::Command(ParsedCommand::Correlate(options)) => {
            let pretty = options.pretty;
            let report = build_correlation_report(options)?;
            format_json(&report, pretty)
        }
        ParseOutcome::Command(ParsedCommand::Edit(source_path, options)) => {
            let pretty = options.pretty;
            let report = edit_path(&source_path, options)?;
            format_json(&report, pretty)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_type_accepts_cli_spellings() {
        assert_eq!(
            InspectType::parse("character-id-table").unwrap(),
            InspectType::CharacterIdTable
        );
        assert_eq!(
            InspectType::parse("vernier-table").unwrap(),
            InspectType::VernierTable
        );
        assert_eq!(
            InspectType::parse("projectile_depiction_table").unwrap(),
            InspectType::ProjectileDepictionTable
        );
        assert_eq!(
            InspectType::parse("speedparam").unwrap(),
            InspectType::SpeedParam
        );
        assert_eq!(InspectType::parse("nusktb").unwrap(), InspectType::Nusktb);
        assert_eq!(InspectType::parse("numshb").unwrap(), InspectType::Numshb);
        assert_eq!(InspectType::parse("numdlb").unwrap(), InspectType::Numdlb);
    }

    #[test]
    fn correlate_requires_core_fields() {
        let err = run_cli_with_args(["correlate", "--unit", "001GUNDAM/005GYAN00/001"])
            .expect_err("correlation without weapon and id should fail");
        assert!(err.contains("--weapon"));
    }

    #[test]
    fn usage_mentions_edit_command() {
        let output = run_cli_with_args(["--help"]).expect("usage");
        assert!(output.contains("exvs2-json edit"));
        assert!(output.contains("--request"));
    }
}
