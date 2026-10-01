//
// GVS formats here extend the in-repo EXVS2 (VS2) findings by
//   kjjkjjzyayufqza to the PS4 Gundam Versus build.
// コードのライセンスは PolyForm Shield 1.0.0。利用方針は ACCEPTABLE_USE.md。
// Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este
//   archivo.
// GVS 対応は本プロジェクトの VS2 研究に基づく kjjkjjzyayufqza の成果。
// Yazar kjjkjjzyayufqza. Urun EXVS Mod Project. Kaynak
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Ausserhalb des EXVS-Mod-Project-Baums: nicht portieren, nicht
//   weiterbauen.
// Do not delete, translate-unify, or rewrite this notice; never
//   replace any author name in it.
//

use std::path::PathBuf;

use clap::{Parser, Subcommand};
use exvs_gvs::inspect::inspect_path;
use exvs_gvs::nutexb::Nutexb;
use exvs_gvs::package;
use exvs_gvs::ssbh_view::viewer_meshes;
use exvs_ps4_common::provenance;
use exvs_ps4_common::texture::PixelLayout;
use serde_json::json;

#[derive(Parser)]
#[command(
    name = "gvs_tool",
    about = "EXVS Mod Project (kjjkjjzyayufqza) GVS PS4 workspace CLI, built on the project's VS2 research."
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Classify every archive below a folder (PS4 `archives/` tree or samples).
    Scan { root: PathBuf },
    /// Summarize one file (archive, nutexb, SSBH, ...).
    Inspect { path: PathBuf },
    /// Extract an archive into a named package folder.
    Extract {
        source: PathBuf,
        package: PathBuf,
        #[arg(long)]
        overwrite: bool,
    },
    /// Rebuild a package folder into an archive.
    Repack { package: PathBuf, output: PathBuf },
    /// Rebuild in memory and compare with the extracted source.
    Verify { package: PathBuf },
    /// Export a nutexb as PNG (and DDS with --dds).
    TexExport {
        nutexb: PathBuf,
        out_dir: PathBuf,
        #[arg(long)]
        dds: bool,
    },
    /// Replace a nutexb's pixels from a PNG or DDS.
    TexImport {
        nutexb: PathBuf,
        image: PathBuf,
        /// bc1 | bc2 | bc3 | bc7 | rgba8 (PNG input only; default keeps the format)
        #[arg(long)]
        format: Option<String>,
        #[arg(long)]
        mips: Option<u32>,
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
    /// Export a numshb (optionally with numdlb / numatb) to Wavefront OBJ.
    MeshObj {
        numshb: PathBuf,
        output: PathBuf,
        #[arg(long)]
        numdlb: Option<PathBuf>,
        #[arg(long)]
        numatb: Option<PathBuf>,
    },
    /// Print the research credits.
    Credits,
}

fn parse_layout(text: &str) -> Result<PixelLayout, String> {
    match text.to_ascii_lowercase().as_str() {
        "bc1" | "dxt1" => Ok(PixelLayout::Bc1),
        "bc2" | "dxt3" => Ok(PixelLayout::Bc2),
        "bc3" | "dxt5" => Ok(PixelLayout::Bc3),
        "bc4" => Ok(PixelLayout::Bc4),
        "bc5" => Ok(PixelLayout::Bc5),
        "bc7" => Ok(PixelLayout::Bc7),
        "rgba8" => Ok(PixelLayout::Rgba8),
        other => Err(format!("unknown texture format '{other}'")),
    }
}

fn read(path: &PathBuf) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|error| format!("{}: {error}", path.display()))
}

