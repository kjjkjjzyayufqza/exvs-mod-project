//! MBON stage port: conversion rules that do not need game files.

use app_lib::mbon::stage_port::info::{placement_csv, plan_param_bytes, ObjectRow};
use app_lib::mbon::stage_port::material::{
    build_matl_pair, surface_of, texture_alpha_is_coverage, MaterialKey, Surface,
};
use app_lib::mbon::stage_port::model::{transform_point, write_model, BuiltMesh, IDENTITY};
use app_lib::mbon::stage_port::stage_list::{add_stage_row, NewStageRow};
use app_lib::mbon::stage_port::texture::{has_alpha_channel, ntp3_to_nutexb};
use app_lib::collision_mesh::{author_collision_shapes, CollisionPrimitive, CollisionSimplifyOptions, CollisionTriMesh};
use app_lib::mbon::stage_port::collision::{mesh_to_hkt, vcl_mesh};
use exvs_mbon::ntp3::Ntp3Texture;
use exvs_mbon::stage::SpawnPlan;
use serde_json::{json, Value};
use ssbh_data::mesh_data::{MeshData, VectorData};
use ssbh_data::modl_data::ModlData;

fn key(surface: Surface, sky: bool) -> MaterialKey {
    MaterialKey {
        texture: "mbon460_1754940a".into(),
        surface,
        double_sided: false,
        sky,
        vertex_opacity: false,
    }
}

#[test]
fn nud_blend_factors_pick_a_surface() {
    assert_eq!(surface_of(0, 0, 0), Surface::Opaque);
    assert_eq!(surface_of(0, 0, 2), Surface::Cutout);
    assert_eq!(surface_of(1, 1, 0), Surface::Blend);
    assert_eq!(surface_of(5, 2, 0), Surface::Additive);
}

#[test]
fn material_flags_tell_coverage_from_mask_alpha() {
    // Heliopolis decal and cutout shaders.
    assert!(texture_alpha_is_coverage(0x1120_0000));
    assert!(texture_alpha_is_coverage(0x1110_1100));
    assert!(texture_alpha_is_coverage(0x1130_0100));
    // Practice outer floor, opaque masked walls, blinking lights, sky.
    assert!(!texture_alpha_is_coverage(0x1144_0000));
    assert!(!texture_alpha_is_coverage(0x1141_0000));
    assert!(!texture_alpha_is_coverage(0x1171_0100));
    assert!(!texture_alpha_is_coverage(0x1100_0000));
}

#[test]
fn material_recipes_pick_the_shipped_shaders() {
    let materials = vec![
        ("a".to_string(), key(Surface::Opaque, false)),
        ("b".to_string(), key(Surface::Blend, false)),
        ("c".to_string(), key(Surface::Opaque, true)),
        ("d".to_string(), key(Surface::Additive, true)),
    ];
    let (nust, maya) = build_matl_pair(&materials).unwrap();
    let shaders: Vec<&str> = nust.entries.iter().map(|entry| entry.shader_label.as_str()).collect();
    assert_eq!(
        shaders,
        ["vstgStandard_VertexColor", "vsngTransparent_BeforeEffect", "vsngSkydome", "vsngSkyTransparent"]
    );
    assert_eq!(nust.entries[0].textures[0].data, "../../textures/mbon460_1754940a");
    assert!(maya.entries.iter().all(|entry| entry.shader_label.is_empty()));
    assert_eq!(maya.entries[3].textures[0].data, "../../textures/mbon460_1754940a");
    let value = serde_json::to_value(&nust).unwrap();
    assert_eq!(value["entries"][3]["blend_states"][0]["data"]["destination_color"], "One");
    let receives_shadow = |entry: &Value| {
        entry["booleans"]
            .as_array()
            .unwrap()
            .iter()
            .any(|flag| flag["param_id"] == "ReceiveShadow" && flag["data"] == true)
    };
    assert!(receives_shadow(&value["entries"][0]), "opaque field geometry receives shadows");
    assert!(!receives_shadow(&value["entries"][2]), "the sky keeps the shipped sky parameters");
}

