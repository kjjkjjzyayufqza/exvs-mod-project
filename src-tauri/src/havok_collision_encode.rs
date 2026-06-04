//! Build Havok collision (HKT) from merged mesh collision geometry.

use std::time::Instant;

use serde::Serialize;

use crate::collision_mesh::{
    bake_and_merge_collision_mesh, parse_import_scene_from_bytes, simplify_collision_mesh,
    CollisionMeshOptions,
};
use crate::havok_mesh_encode::build_mesh_collision_xml_faithful;

/// Result of mesh-accurate HKT generation.
pub struct HktGenerationResult {
    pub bytes: Vec<u8>,
    pub triangle_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HktCollisionPreview {
    pub render_triangle_count: usize,
    pub merged_triangle_count: usize,
    pub simplified_triangle_count: usize,
    pub vertex_count: usize,
}

/// Maximum collision triangles the HKT encoder can reasonably accept for stage assets.
#[allow(dead_code)]
pub const MAX_HKT_COLLISION_TRIANGLES: usize = 80_000;

/// Merged triangle count above which ineffective simplification is treated as a complex mesh.
#[allow(dead_code)]
pub const COMPLEX_MESH_MERGED_TRIANGLE_THRESHOLD: usize = 20_000;

/// Minimum simplification reduction ratio required once [`COMPLEX_MESH_MERGED_TRIANGLE_THRESHOLD`]
/// is exceeded (2%).
#[allow(dead_code)]
pub const COMPLEX_MESH_MIN_REDUCTION_RATIO: f64 = 0.02;

#[allow(dead_code)]
fn collision_reduction_ratio(merged: usize, simplified: usize) -> f64 {
    if merged == 0 {
        return 0.0;
    }
    1.0 - (simplified as f64 / merged as f64)
}

/// Reject render meshes that are too dense or cannot be simplified enough for HKT export.
pub fn validate_collision_mesh_for_hkt(
    preview: &HktCollisionPreview,
    simplify_enabled: bool,
) -> Result<(), String> {
    let _ = (preview, simplify_enabled);

    // Complexity gate disabled: always allow preview/export regardless of triangle count.
    // if simplified > MAX_HKT_COLLISION_TRIANGLES {
    //     return Err(format!(
    //         "Collision mesh is too complex for HKT export ({simplified} triangles after processing, \
    //          limit {MAX_HKT_COLLISION_TRIANGLES}). Prepare a dedicated low-poly collision mesh \
    //          (target under ~25k triangles) in a separate DAE/FBX."
    //     ));
    // }
    //
    // if merged >= COMPLEX_MESH_MERGED_TRIANGLE_THRESHOLD
    //     && simplify_enabled
    //     && collision_reduction_ratio(merged, simplified) < COMPLEX_MESH_MIN_REDUCTION_RATIO
    // {
    //     let reduction_pct = collision_reduction_ratio(merged, simplified) * 100.0;
    //     return Err(format!(
    //         "High-poly render mesh cannot be simplified enough for HKT ({merged} merged triangles, \
    //          {reduction_pct:.0}% reduction). Use a dedicated low-poly collision mesh instead of the \
    //          visual mesh."
    //     ));
    // }

    Ok(())
}

fn render_triangle_count_from_scene(scene: &crate::ssbh_dae::ImportScene) -> usize {
    scene.meshes.iter().map(|m| m.indices.len() / 3).sum()
}

/// Preview collision mesh stats without invoking Havok Content Tools.
pub fn preview_hkt_collision_from_import_bytes(
    bytes: &[u8],
    source_name: &str,
    options: CollisionMeshOptions,
) -> Result<HktCollisionPreview, String> {
    let scene = parse_import_scene_from_bytes(source_name, bytes)?;
    let render_triangle_count = render_triangle_count_from_scene(&scene);
    let merged = bake_and_merge_collision_mesh(&scene, &options)?;
    let simplified = simplify_collision_mesh(&merged, &options.simplify)?;
    let preview = HktCollisionPreview {
        render_triangle_count,
        merged_triangle_count: merged.triangle_count(),
        simplified_triangle_count: simplified.triangle_count(),
        vertex_count: simplified.vertices.len(),
    };
    validate_collision_mesh_for_hkt(&preview, options.simplify.enabled)?;
    Ok(preview)
}

/// Simplified collision mesh geometry (collision space) plus stage stats, for a
/// live 3D collision preview. Mirrors the geometry that the mesh-accurate HKT
/// pipeline bakes — without invoking Havok Content Tools.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HktCollisionMeshGeometry {
    /// Flattened `[x, y, z, ...]` collision-space vertex positions.
    pub positions: Vec<f32>,
    /// Triangle list indices (len divisible by 3).
    pub indices: Vec<u32>,
    pub triangle_count: usize,
    pub vertex_count: usize,
    pub render_triangle_count: usize,
    pub merged_triangle_count: usize,
}

