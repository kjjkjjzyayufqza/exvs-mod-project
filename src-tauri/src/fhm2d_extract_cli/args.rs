use clap::error::ErrorKind;
use clap::Parser;

use crate::format::fhm2d::{ExtractLayout, Fhm2dFormat};

use super::util::usage;

#[derive(Debug, Parser)]
#[command(
    name = "fhm2d-extract",
    disable_version_flag = true,
    about = "Extract OB .fhm2d archives with explicit type naming and folder/flat layout"
)]
struct Cli {
    /// Path to the source .fhm2d file
    #[arg(value_name = "SOURCE_FHM2D")]
    source_path: String,

    /// Output directory for extracted files (structure JSON is written beside it)
    #[arg(long = "output", short = 'o', value_name = "OUT_DIR")]
    output: String,

    /// Naming type (required). Short names or fhm2d_* ids.
    #[arg(long = "type", short = 't', value_name = "TYPE", value_parser = parse_type)]
    extract_type: Fhm2dFormat,

    /// Disk layout: folder (preserve SubFileStructure paths) or flat (basenames only)
    #[arg(long = "layout", short = 'l', value_name = "LAYOUT", value_parser = parse_layout)]
    layout: ExtractLayout,

    /// Write decompressed OB meta section to meta.bin inside the output directory
    #[arg(long = "write-meta-bin")]
    write_meta_bin: bool,

    /// Override list payload file name (`stage_list` / `list` types)
    #[arg(long = "list-output-name", value_name = "NAME")]
    list_output_name: Option<String>,
}

fn parse_type(value: &str) -> Result<Fhm2dFormat, String> {
    Fhm2dFormat::parse_cli(value)
}

fn parse_layout(value: &str) -> Result<ExtractLayout, String> {
    ExtractLayout::parse(value)
}

#[derive(Debug, Clone)]
pub struct ExtractCommand {
    pub source_path: String,
    pub output_dir: String,
    pub extract_type: Fhm2dFormat,
    pub layout: ExtractLayout,
    pub write_meta_bin: bool,
    pub list_output_name: Option<String>,
}

pub enum ParseOutcome {
    Command(ExtractCommand),
    Help(String),
}

pub fn parse_args(args: &[String]) -> Result<ParseOutcome, String> {
    let mut argv = Vec::with_capacity(args.len() + 1);
    argv.push("fhm2d-extract".to_string());
    argv.extend(args.iter().cloned());

    let cli = match Cli::try_parse_from(argv) {
        Ok(cli) => cli,
        Err(error)
            if matches!(
                error.kind(),
                ErrorKind::DisplayHelp | ErrorKind::DisplayVersion
            ) =>
        {
            // Prefer the project-style usage string when help is requested via clap.
            let clap_help = error.to_string();
            if clap_help.contains("Usage:") {
                return Ok(ParseOutcome::Help(format!("{}\n{}", usage(), clap_help)));
            }
            return Ok(ParseOutcome::Help(usage()));
        }
        Err(error) => return Err(error.to_string()),
    };

    Ok(ParseOutcome::Command(ExtractCommand {
        source_path: cli.source_path,
        output_dir: cli.output,
        extract_type: cli.extract_type,
        layout: cli.layout,
        write_meta_bin: cli.write_meta_bin,
        list_output_name: cli.list_output_name,
    }))
}