fn texture(format: u8, width: u16, height: u16, data: Vec<u8>) -> Ntp3Texture {
    Ntp3Texture {
        format,
        width,
        height,
        mip_sizes: vec![data.len() as u32],
        texture_id: 0x1754_940A,
        cube_map: false,
        data,
    }
}

fn mip_table_total(nutexb: &nutexb::NutexbFile) -> u32 {
    nutexb.layer_mipmaps.iter().flat_map(|layer| &layer.mipmap_sizes).sum()
}

#[test]
fn dxt1_blocks_are_copied_as_bc1_srgb() {
    let block = vec![0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0];
    let nutexb = ntp3_to_nutexb(&texture(0, 4, 4, block.clone()), "mbon_test_col", false).unwrap();
    assert_eq!(nutexb.footer.image_format, nutexb::NutexbFormat::BC1Srgb);
    assert_eq!(nutexb.footer.width, 4);
    assert_eq!(nutexb.footer.unk3, 0, "unswizzled like shipped Over Boost textures");
    assert_eq!(nutexb.data, block);
}

#[test]
fn argb_and_ramp_pixels_become_rgba() {
    for format in [14, 17] {
        let nutexb = ntp3_to_nutexb(&texture(format, 1, 1, vec![0x80, 0x10, 0x20, 0x30]), "argb", false).unwrap();
        assert_eq!(nutexb.footer.image_format, nutexb::NutexbFormat::R8G8B8A8Srgb);
        assert_eq!(nutexb.data, vec![0x10, 0x20, 0x30, 0x80]);
    }
}

#[test]
fn padded_small_mips_are_cut_to_block_size() {
    // 8x8 DXT1: 32-byte base level, then 4x4 / 2x2 / 1x1 each padded to 16 bytes.
    let mut padded = texture(0, 8, 8, (0..80).map(|byte| byte as u8).collect());
    padded.mip_sizes = vec![32, 16, 16, 16];
    let nutexb = ntp3_to_nutexb(&padded, "padded", false).unwrap();
    assert_eq!(nutexb.footer.mipmap_count, 4);
    assert_eq!(nutexb.data.len(), 32 + 8 + 8 + 8);
    assert_eq!(mip_table_total(&nutexb) as usize, nutexb.data.len());
    assert_eq!(&nutexb.data[32..40], &padded.data[32..40]);
    assert_eq!(&nutexb.data[40..48], &padded.data[48..56]);
}

#[test]
fn non_square_chains_use_4x4_blocks() {
    // 64x16 DXT1 with 5 mips: 512 + 128 + 32 + 16 (8x2) + 8 (4x1) = 696 bytes.
    let mut wide = texture(0, 64, 16, vec![0xAB; 696]);
    wide.mip_sizes = vec![512, 128, 32, 16, 8];
    let nutexb = ntp3_to_nutexb(&wide, "wide", false).unwrap();
    assert_eq!(nutexb.data.len(), 696);
    assert_eq!(mip_table_total(&nutexb), 696);
}

#[test]
fn cube_maps_and_short_payloads_are_rejected() {
    let mut cube = texture(2, 4, 4, vec![0; 96]);
    cube.cube_map = true;
    assert!(ntp3_to_nutexb(&cube, "cube", false).is_err());
    assert!(ntp3_to_nutexb(&texture(0, 8, 8, vec![0; 8]), "short", false).is_err());
}