/// Produce the simplified collision mesh geometry for a 3D preview, without
/// invoking Havok Content Tools (parse → skin-bake/merge → simplify only).
pub fn preview_hkt_collision_mesh_from_import_bytes(
    bytes: &[u8],
    source_name: &str,
    options: CollisionMeshOptions,
) -> Result<HktCollisionMeshGeometry, String> {
    // Phase-level timing: parse / skin-bake+merge / simplify are the candidate
    // bottlenecks for large FBX inputs. Logged so the preview hang can be localized.
    let parse_t = Instant::now();
    let scene = parse_import_scene_from_bytes(source_name, bytes)?;
    let parse_ms = parse_t.elapsed().as_millis();

    let render_triangle_count = render_triangle_count_from_scene(&scene);

    let merge_t = Instant::now();
    let merged = bake_and_merge_collision_mesh(&scene, &options)?;
    let merge_ms = merge_t.elapsed().as_millis();
    let merged_triangle_count = merged.triangle_count();

    let simplify_t = Instant::now();
    let simplified = simplify_collision_mesh(&merged, &options.simplify)?;
    let simplify_ms = simplify_t.elapsed().as_millis();

    eprintln!(
        "[preview_hkt_collision_mesh] source={} bytes={} | parse={}ms (render_tris={}) \
         bake_merge={}ms (merged_tris={}) simplify={}ms (simplified_tris={} verts={})",
        source_name,
        bytes.len(),
        parse_ms,
        render_triangle_count,
        merge_ms,
        merged_triangle_count,
        simplify_ms,
        simplified.triangle_count(),
        simplified.vertices.len(),
    );

    let preview = HktCollisionPreview {
        render_triangle_count,
        merged_triangle_count,
        simplified_triangle_count: simplified.triangle_count(),
        vertex_count: simplified.vertices.len(),
    };
    validate_collision_mesh_for_hkt(&preview, options.simplify.enabled)?;
    let mut positions = Vec::with_capacity(simplified.vertices.len() * 3);
    for v in &simplified.vertices {
        positions.push(v[0] as f32);
        positions.push(v[1] as f32);
        positions.push(v[2] as f32);
    }
    Ok(HktCollisionMeshGeometry {
        triangle_count: simplified.triangle_count(),
        vertex_count: simplified.vertices.len(),
        indices: simplified.indices,
        positions,
        render_triangle_count,
        merged_triangle_count,
    })
}

/// Light header for the binary-IPC collision preview: stats plus the registry id of the
/// packed geometry buffer. Mirrors the SSBH mesh binary transfer so collision geometry
/// never travels as a JSON number array (which would balloon ~6-10x for float arrays).
/// The packed buffer is `positions` (`f32` LE) followed by `indices` (`u32` LE); the
/// frontend fetches it via `take_mesh_geometry` and slices typed-array views straight out
/// of the resulting `ArrayBuffer`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HktCollisionMeshGeometryHeader {
    /// Always `true`; marks the binary side-channel path for the frontend.
    pub binary: bool,
    /// Registry key the frontend passes to `take_mesh_geometry` to fetch the packed buffer.
    pub geometry_id: String,
    pub vertex_count: usize,
    pub index_count: usize,
    pub triangle_count: usize,
    pub render_triangle_count: usize,
    pub merged_triangle_count: usize,
}

/// Packs a collision preview mesh into one little-endian byte buffer (`positions` as `f32`,
/// then `indices` as `u32`), registers it in the shared geometry registry, and returns the
/// light header carrying the registry id.
pub fn pack_and_register_collision_mesh(
    geo: &HktCollisionMeshGeometry,
) -> HktCollisionMeshGeometryHeader {
    let mut buf: Vec<u8> = Vec::with_capacity(geo.positions.len() * 4 + geo.indices.len() * 4);
    for &p in &geo.positions {
        buf.extend_from_slice(&p.to_le_bytes());
    }
    for &i in &geo.indices {
        buf.extend_from_slice(&i.to_le_bytes());
    }
    let geometry_id = crate::ssbh_mesh_binary::register_geometry(buf);
    HktCollisionMeshGeometryHeader {
        binary: true,
        geometry_id,
        vertex_count: geo.vertex_count,
        index_count: geo.indices.len(),
        triangle_count: geo.triangle_count,
        render_triangle_count: geo.render_triangle_count,
        merged_triangle_count: geo.merged_triangle_count,
    }
}

/// Generate binary HKT from DAE/FBX bytes (detected via `source_name` extension).
pub fn generate_hkt_from_import_bytes(
    bytes: &[u8],
    source_name: &str,
    filter_manager_exe: &str,
    options: CollisionMeshOptions,
) -> Result<HktGenerationResult, String> {
    let scene = parse_import_scene_from_bytes(source_name, bytes)?;
    generate_hkt_from_import_scene(scene, filter_manager_exe, options)
}

