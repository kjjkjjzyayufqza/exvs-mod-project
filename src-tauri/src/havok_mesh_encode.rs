//! Build hknpCompressedMeshShape meshTree XML from a merged triangle mesh.

use crate::collision_mesh::CollisionTriMesh;

const COLLISION_TEMPLATE_XML: &str =
    include_str!("../assets/havok_box_collision_template.xml");

const MAX_SECTION_VERTS: usize = 255;
const MAX_SECTION_TRIS: usize = 255;
const MAX_PACKED_AXIS: f64 = 2047.0;
const MAX_PACKED_Z: f64 = 1023.0;
const AABB_PAD: f64 = 0.01;

#[derive(Clone)]
struct SectionBuild {
    codec_parms: [f64; 6],
    packed_vertices: Vec<u32>,
    primitives: Vec<[u8; 4]>,
    min: [f64; 3],
    max: [f64; 3],
    first_packed_vertex_index: u32,
    first_primitive_index: u32,
}

pub fn build_mesh_collision_xml(mesh: &CollisionTriMesh) -> Result<String, String> {
    let (global_min, global_max) = padded_aabb(mesh)?;
    let sections = split_and_encode_sections(mesh)?;
    let mesh_tree = format_mesh_tree_xml(&sections, global_min, global_max)?;
    inject_mesh_tree_into_template(&mesh_tree, global_min, global_max)
}

fn padded_aabb(mesh: &CollisionTriMesh) -> Result<([f64; 3], [f64; 3]), String> {
    let (mut min, mut max) = mesh.compute_aabb()?;
    for axis in 0..3 {
        if (max[axis] - min[axis]).abs() < 1e-9 {
            max[axis] += 0.5;
            min[axis] -= 0.5;
        }
    }
    min = [min[0] - AABB_PAD, min[1] - AABB_PAD, min[2] - AABB_PAD];
    max = [max[0] + AABB_PAD, max[1] + AABB_PAD, max[2] + AABB_PAD];
    Ok((min, max))
}

fn split_and_encode_sections(mesh: &CollisionTriMesh) -> Result<Vec<SectionBuild>, String> {
    let triangles: Vec<[u32; 3]> = mesh
        .indices
        .chunks(3)
        .map(|c| [c[0], c[1], c[2]])
        .collect();

    let mut sections = Vec::new();
    let mut tri_cursor = 0usize;
    let mut global_packed_offset = 0u32;
    let mut global_prim_offset = 0u32;

    while tri_cursor < triangles.len() {
        let mut section_tris: Vec<[u32; 3]> = Vec::new();
        let mut vert_set = std::collections::HashSet::new();

        while tri_cursor < triangles.len() {
            let tri = triangles[tri_cursor];
            let mut new_verts = 0usize;
            for &v in &tri {
                if !vert_set.contains(&v) {
                    new_verts += 1;
                }
            }
            if !section_tris.is_empty()
                && (vert_set.len() + new_verts > MAX_SECTION_VERTS
                    || section_tris.len() >= MAX_SECTION_TRIS)
            {
                break;
            }
            if new_verts > MAX_SECTION_VERTS {
                return Err(format!(
                    "Single triangle uses more than {MAX_SECTION_VERTS} vertices (cannot encode section)"
                ));
            }
            for v in tri {
                vert_set.insert(v);
            }
            section_tris.push(tri);
            tri_cursor += 1;
        }

        if section_tris.is_empty() {
            return Err("Failed to partition mesh into Havok sections".into());
        }

        // Build local vertex list in triangle encounter order (deterministic)
        let mut global_to_local: std::collections::HashMap<u32, u8> = std::collections::HashMap::new();
        let mut local_verts: Vec<[f64; 3]> = Vec::new();
        for tri in &section_tris {
            for &gv in tri {
                if !global_to_local.contains_key(&gv) {
                    let local_idx = local_verts.len() as u8;
                    global_to_local.insert(gv, local_idx);
                    local_verts.push(mesh.vertices[gv as usize]);
                }
            }
        }

        let (min, max) = aabb_points(&local_verts)?;
        let codec = codec_parms_for_aabb(min, max);
        let packed_vertices: Vec<u32> = local_verts
            .iter()
            .map(|v| encode_packed_vertex(*v, codec))
            .collect();

        let mut primitives = Vec::new();
        for tri in &section_tris {
            let a = *global_to_local.get(&tri[0]).unwrap();
            let b = *global_to_local.get(&tri[1]).unwrap();
            let c = *global_to_local.get(&tri[2]).unwrap();
            primitives.push([a, b, c, c]);
        }

        sections.push(SectionBuild {
            codec_parms: codec,
            packed_vertices,
            primitives,
            min,
            max,
            first_packed_vertex_index: global_packed_offset,
            first_primitive_index: global_prim_offset,
        });

        global_packed_offset += local_verts.len() as u32;
        global_prim_offset += section_tris.len() as u32;
    }

    Ok(sections)
}

