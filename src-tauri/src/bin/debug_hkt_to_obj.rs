//! Debug tool: extract collision mesh from DAE/FBX files and write OBJ for inspection.
//!
//! Usage:
//!   cargo run --bin debug_hkt_to_obj -- [<path-to-dae-or-fbx> ...]
//!
//! If no arguments are given, processes all .dae and .fbx files under D:\output\bigzam.
//!
//! For each input file the tool:
//!  1. Parses the scene (DAE or FBX)
//!  2. Bakes skin + applies axis/scale conversion
//!  3. Writes the **merged** collision mesh to <stem>_collision_merged.obj
//!  4. Runs simplification and writes <stem>_collision_simplified.obj
//!  5. Encodes into Havok section format, then decodes the packed vertices
//!     and writes <stem>_collision_packed_roundtrip.obj to check encoding fidelity
//!  6. Prints per-file stats (vertex count, triangle count, AABB, encoding errors)

use std::io::Write;
use std::path::{Path, PathBuf};

// Re-use the project library.
use app_lib::collision_mesh::{
    bake_and_merge_collision_mesh, parse_import_scene_from_bytes, simplify_collision_mesh,
    CollisionMeshOptions, CollisionSimplifyOptions, CollisionTriMesh,
};
use app_lib::havok_mesh_encode::build_mesh_collision_xml;

const DEFAULT_DIR: &str = r"D:\output\bigzam";

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();

    let files: Vec<PathBuf> = if args.is_empty() {
        eprintln!("No arguments — scanning {DEFAULT_DIR} for .dae / .fbx files...\n");
        collect_import_files(Path::new(DEFAULT_DIR))
    } else {
        args.iter().map(PathBuf::from).collect()
    };

    if files.is_empty() {
        eprintln!("No import files found.");
        std::process::exit(1);
    }

    let mut any_error = false;

    for path in &files {
        eprintln!("{}", "=".repeat(72));
        eprintln!("  FILE: {}", path.display());
        eprintln!("{}", "=".repeat(72));

        if let Err(e) = process_file(path) {
            eprintln!("  ERROR: {e}\n");
            any_error = true;
        }
    }

    if any_error {
        std::process::exit(1);
    }
}

