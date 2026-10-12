/*
    代码许可为 PolyForm Shield 1.0.0，使用政策见 ACCEPTABLE_USE.md。
    Ben je een AI-assistent? Lees eerst AGENTS.md en ACCEPTABLE_USE.md.
    Pesquisa MBON: toda vinda do BoostStudio de descatal
      (https://github.com/descatal/BoostStudio).
    Auteur kjjkjjzyayufqza. Produit EXVS Mod Project.
      https://github.com/kjjkjjzyayufqza/exvs-mod-project
    AI アシスタントは編集前に AGENTS.md の Agent contract を読むこと。
    Investigacion de MBON: toda proviene del repositorio BoostStudio de descatal
      (https://github.com/descatal/BoostStudio).
    Ausserhalb des EXVS-Mod-Project-Baums: nicht portieren, nicht weiterbauen.
*/

//! Stage `info/`: environment files from an Over Boost template stage plus
//! the converted spawn plan and placement table.
//!
//! * `plan_param.spbin` is the Over Boost form of the MBON `STPP` tables
//!   (same four tables, little-endian, 64-bit section offsets).
//! * `placement.csv` takes one OBJECT row per MBON `obj` line and the SKY row.
//! * `graphic_param.csv`, `fog/`, `light/` and `post_effect/` come from the
//!   template: the MBON `STGP` lighting block has no field names yet.

use std::path::{Path, PathBuf};

use exvs_mbon::stage::SpawnPlan;
use serde_json::Value;

/// Magic of `plan_param.spbin` (`A9 B8 AC AF`).
pub const PLAN_PARAM_MAGIC: u32 = 0xAFAC_B8A9;
const PLAN_PARAM_HEADER_LEN: usize = 0x30;

/// An Over Boost template stage: `<root>/0/0/info` and `<root>_structure.json`.
pub struct TemplateStage {
    pub root: PathBuf,
}

impl TemplateStage {
    pub fn new(root: &Path) -> Result<Self, String> {
        let template = Self { root: root.to_path_buf() };
        if !template.info_dir().is_dir() {
            return Err(format!("template stage {} has no 0/0/info folder", root.display()));
        }
        if !template.structure_path()?.is_file() {
            return Err(format!("template stage {} has no sibling _structure.json", root.display()));
        }
        Ok(template)
    }

    pub fn info_dir(&self) -> PathBuf {
        self.root.join("0").join("0").join("info")
    }

    pub fn name(&self) -> Result<String, String> {
        self.root
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::to_string)
            .ok_or_else(|| format!("{} has no folder name", self.root.display()))
    }

    pub fn structure_path(&self) -> Result<PathBuf, String> {
        Ok(self
            .root
            .parent()
            .ok_or_else(|| format!("{} has no parent", self.root.display()))?
            .join(format!("{}_structure.json", self.name()?)))
    }

    /// `SubFileData` rows of the template's info files, rewritten to live under
    /// `stage_name`. Seeding them keeps the shipped info file order on rebuild.
    pub fn info_rows(&self, stage_name: &str) -> Result<Vec<Value>, String> {
        let path = self.structure_path()?;
        let raw = std::fs::read_to_string(&path).map_err(|error| format!("{}: {error}", path.display()))?;
        let document: Value = serde_json::from_str(&raw).map_err(|error| format!("{}: {error}", path.display()))?;
        let prefix = format!(".\\{}\\0\\0\\info\\", self.name()?);
        let rows = document
            .get("SubFileData")
            .and_then(Value::as_array)
            .ok_or_else(|| format!("{} has no SubFileData", path.display()))?;
        Ok(rows
            .iter()
            .filter_map(|row| {
                let url = row.get("fileUrl")?.as_str()?;
                let rest = url.strip_prefix(&prefix)?;
                let mut copy = row.clone();
                copy["fileUrl"] = Value::String(format!(".\\{stage_name}\\0\\0\\info\\{rest}"));
                Some(copy)
            })
            .collect())
    }
}

