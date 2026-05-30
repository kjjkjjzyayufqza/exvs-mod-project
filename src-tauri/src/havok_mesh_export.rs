use std::path::Path;

struct Section {
    codec_parms: [f64; 6],
    first_packed_vertex_index: u32,
    first_shared_vertex_index: u32,
    first_primitive_index: u32,
    num_packed_vertices: u32,
    num_primitives: u32,
}

struct DomainAabb {
    min: [f64; 3],
    max: [f64; 3],
}

fn child_elements<'a>(el: &'a xmltree::Element) -> impl Iterator<Item = &'a xmltree::Element> {
    el.children.iter().filter_map(|c| match c {
        xmltree::XMLNode::Element(e) => Some(e),
        _ => None,
    })
}

fn find_field<'a>(parent: &'a xmltree::Element, name: &str) -> Option<&'a xmltree::Element> {
    child_elements(parent)
        .find(|e| e.name == "field" && e.attributes.get("name").map(|n| n.as_str()) == Some(name))
}

fn first_record(el: &xmltree::Element) -> Option<&xmltree::Element> {
    child_elements(el).find(|e| e.name == "record")
}

fn first_array(el: &xmltree::Element) -> Option<&xmltree::Element> {
    child_elements(el).find(|e| e.name == "array")
}

fn integer_value(el: &xmltree::Element) -> Option<i64> {
    if el.name == "integer" {
        el.attributes.get("value")?.parse::<i64>().ok()
    } else {
        child_elements(el)
            .find(|e| e.name == "integer")
            .and_then(|e| e.attributes.get("value")?.parse::<i64>().ok())
    }
}

fn real_dec(el: &xmltree::Element) -> Option<f64> {
    el.attributes.get("dec")?.parse::<f64>().ok()
}

fn collect_integers(array_el: &xmltree::Element) -> Vec<i64> {
    child_elements(array_el)
        .filter(|e| e.name == "integer")
        .filter_map(|e| e.attributes.get("value")?.parse::<i64>().ok())
        .collect()
}

fn collect_u64_integers(array_el: &xmltree::Element) -> Vec<u64> {
    child_elements(array_el)
        .filter(|e| e.name == "integer")
        .filter_map(|e| e.attributes.get("value")?.parse::<u64>().ok())
        .collect()
}

fn collect_reals(array_el: &xmltree::Element) -> Vec<f64> {
    child_elements(array_el)
        .filter(|e| e.name == "real")
        .filter_map(|e| real_dec(e))
        .collect()
}

fn find_mesh_tree_record(root: &xmltree::Element) -> Result<&xmltree::Element, String> {
    for obj in child_elements(root).filter(|e| e.name == "object") {
        if let Some(rec) = first_record(obj) {
            if find_field(rec, "meshTree").is_some() {
                let mesh_tree_field = find_field(rec, "meshTree").unwrap();
                if let Some(mt_rec) = first_record(mesh_tree_field) {
                    return Ok(mt_rec);
                }
            }
        }
    }
    Err("Cannot find meshTree record in Havok XML".into())
}

fn extract_domain(mesh_tree: &xmltree::Element) -> Result<DomainAabb, String> {
    let domain_field = find_field(mesh_tree, "domain").ok_or("No domain field")?;
    let domain_rec = first_record(domain_field).ok_or("No domain record")?;

    let min_field = find_field(domain_rec, "min").ok_or("No min field in domain")?;
    let max_field = find_field(domain_rec, "max").ok_or("No max field in domain")?;

    let min_arr = first_array(min_field).ok_or("No min array")?;
    let max_arr = first_array(max_field).ok_or("No max array")?;

    let mins = collect_reals(min_arr);
    let maxs = collect_reals(max_arr);

    if mins.len() < 3 || maxs.len() < 3 {
        return Err("Domain AABB needs at least 3 values".into());
    }

    Ok(DomainAabb {
        min: [mins[0], mins[1], mins[2]],
        max: [maxs[0], maxs[1], maxs[2]],
    })
}