fn collect_import_files(dir: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .unwrap_or_else(|e| {
            eprintln!("Cannot read directory {}: {e}", dir.display());
            std::process::exit(1);
        })
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

fn process_file(path: &Path) -> Result<(), String> {
    let name = path
        .file_name()
        .ok_or("Invalid file path")?
        .to_string_lossy()
        .to_string();
    let stem = path
        .file_stem()
        .ok_or("Invalid file stem")?
        .to_string_lossy()
        .to_string();
    let out_dir = path.parent().unwrap_or(Path::new("."));

    let bytes = std::fs::read(path).map_err(|e| format!("Read failed: {e}"))?;
    eprintln!("  File size: {} bytes", bytes.len());

    // --- 1. Parse scene ---
    let scene = parse_import_scene_from_bytes(&name, &bytes)?;
    eprintln!(
        "  Scene: meshes={} bones={} materials={} up_axis={:?}",
        scene.meshes.len(),
        scene.bones.len(),
        scene.materials.len(),
        scene.up_axis
    );
    for m in &scene.meshes {
        let tris = m.indices.len() / 3;
        let skin_status = if m.bone_influences.is_empty() {
            "rigid".to_string()
        } else {
            format!("skinned({} groups)", m.bone_influences.len())
        };
        eprintln!(
            "    mesh '{}': verts={} tris={} {}",
            m.name,
            m.vertices.len(),
            tris,
            skin_status
        );
    }

    // --- 2. Bake + merge (no simplification) ---
    let options = CollisionMeshOptions::default();
    let merged = bake_and_merge_collision_mesh(&scene, &options)?;
    print_mesh_stats("Merged collision mesh", &merged);

    let merged_obj = out_dir.join(format!("{stem}_collision_merged.obj"));
    write_obj(&merged_obj, &merged)?;
    eprintln!("  Written: {}", merged_obj.display());

    // --- 3. Simplify ---
    let simplified = simplify_collision_mesh(&merged, &options.simplify)?;
    print_mesh_stats("Simplified collision mesh", &simplified);

    let simplified_obj = out_dir.join(format!("{stem}_collision_simplified.obj"));
    write_obj(&simplified_obj, &simplified)?;
    eprintln!("  Written: {}", simplified_obj.display());

    // --- 4. Packed vertex round-trip check ---
    match build_mesh_collision_xml(&simplified) {
        Ok(xml) => {
            eprintln!(
                "  Havok XML: {} bytes, contains hknpCompressedMeshShape={}",
                xml.len(),
                xml.contains("hknpCompressedMeshShape")
            );

            match decode_packed_mesh_from_xml(&xml) {
                Ok(decoded) => {
                    print_mesh_stats("Decoded packed round-trip mesh", &decoded);

                    let roundtrip_obj =
                        out_dir.join(format!("{stem}_collision_packed_roundtrip.obj"));
                    write_obj(&roundtrip_obj, &decoded)?;
                    eprintln!("  Written: {}", roundtrip_obj.display());

                    // Report max positional error
                    report_encoding_error(&simplified, &decoded);
                }
                Err(e) => {
                    eprintln!("  Packed decode failed: {e}");
                }
            }
        }
        Err(e) => {
            eprintln!("  XML build failed: {e}");
        }
    }

    // --- 5. Write raw (unskinned, unscaled) source vertices for comparison ---
    let raw = raw_source_mesh(&scene);
    if let Some(ref raw_mesh) = raw {
        let raw_obj = out_dir.join(format!("{stem}_raw_source.obj"));
        write_obj(&raw_obj, raw_mesh)?;
        eprintln!("  Written (raw source verts): {}", raw_obj.display());
    }

    eprintln!();
    Ok(())
}

fn print_mesh_stats(label: &str, mesh: &CollisionTriMesh) {
    let (min, max) = mesh.compute_aabb().unwrap_or(([0.0; 3], [0.0; 3]));
    let span = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    eprintln!(
        "  [{label}] verts={} tris={} AABB min=[{:.4}, {:.4}, {:.4}] max=[{:.4}, {:.4}, {:.4}] span=[{:.4}, {:.4}, {:.4}]",
        mesh.vertices.len(),
        mesh.triangle_count(),
        min[0], min[1], min[2],
        max[0], max[1], max[2],
        span[0], span[1], span[2],
    );
}

fn write_obj(path: &Path, mesh: &CollisionTriMesh) -> Result<(), String> {
    let mut f = std::fs::File::create(path)
        .map_err(|e| format!("Cannot create {}: {e}", path.display()))?;

    writeln!(
        f,
        "# debug_hkt_to_obj — {} vertices, {} triangles",
        mesh.vertices.len(),
        mesh.triangle_count()
    )
    .map_err(|e| format!("Write error: {e}"))?;

    for v in &mesh.vertices {
        writeln!(f, "v {:.8} {:.8} {:.8}", v[0], v[1], v[2])
            .map_err(|e| format!("Write error: {e}"))?;
    }

    for tri in mesh.indices.chunks(3) {
        if tri.len() == 3 {
            // OBJ faces are 1-indexed
            writeln!(f, "f {} {} {}", tri[0] + 1, tri[1] + 1, tri[2] + 1)
                .map_err(|e| format!("Write error: {e}"))?;
        }
    }

    Ok(())
}

/// Build a raw source mesh (no skin bake, no axis/scale) for comparison.
fn raw_source_mesh(scene: &app_lib::ssbh_dae::ImportScene) -> Option<CollisionTriMesh> {
    let mut vertices: Vec<[f64; 3]> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    for mesh in &scene.meshes {
        if mesh.vertices.is_empty() || mesh.indices.is_empty() {
            continue;
        }
        let base = vertices.len() as u32;
        for v in &mesh.vertices {
            vertices.push([v[0] as f64, v[1] as f64, v[2] as f64]);
        }
        for &idx in &mesh.indices {
            indices.push(base + idx);
        }
    }

    if vertices.is_empty() {
        return None;
    }

    Some(CollisionTriMesh { vertices, indices })
}

// ---------------------------------------------------------------------------
// Decode packed vertices from the generated Havok XML to verify encoding.
// ---------------------------------------------------------------------------

/// Parse the generated XML to extract the packed collision mesh.
/// This reverses the encoding in `havok_mesh_encode.rs`.
fn decode_packed_mesh_from_xml(xml: &str) -> Result<CollisionTriMesh, String> {
    // We parse a simplified subset: look for section codecParms, packedVertices, and primitives.
    // The XML is hand-built text, so we can use string scanning.

    let mut all_vertices: Vec<[f64; 3]> = Vec::new();
    let mut all_indices: Vec<u32> = Vec::new();

    // Extract sections by finding <field name="sections"> ... </field>
    let sections_start = xml
        .find(r#"<field name="sections">"#)
        .ok_or("No sections field in XML")?;
    let sections_body = &xml[sections_start..];

    // Extract top-level packedVertices integers
    let packed_ints = extract_integer_array(xml, "packedVertices")?;
    eprintln!("  Packed vertices count: {}", packed_ints.len());

    // Extract top-level primitives
    let all_prims = extract_primitive_records(xml)?;
    eprintln!("  Primitive records count: {}", all_prims.len());

    // Extract per-section codec parameters
    let section_codecs = extract_section_codecs(sections_body)?;
    eprintln!("  Sections: {}", section_codecs.len());

    // For each section, decode its packed vertices and reconstruct triangles
    for (sec_idx, sec) in section_codecs.iter().enumerate() {
        let first_pv = sec.first_packed_vertex_index as usize;
        let num_pv = sec.num_packed_vertices as usize;
        let first_prim = sec.first_primitive_index as usize;
        let num_prims = sec.num_primitives as usize;

        let vert_base = all_vertices.len() as u32;

        // Decode packed vertices
        for i in first_pv..first_pv + num_pv {
            if i >= packed_ints.len() {
                return Err(format!(
                    "Section {sec_idx}: packed vertex index {i} out of range ({})",
                    packed_ints.len()
                ));
            }
            let packed = packed_ints[i] as u32;
            let v = decode_packed_vertex(packed, &sec.codec_parms);
            all_vertices.push(v);
        }

        // Decode primitives (triangles)
        for i in first_prim..first_prim + num_prims {
            if i >= all_prims.len() {
                return Err(format!(
                    "Section {sec_idx}: primitive index {i} out of range ({})",
                    all_prims.len()
                ));
            }
            let prim = &all_prims[i];
            // prim indices are section-local, rebase to global
            all_indices.push(vert_base + prim[0] as u32);
            all_indices.push(vert_base + prim[1] as u32);
            all_indices.push(vert_base + prim[2] as u32);
        }
    }

    Ok(CollisionTriMesh {
        vertices: all_vertices,
        indices: all_indices,
    })
}

fn decode_packed_vertex(packed: u32, codec: &[f64; 6]) -> [f64; 3] {
    // codec = [offX, offY, offZ, sX, sY, sZ]
    // bit layout: Z[31:22] Y[21:11] X[10:0]
    let xi = packed & 0x7FF; // 11 bits
    let yi = (packed >> 11) & 0x7FF; // 11 bits
    let zi = (packed >> 22) & 0x3FF; // 10 bits

    let x = codec[0] + (xi as f64) * codec[3];
    let y = codec[1] + (yi as f64) * codec[4];
    let z = codec[2] + (zi as f64) * codec[5];
    [x, y, z]
}

struct SectionCodec {
    codec_parms: [f64; 6],
    first_packed_vertex_index: u32,
    num_packed_vertices: u32,
    first_primitive_index: u32,
    num_primitives: u32,
}

fn extract_integer_array(xml: &str, field_name: &str) -> Result<Vec<i64>, String> {
    let marker = format!(r#"<field name="{field_name}">"#);
    // Find the field, then scan for <integer value="..."/> within its array
    let field_start = xml
        .find(&marker)
        .ok_or(format!("Field '{field_name}' not found"))?;
    let field_body = &xml[field_start..];
    let field_end = field_body.find("</field>").unwrap_or(field_body.len());
    let field_slice = &field_body[..field_end];

    let mut values = Vec::new();
    let mut pos = 0;
    while let Some(idx) = field_slice[pos..].find(r#"<integer value=""#) {
        let start = pos + idx + r#"<integer value=""#.len();
        let end = field_slice[start..]
            .find('"')
            .map(|i| start + i)
            .ok_or("Malformed integer tag")?;
        let val: i64 = field_slice[start..end]
            .parse()
            .map_err(|e| format!("Bad integer: {e}"))?;
        values.push(val);
        pos = end + 1;
    }
    Ok(values)
}

fn extract_primitive_records(xml: &str) -> Result<Vec<[u8; 4]>, String> {
    // Find the top-level primitives field (under meshTree, not section-level)
    let marker = r#"<field name="primitives">"#;
    // We want the meshTree-level primitives, which appears after sections
    let sections_end = xml
        .find(r#"<field name="primitives">"#)
        .ok_or("No primitives field")?;
    let prim_body = &xml[sections_end..];
    let prim_end = prim_body
        .find(r#"<field name="sharedVerticesIndex">"#)
        .unwrap_or(prim_body.len());
    let prim_slice = &prim_body[..prim_end];

    // Each primitive record has 4 integer values under "indices"
    let mut records = Vec::new();
    let mut pos = 0;
    while let Some(idx) = prim_slice[pos..].find(r#"<field name="indices">"#) {
        let start = pos + idx;
        let rec_end = prim_slice[start..]
            .find("</record>")
            .map(|i| start + i + "</record>".len())
            .unwrap_or(prim_slice.len());
        let rec_slice = &prim_slice[start..rec_end];

        let mut ints = Vec::new();
        let mut ipos = 0;
        while let Some(ii) = rec_slice[ipos..].find(r#"<integer value=""#) {
            let istart = ipos + ii + r#"<integer value=""#.len();
            let iend = rec_slice[istart..]
                .find('"')
                .map(|i| istart + i)
                .unwrap_or(rec_slice.len());
            if let Ok(v) = rec_slice[istart..iend].parse::<u8>() {
                ints.push(v);
            }
            ipos = iend + 1;
        }

        if ints.len() >= 4 {
            records.push([ints[0], ints[1], ints[2], ints[3]]);
        }
        pos = rec_end;
    }
    Ok(records)
}

fn extract_section_codecs(sections_body: &str) -> Result<Vec<SectionCodec>, String> {
    let mut codecs = Vec::new();

    // Find each section record by looking for firstPackedVertexIndex
    let mut pos = 0;
    while let Some(idx) = sections_body[pos..].find(r#"<field name="codecParms">"#) {
        let sec_start = pos + idx;

        // Find the end of this section record
        let sec_end = sections_body[sec_start..]
            .find(r#"<field name="page">"#)
            .map(|i| sec_start + i + 200)
            .unwrap_or(sections_body.len());
        let sec_slice = &sections_body[sec_start..sec_end.min(sections_body.len())];

        // Extract codecParms (6 real values)
        let codec_parms = extract_real_array(sec_slice, "codecParms")?;
        if codec_parms.len() < 6 {
            return Err(format!(
                "Section has only {} codecParms (expected 6)",
                codec_parms.len()
            ));
        }
        let codec: [f64; 6] = [
            codec_parms[0],
            codec_parms[1],
            codec_parms[2],
            codec_parms[3],
            codec_parms[4],
            codec_parms[5],
        ];

        let first_pv = extract_single_integer(sec_slice, "firstPackedVertexIndex")? as u32;
        let num_pv = extract_single_integer(sec_slice, "numPackedVertices")? as u32;
        let first_prim = extract_single_integer(sec_slice, "firstPrimitiveIndex")? as u32;
        let num_prims = extract_single_integer(sec_slice, "numPrimitives")? as u32;

        codecs.push(SectionCodec {
            codec_parms: codec,
            first_packed_vertex_index: first_pv,
            num_packed_vertices: num_pv,
            first_primitive_index: first_prim,
            num_primitives: num_prims,
        });

        pos = sec_end.min(sections_body.len());
    }

    Ok(codecs)
}

fn extract_real_array(slice: &str, field_name: &str) -> Result<Vec<f64>, String> {
    let marker = format!(r#"<field name="{field_name}">"#);
    let start = slice
        .find(&marker)
        .ok_or(format!("Field '{field_name}' not found in section"))?;
    let body = &slice[start..];
    let end = body.find("</array>").unwrap_or(body.len());
    let arr_slice = &body[..end];

    let mut values = Vec::new();
    let mut pos = 0;
    while let Some(idx) = arr_slice[pos..].find(r#"dec=""#) {
        let dstart = pos + idx + r#"dec=""#.len();
        let dend = arr_slice[dstart..]
            .find('"')
            .map(|i| dstart + i)
            .ok_or("Malformed real tag")?;
        if let Ok(v) = arr_slice[dstart..dend].parse::<f64>() {
            values.push(v);
        }
        pos = dend + 1;
    }
    Ok(values)
}

fn extract_single_integer(slice: &str, field_name: &str) -> Result<i64, String> {
    let marker = format!(r#"<field name="{field_name}">"#);
    let start = slice
        .find(&marker)
        .ok_or(format!("Field '{field_name}' not found"))?;
    let body = &slice[start..];
    let int_start = body
        .find(r#"<integer value=""#)
        .ok_or(format!("No integer in '{field_name}'"))?
        + r#"<integer value=""#.len();
    let int_end = body[int_start..]
        .find('"')
        .map(|i| int_start + i)
        .ok_or("Malformed integer")?;
    body[int_start..int_end]
        .parse()
        .map_err(|e| format!("Bad integer in '{field_name}': {e}"))
}

fn report_encoding_error(original: &CollisionTriMesh, decoded: &CollisionTriMesh) {
    if original.vertices.len() != decoded.vertices.len() {
        eprintln!(
            "  WARNING: vertex count mismatch: original={} decoded={}",
            original.vertices.len(),
            decoded.vertices.len()
        );
        return;
    }

    let mut max_err = 0.0f64;
    let mut max_err_axis = 0usize;
    let mut max_err_idx = 0usize;
    let mut sum_err = 0.0f64;

    // Note: vertices may be reordered between sections. For section-level
    // comparison we would need to match by section. For now just compare
    // globally if the count matches and there is only one section.
    // A more robust comparison would match by index mapping.
    // Since simplified mesh goes through HashSet-based section splitting,
    // the vertex order may differ. Just report aggregate stats.

    // Instead of comparing 1:1 (order may differ), compute per-decoded-vertex
    // closest distance to any original vertex. This is O(n*m) but fine for debug.
    for (di, dv) in decoded.vertices.iter().enumerate() {
        let mut best = f64::INFINITY;
        let mut best_axis = 0;
        for ov in &original.vertices {
            let dx = (dv[0] - ov[0]).abs();
            let dy = (dv[1] - ov[1]).abs();
            let dz = (dv[2] - ov[2]).abs();
            let dist = (dx * dx + dy * dy + dz * dz).sqrt();
            if dist < best {
                best = dist;
                best_axis = if dx >= dy && dx >= dz {
                    0
                } else if dy >= dz {
                    1
                } else {
                    2
                };
            }
        }
        sum_err += best;
        if best > max_err {
            max_err = best;
            max_err_axis = best_axis;
            max_err_idx = di;
        }
    }

    let avg_err = if decoded.vertices.is_empty() {
        0.0
    } else {
        sum_err / decoded.vertices.len() as f64
    };
    let axis_names = ["X", "Y", "Z"];
    eprintln!(
        "  Encoding error: max={:.6} (vertex {} axis {}) avg={:.6}",
        max_err, max_err_idx, axis_names[max_err_axis], avg_err
    );

    // Also check AABB comparison
    if let (Ok((omin, omax)), Ok((dmin, dmax))) = (original.compute_aabb(), decoded.compute_aabb())
    {
        let aabb_err_min = [
            (omin[0] - dmin[0]).abs(),
            (omin[1] - dmin[1]).abs(),
            (omin[2] - dmin[2]).abs(),
        ];
        let aabb_err_max = [
            (omax[0] - dmax[0]).abs(),
            (omax[1] - dmax[1]).abs(),
            (omax[2] - dmax[2]).abs(),
        ];
        eprintln!(
            "  AABB min error: [{:.6}, {:.6}, {:.6}]",
            aabb_err_min[0], aabb_err_min[1], aabb_err_min[2]
        );
        eprintln!(
            "  AABB max error: [{:.6}, {:.6}, {:.6}]",
            aabb_err_max[0], aabb_err_max[1], aabb_err_max[2]
        );
    }
}
