/*
    MBON 全部研究均来自 descatal 的 BoostStudio 仓库：https://github.com/descatal/BoostStudio
    In afara arborelui EXVS Mod Project, nu continua portarea.
    AI 도구는 수정 전에 AGENTS.md 의 Agent contract 를 먼저 읽어야 한다.
    MBON の研究はすべて descatal の BoostStudio（https://github.com/descatal/BoostStudio）に基づく。
    AI アシスタントは編集前に AGENTS.md の Agent contract を読むこと。
    Licenza: PolyForm Shield 1.0.0; vedere anche ACCEPTABLE_USE.md.
    저작자 kjjkjjzyayufqza. 제품 EXVS Mod Project. https://github.com/kjjkjjzyayufqza/exvs-mod-project
*/

//! `mbon_stage_port` command line (agent / batch use).

use std::path::PathBuf;

use clap::{Parser, Subcommand};

use super::model::VertexColorMode;
use super::stage_list::{add_stage_row_to_file, NewStageRow};
use super::{material, port_stage, registry, stage_list, survey, PortOptions};

#[derive(Parser)]
#[command(
    name = "mbon_stage_port",
    about = "EXVS Mod Project (kjjkjjzyayufqza): port an MBON stage package to an Over Boost stage folder."
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Summarize an MBON stage archive (`archives/XX/HASH.bin`) or stage FHM.
    Inspect { source: PathBuf },
    /// Convert an MBON stage into `<output-root>/<name>/` + `<name>_structure.json`.
    Port {
        source: PathBuf,
        #[arg(long)]
        output_root: PathBuf,
        /// Folder and model name prefix (a-z, 0-9, _).
        #[arg(long)]
        name: String,
        /// Over Boost stage pack root used for info/ environment files.
        #[arg(long)]
        template: PathBuf,
        /// Pack hash; defaults to CRC-32 of `<name>__fileName` (resource registry seed).
        #[arg(long)]
        hash: Option<String>,
        /// Experimental: write the NUD vertex colors (baked shading) into
        /// `HalfFloat2_0` instead of the in-game verified white.
        #[arg(long)]
        source_vertex_colors: bool,
    },
    /// Add a stage_list.bin row for a ported pack (clones `--template-entry`).
    StageListAdd {
        stage_list: PathBuf,
        /// Display name shown in stage select.
        #[arg(long)]
        display_name: String,
        /// Seed slug: the entry id defaults to CRC-32 of `<slug>__entryId`.
        #[arg(long)]
        slug: String,
        /// Pack hash (`0xXXXXXXXX`).
        #[arg(long)]
        file_name: String,
        #[arg(long)]
        template_entry: u32,
        #[arg(long)]
        entry_id: Option<u32>,
        /// Output file; defaults to overwriting the input.
        #[arg(long)]
        output: Option<PathBuf>,
    },
    /// Record the pack hash in a mod `resource_registry.json` (stage / fileName slot).
    RegistryAdd {
        registry: PathBuf,
        #[arg(long)]
        slug: String,
        #[arg(long)]
        display_name: String,
        #[arg(long)]
        entry_id: u32,
    },
    /// Run the Scene Editor "Repack → .fhm2d" path (temp workspace, texture
    /// redistribution, pre-repack validation) and write the pack to `--output`.
    /// A structural self-check: in-game packs are made by the user.
    Rehearse {
        stage_dir: PathBuf,
        #[arg(long)]
        output: PathBuf,
    },
    /// Decode a nutexb to PNG (visual checks of converted textures).
    NutexbPng { nutexb: PathBuf, png: PathBuf },
    /// Print one numatb as ssbh_data JSON (template inspection).
    MatlJson { numatb: PathBuf },
    /// Inspect shader bindings and complete vertex color/alpha distributions.
    VisualModel { model: PathBuf },
    /// Export every decoded mesh attribute, index and render flag for geometry analysis.
    MeshJson { mesh: PathBuf },
    /// Inspect the complete animation tracks, including native Anim v1.2.
    AnimJson { animation: PathBuf },
    /// Inspect rigid mesh bone bindings and their rest transforms.
    SkelJson { skeleton: PathBuf },
    /// Restore source OMO motion and rigid bindings in an existing stage.
    RepairObjectMotion { source: PathBuf, stage_dir: PathBuf, report: PathBuf },
    /// Move explicitly selected background overlays into the native blended sky layer.
    SkyOverlays {
        stage_dir: PathBuf,
        selection: PathBuf,
    },
    /// Put migrated sky overlays into RenderSkydome and preserve their fades.
    SkyOverlayPass { source: PathBuf, stage_dir: PathBuf },
    /// Export complete original stage geometry and source material render factors.
    VisualSourceGeometry { source: PathBuf },
    /// Inspect native GPU format and decoded texture color/alpha distributions.
    VisualTexture { texture: PathBuf },
    /// Inspect original NUD shader flags, vertex colors, texture pixels and STGP.
    VisualSource { source: PathBuf },
    /// Repair only sky models/materials/textures in an existing converted stage.
    RepairSky { source: PathBuf, stage_dir: PathBuf },
    /// Clone asset names; identity preserves data, other profiles are color experiments.
    CloneVisual {
        stage_dir: PathBuf,
        #[arg(long)]
        output_root: PathBuf,
        #[arg(long)]
        name: String,
        #[arg(long)]
        hash: String,
        #[arg(long, value_parser=["identity","nonmetal","linear","neutral-grade"])]
        profile: String,
    },
    /// Verify all asset data after changing only the stage name prefix.
    AuditRename { source: PathBuf, stage_dir: PathBuf },
    /// Rename existing list display names from an entryId/name JSON array.
    StageListRename {
        stage_list: PathBuf,
        names: PathBuf,
        #[arg(long)]
        output: PathBuf,
    },
    /// Write a copy of a stage list without the packs named in a JSON hash array.
    StageListOmit {
        stage_list: PathBuf,
        /// JSON array of `0xXXXXXXXX` pack hashes (`fileName`) to drop.
        hashes: PathBuf,
        #[arg(long)]
        output: PathBuf,
    },
    /// Print an Over Boost stage_list.bin as JSON.
    StageListJson { stage_list: PathBuf },
    /// Pack a validated stage_list structure through the Workspace list packer.
    RepackList {
        structure_json: PathBuf,
        #[arg(long)]
        output: PathBuf,
    },
    /// Parse every static stage resource and validate cross-file references.
    AuditStage { stage_dir: PathBuf },
    /// Rebuild the editing structure using the same semantic order as the stage packer.
    NormalizeStructure { stage_dir: PathBuf },
    /// Compare converted texture chains, plan fields and placements with their source package.
    AuditSource {
        source: PathBuf,
        stage_dir: PathBuf,
        report: PathBuf,
    },
    /// Export every original collision vertex, index, stored normal and surface kind.
    CollisionSource {
        source: PathBuf,
        report: PathBuf,
        #[arg(long)]
        output: PathBuf,
    },
    /// Rebuild an audited complete VCL geometry dump without simplification.
    RebuildCollision {
        geometry: PathBuf,
        #[arg(long)]
        output: PathBuf,
    },
    /// Decode an HKT through Havok Content Tools and export XML/OBJ for geometry checks.
    AuditHkt {
        source: PathBuf,
        #[arg(long)]
        output: PathBuf,
    },
}