fn aabb_points(points: &[[f64; 3]]) -> Result<([f64; 3], [f64; 3]), String> {
    if points.is_empty() {
        return Err("Section has no vertices".into());
    }
    let mut min = [f64::INFINITY; 3];
    let mut max = [f64::NEG_INFINITY; 3];
    for p in points {
        for axis in 0..3 {
            min[axis] = min[axis].min(p[axis]);
            max[axis] = max[axis].max(p[axis]);
        }
    }
    Ok((min, max))
}

fn codec_parms_for_aabb(min: [f64; 3], max: [f64; 3]) -> [f64; 6] {
    let scale_x = ((max[0] - min[0]) / MAX_PACKED_AXIS).max(1e-9);
    let scale_y = ((max[1] - min[1]) / MAX_PACKED_AXIS).max(1e-9);
    let scale_z = ((max[2] - min[2]) / MAX_PACKED_Z).max(1e-9);
    // Havok format: [offX, offY, offZ, sX, sY, sZ]
    [min[0], min[1], min[2], scale_x, scale_y, scale_z]
}

fn encode_packed_vertex(point: [f64; 3], codec: [f64; 6]) -> u32 {
    // codec = [offX, offY, offZ, sX, sY, sZ]
    let xi = ((point[0] - codec[0]) / codec[3])
        .clamp(0.0, MAX_PACKED_AXIS)
        .round() as u32;
    let yi = ((point[1] - codec[1]) / codec[4])
        .clamp(0.0, MAX_PACKED_AXIS)
        .round() as u32;
    let zi = ((point[2] - codec[2]) / codec[5])
        .clamp(0.0, MAX_PACKED_Z)
        .round() as u32;
    // Havok bit layout: Z[31:22] Y[21:11] X[10:0]
    (zi << 22) | (yi << 11) | xi
}

fn format_aabb_xml(min: [f64; 3], max: [f64; 3]) -> String {
    format!(
        r#"<record> <!-- hkAabb -->
              <field name="min">
                <array count="4" elementtypeid="type48">
                  {}
                  {}
                  {}
                  {}
                </array>
              </field>
              <field name="max">
                <array count="4" elementtypeid="type48">
                  {}
                  {}
                  {}
                  {}
                </array>
              </field>
            </record>"#,
        format_real_tag(min[0]),
        format_real_tag(min[1]),
        format_real_tag(min[2]),
        format_real_tag(1.0),
        format_real_tag(max[0]),
        format_real_tag(max[1]),
        format_real_tag(max[2]),
        format_real_tag(1.0),
    )
}

fn format_codec_parms_xml(codec: [f64; 6]) -> String {
    let mut out = String::from(
        r#"<array count="6" elementtypeid="type35">
"#,
    );
    for v in codec {
        out.push_str(&format!("                    {}\n", format_real_tag(v)));
    }
    out.push_str("                  </array>");
    out
}

fn format_bvh_node_4byte(data: u8) -> String {
    format!(
        r#"<record>
                      <field name="xyz">
                        <array count="3" elementtypeid="type135">
                          <integer value="0"/>
                          <integer value="0"/>
                          <integer value="0"/>
                        </array>
                      </field>
                      <field name="data"><integer value="{}"/></field>
                    </record>"#,
        data
    )
}

