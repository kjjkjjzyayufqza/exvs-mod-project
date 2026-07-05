use super::correlate::CorrelateOptions;
use super::edit::{EditOptions, EditRequestSource};
use super::types::{InspectOptions, InspectType};
use super::util::parse_u32_arg;
use clap::error::ErrorKind;
use clap::{Args, Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(
    name = "exvs2-json",
    disable_version_flag = true,
    about = "AI-facing EXVS2 binary/resource JSON tool"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Inspect(InspectArgs),
    Edit(EditArgs),
    Correlate(CorrelateArgs),
}

#[derive(Debug, Args)]
struct InspectArgs {
    #[arg(value_name = "KNOWN_EXVS2_FILE_PATH")]
    source_path: String,
    #[arg(long = "type", value_parser = parse_inspect_type)]
    inspect_type: Option<InspectType>,
    #[arg(long)]
    pretty: bool,
    #[arg(long)]
    summary: bool,
    #[arg(long = "raw-fields")]
    raw_fields: bool,
    #[arg(long = "roundtrip-check")]
    roundtrip_check: bool,
}

#[derive(Debug, Args)]
struct EditArgs {
    #[arg(value_name = "KNOWN_EXVS2_FILE_PATH")]
    source_path: String,
    #[arg(long = "type", value_parser = parse_inspect_type)]
    inspect_type: Option<InspectType>,
    #[arg(long = "request", alias = "input", value_name = "EDIT_JSON")]
    request: Option<String>,
    #[arg(long = "request-json", alias = "input-json", value_name = "JSON")]
    request_json: Option<String>,
    #[arg(long, value_name = "NEW_FILE")]
    output: Option<String>,
    #[arg(long)]
    pretty: bool,
    #[arg(long = "dry-run")]
    dry_run: bool,
}

#[derive(Debug, Args)]
struct CorrelateArgs {
    #[arg(long)]
    unit: String,
    #[arg(long)]
    weapon: String,
    #[arg(long = "id", value_parser = parse_u32_arg)]
    dispatcher_id: u32,
    #[arg(long = "player-facing-name")]
    player_facing_name: Option<String>,
    #[arg(long = "atwiki-url")]
    atwiki_url: Option<String>,
    #[arg(long = "ida-dispatcher")]
    ida_dispatcher: Option<String>,
    #[arg(long = "ida-wrapper")]
    ida_wrapper: Option<String>,
    #[arg(long = "ida-constructor")]
    ida_constructor: Option<String>,
    #[arg(long = "task-class")]
    task_class: Option<String>,
    #[arg(long = "object-size")]
    object_size: Option<String>,
    #[arg(long)]
    pretty: bool,
}

pub(crate) enum ParsedCommand {
    Inspect(String, InspectOptions),
    Edit(String, EditOptions),
    Correlate(CorrelateOptions),
}

pub(crate) enum ParseOutcome {
    Command(ParsedCommand),
    Help(String),
}

pub(crate) fn parse_args(args: &[String]) -> Result<ParseOutcome, String> {
    let mut argv = Vec::with_capacity(args.len() + 1);
    argv.push("exvs2-json".to_string());
    argv.extend(args.iter().cloned());

    let cli = match Cli::try_parse_from(argv) {
        Ok(cli) => cli,
        Err(error)
            if matches!(
                error.kind(),
                ErrorKind::DisplayHelp | ErrorKind::DisplayVersion
            ) =>
        {
            return Ok(ParseOutcome::Help(error.to_string()));
        }
        Err(error) => return Err(error.to_string()),
    };
    match cli.command {
        Command::Inspect(args) => Ok(ParseOutcome::Command(ParsedCommand::Inspect(
            args.source_path,
            InspectOptions {
                inspect_type: args.inspect_type,
                pretty: args.pretty,
                summary: args.summary,
                raw_fields: args.raw_fields,
                roundtrip_check: args.roundtrip_check,
            },
        ))),
        Command::Edit(args) => {
            let request_source =
                match (args.request, args.request_json) {
                    (Some(path), None) => Some(EditRequestSource::Path(path)),
                    (None, Some(json)) => Some(EditRequestSource::Inline(json)),
                    (None, None) => None,
                    (Some(_), Some(_)) => return Err(
                        "edit accepts only one of --request <edit.json> or --request-json <json>"
                            .to_string(),
                    ),
                };
            if request_source.is_none() {
                return Err(
                    "edit requires --request <edit.json> or --request-json <json>".to_string(),
                );
            }
            Ok(ParseOutcome::Command(ParsedCommand::Edit(
                args.source_path,
                EditOptions {
                    inspect_type: args.inspect_type,
                    request_source,
                    output_path: args.output,
                    pretty: args.pretty,
                    dry_run: args.dry_run,
                },
            )))
        }
        Command::Correlate(args) => Ok(ParseOutcome::Command(ParsedCommand::Correlate(
            CorrelateOptions {
                unit: Some(args.unit),
                weapon: Some(args.weapon),
                dispatcher_id: Some(args.dispatcher_id),
                player_facing_name: args.player_facing_name,
                atwiki_url: args.atwiki_url,
                ida_dispatcher: args.ida_dispatcher,
                ida_wrapper: args.ida_wrapper,
                ida_constructor: args.ida_constructor,
                task_class: args.task_class,
                object_size: args.object_size,
                pretty: args.pretty,
            },
        ))),
    }
}

fn parse_inspect_type(value: &str) -> Result<InspectType, String> {
    InspectType::parse(value)
}