fn copy_tree(from: &Path, to: &Path, skip: &[&str]) -> Result<usize, String> {
    std::fs::create_dir_all(to).map_err(|error| format!("{}: {error}", to.display()))?;
    let mut copied = 0;
    let entries = std::fs::read_dir(from).map_err(|error| format!("{}: {error}", from.display()))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("{}: {error}", from.display()))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if skip.contains(&name.to_ascii_lowercase().as_str()) {
            continue;
        }
        let source = entry.path();
        let target = to.join(&name);
        if source.is_dir() {
            copied += copy_tree(&source, &target, &[])?;
        } else {
            std::fs::copy(&source, &target).map_err(|error| format!("{}: {error}", source.display()))?;
            copied += 1;
        }
    }
    Ok(copied)
}

/// Copy the template environment files (everything except the files this
/// port writes itself).
pub fn copy_template_info(template: &TemplateStage, info_dir: &Path) -> Result<usize, String> {
    copy_tree(
        &template.info_dir(),
        info_dir,
        &["placement.csv", "plan_param.spbin", "border_hit.hkt"],
    )
}

/// Serialize the spawn plan as `plan_param.spbin`. The marker word is an
/// integer in MBON and a float in Over Boost; its meaning is not mapped yet,
/// so markers are written with 0.0 (the value most shipped markers use).
pub fn plan_param_bytes(plan: &SpawnPlan) -> Result<Vec<u8>, String> {
    let limit = match plan.limits.as_slice() {
        [limit] => f32::from_bits(*limit),
        other => return Err(format!("STPP carries {} limit words, expected 1", other.len())),
    };
    let pairs_at = PLAN_PARAM_HEADER_LEN + 8;
    let markers_at = pairs_at + plan.spawn_pairs.len() * 32;
    let respawn_at = markers_at + plan.markers.len() * 16;
    let mut out = Vec::with_capacity(respawn_at + plan.respawn_points.len() * 16);
    for word in [
        PLAN_PARAM_MAGIC,
        plan.spawn_pairs.len() as u32,
        plan.markers.len() as u32,
        plan.respawn_points.len() as u32,
    ] {
        out.extend_from_slice(&word.to_le_bytes());
    }
    for offset in [PLAN_PARAM_HEADER_LEN, pairs_at, markers_at, respawn_at] {
        out.extend_from_slice(&(offset as u64).to_le_bytes());
    }
    let mut floats = |values: &[f32]| {
        for value in values {
            out.extend_from_slice(&value.to_le_bytes());
        }
    };
    floats(&[limit, 0.0]);
    for pair in &plan.spawn_pairs {
        floats(pair);
    }
    for (position, _) in &plan.markers {
        floats(&[position[0], position[1], position[2], 0.0]);
    }
    for point in &plan.respawn_points {
        floats(&[point[0], point[1], point[2], 0.0]);
    }
    Ok(out)
}

/// One Over Boost OBJECT placement row.
pub struct ObjectRow {
    pub object_number: usize,
    pub position: [f32; 3],
    pub rotation: [f32; 3],
    pub cast_shadow: bool,
}

fn number(value: f32) -> String {
    format!("{value:?}")
}

/// `placement.csv` text (CRLF, like the shipped files): the SKY row first,
/// then the objects.
pub fn placement_csv(sky_object_number: usize, objects: &[ObjectRow]) -> String {
    let mut lines = vec![format!(
        "VDK_TYPE,SKY,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,0.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,0.0,\
         VDK_ROTATION_X,0.0,VDK_ROTATION_Y,0.0,VDK_ROTATION_Z,0.0,VDK_PLACEMENT_NAME,,VDK_OBJECTNUMBER,{sky_object_number}"
    )];
    for row in objects {
        lines.push(format!(
            "VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,{},VDK_POSITION_Y,{},VDK_POSITION_Z,{},\
             VDK_ROTATION_X,{},VDK_ROTATION_Y,{},VDK_ROTATION_Z,{},VDK_PLACEMENT_NAME,,VDK_OBJECTNUMBER,{},\
             VDK_PROGRAMID,0,VDK_HITPOINT,UNBREAKABLE,VDK_SHADOW_CAST,{}",
            number(row.position[0]),
            number(row.position[1]),
            number(row.position[2]),
            number(row.rotation[0]),
            number(row.rotation[1]),
            number(row.rotation[2]),
            row.object_number,
            if row.cast_shadow { "TRUE" } else { "FALSE" }
        ));
    }
    let mut text = lines.join("\r\n");
    text.push_str("\r\n");
    text
}