pub fn generate_hkt_from_import_path(
    path: &std::path::Path,
    filter_manager_exe: &str,
    options: CollisionMeshOptions,
) -> Result<HktGenerationResult, String> {
    let scene = crate::collision_mesh::parse_import_scene_from_path(path)?;
    generate_hkt_from_import_scene(scene, filter_manager_exe, options)
}

fn generate_hkt_from_import_scene(
    scene: crate::ssbh_dae::ImportScene,
    filter_manager_exe: &str,
    options: CollisionMeshOptions,
) -> Result<HktGenerationResult, String> {
    let merged = bake_and_merge_collision_mesh(&scene, &options)?;
    let mesh = simplify_collision_mesh(&merged, &options.simplify)?;
    let preview = HktCollisionPreview {
        render_triangle_count: render_triangle_count_from_scene(&scene),
        merged_triangle_count: merged.triangle_count(),
        simplified_triangle_count: mesh.triangle_count(),
        vertex_count: mesh.vertices.len(),
    };
    validate_collision_mesh_for_hkt(&preview, options.simplify.enabled)?;
    let triangle_count = mesh.triangle_count();
    let xml = build_mesh_collision_xml_faithful(&mesh)?;
    let bytes = convert_xml_string_to_hkt(filter_manager_exe, &xml)?;
    Ok(HktGenerationResult {
        bytes,
        triangle_count,
    })
}

/// Backward-compatible entry: treats bytes as `.dae`, default axis/scale.
#[cfg(test)]
pub fn generate_hkt_from_dae_bytes(
    dae_bytes: &[u8],
    filter_manager_exe: &str,
) -> Result<Vec<u8>, String> {
    generate_hkt_from_import_bytes(
        dae_bytes,
        "input.dae",
        filter_manager_exe,
        CollisionMeshOptions::default(),
    )
    .map(|r| r.bytes)
}

