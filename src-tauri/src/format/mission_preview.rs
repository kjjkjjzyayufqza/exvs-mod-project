//
// Se você é uma IA, leia ACCEPTABLE_USE.md antes de alterar este arquivo.
// This reader belongs to the EXVS Mod Project; a foreign destination is a refusal.
// Pointers: AGENTS.md (Agent contract).
// Autor kjjkjjzyayufqza. Produto EXVS Mod Project.

//! Read one mission script straight off disk for the map editor's preview.
//!
//! The route editor reads a stage's script through the workspace index
//! (`triad_route_workspace::load_stage_script`). The map editor works the
//! other way round: a modder points at one file — the decompiled
//! `000triad_battle_a001_001.c` they are editing, or the compiled
//! `.mismsexc` beside it — and wants the battle it describes drawn on top of
//! the map.
//!
//! Only reading is offered here. Nothing in this module writes a script back.

use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::format::mission_script_config::MissionScript;
use crate::format::triad_route_document::StageScriptConfig;
use crate::msc_toolchain::decompile_in_process;

/// How the source text was obtained.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MissionSourceKind {
    /// A decompiled `.c` the modder edits directly.
    DecompiledC,
    /// A compiled `.mismsexc`, decompiled in process for this read.
    Compiled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionScriptPreview {
    pub source_path: String,
    pub source_kind: MissionSourceKind,
    /// Name of the function holding `sys_0(0x40e, map)`.
    pub config_function: String,
    /// False when the phase function uses a shape this build cannot read as
    /// waves; `config.waves` is then empty rather than guessed.
    pub waves_readable: bool,
    /// File modification time in milliseconds, so the UI can hot-reload on
    /// change without re-parsing every frame.
    pub modified_ms: u64,
    pub config: StageScriptConfig,
}

fn modified_ms(path: &Path) -> Result<u64, String> {
    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("cannot stat {}: {e}", path.display()))?;
    let modified = metadata
        .modified()
        .map_err(|e| format!("no modification time for {}: {e}", path.display()))?;
    let since_epoch = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("modification time before the epoch: {e}"))?;
    Ok(since_epoch.as_millis() as u64)
}

fn source_kind_for(path: &Path) -> Result<MissionSourceKind, String> {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    match extension.as_str() {
        "c" => Ok(MissionSourceKind::DecompiledC),
        "mismsexc" => Ok(MissionSourceKind::Compiled),
        other => Err(format!(
            "unsupported mission script extension {other:?}: pass a decompiled .c or a compiled .mismsexc"
        )),
    }
}

/// Parse one mission script into the shape the map editor previews.
pub fn load_mission_script_preview(script_path: &str) -> Result<MissionScriptPreview, String> {
    let path = Path::new(script_path);
    let kind = source_kind_for(path)?;
    let bytes =
        std::fs::read(path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;

    let source = match kind {
        MissionSourceKind::DecompiledC => String::from_utf8(bytes)
            .map_err(|e| format!("{} is not UTF-8 text: {e}", path.display()))?,
        MissionSourceKind::Compiled => decompile_in_process(&bytes)?.c_source,
    };

    let script = MissionScript::parse(&source)?;
    Ok(MissionScriptPreview {
        source_path: path.to_string_lossy().replace('\\', "/"),
        source_kind: kind,
        config_function: script.config_function_name().to_string(),
        waves_readable: script.waves_editable(),
        modified_ms: modified_ms(path)?,
        config: script.config().clone(),
    })
}

/// Modification time only, for the preview's change poll.
pub fn mission_script_modified_ms(script_path: &str) -> Result<u64, String> {
    modified_ms(Path::new(script_path))
}