fn format_section_xml(sec: &SectionBuild) -> String {
    let mut bvh_nodes = String::new();
    let node_count = sec.primitives.len().max(1);
    for i in 0..node_count {
        bvh_nodes.push_str(&format_bvh_node_4byte(i as u8));
        bvh_nodes.push('\n');
    }

    let mut prims = String::new();
    for p in &sec.primitives {
        prims.push_str(&format!(
            r#"<record>
                <field name="indices">
                  <array count="4" elementtypeid="type135">
                    <integer value="{}"/>
                    <integer value="{}"/>
                    <integer value="{}"/>
                    <integer value="{}"/>
                  </array>
                </field>
              </record>
"#,
            p[0], p[1], p[2], p[3]
        ));
    }

    format!(
        r#"<record>
                <field name="nodes">
                  <array count="{node_count}" elementtypeid="type400">
                    {bvh_nodes}
                  </array>
                </field>
                <field name="domain">
                  {domain}
                </field>
                <field name="codecParms">
                  {codec}
                </field>
                <field name="firstPackedVertexIndex"><integer value="{first_packed}"/></field>
                <field name="firstSharedVertexIndex"><integer value="0"/></field>
                <field name="firstPrimitiveIndex"><integer value="{first_prim}"/></field>
                <field name="firstDataRunIndex"><integer value="0"/></field>
                <field name="numPackedVertices"><integer value="{num_packed}"/></field>
                <field name="numPrimitives"><integer value="{num_prims}"/></field>
                <field name="numDataRuns"><integer value="1"/></field>
                <field name="page"><integer value="0"/></field>
                <field name="leafIndex"><integer value="0"/></field>
                <field name="layerData"><integer value="0"/></field>
                <field name="flags"><integer value="0"/></field>
              </record>"#,
        node_count = node_count,
        bvh_nodes = bvh_nodes,
        domain = format_aabb_xml(sec.min, sec.max),
        codec = format_codec_parms_xml(sec.codec_parms),
        first_packed = sec.first_packed_vertex_index,
        first_prim = sec.first_primitive_index,
        num_packed = sec.packed_vertices.len(),
        num_prims = sec.primitives.len(),
    )
}

fn format_mesh_tree_xml(
    sections: &[SectionBuild],
    global_min: [f64; 3],
    global_max: [f64; 3],
) -> Result<String, String> {
    let total_prims: u32 = sections.iter().map(|s| s.primitives.len() as u32).sum();
    let total_packed: u32 = sections.iter().map(|s| s.packed_vertices.len() as u32).sum();

    let mut section_records = String::new();
    for sec in sections {
        section_records.push_str(&format_section_xml(sec));
        section_records.push('\n');
    }

    let mut packed_integers = String::new();
    for sec in sections {
        for pv in &sec.packed_vertices {
            packed_integers.push_str(&format!(
                r#"              <integer value="{}"/>
"#,
                pv
            ));
        }
    }

    let mut prim_records = String::new();
    for sec in sections {
        for p in &sec.primitives {
            prim_records.push_str(&format!(
                r#"<record>
                <field name="indices">
                  <array count="4" elementtypeid="type135">
                    <integer value="{}"/>
                    <integer value="{}"/>
                    <integer value="{}"/>
                    <integer value="{}"/>
                  </array>
                </field>
              </record>
"#,
                p[0], p[1], p[2], p[3]
            ));
        }
    }

    let mut data_runs = String::new();
    let mut prim_offset = 0u32;
    for sec in sections {
        data_runs.push_str(&format!(
            r#"<record>
                <field name="value"><integer value="65535"/></field>
                <field name="index"><integer value="{}"/></field>
                <field name="count"><integer value="{}"/></field>
              </record>
"#,
            prim_offset,
            sec.primitives.len()
        ));
        prim_offset += sec.primitives.len() as u32;
    }

    let max_key = total_prims.saturating_sub(1).max(1);
    let bits_per_key = (32 - max_key.leading_zeros()).max(1).min(8);

    Ok(format!(
        r#"<record>
          <field name="nodes">
            <array count="1" elementtypeid="type391">
              <record>
                <field name="xyz">
                  <array count="3" elementtypeid="type135">
                    <integer value="0"/>
                    <integer value="0"/>
                    <integer value="0"/>
                  </array>
                </field>
                <field name="hiData"><integer value="0"/></field>
                <field name="loData"><integer value="0"/></field>
              </record>
            </array>
          </field>
          <field name="domain">
            {global_domain}
          </field>
          <field name="numPrimitiveKeys"><integer value="{total_prims}"/></field>
          <field name="bitsPerKey"><integer value="{bits_per_key}"/></field>
          <field name="maxKeyValue"><integer value="{max_key}"/></field>
          <field name="primitiveStoresIsFlatConvex"><integer value="255"/></field>
          <field name="sections">
            <array count="{section_count}" elementtypeid="type386">
              {section_records}
            </array>
          </field>
          <field name="primitives">
            <array count="{total_prims}" elementtypeid="type388">
              {prim_records}
            </array>
          </field>
          <field name="sharedVerticesIndex">
            <array count="0" elementtypeid="type188">
            </array>
          </field>
          <field name="packedVertices">
            <array count="{total_packed}" elementtypeid="type33">
{packed_integers}            </array>
          </field>
          <field name="sharedVertices">
            <array count="0" elementtypeid="type136">
            </array>
          </field>
          <field name="primitiveDataRuns">
            <array count="{run_count}" elementtypeid="type383">
              {data_runs}
            </array>
          </field>
        </record>"#,
        global_domain = format_aabb_xml(global_min, global_max),
        section_count = sections.len(),
        run_count = sections.len(),
    ))
}