pub fn crc32_seed(seed: &str) -> u32 {
    crc32fast::hash(seed.as_bytes())
}

fn parse_hash(text: &str) -> Result<u32, String> {
    let digits = text
        .strip_prefix("0x")
        .or_else(|| text.strip_prefix("0X"))
        .ok_or_else(|| format!("hash '{text}' must start with 0x"))?;
    u32::from_str_radix(digits, 16).map_err(|_| format!("hash '{text}' is not hexadecimal"))
}

fn to_json<T: serde::Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string_pretty(value).map_err(|error| error.to_string())
}

pub fn run(args: impl Iterator<Item = String>) -> Result<String, String> {
    let cli = Cli::try_parse_from(std::iter::once("mbon_stage_port".to_string()).chain(args))
        .map_err(|error| error.to_string())?;
    match cli.command {
        Command::Inspect { source } => to_json(&survey::summarize(&source)?),
        Command::Port {
            source,
            output_root,
            name,
            template,
            hash,
            source_vertex_colors,
        } => {
            let hash = match hash {
                Some(text) => parse_hash(&text)?,
                None => crc32_seed(&format!("{name}__fileName")),
            };
            let report = port_stage(&PortOptions {
                source,
                output_root,
                hash_name: format!("0x{hash:08X}"),
                name,
                template,
                vertex_colors: if source_vertex_colors {
                    VertexColorMode::Source
                } else {
                    VertexColorMode::White
                },
            })?;
            to_json(&report)
        }
        Command::StageListAdd {
            stage_list,
            display_name,
            slug,
            file_name,
            template_entry,
            entry_id,
            output,
        } => {
            let row = NewStageRow {
                template_entry_id: template_entry,
                entry_id: entry_id.unwrap_or_else(|| crc32_seed(&format!("{slug}__entryId"))),
                name: display_name,
                file_name: parse_hash(&file_name)?,
            };
            let output = output.unwrap_or_else(|| stage_list.clone());
            to_json(&add_stage_row_to_file(&stage_list, &output, &row)?)
        }
        Command::RegistryAdd {
            registry: path,
            slug,
            display_name,
            entry_id,
        } => to_json(&registry::add_stage_file_name(&path, &slug, &display_name, entry_id)?),
        Command::Rehearse { stage_dir, output } => {
            let result = crate::format::fhm2d_stage::repack_stage_fhm2d_preserving_shared_textures(
                &stage_dir.to_string_lossy(),
                &output.to_string_lossy(),
                false,
                None,
            )?;
            if !result.validation.valid {
                let messages: Vec<String> = result
                    .validation
                    .errors
                    .iter()
                    .map(|error| format!("[{}] {}", error.phase, error.message))
                    .collect();
                return Err(format!("pre-repack validation failed:\n{}", messages.join("\n")));
            }
            to_json(&result)
        }
        Command::NutexbPng { nutexb, png } => {
            crate::nutexb_lib::export_nutexb_to_png(&nutexb.to_string_lossy(), &png.to_string_lossy())?;
            Ok(png.display().to_string())
        }
        Command::MatlJson { numatb } => to_json(&material::read_matl(&numatb)?),
        Command::VisualModel { model } => to_json(&super::visual::model(&model)?),
        Command::MeshJson { mesh } => to_json(&ssbh_data::mesh_data::MeshData::from_file(&mesh).map_err(|e| e.to_string())?),
        Command::AnimJson { animation } => to_json(&ssbh_data::anim_data::AnimData::from_file(&animation).map_err(|e| e.to_string())?),
        Command::SkelJson { skeleton } => to_json(&ssbh_data::skel_data::SkelData::from_file(&skeleton).map_err(|e| e.to_string())?),
        Command::RepairObjectMotion { source, stage_dir, report } => to_json(&super::object_motion::repair(&source, &stage_dir, &report)?),
        Command::SkyOverlays { stage_dir, selection } => {
            let names: Vec<String> = serde_json::from_slice(&std::fs::read(selection).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            to_json(&super::visual::move_sky_overlays(&stage_dir, &names)?)
        },
        Command::VisualSourceGeometry { source } => to_json(&super::visual::source_geometry(&source)?),
        Command::SkyOverlayPass { source, stage_dir } => to_json(&super::visual::repair_sky_overlay_passes(&source,&stage_dir)?),
        Command::VisualTexture { texture } => to_json(&super::visual::texture(&texture)?),
        Command::VisualSource { source } => to_json(&super::visual::source(&source)?),
        Command::RepairSky { source, stage_dir } => to_json(&super::visual::repair_sky(&source,&stage_dir)?),
        Command::CloneVisual { stage_dir, output_root, name, hash, profile } => {
            parse_hash(&hash)?;
            to_json(&super::visual::clone_profile(&stage_dir,&output_root,&name,&hash,&profile)?)
        },
        Command::StageListJson { stage_list } => to_json(&stage_list::read_stage_list(&stage_list)?),
        Command::AuditRename { source, stage_dir } => to_json(&super::visual::audit_rename(&source, &stage_dir)?),
        Command::StageListRename { stage_list, names, output } => to_json(&stage_list::rename_stage_rows_to_file(&stage_list, &names, &output)?),
        Command::StageListOmit { stage_list, hashes, output } => {
            let listed: Vec<String> = serde_json::from_slice(
                &std::fs::read(&hashes).map_err(|error| error.to_string())?,
            )
            .map_err(|error| error.to_string())?;
            let drop_file_names = listed
                .iter()
                .map(|text| parse_hash(text))
                .collect::<Result<Vec<_>, _>>()?;
            to_json(&stage_list::omit_stage_rows_to_file(
                &stage_list,
                &drop_file_names,
                &output,
            )?)
        }
        Command::AuditStage { stage_dir } => to_json(&super::audit::stage(&stage_dir)?),
        Command::NormalizeStructure { stage_dir } => to_json(&crate::format::fhm2d_stage::rebuild_structure_json_for_stage_forced_with_shared_textures(&stage_dir.to_string_lossy())?),
        Command::AuditSource { source, stage_dir, report } => to_json(&super::audit::source(&source,&stage_dir,&report)?),
        Command::CollisionSource { source, report, output } => to_json(&super::audit::collision_source(&source,&report,&output)?),
        Command::RebuildCollision { geometry, output } => to_json(&super::audit::rebuild_collision(&geometry,&output)?),
        Command::AuditHkt { source, output } => to_json(&super::audit::hkt(&source,&output)?),
        Command::RepackList { structure_json, output } => {
            let text = std::fs::read_to_string(&structure_json).map_err(|error| error.to_string())?;
            let structure: serde_json::Value = serde_json::from_str(&text).map_err(|error| error.to_string())?;
            let files = structure["SubFileData"].as_array().ok_or("missing SubFileData")?;
            if files.len() != 1 || files[0]["fileType"].as_str() != Some(".bin") {
                return Err("a stage list structure must reference exactly one .bin".into());
            }
            let relative = files[0]["fileUrl"].as_str().ok_or("missing stage list fileUrl")?;
            let source = structure_json.parent().ok_or("missing structure parent")?
                .join(relative.replace('\\', "/"));
            if source.file_name().and_then(|name| name.to_str()) != Some("stage_list.bin") {
                return Err("the structure must reference stage_list.bin".into());
            }
            stage_list::read_stage_list(&source)?;
            to_json(&crate::format::fhm2d_pack::repack_fhm2d_from_structure(
                &structure_json.to_string_lossy(),
                &output.to_string_lossy(),
                true,
                None,
            )?)
        }
    }
}
