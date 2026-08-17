use std::ffi::OsString;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use app_lib::format::effect_folder::{inspect_effect_folder, parse_efxbn_file};
use app_lib::nutexb_lib;
use app_lib::ssbh_dae::{
    export_ssbh_bundle_to_dae, DaeExportConfig, DaeMaterialTextureExport,
};
use app_lib::ssbh_preview::load_model_preview_bundle;
use serde::Deserialize;
use serde_json::{json, Value};
use ssbh_data::prelude::*;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssetManifest {
    #[serde(default)]
    models: Vec<AssetRequest>,
    #[serde(default)]
    textures: Vec<AssetRequest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssetRequest {
    id: String,
    source_path: String,
    output_path: String,
}

fn required_path(args: &[OsString], flag: &str) -> Result<PathBuf, String> {
    let index = args
        .iter()
        .position(|value| value.to_string_lossy() == flag)
        .ok_or_else(|| format!("Missing required argument {flag}"))?;
    let value = args
        .get(index + 1)
        .ok_or_else(|| format!("Missing value for {flag}"))?;
    Ok(PathBuf::from(value))
}

fn path_text(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn emit_json(value: &Value) -> Result<(), String> {
    let stdout = io::stdout();
    let mut writer = stdout.lock();
    serde_json::to_writer_pretty(&mut writer, value)
        .map_err(|error| format!("Failed to serialize output JSON: {error}"))?;
    writer
        .write_all(b"\n")
        .map_err(|error| format!("Failed to write output JSON: {error}"))
}

fn inspect_command(args: &[OsString]) -> Result<Value, String> {
    let effect_root = required_path(args, "--effect-root")?;
    let structure = required_path(args, "--structure")?;
    let efxbn = required_path(args, "--efxbn")?;
    let effect_root_text = path_text(&effect_root);
    let structure_text = path_text(&structure);
    let efxbn_text = path_text(&efxbn);

    let inventory = inspect_effect_folder(&effect_root_text, Some(&structure_text))?;
    let selected_efxbn = parse_efxbn_file(&efxbn_text)?;
    Ok(json!({
        "schemaVersion": 1,
        "effectRoot": effect_root_text,
        "structureJsonPath": structure_text,
        "efxbnPath": efxbn_text,
        "inventory": inventory,
        "selectedEfxbn": selected_efxbn,
    }))
}

fn export_model(source: &Path, output: &Path) -> Result<Value, String> {
    let source_text = path_text(source);
    let bundle = load_model_preview_bundle(&source_text)?;
    let mesh = MeshData::from_file(Path::new(&bundle.mesh_path))
        .map_err(|error| format!("Failed to read resolved NUMSHB: {error}"))?;
    let skel = bundle
        .skel_path
        .as_deref()
        .map(|path| {
            SkelData::from_file(Path::new(path))
                .map_err(|error| format!("Failed to read resolved NUSKTB: {error}"))
        })
        .transpose()?;
    let modl: ModlData = serde_json::from_value(bundle.modl.clone())
        .map_err(|error| format!("Failed to deserialize resolved NUMDLB: {error}"))?;
    let matl: Option<MatlData> = bundle
        .matl
        .clone()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| format!("Failed to deserialize resolved NUMATB: {error}"))?;

    let output_dir = output.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(output_dir).map_err(|error| {
        format!(
            "Failed to create model interchange directory {}: {error}",
            output_dir.display()
        )
    })?;
    let model_root = PathBuf::from(&bundle.root_folder);
    let material_export = matl.as_ref().map(|matl| DaeMaterialTextureExport {
        root_canon: &model_root,
        output_dir,
        modl: &modl,
        matl,
    });
    let stats = export_ssbh_bundle_to_dae(
        &mesh,
        skel.as_ref(),
        output,
        &DaeExportConfig::default(),
        None,
        material_export.as_ref(),
    )
    .map_err(|error| format!("SSBH DAE export failed: {error:#}"))?;

    Ok(json!({
        "ok": true,
        "outputPath": path_text(output),
        "stats": stats,
        "warnings": bundle.warnings,
    }))
}

fn export_texture(source: &Path, output: &Path) -> Result<Value, String> {
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create texture preview directory {}: {error}",
                parent.display()
            )
        })?;
    }
    nutexb_lib::export_nutexb_to_png(&path_text(source), &path_text(output))?;
    Ok(json!({
        "ok": true,
        "outputPath": path_text(output),
    }))
}

fn export_asset_rows<F>(requests: Vec<AssetRequest>, export: F) -> Vec<Value>
where
    F: Fn(&Path, &Path) -> Result<Value, String>,
{
    requests
        .into_iter()
        .map(|request| {
            let source = PathBuf::from(&request.source_path);
            let output = PathBuf::from(&request.output_path);
            match export(&source, &output) {
                Ok(details) => json!({
                    "id": request.id,
                    "sourcePath": request.source_path,
                    "outputPath": request.output_path,
                    "result": details,
                }),
                Err(error) => json!({
                    "id": request.id,
                    "sourcePath": request.source_path,
                    "outputPath": request.output_path,
                    "result": {
                        "ok": false,
                        "error": error,
                    },
                }),
            }
        })
        .collect()
}

fn export_assets_command(args: &[OsString]) -> Result<Value, String> {
    let manifest_path = required_path(args, "--manifest")?;
    let manifest_text = fs::read_to_string(&manifest_path).map_err(|error| {
        format!(
            "Failed to read asset manifest {}: {error}",
            manifest_path.display()
        )
    })?;
    let manifest: AssetManifest = serde_json::from_str(&manifest_text).map_err(|error| {
        format!(
            "Failed to parse asset manifest {}: {error}",
            manifest_path.display()
        )
    })?;
    Ok(json!({
        "schemaVersion": 1,
        "models": export_asset_rows(manifest.models, export_model),
        "textures": export_asset_rows(manifest.textures, export_texture),
    }))
}

fn run() -> Result<(), String> {
    let args = std::env::args_os().collect::<Vec<_>>();
    let command = args
        .get(1)
        .map(|value| value.to_string_lossy().to_string())
        .ok_or_else(|| "Expected command: inspect or export-assets".to_string())?;
    let value = match command.as_str() {
        "inspect" => inspect_command(&args)?,
        "export-assets" => export_assets_command(&args)?,
        _ => return Err(format!("Unknown command: {command}")),
    };
    emit_json(&value)
}

fn main() {
    if let Err(error) = run() {
        eprintln!("efxbn-preview-adapter: {error}");
        std::process::exit(2);
    }
}
