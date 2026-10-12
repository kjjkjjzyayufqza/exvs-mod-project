//! OB stage regression evidence for the EXVS Mod Project by kjjkjjzyayufqza.
use app_lib::format::fhm2d::{extract_fhm2d_to_memory_impl, Fhm2dFormat};
use flate2::{write::DeflateEncoder, Compression};
use std::io::Write;

fn words(out: &mut Vec<u8>, values: &[u32]) {
    for value in values {
        out.extend_from_slice(&value.to_le_bytes());
    }
}

fn fixture(path_offset: Option<u32>, terminated: bool) -> Vec<u8> {
    let structure_start = 36 + 32 + 12 + 44;
    let name_start = structure_start + 33 + 25 + 1;
    let mut meta = Vec::new();
    words(&mut meta, &[20, 0, 0, 0, structure_start, 0, 1, 1, 0]);
    words(&mut meta, &[0, 0, 0, 0, 32, 0, 16, 1]);
    words(&mut meta, &[0, 0, 0]);
    words(
        &mut meta,
        &[
            path_offset.unwrap_or(name_start),
            0,
            32,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
        ],
    );
    meta.push(10);
    words(&mut meta, &[0, 1, 0, 0, 0, 0, 0, 0]);
    meta.push(0);
    words(&mut meta, &[0, 0, 0, 0, 0, 0]);
    meta.push(11);
    meta.extend_from_slice(b"c:\\authoring\\plan_param.spbin");
    if terminated {
        meta.push(0);
    }
    let mut encoder = DeflateEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&meta).unwrap();
    let compressed = encoder.finish().unwrap();
    let mut archive = Vec::new();
    words(
        &mut archive,
        &[
            0xcdb2b7b9,
            0,
            0x10002,
            0,
            (48 + compressed.len() + 32) as u32,
            0,
            meta.len() as u32,
            0,
            compressed.len() as u32,
            0,
            0,
            0,
        ],
    );
    archive.extend_from_slice(&compressed);
    archive.extend_from_slice(&[0x55; 32]);
    archive
}

#[test]
fn deep_stage_audit_native_authoring_path_pool() {
    let extract = extract_fhm2d_to_memory_impl(
        &fixture(None, true),
        "path_pool",
        Some(Fhm2dFormat::Character),
    )
    .unwrap();
    assert_eq!(extract.files.len(), 1);
    assert_eq!(extract.files[0].data, vec![0x55; 32]);
    for offset in [4, 999_999] {
        assert!(extract_fhm2d_to_memory_impl(
            &fixture(Some(offset), true),
            "invalid",
            Some(Fhm2dFormat::Character)
        )
        .is_err());
    }
    assert!(extract_fhm2d_to_memory_impl(
        &fixture(None, false),
        "invalid",
        Some(Fhm2dFormat::Character)
    )
    .is_err());
}

#[test]
fn deep_stage_audit_vcl_crease_preserves_original_triangles() {
    use app_lib::collision_mesh::{author_collision_shapes, CollisionPrimitive, CollisionTriMesh};
    let source = CollisionTriMesh {
        vertices: vec![
            [0.0, 0.0, 0.0],
            [1000.0, 0.0, 0.0],
            [1000.0, 0.0, 1000.0],
            [0.0, 100.0, 1000.0],
        ],
        indices: vec![0, 3, 1, 1, 3, 2],
    };
    let authored = author_collision_shapes(
        &source,
        &app_lib::mbon::stage_port::collision::stage_collision_options(),
    )
    .unwrap();
    let mut expected = vec![
        vec![[0, 0, 0], [0, 100, 1000], [1000, 0, 0]],
        vec![[1000, 0, 0], [0, 100, 1000], [1000, 0, 1000]],
    ];
    for t in &mut expected {
        t.sort();
    }
    expected.sort();
    let mut actual = Vec::new();
    for shape in authored.shapes {
        for primitive in &shape.primitives {
            assert!(
                matches!(primitive, CollisionPrimitive::Triangle(_)),
                "a bent VCL pair must not be reauthored as a quad"
            );
        }
        let mesh = shape.to_triangle_mesh();
        for tri in mesh.indices.chunks_exact(3) {
            let mut points: Vec<_> = tri
                .iter()
                .map(|i| mesh.vertices[*i as usize].map(|v| v as i32))
                .collect();
            points.sort();
            actual.push(points);
        }
    }
    actual.sort();
    assert_eq!(actual, expected, "imported collision topology changed");
}

#[test]
fn deep_stage_audit_vcl_uses_shared_vertices() {
    use app_lib::collision_mesh::{author_collision_shapes, CollisionTriMesh};
    let source = CollisionTriMesh {
        vertices: vec![
            [0.123, 0.0, 0.0],
            [1260.9356689453125, 0.0, 0.0],
            [0.0, 111.96318054199219, 1260.5523681640625],
        ],
        indices: vec![0, 1, 2],
    };
    let authored = author_collision_shapes(
        &source,
        &app_lib::mbon::stage_port::collision::stage_collision_options(),
    )
    .unwrap();
    let xml = app_lib::havok_mesh_encode::build_authored_collision_set_xml_shared_vertices_scaled(
        &authored, 1.0,
    )
    .unwrap();
    let packed = xml.split("<field name=\"packedVertices\">").nth(1).unwrap();
    assert!(packed.trim_start().starts_with("<array count=\"0\""));
    let shared = xml.split("<field name=\"sharedVertices\">").nth(1).unwrap();
    assert!(shared.trim_start().starts_with("<array count=\"3\""));
}