#[test]
fn opaque_variants_keep_color_and_force_alpha() {
    // One DXT5 block: alpha endpoints 0x10 / 0x80 with mixed indices, then a color block.
    let block: Vec<u8> = vec![
        0x10, 0x80, 0x24, 0x92, 0x49, 0x24, 0x92, 0x49, 0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
    ];
    let kept = ntp3_to_nutexb(&texture(2, 4, 4, block.clone()), "keep", false).unwrap();
    assert_eq!(kept.data, block);
    let opaque = ntp3_to_nutexb(&texture(2, 4, 4, block.clone()), "opaque", true).unwrap();
    assert_eq!(&opaque.data[..8], &[0xFF, 0xFF, 0, 0, 0, 0, 0, 0]);
    assert_eq!(&opaque.data[8..], &block[8..]);

    let argb = ntp3_to_nutexb(&texture(14, 1, 1, vec![0x20, 0x10, 0x20, 0x30]), "argb", true).unwrap();
    assert_eq!(argb.data, vec![0x10, 0x20, 0x30, 0xFF]);

    assert!(has_alpha_channel(&texture(2, 4, 4, block)));
    assert!(!has_alpha_channel(&texture(0, 4, 4, vec![0; 8])));
}

#[test]
fn plan_param_matches_the_shipped_layout() {
    let plan = SpawnPlan {
        header: [0; 3],
        spawn_pairs: vec![[0.0, 400.0, 100.0, 1.0, 0.0, 400.0, -100.0, 1.0]],
        respawn_points: vec![[0.0, 400.0, 0.0]; 21],
        markers: vec![([200.0, 50.0, 0.0], 1), ([-200.0, 50.0, 0.0], 5)],
        limits: vec![1000.0f32.to_bits()],
    };
    let bytes = plan_param_bytes(&plan).unwrap();
    assert_eq!(bytes.len(), 456, "same size as the shipped 0x16F73C97 plan_param");
    assert_eq!(&bytes[..16], &[0xA9, 0xB8, 0xAC, 0xAF, 1, 0, 0, 0, 2, 0, 0, 0, 21, 0, 0, 0]);
    assert_eq!(u64::from_le_bytes(bytes[0x28..0x30].try_into().unwrap()), 0x78);
    assert_eq!(f32::from_le_bytes(bytes[0x30..0x34].try_into().unwrap()), 1000.0);
    assert_eq!(f32::from_le_bytes(bytes[0x58..0x5C].try_into().unwrap()), 200.0);
    let bad = SpawnPlan {
        limits: Vec::new(),
        ..plan
    };
    assert!(plan_param_bytes(&bad).is_err());
}

#[test]
fn placement_rows_follow_the_shipped_column_order() {
    let text = placement_csv(
        1,
        &[ObjectRow {
            object_number: 0,
            position: [300.0, 0.0, -300.0],
            rotation: [0.0, 90.0, 0.0],
            cast_shadow: true,
        }],
    );
    let lines: Vec<&str> = text.split("\r\n").collect();
    assert!(lines[0].starts_with("VDK_TYPE,SKY,"));
    assert!(lines[0].ends_with("VDK_OBJECTNUMBER,1"));
    assert!(lines[1].starts_with("VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,300.0,"));
    assert!(lines[1].ends_with("VDK_HITPOINT,UNBREAKABLE,VDK_SHADOW_CAST,TRUE"));
}

fn stage_list() -> Value {
    json!({
        "header": {"entryCount": 2},
        "entryIds": [10, 30],
        "entries": [
            {"entryId": 10, "name": "a", "fileName": 100, "selectOrderDefault": 3, "selectOrderAlt": 7, "vsSD": 5},
            {"entryId": 30, "name": "b", "fileName": 300, "selectOrderDefault": 9, "selectOrderAlt": 2, "vsSD": 6}
        ]
    })
}

#[test]
fn stage_row_clones_the_template_and_keeps_ids_sorted() {
    let row = NewStageRow {
        template_entry_id: 30,
        entry_id: 20,
        name: "MBON".into(),
        file_name: 200,
    };
    let (updated, report) = add_stage_row(&stage_list(), &row).unwrap();
    assert_eq!(updated["entryIds"], json!([10, 20, 30]));
    assert_eq!(updated["header"]["entryCount"], 3);
    let added = &updated["entries"][1];
    assert_eq!(added["vsSD"], 6);
    assert_eq!(added["fileName"], 200);
    assert_eq!(report.select_order_default, 10);
    assert_eq!(report.select_order_alt, 8);
}

