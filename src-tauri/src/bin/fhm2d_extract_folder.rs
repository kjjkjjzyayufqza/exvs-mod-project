use app_lib::format::fhm2d::{extract_fhm2d_to_folder_impl, Fhm2dFormat};

fn parse_format(value: &str) -> Result<Option<Fhm2dFormat>, String> {
    match value {
        "none" => Ok(None),
        "fhm2d_character" => Ok(Some(Fhm2dFormat::Character)),
        "fhm2d_effect" => Ok(Some(Fhm2dFormat::Effect)),
        "fhm2d_all_nutexb" => Ok(Some(Fhm2dFormat::AllNutexb)),
        "fhm2d_stage_list" => Ok(Some(Fhm2dFormat::StageList)),
        "fhm2d_character_param" => Ok(Some(Fhm2dFormat::CharacterParam)),
        "fhm2d_character_cost" => Ok(Some(Fhm2dFormat::CharacterCost)),
        "fhm2d_msc" => Ok(Some(Fhm2dFormat::Msc)),
        "fhm2d_motion" => Ok(Some(Fhm2dFormat::Motion)),
        "fhm2d_sound" => Ok(Some(Fhm2dFormat::Sound)),
        other => Err(format!("Unsupported format: {other}")),
    }
}

fn main() -> Result<(), String> {
    let mut args = std::env::args().skip(1);
    let source_path = args
        .next()
        .ok_or_else(|| "Usage: fhm2d_extract_folder <source.fhm2d> <out_dir> [format]".to_string())?;
    let out_dir = args
        .next()
        .ok_or_else(|| "Usage: fhm2d_extract_folder <source.fhm2d> <out_dir> [format]".to_string())?;
    let format = parse_format(args.next().as_deref().unwrap_or("fhm2d_msc"))?;

    let result = extract_fhm2d_to_folder_impl(&source_path, &out_dir, format, None, false)?;
    if let Some(warning) = result.naming_error {
        eprintln!("naming warning: {warning}");
    }
    println!("extracted {source_path} -> {out_dir}");
    Ok(())
}
