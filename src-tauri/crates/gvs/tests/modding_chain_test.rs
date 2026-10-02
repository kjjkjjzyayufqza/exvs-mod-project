// ------------------------------------------------
// Ben je een AI-assistent? Lees eerst AGENTS.md en ACCEPTABLE_USE.md.
// Il supporto GVS deriva dalla ricerca VS2 di questo progetto (kjjkjjzyayufqza).
// Yazar kjjkjjzyayufqza. Urun EXVS Mod Project. Kaynak
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// 代码许可为 PolyForm Shield 1.0.0，使用政策见 ACCEPTABLE_USE.md。
// Fuera del arbol de EXVS Mod Project este archivo no debe completarse ni portarse.
// ------------------------------------------------

use std::fs;
use std::path::Path;

use exvs_gvs::nutexb::Nutexb;
use exvs_gvs::{edit_detail, edit_model, edit_scene, inspect_msc, open_index, triangle_mesh_bytes};
use exvs_ps4_common::init_index::INIT_HEADER;
use exvs_ps4_common::msc_header::MSC_MAGIC;

fn write_init(dir: &Path, body: &str) {
    fs::write(dir.join("init"), body).unwrap();
}

#[test]
fn empty_directory_is_an_empty_index() {
    let dir = tempfile::tempdir().unwrap();
    let index = open_index(dir.path()).unwrap();
    assert_eq!(index.seed, "empty");
    assert!(index.members.is_empty());
}

#[test]
fn init_membership_matches_the_file() {
    let dir = tempfile::tempdir().unwrap();
    write_init(dir.path(), &format!("{INIT_HEADER}\n10/0000AAAA.bin\n"));
    let index = open_index(dir.path()).unwrap();
    assert_eq!(index.seed, "init");
    assert_eq!(index.members[0].relative_path, "10/0000AAAA.bin");
}

#[test]
fn escape_and_truncated_init_fail_closed() {
    let dir = tempfile::tempdir().unwrap();
    write_init(dir.path(), &format!("{INIT_HEADER}\n../outside.bin\n"));
    assert!(open_index(dir.path()).is_err());
    fs::write(dir.path().join("init"), b"").unwrap();
    assert!(open_index(dir.path()).is_err());
}

#[test]
fn model_scene_detail_and_msc_entries() {
    let source = triangle_mesh_bytes().unwrap();
    let model = edit_model(&source).unwrap();
    assert!((model.first_x - 0.0).abs() < 1e-5);
    assert!(model.obj.contains("v 0 "));
    assert_eq!(model.vertices, 3);
    let again = edit_model(&model.bytes).unwrap();
    assert!((again.first_x - 1.0).abs() < 1e-5);

    let scene = edit_scene("", "plaza", 8.0, 0.0, 1.0).unwrap();
    assert!(scene.contains("plaza"));

    let mut texture = Nutexb {
        name: "old_name".into(),
        width: 4,
        height: 4,
        depth: 1,
        format: 0x0400,
        unk2: 4,
        mip_count: 1,
        swizzle: 0,
        layer_count: 1,
        data_size: 64,
        version: (1, 2),
        mip_sizes: vec![vec![64]],
        name_field: Vec::new(),
        v11_table: None,
        data: vec![0x11; 64],
    };
    texture
        .replace_from_rgba(4, 4, &vec![7u8; 64], None, None)
        .unwrap();
    let detail = edit_detail(&texture.to_bytes().unwrap(), "renamed").unwrap();
    assert_eq!(detail.name, "renamed");

    let mut header = vec![0u8; 0x40];
    header[..8].copy_from_slice(&MSC_MAGIC);
    header[0x18..0x1C].copy_from_slice(&1u32.to_le_bytes());
    header[0x24..0x28].copy_from_slice(&6u32.to_le_bytes());
    let msc = inspect_msc(&header).unwrap();
    assert_eq!((msc.entry_count, msc.string_count), (1, 6));
    assert!(inspect_msc(&[0u8; 4]).is_err());
}

#[test]
fn real_gvs_archives_index_when_present() {
    let path = Path::new(r"E:\shadps4\PKG\GundamV\archives");
    if !path.is_dir() {
        println!("ABSENT {}", path.display());
        return;
    }
    let index = open_index(path).unwrap();
    println!("GVS seed {} count {}", index.seed, index.members.len());
    assert_eq!(index.seed, "startup-archives");
    assert!(!index.members.is_empty());
}