#[test]
fn stage_row_rejects_duplicate_ids_and_packs() {
    let duplicate_id = NewStageRow {
        template_entry_id: 10,
        entry_id: 30,
        name: "x".into(),
        file_name: 1,
    };
    assert!(add_stage_row(&stage_list(), &duplicate_id).is_err());
    let duplicate_pack = NewStageRow {
        template_entry_id: 10,
        entry_id: 40,
        name: "x".into(),
        file_name: 300,
    };
    assert!(add_stage_row(&stage_list(), &duplicate_pack).is_err());
}

#[test]
fn row_matrices_keep_translation_in_the_last_row() {
    let bind = [[0.0, 0.0, -1.0, 0.0], [0.0, 1.0, 0.0, 0.0], [1.0, 0.0, 0.0, 0.0], [5.0, 0.0, 0.0, 1.0]];
    assert_eq!(transform_point(&bind, [1.0, 0.0, 0.0]), [5.0, 0.0, -1.0]);
    assert_eq!(transform_point(&IDENTITY, [1.0, 2.0, 3.0]), [1.0, 2.0, 3.0]);
}

/// Four walls and a ceiling of a ±500 box, every face wound to face the inside
/// (the MBON `wall_vcl` layout).
fn inward_box() -> CollisionTriMesh {
    let (s, low, high) = (500.0, -300.0, 500.0);
    let vertices = vec![
        [-s, low, -s], [s, low, -s], [s, low, s], [-s, low, s],
        [-s, high, -s], [s, high, -s], [s, high, s], [-s, high, s],
    ];
    let quads: [[u32; 4]; 5] = [
        [0, 1, 5, 4], // z = -s, faces +z
        [1, 2, 6, 5], // x = +s, faces -x
        [2, 3, 7, 6], // z = +s, faces -z
        [3, 0, 4, 7], // x = -s, faces +x
        [4, 5, 6, 7], // ceiling, faces -y
    ];
    let indices = quads
        .iter()
        .flat_map(|&[a, b, c, d]| [a, b, c, a, c, d])
        .collect();
    CollisionTriMesh { vertices, indices }
}

#[test]
fn authored_walls_keep_facing_inward() {
    let mesh = inward_box();
    let authored = author_collision_shapes(&mesh, &CollisionSimplifyOptions::default()).unwrap();
    let mut faces = 0;
    for shape in &authored.shapes {
        for primitive in &shape.primitives {
            let [a, b, c, _] = match primitive {
                CollisionPrimitive::Triangle([a, b, c]) => [*a, *b, *c, *c],
                CollisionPrimitive::Quad(indices) => *indices,
            };
            let [pa, pb, pc] = [a, b, c].map(|index| shape.vertices[index as usize]);
            let e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
            let e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
            let normal = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
            let centre = [(pa[0] + pb[0] + pc[0]) / 3.0, (pa[1] + pb[1] + pc[1]) / 3.0, (pa[2] + pb[2] + pc[2]) / 3.0];
            // Inward means pointing back towards the box axis / below the ceiling.
            let towards_inside = [-centre[0], 100.0 - centre[1], -centre[2]];
            let facing = normal[0] * towards_inside[0] + normal[1] * towards_inside[1] + normal[2] * towards_inside[2];
            assert!(facing > 0.0, "primitive {primitive:?} at {centre:?} faces outward");
            faces += 1;
        }
    }
    assert!(faces >= 5, "every wall and the ceiling survive ({faces} primitives)");
}

#[test]
fn empty_collision_is_rejected_before_havok() {
    let mesh = vcl_mesh(&[]).unwrap();
    assert!(mesh_to_hkt(&mesh, "unused.exe").is_err());
}

fn vector3(data: &VectorData) -> Vec<[f32; 3]> {
    match data {
        VectorData::Vector3(values) => values.iter().map(|value| value.to_array()).collect(),
        other => panic!("expected Vector3, got {other:?}"),
    }
}

