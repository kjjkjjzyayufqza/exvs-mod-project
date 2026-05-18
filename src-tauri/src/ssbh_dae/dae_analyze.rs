//! Structured preflight for COLLADA files before SSBH conversion.

use serde::Serialize;
use std::path::Path;

use super::dae_parse::{parse_dae_file, validate_dae_scene, DaeMesh, UpAxisConversion};
use super::import_scene::ImportScene;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaeMeshAnalysisRow {
    pub name: String,
    pub vertex_count: usize,
    pub index_count: usize,
    pub triangle_count: usize,
    pub normal_count: usize,
    pub uv_count: usize,
    pub normals_match_vertices: bool,
    pub uvs_match_vertices: bool,
    pub bone_influence_groups: usize,
    pub max_influences_per_vertex: usize,
    pub exceeds_four_influences: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaeAnalysisReport {
    pub dae_path: String,
    pub up_axis: String,
    pub mesh_rows: Vec<DaeMeshAnalysisRow>,
    pub bone_count: usize,
    pub bone_names: Vec<String>,
    pub geometry_names: Vec<String>,
    pub blocking_errors: Vec<String>,
    pub warnings: Vec<String>,
    pub can_convert: bool,
}

fn up_axis_label(u: UpAxisConversion) -> &'static str {
    match u {
        UpAxisConversion::YUp => "y_up",
        UpAxisConversion::ZUp => "z_up",
        UpAxisConversion::NoConversion => "none",
    }
}

fn max_influences_per_vertex(mesh: &DaeMesh) -> usize {
    let n = mesh.vertices.len();
    if n == 0 {
        return 0;
    }
    let mut counts = vec![0usize; n];
    for inf in &mesh.bone_influences {
        for vw in &inf.vertex_weights {
            let i = vw.vertex_index as usize;
            if i < n {
                counts[i] += 1;
            }
        }
    }
    counts.into_iter().max().unwrap_or(0)
}

fn analyze_mesh_row(mesh: &DaeMesh) -> DaeMeshAnalysisRow {
    let vc = mesh.vertices.len();
    let ic = mesh.indices.len();
    let tri = if ic % 3 == 0 { ic / 3 } else { 0 };
    let nc = mesh.normals.len();
    let uc = mesh.uvs.len();
    let normals_match = nc == 0 || nc == vc;
    let uvs_match = uc == 0 || uc == vc;
    let max_inf = max_influences_per_vertex(mesh);
    let groups = mesh.bone_influences.len();

    DaeMeshAnalysisRow {
        name: mesh.name.clone(),
        vertex_count: vc,
        index_count: ic,
        triangle_count: tri,
        normal_count: nc,
        uv_count: uc,
        normals_match_vertices: normals_match,
        uvs_match_vertices: uvs_match,
        bone_influence_groups: groups,
        max_influences_per_vertex: max_inf,
        exceeds_four_influences: max_inf > 4,
    }
}

/// Build the same analysis report used for DAE preflight, for any `ImportScene` (DAE, FBX, etc.).
pub fn analysis_report_for_import_scene(source_path: String, scene: &ImportScene) -> DaeAnalysisReport {
    eprintln!(
        "[dae_analyze] building report for '{}': {} meshes, {} bones",
        source_path, scene.meshes.len(), scene.bones.len()
    );
    let mut mesh_rows: Vec<DaeMeshAnalysisRow> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    for m in &scene.meshes {
        let row = analyze_mesh_row(m);
        if !m.vertices.is_empty() && m.indices.is_empty() {
            warnings.push(format!(
                "Mesh '{}': has vertices but no indices",
                m.name
            ));
        }
        if !m.vertices.is_empty() && !row.normals_match_vertices {
            warnings.push(format!(
                "Mesh '{}': normals count {} != vertex count {}",
                m.name, row.normal_count, row.vertex_count
            ));
        }
        if !m.vertices.is_empty() && !row.uvs_match_vertices {
            warnings.push(format!(
                "Mesh '{}': UV count {} != vertex count {}",
                m.name, row.uv_count, row.vertex_count
            ));
        }
        if row.exceeds_four_influences {
            warnings.push(format!(
                "Mesh '{}': max {} bone influences per vertex (>4); strict pipeline will reject",
                m.name, row.max_influences_per_vertex
            ));
        }
        if m.indices.len() % 3 != 0 && !m.indices.is_empty() {
            warnings.push(format!(
                "Mesh '{}': index count {} is not a multiple of 3",
                m.name,
                m.indices.len()
            ));
        }
        mesh_rows.push(row);
    }

    let bone_names: Vec<String> = scene.bones.iter().map(|b| b.name.clone()).collect();
    let geometry_names: Vec<String> = scene
        .meshes
        .iter()
        .filter(|m| !m.vertices.is_empty())
        .map(|m| m.name.clone())
        .collect();

    let mut blocking_errors: Vec<String> = Vec::new();
    if let Err(e) = validate_dae_scene(scene) {
        eprintln!("[dae_analyze] validation blocking error: {}", e);
        blocking_errors.push(e.to_string());
    }

    if !warnings.is_empty() {
        for w in &warnings {
            eprintln!("[dae_analyze] warning: {}", w);
        }
    }

    let can_convert = blocking_errors.is_empty();
    eprintln!(
        "[dae_analyze] report: {} mesh_rows, {} warnings, {} blocking_errors, can_convert={}",
        mesh_rows.len(), warnings.len(), blocking_errors.len(), can_convert
    );

    DaeAnalysisReport {
        dae_path: source_path,
        up_axis: up_axis_label(scene.up_axis).to_string(),
        mesh_rows,
        bone_count: scene.bones.len(),
        bone_names,
        geometry_names,
        blocking_errors,
        warnings,
        can_convert,
    }
}

/// Parse and summarize a DAE without writing SSBH files.
pub fn analyze_dae_path(path: &Path) -> Result<DaeAnalysisReport, String> {
    eprintln!("[dae_analyze] analyzing path: {}", path.display());
    let scene = parse_dae_file(path).map_err(|e| {
        eprintln!("[dae_analyze] parse_dae_file failed for '{}': {}", path.display(), e);
        e.to_string()
    })?;
    let report = analysis_report_for_import_scene(
        path.to_string_lossy().to_string(),
        &scene,
    );
    eprintln!(
        "[dae_analyze] analysis complete: can_convert={} meshes={} bones={}",
        report.can_convert, report.mesh_rows.len(), report.bone_count
    );
    Ok(report)
}