fn extract_sections(mesh_tree: &xmltree::Element) -> Result<Vec<Section>, String> {
    let sections_field = find_field(mesh_tree, "sections").ok_or("No sections field")?;
    let sections_array = first_array(sections_field).ok_or("No sections array")?;

    let mut sections = Vec::new();
    for sec_rec in child_elements(sections_array).filter(|e| e.name == "record") {
        let cp_field = find_field(sec_rec, "codecParms").ok_or("No codecParms")?;
        let cp_arr = first_array(cp_field).ok_or("No codecParms array")?;
        let parms = collect_reals(cp_arr);
        if parms.len() < 6 {
            return Err(format!("codecParms needs 6 values, got {}", parms.len()));
        }

        let fpvi = integer_value(
            find_field(sec_rec, "firstPackedVertexIndex").ok_or("No firstPackedVertexIndex")?,
        )
        .ok_or("Bad firstPackedVertexIndex")? as u32;

        let fsvi = integer_value(
            find_field(sec_rec, "firstSharedVertexIndex").ok_or("No firstSharedVertexIndex")?,
        )
        .ok_or("Bad firstSharedVertexIndex")? as u32;

        let fpi = integer_value(
            find_field(sec_rec, "firstPrimitiveIndex").ok_or("No firstPrimitiveIndex")?,
        )
        .ok_or("Bad firstPrimitiveIndex")? as u32;

        let npv =
            integer_value(find_field(sec_rec, "numPackedVertices").ok_or("No numPackedVertices")?)
                .ok_or("Bad numPackedVertices")? as u32;

        let np = integer_value(find_field(sec_rec, "numPrimitives").ok_or("No numPrimitives")?)
            .ok_or("Bad numPrimitives")? as u32;

        sections.push(Section {
            codec_parms: [parms[0], parms[1], parms[2], parms[3], parms[4], parms[5]],
            first_packed_vertex_index: fpvi,
            first_shared_vertex_index: fsvi,
            first_primitive_index: fpi,
            num_packed_vertices: npv,
            num_primitives: np,
        });
    }

    Ok(sections)
}

fn extract_packed_vertices(mesh_tree: &xmltree::Element) -> Result<Vec<u32>, String> {
    let pv_field = find_field(mesh_tree, "packedVertices").ok_or("No packedVertices field")?;
    let pv_array = first_array(pv_field).ok_or("No packedVertices array")?;
    Ok(collect_integers(pv_array)
        .into_iter()
        .map(|v| v as u32)
        .collect())
}

fn extract_shared_vertices(mesh_tree: &xmltree::Element) -> Result<Vec<u64>, String> {
    let sv_field = find_field(mesh_tree, "sharedVertices").ok_or("No sharedVertices field")?;
    let sv_array = first_array(sv_field).ok_or("No sharedVertices array")?;
    Ok(collect_integers(sv_array)
        .into_iter()
        .map(|v| v as u64)
        .collect())
}

fn extract_shared_vertices_index(mesh_tree: &xmltree::Element) -> Result<Vec<u16>, String> {
    let svi_field =
        find_field(mesh_tree, "sharedVerticesIndex").ok_or("No sharedVerticesIndex field")?;
    let svi_array = first_array(svi_field).ok_or("No sharedVerticesIndex array")?;
    Ok(collect_integers(svi_array)
        .into_iter()
        .map(|v| v as u16)
        .collect())
}

fn extract_primitives(mesh_tree: &xmltree::Element) -> Result<Vec<[u8; 4]>, String> {
    let prim_field = find_field(mesh_tree, "primitives").ok_or("No primitives field")?;
    let prim_array = first_array(prim_field).ok_or("No primitives array")?;

    let mut prims = Vec::new();
    for rec in child_elements(prim_array).filter(|e| e.name == "record") {
        let idx_field = find_field(rec, "indices").ok_or("No indices in primitive")?;
        let idx_arr = first_array(idx_field).ok_or("No indices array")?;
        let ints = collect_integers(idx_arr);
        if ints.len() >= 4 {
            prims.push([ints[0] as u8, ints[1] as u8, ints[2] as u8, ints[3] as u8]);
        }
    }

    Ok(prims)
}

fn decode_shared_vertex(sv: u64, domain: &DomainAabb) -> [f64; 3] {
    let xi = (sv & 0x1F_FFFF) as f64;
    let yi = ((sv >> 21) & 0x1F_FFFF) as f64;
    let zi = ((sv >> 42) & 0x3F_FFFF) as f64;
    let dx = domain.max[0] - domain.min[0];
    let dy = domain.max[1] - domain.min[1];
    let dz = domain.max[2] - domain.min[2];
    [
        domain.min[0] + (xi / 2097151.0) * dx,
        domain.min[1] + (yi / 2097151.0) * dy,
        domain.min[2] + (zi / 4194303.0) * dz,
    ]
}