#[test]
fn sky_meshes_use_the_shipped_sky_layers() {
    let dir = tempfile::tempdir().unwrap();
    let dome = BuiltMesh {
        name: "sky005_sky_01_0".into(),
        positions: vec![[0.0, 0.0, 0.0], [10.0, 0.0, 0.0], [0.0, 10.0, 0.0]],
        normals: vec![[0.0, 0.0, 1.0]; 3],
        uvs: vec![[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]],
        colors: vec![[1.0; 4]; 3],
        indices: vec![0, 1, 2],
        material: Some(key(Surface::Opaque, true)),
    };
    let cap = BuiltMesh {
        name: "sky006_cap_0".into(),
        material: Some(key(Surface::Blend, true)),
        ..dome.clone()
    };
    let floor = BuiltMesh {
        name: "bf001_floor_0".into(),
        material: Some(key(Surface::Opaque, false)),
        ..dome.clone()
    };
    write_model(dir.path(), "mbon_test_sky", "mbon_test_sky", &[dome, cap, floor]).unwrap();
    let mesh = MeshData::from_file(dir.path().join("mbon_test_sky__maya__.numshb")).unwrap();
    let flags: Vec<(i32, bool, bool)> = mesh
        .objects
        .iter()
        .map(|object| (object.sort_bias, object.disable_depth_test, object.disable_depth_write))
        .collect();
    assert_eq!(flags, [(510, true, false), (610, true, false), (0, false, false)]);
}

#[test]
fn written_model_reads_back_with_shipped_layout() {
    let dir = tempfile::tempdir().unwrap();
    let quad = BuiltMesh {
        name: "bf001_floor_0".into(),
        positions: vec![[0.0, 0.0, 0.0], [10.0, 0.0, 0.0], [0.0, 0.0, 10.0], [10.0, 0.0, 10.0]],
        normals: vec![[0.0, 1.0, 0.0]; 4],
        uvs: vec![[0.0, 0.0], [1.0, 0.0], [0.0, 1.0], [1.0, 1.0]],
        colors: vec![[1.0; 4]; 4],
        indices: vec![0, 2, 1, 1, 2, 3],
        material: Some(key(Surface::Opaque, false)),
    };
    let untextured = BuiltMesh {
        name: "bf001_floor_1".into(),
        material: None,
        ..quad.clone()
    };
    let count = write_model(dir.path(), "mbon_test_base", "mbon_test_base", &[quad, untextured]).unwrap();
    assert_eq!(count, 1, "meshes without a color texture are dropped");
    for suffix in [
        ".numdlb",
        "__maya__.numshb",
        "__maya__.nusktb",
        "__maya__.numatb",
        "__nust__.numatb",
        ".jnttbl",
    ] {
        assert!(dir.path().join(format!("mbon_test_base{suffix}")).is_file(), "{suffix}");
    }
    let modl = ModlData::from_file(dir.path().join("mbon_test_base.numdlb")).unwrap();
    assert_eq!((modl.major_version, modl.minor_version), (1, 7));
    assert_eq!(modl.mesh_file_name, "nusubf/mbon_test_base__maya__.numshb");
    assert_eq!(modl.entries[0].material_label, "mbon_test_base_m000");
    let mesh = MeshData::from_file(dir.path().join("mbon_test_base__maya__.numshb")).unwrap();
    let object = &mesh.objects[0];
    let names: Vec<&str> = object
        .texture_coordinates
        .iter()
        .chain(&object.color_sets)
        .map(|attribute| attribute.name.as_str())
        .collect();
    assert_eq!(names, ["TextureCoordinate0", "HalfFloat2_0", "colorSet0", "colorSet1"]);
    let normals = vector3(&object.normals[0].data);
    let tangents = vector3(&object.tangents[0].data);
    let dot = |a: [f32; 3], b: [f32; 3]| a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (normal, tangent) in normals.iter().zip(&tangents) {
        assert!(dot(*normal, *tangent).abs() < 1e-3, "tangent is orthogonal to the normal");
        assert!((dot(*tangent, *tangent) - 1.0).abs() < 1e-3, "tangent is unit length");
    }
}