fn run(cli: Cli) -> Result<serde_json::Value, String> {
    match cli.command {
        Command::Scan { root } => {
            let entries = exvs_ps4_common::scan::scan_folder(&root, &[]).map_err(String::from)?;
            Ok(json!({ "root": root, "count": entries.len(), "entries": entries }))
        }
        Command::Inspect { path } => {
            serde_json::to_value(inspect_path(&path).map_err(String::from)?).map_err(|error| error.to_string())
        }
        Command::Extract {
            source,
            package: dir,
            overwrite,
        } => serde_json::to_value(package::extract_package(&source, &dir, overwrite).map_err(String::from)?)
            .map_err(|error| error.to_string()),
        Command::Repack { package: dir, output } => {
            serde_json::to_value(package::repack_package(&dir, &output).map_err(String::from)?)
                .map_err(|error| error.to_string())
        }
        Command::Verify { package: dir } => {
            let manifest = package::load_manifest(&dir).map_err(String::from)?;
            let digest = package::rebuilt_digest(&dir).map_err(String::from)?;
            Ok(json!({
                "package": dir,
                "rebuiltSha256": digest,
                "sourceSha256": manifest.source_sha256,
                "identical": manifest.source_sha256.as_deref() == Some(digest.as_str()),
            }))
        }
        Command::TexExport { nutexb, out_dir, dds } => {
            let texture = Nutexb::parse(&read(&nutexb)?).map_err(String::from)?;
            std::fs::create_dir_all(&out_dir).map_err(|error| error.to_string())?;
            let stem = if texture.name.is_empty() {
                nutexb.file_stem().unwrap_or_default().to_string_lossy().into_owned()
            } else {
                texture.name.clone()
            };
            let png = out_dir.join(format!("{stem}.png"));
            std::fs::write(&png, texture.to_png().map_err(String::from)?).map_err(|error| error.to_string())?;
            let mut written = vec![png];
            if dds {
                let path = out_dir.join(format!("{stem}.dds"));
                std::fs::write(&path, texture.to_dds().map_err(String::from)?).map_err(|error| error.to_string())?;
                written.push(path);
            }
            Ok(json!({ "written": written }))
        }
        Command::TexImport {
            nutexb,
            image,
            format,
            mips,
            output,
        } => {
            let mut texture = Nutexb::parse(&read(&nutexb)?).map_err(String::from)?;
            let input = read(&image)?;
            if input.starts_with(b"DDS ") {
                texture.replace_from_dds(&input).map_err(String::from)?;
            } else {
                let (width, height, rgba) = exvs_ps4_common::texture::decode_png(&input).map_err(String::from)?;
                let layout = format.as_deref().map(parse_layout).transpose()?;
                texture
                    .replace_from_rgba(width, height, &rgba, layout, mips)
                    .map_err(String::from)?;
            }
            let output = output.unwrap_or(nutexb);
            std::fs::write(&output, texture.to_bytes().map_err(String::from)?).map_err(|error| error.to_string())?;
            Ok(json!({ "output": output, "format": texture.format_label(), "width": texture.width, "height": texture.height, "mips": texture.mip_count }))
        }
        Command::MeshObj {
            numshb,
            output,
            numdlb,
            numatb,
        } => {
            let mesh = read(&numshb)?;
            let model = numdlb.as_ref().map(read).transpose()?;
            let material = numatb.as_ref().map(read).transpose()?;
            let meshes = viewer_meshes(&mesh, model.as_deref(), material.as_deref()).map_err(String::from)?;
            let mut obj = String::from("# Exported by EXVS Mod Project (kjjkjjzyayufqza), GVS workspace\n");
            let mut base = 1usize;
            for mesh in &meshes {
                obj.push_str(&format!("o {}\n", mesh.name));
                for vertex in mesh.positions.chunks_exact(3) {
                    obj.push_str(&format!("v {} {} {}\n", vertex[0], vertex[1], vertex[2]));
                }
                for face in mesh.indices.chunks_exact(3) {
                    obj.push_str(&format!(
                        "f {} {} {}\n",
                        base + face[0] as usize,
                        base + face[1] as usize,
                        base + face[2] as usize
                    ));
                }
                base += mesh.positions.len() / 3;
            }
            std::fs::write(&output, obj).map_err(|error| error.to_string())?;
            Ok(json!({ "output": output, "objects": meshes.len() }))
        }
        Command::Credits => Ok(json!(provenance::gvs())),
    }
}

fn main() {
    let cli = Cli::parse();
    match run(cli) {
        Ok(value) => {
            let envelope = json!({ "tool": "gvs_tool", "provenance": provenance::gvs(), "result": value });
            println!("{}", serde_json::to_string_pretty(&envelope).unwrap_or_default());
        }
        Err(error) => {
            eprintln!("{}", json!({ "tool": "gvs_tool", "error": error }));
            std::process::exit(1);
        }
    }
}