pub fn havok_xml_to_obj(xml_content: &str, output_path: &Path) -> Result<String, String> {
    let root = xmltree::Element::parse(xml_content.as_bytes())
        .map_err(|e| format!("XML parse error: {e}"))?;

    let mesh_tree = find_mesh_tree_record(&root)?;
    let domain = extract_domain(mesh_tree)?;
    let sections = extract_sections(mesh_tree)?;
    let packed_vertices = extract_packed_vertices(mesh_tree)?;
    let shared_vertices = extract_shared_vertices(mesh_tree)?;
    let shared_vertices_index = extract_shared_vertices_index(mesh_tree)?;
    let primitives = extract_primitives(mesh_tree)?;

    let mut obj_verts: Vec<[f64; 3]> = Vec::new();
    let mut obj_faces: Vec<[usize; 4]> = Vec::new();
    let mut tri_count = 0usize;
    let mut quad_count = 0usize;

    for section in &sections {
        let vert_base = obj_verts.len();

        let pv_start = section.first_packed_vertex_index as usize;
        let pv_end = (pv_start + section.num_packed_vertices as usize).min(packed_vertices.len());
        for i in pv_start..pv_end {
            let packed = packed_vertices[i];
            // Havok bit layout: Z[31:22] Y[21:11] X[10:0]
            let xi = (packed & 0x7FF) as f64;
            let yi = ((packed >> 11) & 0x7FF) as f64;
            let zi = ((packed >> 22) & 0x3FF) as f64;
            // codecParms = [offX, offY, offZ, sX, sY, sZ]
            obj_verts.push([
                section.codec_parms[0] + xi * section.codec_parms[3],
                section.codec_parms[1] + yi * section.codec_parms[4],
                section.codec_parms[2] + zi * section.codec_parms[5],
            ]);
        }

        let prim_start = section.first_primitive_index as usize;
        let prim_end = (prim_start + section.num_primitives as usize).min(primitives.len());

        let mut max_shared_local: i32 = -1;
        for pi in prim_start..prim_end {
            for &idx in &primitives[pi] {
                if idx as u32 >= section.num_packed_vertices {
                    let local = (idx as u32 - section.num_packed_vertices) as i32;
                    if local > max_shared_local {
                        max_shared_local = local;
                    }
                }
            }
        }

        let shared_base = obj_verts.len();
        if max_shared_local >= 0 {
            for si in 0..=(max_shared_local as usize) {
                let svi_idx = section.first_shared_vertex_index as usize + si;
                if svi_idx < shared_vertices_index.len() {
                    let global_idx = shared_vertices_index[svi_idx] as usize;
                    if global_idx < shared_vertices.len() {
                        obj_verts.push(decode_shared_vertex(shared_vertices[global_idx], &domain));
                    } else {
                        obj_verts.push([0.0, 0.0, 0.0]);
                    }
                } else {
                    obj_verts.push([0.0, 0.0, 0.0]);
                }
            }
        }

        for pi in prim_start..prim_end {
            let [i0, i1, i2, i3] = primitives[pi];
            let resolve = |idx: u8| -> usize {
                if (idx as u32) < section.num_packed_vertices {
                    vert_base + idx as usize
                } else {
                    shared_base + (idx as u32 - section.num_packed_vertices) as usize
                }
            };
            let f = [resolve(i0), resolve(i1), resolve(i2), resolve(i3)];
            if i2 == i3 {
                tri_count += 1;
            } else {
                quad_count += 1;
            }
            obj_faces.push(f);
        }
    }

    let mut out = String::with_capacity(obj_verts.len() * 40 + obj_faces.len() * 30);
    out.push_str(&format!(
        "# Havok Collision Mesh (hknpCompressedMeshShape)\n\
         # Sections: {}, Vertices: {}, Triangles: {}, Quads: {}\n\n",
        sections.len(),
        obj_verts.len(),
        tri_count,
        quad_count
    ));

    for [x, y, z] in &obj_verts {
        out.push_str(&format!("v {x} {y} {z}\n"));
    }
    out.push('\n');

    for [i0, i1, i2, i3] in &obj_faces {
        if i2 == i3 {
            out.push_str(&format!("f {} {} {}\n", i0 + 1, i1 + 1, i2 + 1));
        } else {
            out.push_str(&format!("f {} {} {} {}\n", i0 + 1, i1 + 1, i2 + 1, i3 + 1));
        }
    }

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory: {e}"))?;
    }
    std::fs::write(output_path, &out).map_err(|e| format!("Failed to write OBJ: {e}"))?;

    Ok(format!(
        "Exported {} vertices, {} faces ({} tri + {} quad) from {} sections",
        obj_verts.len(),
        tri_count + quad_count,
        tri_count,
        quad_count,
        sections.len()
    ))
}

#[tauri::command]
pub async fn convert_hkt_to_obj(input_path: String, output_path: String) -> Result<String, String> {
    let config =
        crate::havok_cli::HavokCliConfig::detect().ok_or("Havok Content Tools not found")?;

    if !Path::new(&config.filter_manager_path).exists() {
        return Err("hctStandAloneFilterManager.exe not found".into());
    }

    let inp = std::path::PathBuf::from(&input_path);
    if !inp.exists() {
        return Err(format!("Input file not found: {input_path}"));
    }

    let out = std::path::PathBuf::from(&output_path);

    tauri::async_runtime::spawn_blocking(move || {
        let xml = crate::havok_cli::convert_hkt_bytes_to_xml(
            &config.filter_manager_path,
            &std::fs::read(&inp).map_err(|e| format!("Read HKT failed: {e}"))?,
        )?;
        havok_xml_to_obj(&xml, &out)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}