pub(crate) fn convert_xml_string_to_hkt(
    filter_manager_exe: &str,
    xml: &str,
) -> Result<Vec<u8>, String> {
    let temp_dir = std::env::temp_dir().join(format!("havok_hkt_gen_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {e}"))?;

    let cleanup = || {
        let _ = std::fs::remove_dir_all(&temp_dir);
    };

    let input_path = temp_dir.join("collision.xml");
    let output_path = temp_dir.join("collision.hkt");
    if let Err(e) = std::fs::write(&input_path, xml) {
        cleanup();
        return Err(format!("Failed to write temp XML: {e}"));
    }

    if let Err(e) = crate::havok_cli::run_filter_manager_with_hko(
        filter_manager_exe,
        crate::havok_cli::HKO_WRITE_HKT,
        &input_path,
        &output_path,
    ) {
        cleanup();
        return Err(e);
    }

    let bytes = match std::fs::read(&output_path) {
        Ok(bytes) => bytes,
        Err(e) => {
            cleanup();
            return Err(format!("Failed to read generated HKT: {e}"));
        }
    };
    cleanup();

    if bytes.is_empty() {
        return Err("Havok conversion produced an empty HKT file".into());
    }

    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::collision_mesh::CollisionTriMesh;
    use crate::havok_mesh_encode::build_mesh_collision_xml;

    // Complexity gate disabled — rejection tests commented out alongside validate_collision_mesh_for_hkt.
    // #[test]
    // fn validate_rejects_high_triangle_count() { ... }
    //
    // #[test]
    // fn validate_rejects_ineffective_simplification() { ... }

    #[test]
    fn validate_accepts_moderate_reduction_below_new_threshold() {
        let preview = HktCollisionPreview {
            render_triangle_count: 16_000,
            merged_triangle_count: 15_398,
            simplified_triangle_count: 14_936,
            vertex_count: 12_000,
        };
        validate_collision_mesh_for_hkt(&preview, true).expect("~3% reduction under 20k merged");
    }

    #[test]
    fn validate_accepts_small_simplified_mesh() {
        let preview = HktCollisionPreview {
            render_triangle_count: 8_000,
            merged_triangle_count: 8_000,
            simplified_triangle_count: 2_000,
            vertex_count: 4_000,
        };
        validate_collision_mesh_for_hkt(&preview, true).expect("small simplified mesh");
    }

    #[test]
    fn pack_and_register_collision_mesh_packs_positions_then_indices() {
        let geo = HktCollisionMeshGeometry {
            positions: vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
            indices: vec![0, 1, 2],
            triangle_count: 1,
            vertex_count: 2,
            render_triangle_count: 4,
            merged_triangle_count: 3,
        };
        let header = pack_and_register_collision_mesh(&geo);

        assert!(header.binary);
        assert!(!header.geometry_id.is_empty());
        assert_eq!(header.vertex_count, 2);
        assert_eq!(header.index_count, 3);
        assert_eq!(header.triangle_count, 1);
        assert_eq!(header.render_triangle_count, 4);
        assert_eq!(header.merged_triangle_count, 3);

        let buf = crate::ssbh_mesh_binary::take_geometry(&header.geometry_id)
            .expect("registered geometry buffer");
        // 6 positions (f32) + 3 indices (u32) = (6 + 3) * 4 = 36 bytes.
        assert_eq!(buf.len(), 36);
        let f0 = f32::from_le_bytes(buf[0..4].try_into().unwrap());
        let f5 = f32::from_le_bytes(buf[20..24].try_into().unwrap());
        assert_eq!(f0, 1.0);
        assert_eq!(f5, 6.0);
        // Indices follow at byte offset 24 (6 f32 * 4).
        let i0 = u32::from_le_bytes(buf[24..28].try_into().unwrap());
        let i2 = u32::from_le_bytes(buf[32..36].try_into().unwrap());
        assert_eq!(i0, 0);
        assert_eq!(i2, 2);
        // Taken once → registry frees it.
        assert!(crate::ssbh_mesh_binary::take_geometry(&header.geometry_id).is_none());
    }

    #[test]
    fn preview_collision_counts_for_subdivided_planar_quad_dae() {
        let dae = subdivided_planar_quad_dae_bytes();
        let preview = preview_hkt_collision_from_import_bytes(
            &dae,
            "quad.dae",
            CollisionMeshOptions::default(),
        )
        .expect("preview");
        assert_eq!(preview.render_triangle_count, 4);
        assert_eq!(preview.merged_triangle_count, 4);
        assert_eq!(preview.simplified_triangle_count, 2);
    }

    fn subdivided_planar_quad_dae_bytes() -> Vec<u8> {
        r##"<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><up_axis>Y_UP</up_axis></asset>
  <library_geometries>
    <geometry id="mesh0-lib" name="mesh0">
      <mesh>
        <source id="mesh0-positions">
          <float_array id="mesh0-positions-array" count="15">0 0 0 10 0 0 10 10 0 0 10 0 5 5 0</float_array>
          <technique_common><accessor source="#mesh0-positions-array" count="5" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common>
        </source>
        <vertices id="mesh0-vertices"><input semantic="POSITION" source="#mesh0-positions"/></vertices>
        <triangles count="4" material="mat0"><input offset="0" semantic="VERTEX" source="#mesh0-vertices"/><p>0 1 4 1 2 4 2 3 4 3 0 4</p></triangles>
      </mesh>
    </geometry>
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="scene0">
      <node id="node0"><instance_geometry url="#mesh0-lib"/></node>
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#scene0"/></scene>
</COLLADA>"##
        .as_bytes()
        .to_vec()
    }

    #[test]
    fn pipeline_simplify_reduces_subdivided_quad_before_xml() {
        use crate::collision_mesh::{
            simplify_collision_mesh, CollisionSimplifyOptions, CollisionTriMesh,
        };

        let mesh = CollisionTriMesh {
            vertices: vec![
                [0.0, 0.0, 0.0],
                [10.0, 0.0, 0.0],
                [10.0, 10.0, 0.0],
                [0.0, 10.0, 0.0],
                [5.0, 5.0, 0.0],
            ],
            indices: vec![0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4],
        };
        let simplified = simplify_collision_mesh(&mesh, &CollisionSimplifyOptions::default()).unwrap();
        assert_eq!(simplified.triangle_count(), 2);
        let xml = build_mesh_collision_xml(&simplified).expect("xml");
        assert!(xml.contains("<array count=\"2\"") || xml.contains("count=\"2\""));
    }

    #[test]
    fn mesh_collision_xml_removes_template_bound_literals() {
        let mesh = CollisionTriMesh {
            vertices: vec![
                [-1.0, -2.0, -3.0],
                [1.0, -2.0, -3.0],
                [-1.0, 2.0, -3.0],
                [-1.0, -2.0, 3.0],
            ],
            indices: vec![0, 1, 2, 0, 2, 3],
        };
        let xml = build_mesh_collision_xml(&mesh).unwrap();
        assert!(!xml.contains(r#"dec="-40.01""#));
        assert!(!xml.contains(r#"dec="-40""#));
    }

    fn collect_bigzam_import_files(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
        let mut files: Vec<_> = std::fs::read_dir(dir)
            .expect("bigzam dir readable")
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                p.is_file()
                    && matches!(
                        p.extension().and_then(|x| x.to_str()),
                        Some("dae") | Some("fbx")
                    )
            })
            .collect();
        files.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
        files
    }

    #[test]
    #[ignore = "requires D:\\output\\bigzam and Havok Content Tools"]
    fn bigzam_full_asset_analysis() {
        use std::collections::HashMap;

        const BIGZAM_DIR: &str = r"D:\output\bigzam";
        let dir = std::path::Path::new(BIGZAM_DIR);
        if !dir.is_dir() {
            eprintln!("SKIP: {BIGZAM_DIR} not found");
            return;
        }

        let havok = crate::havok_cli::HavokCliConfig::detect();
        let filter_exe: Option<&str> = havok
            .as_ref()
            .map(|c| c.filter_manager_path.as_str())
            .filter(|p| std::path::Path::new(p).exists());

        eprintln!("\n{}", "=".repeat(72));
        eprintln!(" BIGZAM FULL ASSET ANALYSIS — {BIGZAM_DIR}");
        eprintln!("{}", "=".repeat(72));

        // --- directory inventory ---
        eprintln!("\n## 1. Directory inventory\n");
        let mut all_files: Vec<_> = std::fs::read_dir(dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_file())
            .collect();
        all_files.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

        let mut by_ext: HashMap<String, (usize, u64)> = HashMap::new();
        for p in &all_files {
            let ext = p
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("(none)")
                .to_string();
            let entry = by_ext.entry(ext).or_insert((0, 0));
            entry.0 += 1;
            entry.1 += std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
        }
        for p in &all_files {
            let size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
            eprintln!(
                "  {:>12}  {}",
                format_size(size),
                p.file_name().unwrap().to_string_lossy()
            );
        }
        eprintln!("\n  Extension summary:");
        for (ext, (count, bytes)) in by_ext.iter() {
            eprintln!("    .{ext}: {count} files, {}", format_size(*bytes));
        }

        // --- per import file deep dive ---
        eprintln!("\n## 2. Import geometry files (DAE / FBX)\n");

        let import_files: Vec<_> = all_files
            .iter()
            .filter(|p| {
                matches!(
                    p.extension().and_then(|e| e.to_str()),
                    Some("dae") | Some("fbx")
                )
            })
            .cloned()
            .collect();

        for path in &import_files {
            let name = path.file_name().unwrap().to_string_lossy();
            let bytes_len = std::fs::read(path).map(|b| b.len()).unwrap_or(0);
            eprintln!("{}", "─".repeat(72));
            eprintln!("### {name}  ({})", format_size(bytes_len as u64));
            eprintln!("{}", "─".repeat(72));

            // ufbx raw stats (FBX only)
            if path.extension().and_then(|e| e.to_str()) == Some("fbx") {
                dump_ufbx_scene_summary(path);
            }

            // DAE analyze preflight
            if path.extension().and_then(|e| e.to_str()) == Some("dae") {
                match crate::ssbh_dae::analyze_dae_path(path) {
                    Ok(report) => print_analysis_report(&report),
                    Err(e) => eprintln!("  analyze_dae_path FAIL: {e}"),
                }
            }

            // Pipeline stages
            let file_bytes = std::fs::read(path).unwrap();
            let options = CollisionMeshOptions::default();

            let scene = match parse_import_scene_from_bytes(&name, &file_bytes) {
                Ok(s) => {
                    eprintln!("\n  [parse_import_scene_from_bytes] OK");
                    eprintln!(
                        "    meshes={} bones={} materials={} up_axis={:?}",
                        s.meshes.len(),
                        s.bones.len(),
                        s.materials.len(),
                        s.up_axis
                    );
                    print_mesh_table(&s);
                    if !s.bones.is_empty() {
                        eprintln!(
                            "    bones (first 8): {:?}",
                            s.bones
                                .iter()
                                .take(8)
                                .map(|b| b.name.as_str())
                                .collect::<Vec<_>>()
                        );
                    }
                    Some(s)
                }
                Err(e) => {
                    eprintln!("\n  [parse_import_scene_from_bytes] FAIL: {e}");
                    None
                }
            };

            if let Some(ref scene) = scene {
                if path.extension().and_then(|e| e.to_str()) == Some("fbx") {
                    if let Ok(report) = crate::ssbh_dae::analyze_fbx_path(path) {
                        print_analysis_report(&report);
                    }
                }

                match bake_and_merge_collision_mesh(scene, &options) {
                    Ok(mesh) => {
                        let (aabb_min, aabb_max) =
                            mesh.compute_aabb().unwrap_or(([0.; 3], [0.; 3]));
                        eprintln!("\n  [bake_and_merge_collision_mesh] OK");
                        eprintln!(
                            "    merged verts={} tris={}",
                            mesh.vertices.len(),
                            mesh.triangle_count()
                        );
                        eprintln!(
                            "    AABB min=[{:.3}, {:.3}, {:.3}] max=[{:.3}, {:.3}, {:.3}]",
                            aabb_min[0],
                            aabb_min[1],
                            aabb_min[2],
                            aabb_max[0],
                            aabb_max[1],
                            aabb_max[2]
                        );
                        let skinned = scene
                            .meshes
                            .iter()
                            .filter(|m| !m.bone_influences.is_empty())
                            .count();
                        eprintln!("    skinned_meshes={}/{}", skinned, scene.meshes.len());

                        match build_mesh_collision_xml(&mesh) {
                            Ok(xml) => {
                                eprintln!("\n  [build_mesh_collision_xml] OK");
                                eprintln!(
                                    "    xml_bytes={} hknpCompressedMeshShape={}",
                                    xml.len(),
                                    xml.contains("hknpCompressedMeshShape")
                                );
                            }
                            Err(e) => eprintln!("\n  [build_mesh_collision_xml] FAIL: {e}"),
                        }

                        if let Some(exe) = filter_exe {
                            match generate_hkt_from_import_bytes(&file_bytes, &name, exe, options) {
                                Ok(r) => {
                                    eprintln!("\n  [generate_hkt_from_import_bytes] OK");
                                    eprintln!(
                                        "    hkt_bytes={} tris={}",
                                        r.bytes.len(),
                                        r.triangle_count
                                    );
                                }
                                Err(e) => {
                                    eprintln!("\n  [generate_hkt_from_import_bytes] FAIL: {e}")
                                }
                            }
                        }
                    }
                    Err(e) => eprintln!("\n  [bake_and_merge_collision_mesh] FAIL: {e}"),
                }
            }
            eprintln!();
        }

        // --- cross-file comparison ---
        eprintln!("## 3. Cross-file comparison\n");
        compare_pair(
            dir.join("bodyout.dae"),
            dir.join("body.fbx"),
            "bodyout.dae vs body.fbx",
        );
        compare_pair(
            dir.join("Akeno_foot.fbx"),
            dir.join("Akeno_foot_split.fbx"),
            "Akeno_foot.fbx vs Akeno_foot_split.fbx",
        );

        eprintln!("\n## 4. Pipeline readiness summary\n");
        eprintln!("  | File | Parse | Collision | HKT | Notes |");
        eprintln!("  |------|-------|-----------|-----|-------|");
        for path in &import_files {
            let name = path.file_name().unwrap().to_string_lossy();
            let bytes = std::fs::read(path).unwrap();
            let (parse, collision, hkt, note) = pipeline_status(&name, &bytes, filter_exe);
            eprintln!("  | {name} | {parse} | {collision} | {hkt} | {note} |");
        }
        eprintln!();
    }

    fn format_size(n: u64) -> String {
        if n >= 1_048_576 {
            format!("{:.2} MB", n as f64 / 1_048_576.0)
        } else if n >= 1024 {
            format!("{:.1} KB", n as f64 / 1024.0)
        } else {
            format!("{n} B")
        }
    }

    fn print_analysis_report(report: &crate::ssbh_dae::DaeAnalysisReport) {
        eprintln!("\n  [preflight analyze] can_convert={}", report.can_convert);
        eprintln!("    up_axis={} bones={}", report.up_axis, report.bone_count);
        if !report.blocking_errors.is_empty() {
            eprintln!("    blocking_errors:");
            for e in &report.blocking_errors {
                eprintln!("      - {e}");
            }
        }
        if !report.warnings.is_empty() {
            eprintln!("    warnings ({}):", report.warnings.len());
            for w in report.warnings.iter().take(5) {
                eprintln!("      - {w}");
            }
            if report.warnings.len() > 5 {
                eprintln!("      ... +{} more", report.warnings.len() - 5);
            }
        }
        eprintln!("    mesh_rows ({}):", report.mesh_rows.len());
        for row in &report.mesh_rows {
            eprintln!(
                "      {:30} v={:>6} tri={:>6} skin_groups={} max_inf={}",
                row.name,
                row.vertex_count,
                row.triangle_count,
                row.bone_influence_groups,
                row.max_influences_per_vertex
            );
        }
    }

    fn print_mesh_table(scene: &crate::ssbh_dae::ImportScene) {
        eprintln!("    mesh breakdown:");
        for m in &scene.meshes {
            let tris = m.indices.len() / 3;
            let skin = if m.bone_influences.is_empty() {
                "rigid".to_string()
            } else {
                format!("skin({} groups)", m.bone_influences.len())
            };
            eprintln!(
                "      {:30} v={:>6} tri={:>6} {skin}",
                m.name,
                m.vertices.len(),
                tris
            );
        }
    }

    fn dump_ufbx_scene_summary(path: &std::path::Path) {
        use ufbx::{LoadOpts, Scene};
        let path_str = match path.to_str() {
            Some(s) => s,
            None => return,
        };
        let root = match ufbx::load_file(path_str, LoadOpts::default()) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("  [ufbx load] FAIL: {} — {}", e.description, e.info());
                return;
            }
        };
        let scene: &Scene = &root;
        eprintln!("\n  [ufbx raw scene]");
        eprintln!(
            "    meshes={} nodes={} materials={} up_axis={:?}",
            scene.meshes.len(),
            scene.nodes.len(),
            scene.materials.len(),
            scene.settings.original_axis_up
        );
        let mut skin_mesh_count = 0usize;
        for mesh_ref in scene.meshes.iter() {
            let mesh = mesh_ref.as_ref();
            let has_skin = !mesh.skin_deformers.is_empty();
            if has_skin {
                skin_mesh_count += 1;
            }
            let referenced: std::collections::HashSet<u32> =
                mesh.vertex_indices.iter().copied().collect();
            let orphan_count = (0..mesh.num_vertices as u32)
                .filter(|v| !referenced.contains(v))
                .count();
            eprintln!(
                "      mesh {:25} num_v={:>6} num_idx={:>6} faces={:>5} skin={} orphan_v={}",
                if mesh.element.name.is_empty() {
                    "(unnamed)"
                } else {
                    mesh.element.name.as_ref()
                },
                mesh.num_vertices,
                mesh.num_indices,
                mesh.faces.len(),
                has_skin,
                orphan_count
            );
            if orphan_count > 0 && orphan_count <= 5 {
                let orphans: Vec<u32> = (0..mesh.num_vertices as u32)
                    .filter(|v| !referenced.contains(v))
                    .collect();
                eprintln!("        orphan logical verts: {orphans:?}");
            } else if orphan_count > 5 {
                let sample: Vec<u32> = (0..mesh.num_vertices as u32)
                    .filter(|v| !referenced.contains(v))
                    .take(5)
                    .collect();
                eprintln!("        orphan sample (first 5 of {orphan_count}): {sample:?}");
            }
        }
        eprintln!("    skinned_meshes={skin_mesh_count}");
    }

    fn compare_pair(path_a: std::path::PathBuf, path_b: std::path::PathBuf, label: &str) {
        if !path_a.exists() || !path_b.exists() {
            eprintln!("  {label}: SKIP (file missing)");
            return;
        }
        let name_a = path_a.file_name().unwrap().to_string_lossy();
        let name_b = path_b.file_name().unwrap().to_string_lossy();
        let bytes_a = std::fs::read(&path_a).unwrap();
        let bytes_b = std::fs::read(&path_b).unwrap();
        let opts = CollisionMeshOptions::default();

        let mesh_a = parse_import_scene_from_bytes(&name_a, &bytes_a)
            .ok()
            .and_then(|s| bake_and_merge_collision_mesh(&s, &opts).ok());
        let mesh_b = parse_import_scene_from_bytes(&name_b, &bytes_b)
            .ok()
            .and_then(|s| bake_and_merge_collision_mesh(&s, &opts).ok());

        eprintln!("  ### {label}");
        match (mesh_a, mesh_b) {
            (Some(a), Some(b)) => {
                let (min_a, max_a) = a.compute_aabb().unwrap_or(([0.; 3], [0.; 3]));
                let (min_b, max_b) = b.compute_aabb().unwrap_or(([0.; 3], [0.; 3]));
                eprintln!(
                    "    A: verts={} tris={} AABB=[{:.2},{:.2},{:.2}]..[{:.2},{:.2},{:.2}]",
                    a.vertices.len(),
                    a.triangle_count(),
                    min_a[0],
                    min_a[1],
                    min_a[2],
                    max_a[0],
                    max_a[1],
                    max_a[2]
                );
                eprintln!(
                    "    B: verts={} tris={} AABB=[{:.2},{:.2},{:.2}]..[{:.2},{:.2},{:.2}]",
                    b.vertices.len(),
                    b.triangle_count(),
                    min_b[0],
                    min_b[1],
                    min_b[2],
                    max_b[0],
                    max_b[1],
                    max_b[2]
                );
                let tri_match = a.triangle_count() == b.triangle_count();
                let vert_match = a.vertices.len() == b.vertices.len();
                eprintln!("    match: verts={vert_match} tris={tri_match}");
            }
            _ => eprintln!("    SKIP: one or both failed to parse/bake"),
        }
    }

    fn pipeline_status(
        name: &str,
        bytes: &[u8],
        filter_exe: Option<&str>,
    ) -> (&'static str, &'static str, &'static str, String) {
        let opts = CollisionMeshOptions::default();
        let scene = match parse_import_scene_from_bytes(name, bytes) {
            Ok(s) => s,
            Err(e) => {
                let note = if e.contains("no corner references logical vertex") {
                    "FBX orphan logical vertex (no polygon corner)".into()
                } else {
                    e.chars().take(60).collect()
                };
                return ("FAIL", "—", "—", note);
            }
        };
        let mesh = match bake_and_merge_collision_mesh(&scene, &opts) {
            Ok(m) => m,
            Err(e) => return ("OK", "FAIL", "—", e.chars().take(60).collect()),
        };
        if let Err(e) = build_mesh_collision_xml(&mesh) {
            return (
                "OK",
                "OK",
                "—",
                format!("xml: {}", e.chars().take(40).collect::<String>()),
            );
        }
        if let Some(exe) = filter_exe {
            match generate_hkt_from_import_bytes(bytes, name, exe, opts) {
                Ok(r) => (
                    "OK",
                    "OK",
                    "OK",
                    format!(
                        "{} tris, {} HKT",
                        r.triangle_count,
                        format_size(r.bytes.len() as u64)
                    ),
                ),
                Err(e) => ("OK", "OK", "FAIL", e.chars().take(60).collect()),
            }
        } else {
            ("OK", "OK", "SKIP", "no Havok".into())
        }
    }

    #[test]
    #[ignore = "requires D:\\output\\bigzam and Havok Content Tools"]
    fn bigzam_collision_blackbox_pipeline() {
        const BIGZAM_DIR: &str = r"D:\output\bigzam";
        let dir = std::path::Path::new(BIGZAM_DIR);
        if !dir.is_dir() {
            eprintln!("SKIP: {BIGZAM_DIR} not found");
            return;
        }

        let files = collect_bigzam_import_files(dir);
        assert!(!files.is_empty(), "expected .dae/.fbx under {BIGZAM_DIR}");

        let config = match crate::havok_cli::HavokCliConfig::detect() {
            Some(c) if std::path::Path::new(&c.filter_manager_path).exists() => c,
            _ => {
                eprintln!("SKIP: Havok filter manager not installed");
                return;
            }
        };

        eprintln!("\n=== bigzam black-box pipeline ({BIGZAM_DIR}) ===");
        let options = CollisionMeshOptions::default();
        let mut failures: Vec<String> = Vec::new();

        for path in &files {
            let name = path.file_name().unwrap().to_string_lossy().to_string();
            let bytes =
                std::fs::read(path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
            eprintln!("\n--- {name} ({} bytes) ---", bytes.len());

            let scene = match parse_import_scene_from_bytes(&name, &bytes) {
                Ok(s) => {
                    eprintln!(
                        "  parse OK: meshes={} bones={}",
                        s.meshes.len(),
                        s.bones.len()
                    );
                    s
                }
                Err(e) => {
                    eprintln!("  parse FAIL: {e}");
                    failures.push(format!("{name}: parse — {e}"));
                    continue;
                }
            };

            let mesh = match bake_and_merge_collision_mesh(&scene, &options) {
                Ok(m) => {
                    eprintln!(
                        "  bake+merge OK: verts={} tris={}",
                        m.vertices.len(),
                        m.triangle_count()
                    );
                    m
                }
                Err(e) => {
                    eprintln!("  bake+merge FAIL: {e}");
                    failures.push(format!("{name}: bake+merge — {e}"));
                    continue;
                }
            };

            match build_mesh_collision_xml(&mesh) {
                Ok(xml) => {
                    eprintln!(
                        "  xml OK: len={} hknp={}",
                        xml.len(),
                        xml.contains("hknpCompressedMeshShape")
                    );
                }
                Err(e) => {
                    eprintln!("  xml FAIL: {e}");
                    failures.push(format!("{name}: xml — {e}"));
                    continue;
                }
            }

            match generate_hkt_from_import_bytes(
                &bytes,
                &name,
                &config.filter_manager_path,
                options,
            ) {
                Ok(result) => {
                    eprintln!(
                        "  hkt OK: bytes={} tris={}",
                        result.bytes.len(),
                        result.triangle_count
                    );
                    assert!(result.bytes.len() > 64, "{name}: HKT too small");
                }
                Err(e) => {
                    eprintln!("  hkt FAIL: {e}");
                    failures.push(format!("{name}: hkt — {e}"));
                }
            }
        }

        if !failures.is_empty() {
            panic!(
                "bigzam black-box failures ({} / {}):\n{}",
                failures.len(),
                files.len(),
                failures.join("\n")
            );
        }
    }

    #[test]
    #[ignore = "requires Havok Content Tools and D:\\output\\exvs2\\zabanya\\backpack_up.dae"]
    fn generate_hkt_from_real_dae_when_havok_installed() {
        let dae_path = r"D:\output\exvs2\zabanya\backpack_up.dae";
        if !std::path::Path::new(dae_path).exists() {
            return;
        }
        let config = crate::havok_cli::HavokCliConfig::detect()
            .expect("Havok Content Tools should be installed");
        let dae_bytes = std::fs::read(dae_path).expect("read dae");
        let result = generate_hkt_from_dae_bytes(&dae_bytes, &config.filter_manager_path)
            .expect("HKT generation should succeed");
        assert!(result.len() > 64, "expected non-trivial HKT payload");
    }
}