fn inject_mesh_tree_into_template(
    mesh_tree: &str,
    global_min: [f64; 3],
    global_max: [f64; 3],
) -> Result<String, String> {
    let template = COLLISION_TEMPLATE_XML;
    let start = template
        .find(r#"<field name="meshTree">"#)
        .ok_or_else(|| "meshTree field missing from collision template".to_string())?;
    let end = find_field_end(template, start)?;
    let mut xml = format!(
        "{}{}{}",
        &template[..start],
        format!(r#"<field name="meshTree">{mesh_tree}</field>"#),
        &template[end..]
    );

    // Patch legacy template domain blocks outside meshTree (compound shape metadata).
    let domain_aabb = format_aabb_xml(global_min, global_max);
    while let Some(dom_start) = xml.find(r#"<field name="domain">
            <record> <!-- hkAabb -->
              <field name="min">
                <array count="4" elementtypeid="type48"> <!-- ArrayOf float -->
                  <real dec="-40.01""#) {
        let dom_end = xml[dom_start..]
            .find(r#"</field>
          <field name="numPrimitiveKeys">"#)
            .or_else(|| {
                xml[dom_start..].find(r#"</field>
                <field name="codecParms">"#)
            })
            .ok_or_else(|| "domain end marker missing".to_string())?
            + dom_start;
        xml.replace_range(
            dom_start..dom_end,
            &format!(r#"<field name="domain">
            {domain_aabb}"#),
        );
    }

    patch_simd_tree_bounds(&xml, global_min, global_max)
}

pub fn float_to_havok_hex(value: f64) -> String {
    let bits = value.to_bits();
    format!("#{:016X}", bits)
}

pub fn format_real_tag(value: f64) -> String {
    format!(
        r#"<real dec="{:.9}" hex="{}"/>"#,
        value,
        float_to_havok_hex(value)
    )
}

fn find_field_end(xml: &str, field_start: usize) -> Result<usize, String> {
    const OPEN: &str = "<field ";
    const CLOSE: &str = "</field>";

    let after_open = xml[field_start..]
        .find('>')
        .map(|idx| field_start + idx + 1)
        .ok_or_else(|| "Malformed XML field opening tag".to_string())?;

    let mut depth = 1usize;
    let mut pos = after_open;

    while pos < xml.len() && depth > 0 {
        let open = xml[pos..].find(OPEN);
        let close = xml[pos..].find(CLOSE);

        match (open, close) {
            (Some(o), Some(c)) if o <= c => {
                depth += 1;
                pos += o + OPEN.len();
            }
            (_, Some(c)) => {
                depth -= 1;
                pos += c + CLOSE.len();
                if depth == 0 {
                    return Ok(pos);
                }
            }
            _ => break,
        }
    }

    Err("Failed to locate end of XML field".into())
}

fn replace_template_bound_literal(field_body: &str, old_dec: &str, new_value: f64) -> String {
    let old_prefix = format!(r#"<real dec="{old_dec}""#);
    let new_tag = format_real_tag(new_value);
    let mut patched = field_body.to_string();
    while let Some(idx) = patched.find(&old_prefix) {
        let rest = &patched[idx..];
        if let Some(close) = rest.find("/>") {
            patched.replace_range(idx..idx + close + 2, &new_tag);
        } else {
            break;
        }
    }
    patched
}

fn replace_axis_field_bounds(
    section: &str,
    axis_field: &str,
    low_value: f64,
    high_value: f64,
) -> Result<String, String> {
    let marker = format!(r#"<field name="{axis_field}">"#);
    let mut result = section.to_string();
    let mut search_from = 0;

    while let Some(rel_start) = result[search_from..].find(&marker) {
        let start = search_from + rel_start;
        let end = find_field_end(&result, start)?;
        let field_body = result[start..end].to_string();
        let mut patched_field = field_body;
        patched_field = replace_template_bound_literal(&patched_field, "-40.01", low_value);
        patched_field = replace_template_bound_literal(&patched_field, "-40", low_value);
        patched_field = replace_template_bound_literal(&patched_field, "0", low_value);
        patched_field = replace_template_bound_literal(&patched_field, "40", high_value);
        result.replace_range(start..end, &patched_field);
        search_from = start + marker.len();
    }

    Ok(result)
}

fn patch_simd_tree_bounds(xml: &str, min: [f64; 3], max: [f64; 3]) -> Result<String, String> {
    let field_start = xml
        .find(r#"<field name="simdTree">"#)
        .ok_or_else(|| "simdTree field not found in collision template".to_string())?;
    let field_end = find_field_end(xml, field_start)?;

    let mut simd_tree = xml[field_start..field_end].to_string();
    simd_tree = replace_axis_field_bounds(&simd_tree, "lx", min[0], max[0])?;
    simd_tree = replace_axis_field_bounds(&simd_tree, "hx", min[0], max[0])?;
    simd_tree = replace_axis_field_bounds(&simd_tree, "ly", min[1], max[1])?;
    simd_tree = replace_axis_field_bounds(&simd_tree, "hy", min[1], max[1])?;
    simd_tree = replace_axis_field_bounds(&simd_tree, "lz", min[2], max[2])?;
    simd_tree = replace_axis_field_bounds(&simd_tree, "hz", min[2], max[2])?;

    Ok(format!(
        "{}{}{}",
        &xml[..field_start],
        simd_tree,
        &xml[field_end..]
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::collision_mesh::CollisionTriMesh;

    #[test]
    fn single_triangle_mesh_builds_xml_without_template_literals() {
        let mesh = CollisionTriMesh {
            vertices: vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
            indices: vec![0, 1, 2],
        };
        let xml = build_mesh_collision_xml(&mesh).unwrap();
        assert!(xml.contains("hknpCompressedMeshShape"));
        assert!(xml.contains(r#"<field name="meshTree">"#));
        assert!(!xml.contains(r#"dec="-40.01""#));
        assert!(xml.contains(r#"<integer value="1"/>"#)); // one primitive
    }

    #[test]
    fn large_mesh_splits_into_multiple_sections() {
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        for batch in 0..3usize {
            let base = (batch * 200) as f64;
            let v_base = vertices.len() as u32;
            vertices.push([base, 0.0, 0.0]);
            vertices.push([base + 1.0, 0.0, 0.0]);
            vertices.push([base, 1.0, 0.0]);
            for t in 0..200usize {
                let o = (v_base as usize) + t * 3;
                if o + 2 >= vertices.len() {
                    vertices.push([base + (t as f64), 0.0, 0.0]);
                    vertices.push([base + (t as f64) + 0.1, 0.0, 0.0]);
                    vertices.push([base + (t as f64), 0.1, 0.0]);
                }
                indices.extend_from_slice(&[
                    (v_base + t as u32 * 3) % vertices.len() as u32,
                    ((v_base + t as u32 * 3 + 1) % vertices.len() as u32),
                    ((v_base + t as u32 * 3 + 2) % vertices.len() as u32),
                ]);
            }
        }
        // simpler: 300 separate triangles with unique verts
        vertices.clear();
        indices.clear();
        for i in 0..300usize {
            let x = i as f64;
            let base = vertices.len() as u32;
            vertices.push([x, 0.0, 0.0]);
            vertices.push([x + 0.1, 0.0, 0.0]);
            vertices.push([x, 0.1, 0.0]);
            indices.extend_from_slice(&[base, base + 1, base + 2]);
        }
        let mesh = CollisionTriMesh { vertices, indices };
        let sections = split_and_encode_sections(&mesh).unwrap();
        assert!(sections.len() >= 2);
    }
}
