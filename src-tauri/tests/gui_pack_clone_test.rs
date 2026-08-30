use app_lib::format::fhm2d_pack::repack_fhm2d_from_structure;
use app_lib::format::gui_pack_clone::{
    allocate_gui_clone_hash, clone_character_gui_set, clone_gui_pack_extract,
    gui_clone_extract_relative, gui_clone_hash_key, list_workspace_gui_packs, pack_file_name,
    parse_hash_name_token, parse_pack_hash_from_name, structure_display_name, structure_hash_name,
    vs2_gui_extract_relative, CloneGuiSetRequest, NAVI_GUI_PACKS, NAVI_UNIQUE_ID_HASH,
    PILOT_GUI_FIELDS,
};
use app_lib::format::list_command_pool::{ListData, ListEntry};
use app_lib::format::navilist::{build_navilist_data, parse_navilist_data};
use app_lib::format::param_bin_format::{ParamBinaryHeader, PARAM_BIN_MAGIC};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

#[test]
fn pack_file_name_is_uppercase_hex() {
    assert_eq!(pack_file_name(0x88BD_4DC3), "0x88BD4DC3.fhm2d");
    assert_eq!(
        parse_pack_hash_from_name("0x88BD4DC3.fhm2d"),
        Some(0x88BD_4DC3)
    );
    assert_eq!(
        parse_pack_hash_from_name("0x88bd4dc3.fhm2d"),
        Some(0x88BD_4DC3)
    );
}

#[test]
fn vs2_gui_extract_relative_uniques_shared_parents_and_collapses_duplicate_leaf() {
    assert_eq!(
        vs2_gui_extract_relative(
            "009gui/flash/pilot/p_016_001/st_p_016_001_c01/st_p_016_001_c01",
            "st_p_016_001_c01",
        ),
        "flash/pilot/p_016_001/st_p_016_001_c01"
    );
    assert_eq!(
        vs2_gui_extract_relative("009gui/flash/navi/battle", "navi_bt_016_o01"),
        "flash/navi/battle/navi_bt_016_o01"
    );
    assert_eq!(
        vs2_gui_extract_relative("009gui/flash/pilot", "ex_p_016_001_c01"),
        "flash/pilot/ex_p_016_001_c01"
    );
    assert_eq!(
        vs2_gui_extract_relative(
            "009gui/image/pilot/vs_p_l/vs_p_l_016_001_c01",
            "vs_p_l_016_001_c01",
        ),
        "image/pilot/vs_p_l/vs_p_l_016_001_c01"
    );
}

#[test]
fn gui_clone_extract_relative_replaces_leaf_with_custom_name() {
    assert_eq!(
        gui_clone_extract_relative(
            "009gui/image/navi/navi_pl_s/navi_pl_s_016_o01_c02",
            "navi_pl_s_016_o01_c02",
            "navi_pl_s_016_o01_c0212313dad",
        ),
        "image/navi/navi_pl_s/navi_pl_s_016_o01_c0212313dad"
    );
    assert_eq!(
        gui_clone_extract_relative(
            "009gui/flash/navi/battle",
            "navi_bt_016_o01",
            "navi_bt_016_o01",
        ),
        "flash/navi/battle/navi_bt_016_o01"
    );
    assert_eq!(
        gui_clone_extract_relative(
            "009gui/flash/pilot/p_016_001/st_p_016_001_c01/st_p_016_001_c01",
            "st_p_016_001_c01",
            "wz_rebellion_cutin",
        ),
        "flash/pilot/p_016_001/wz_rebellion_cutin"
    );
}

#[test]
fn allocate_skips_occupied_and_zero() {
    let mut occupied = HashSet::new();
    let first =
        allocate_gui_clone_hash(900_000_004, "st_p_016_001_c01", "lmbCutIn", &occupied).unwrap();
    assert_ne!(first, 0);
    occupied.insert(first);
    let second =
        allocate_gui_clone_hash(900_000_004, "st_p_016_001_c01", "lmbCutIn", &occupied).unwrap();
    assert_ne!(second, first);
    assert_ne!(second, 0);
}

#[test]
fn allocate_uses_custom_structure_name_in_crc_seed() {
    let occupied = HashSet::new();
    let donor = allocate_gui_clone_hash(
        900_000_004,
        "navi_pl_s_016_o01_c02",
        "naviPlSC02",
        &occupied,
    )
    .unwrap();
    let custom = allocate_gui_clone_hash(
        900_000_004,
        "navi_pl_s_016_o01_c0212313dad",
        "naviPlSC02",
        &occupied,
    )
    .unwrap();
    assert_ne!(donor, custom);
    assert_eq!(
        gui_clone_hash_key(
            900_000_004,
            "navi_pl_s_016_o01_c0212313dad",
            "naviPlSC02",
            0
        ),
        "GUI_CLONE|900000004|navi_pl_s_016_o01_c0212313dad|naviPlSC02"
    );
}

#[test]
fn clone_gui_pack_extract_writes_inner_files_with_new_hash_name() {
    let temp = tempfile::tempdir().unwrap();
    let payload = b"GUI-INNER-PAYLOAD";
    let source = write_tiny_ob_fhm2d(temp.path(), 0x88BD_4DC3, payload);
    let extract_dir = temp
        .path()
        .join("009gui")
        .join("flash")
        .join("pilot")
        .join("p_016_001")
        .join("st_p_016_001_c01");

    let cloned = clone_gui_pack_extract(
        &source,
        0x1111_1111,
        &extract_dir,
        Some("custom_wing_cutin"),
    )
    .unwrap();
    assert!(!temp.path().join("009gui").join("0x11111111.fhm2d").exists());
    assert_eq!(
        structure_hash_name(Path::new(&cloned.structure_json_path)).unwrap(),
        "0x11111111"
    );
    assert_eq!(
        structure_display_name(Path::new(&cloned.structure_json_path)).unwrap(),
        "custom_wing_cutin"
    );
    assert_eq!(cloned.structure_name, "custom_wing_cutin");
    assert!(cloned.inner_file_count >= 1);
    let inner = first_extracted_payload(&extract_dir);
    assert_eq!(inner, payload);
    assert_eq!(cloned.new_hash, 0x1111_1111);

    let listed = list_workspace_gui_packs(temp.path()).unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].hash, 0x1111_1111);
    assert_eq!(listed[0].name, "custom_wing_cutin");
    assert_eq!(
        listed[0].workspace_relative.replace('\\', "/"),
        "flash/pilot/p_016_001/st_p_016_001_c01"
    );
}

#[test]
fn parse_hash_name_token_accepts_bare_and_filename() {
    assert_eq!(parse_hash_name_token("0x88BD4DC3"), Some(0x88BD_4DC3));
    assert_eq!(parse_hash_name_token("0x88BD4DC3.fhm2d"), Some(0x88BD_4DC3));
    assert_eq!(
        parse_pack_hash_from_name("0x88bd4dc3.fhm2d"),
        Some(0x88BD_4DC3)
    );
}

#[test]
fn clone_gui_pack_extract_rejects_existing_folder() {
    let temp = tempfile::tempdir().unwrap();
    let source = write_tiny_ob_fhm2d(temp.path(), 0x88BD_4DC3, b"a");
    let extract_dir = temp.path().join("already");
    fs::create_dir_all(&extract_dir).unwrap();
    let err = clone_gui_pack_extract(&source, 0x1111_1111, &extract_dir, None).unwrap_err();
    assert!(err.contains("already exists"));
}

#[test]
fn clone_character_gui_set_preview_and_write_pilot_and_navi() {
    let temp = tempfile::tempdir().unwrap();
    let dpl = temp.path().join("dpl");
    let workspace = temp.path().join("mod");
    fs::create_dir_all(&dpl).unwrap();
    fs::create_dir_all(workspace.join("012list").join("navi_list")).unwrap();

    let donor_cut_in = PILOT_GUI_FIELDS[0].fallback_donor_hash;
    let donor_navi_bt = NAVI_GUI_PACKS[0].fallback_donor_hash;
    let cut_in_payload = b"PILOT-INNER";
    write_tiny_ob_fhm2d(&dpl, donor_cut_in, cut_in_payload);
    for field in NAVI_GUI_PACKS {
        write_tiny_ob_fhm2d(
            &dpl,
            field.fallback_donor_hash,
            format!("NAVI-{}", field.donor_name).as_bytes(),
        );
    }

    let navi_path = workspace
        .join("012list")
        .join("navi_list")
        .join("navi_list.bin");
    fs::write(&navi_path, sample_relena_navi_list(donor_navi_bt)).unwrap();

    let character_list = json!({
        "entries": [
            {
                "entryId": 16_001_001,
                "lmbCutIn": donor_cut_in,
                "lmbPilotClothing": 0,
                "lmbBoost": 0,
                "exPilotClothingLmbHash": 0,
                "vsPL": 0,
                "vsPR": 0,
                "scP": 0
            },
            {
                "entryId": 900_000_004,
                "lmbCutIn": donor_cut_in
            }
        ]
    });

    let preview = clone_character_gui_set(CloneGuiSetRequest {
        dpl_cache_path: dpl.display().to_string(),
        workspace_root: workspace.display().to_string(),
        ob_mod_path: None,
        copy_to_ob_mod: false,
        target_entry_id: 900_000_004,
        donor_entry_id: 16_001_001,
        clone_pilot: true,
        clone_navi: true,
        preview: true,
        selected_field_keys: None,
        structure_names: None,
        character_list: character_list.clone(),
    })
    .unwrap();
    assert!(preview.preview);
    assert_eq!(preview.packs.len(), 1 + NAVI_GUI_PACKS.len());
    assert!(!workspace
        .join("009gui")
        .join(pack_file_name(preview.packs[0].new_hash))
        .exists());
    assert_eq!(
        preview.packs[0].workspace_relative,
        "flash/pilot/p_016_001/st_p_016_001_c01"
    );
    assert_eq!(
        preview.character_field_updates.get("lmbCutIn").copied(),
        Some(preview.packs[0].new_hash)
    );

    let written = clone_character_gui_set(CloneGuiSetRequest {
        dpl_cache_path: dpl.display().to_string(),
        workspace_root: workspace.display().to_string(),
        ob_mod_path: None,
        copy_to_ob_mod: false,
        target_entry_id: 900_000_004,
        donor_entry_id: 16_001_001,
        clone_pilot: true,
        clone_navi: true,
        preview: false,
        selected_field_keys: None,
        structure_names: Some(HashMap::from([(
            "lmbCutIn".to_string(),
            "wz_rebellion_cutin".to_string(),
        )])),
        character_list,
    })
    .unwrap();
    assert!(!written.preview);
    let cut_in = written
        .character_field_updates
        .get("lmbCutIn")
        .copied()
        .unwrap();
    assert_ne!(cut_in, donor_cut_in);
    assert!(!workspace
        .join("009gui")
        .join(pack_file_name(cut_in))
        .exists());
    let extract_dir = PathBuf::from(&written.packs[0].output_path);
    assert_eq!(first_extracted_payload(&extract_dir), cut_in_payload);
    assert_eq!(
        structure_hash_name(Path::new(&written.packs[0].structure_json_path)).unwrap(),
        format!("0x{cut_in:08X}")
    );
    assert_eq!(
        structure_display_name(Path::new(&written.packs[0].structure_json_path)).unwrap(),
        "wz_rebellion_cutin"
    );
    assert_eq!(
        written.packs[0].workspace_relative,
        "flash/pilot/p_016_001/wz_rebellion_cutin"
    );
    assert!(!workspace
        .join("009gui")
        .join("flash")
        .join("pilot")
        .join("p_016_001")
        .join("st_p_016_001_c01")
        .exists());
    let navi_bt_pack = written
        .packs
        .iter()
        .find(|pack| pack.donor_hash == donor_navi_bt)
        .unwrap();
    assert_eq!(
        navi_bt_pack.workspace_relative,
        "flash/navi/battle/navi_bt_016_o01"
    );

    let navi = written.navi.expect("navi result");
    let rebuilt = parse_navilist_data(&fs::read(&navi_path).unwrap()).unwrap();
    assert_eq!(rebuilt.entries.len(), 2);
    let cloned = rebuilt
        .entries
        .iter()
        .find(|entry| entry.entry_id == navi.appended_entry_ids[0])
        .unwrap();
    assert_eq!(
        cloned.commands.get(&NAVI_UNIQUE_ID_HASH).copied(),
        Some(navi.new_character_unique_id)
    );
    assert_ne!(
        cloned.commands.values().find(|&&v| v == donor_navi_bt),
        Some(&donor_navi_bt)
    );
    assert!(cloned
        .commands
        .values()
        .any(|&v| v == navi_bt_pack.new_hash));
    assert_eq!(written.packs[0].bind_target, "character_list.lmbCutIn");
}

#[test]
fn clone_character_gui_set_honors_selected_field_keys() {
    let temp = tempfile::tempdir().unwrap();
    let dpl = temp.path().join("dpl");
    let workspace = temp.path().join("mod");
    fs::create_dir_all(&dpl).unwrap();
    let donor_cut_in = PILOT_GUI_FIELDS[0].fallback_donor_hash;
    let donor_boost = PILOT_GUI_FIELDS[2].fallback_donor_hash;
    write_tiny_ob_fhm2d(&dpl, donor_cut_in, b"CUTIN");
    write_tiny_ob_fhm2d(&dpl, donor_boost, b"BOOST");

    let character_list = json!({
        "entries": [{
            "entryId": 16_001_001,
            "lmbCutIn": donor_cut_in,
            "lmbBoost": donor_boost
        }]
    });

    let written = clone_character_gui_set(CloneGuiSetRequest {
        dpl_cache_path: dpl.display().to_string(),
        workspace_root: workspace.display().to_string(),
        ob_mod_path: None,
        copy_to_ob_mod: false,
        target_entry_id: 900_000_004,
        donor_entry_id: 16_001_001,
        clone_pilot: true,
        clone_navi: true,
        preview: false,
        selected_field_keys: Some(vec!["lmbCutIn".to_string()]),
        structure_names: None,
        character_list,
    })
    .unwrap();
    assert_eq!(written.packs.len(), 1);
    assert_eq!(written.packs[0].field_key, "lmbCutIn");
    assert!(written.navi.is_none());
    assert!(written.character_field_updates.contains_key("lmbCutIn"));
    assert!(!written.character_field_updates.contains_key("lmbBoost"));
    assert_eq!(
        first_extracted_payload(Path::new(&written.packs[0].output_path)),
        b"CUTIN"
    );
    assert!(!workspace
        .join("009gui")
        .join(written.packs[0].new_file_name.as_str())
        .exists());
}

#[test]
fn custom_name_does_not_replace_original_navi_thumbnail_folder() {
    let temp = tempfile::tempdir().unwrap();
    let dpl = temp.path().join("dpl");
    let workspace = temp.path().join("mod");
    fs::create_dir_all(workspace.join("012list").join("navi_list")).unwrap();
    let sc02 = NAVI_GUI_PACKS
        .iter()
        .find(|field| field.camel_key == "naviPlSC02")
        .unwrap();
    write_tiny_ob_fhm2d(&dpl, sc02.fallback_donor_hash, b"THUMB-C02");
    let original = workspace
        .join("009gui")
        .join("image")
        .join("navi")
        .join("navi_pl_s")
        .join("navi_pl_s_016_o01_c02");
    fs::create_dir_all(&original).unwrap();
    fs::write(original.join("KEEP.txt"), b"original").unwrap();
    let navi_path = workspace
        .join("012list")
        .join("navi_list")
        .join("navi_list.bin");
    fs::write(
        &navi_path,
        sample_relena_navi_list(sc02.fallback_donor_hash),
    )
    .unwrap();

    let written = clone_character_gui_set(CloneGuiSetRequest {
        dpl_cache_path: dpl.display().to_string(),
        workspace_root: workspace.display().to_string(),
        ob_mod_path: None,
        copy_to_ob_mod: false,
        target_entry_id: 900_000_004,
        donor_entry_id: 16_001_001,
        clone_pilot: false,
        clone_navi: true,
        preview: false,
        selected_field_keys: Some(vec!["naviPlSC02".to_string()]),
        structure_names: Some(HashMap::from([(
            "naviPlSC02".to_string(),
            "navi_pl_s_016_o01_c0212313dad".to_string(),
        )])),
        character_list: json!({ "entries": [{ "entryId": 16_001_001 }] }),
    })
    .unwrap();

    assert_eq!(written.packs.len(), 1);
    assert_eq!(
        written.packs[0].workspace_relative,
        "image/navi/navi_pl_s/navi_pl_s_016_o01_c0212313dad"
    );
    assert_eq!(
        written.packs[0].structure_name,
        "navi_pl_s_016_o01_c0212313dad"
    );
    let donor_hash = allocate_gui_clone_hash(
        900_000_004,
        "navi_pl_s_016_o01_c02",
        "naviPlSC02",
        &HashSet::new(),
    )
    .unwrap();
    assert_ne!(written.packs[0].new_hash, donor_hash);
    assert_ne!(written.packs[0].new_hash, sc02.fallback_donor_hash);
    assert_eq!(fs::read(original.join("KEEP.txt")).unwrap(), b"original");
    assert_eq!(
        first_extracted_payload(Path::new(&written.packs[0].output_path)),
        b"THUMB-C02"
    );
}

fn write_tiny_ob_fhm2d(dir: &Path, hash: u32, payload: &[u8]) -> PathBuf {
    fs::create_dir_all(dir).unwrap();
    let pack_name = format!("0x{hash:08X}");
    let pack_dir = dir.join(&pack_name);
    fs::create_dir_all(&pack_dir).unwrap();
    fs::write(pack_dir.join("payload.bin"), payload).unwrap();
    let structure = json!({
        "Name": pack_name,
        "HashName": format!("0x{hash:08X}"),
        "Magic": 0xCDB2B7B9u32,
        "UnkCount": 0,
        "Fhm2dTotalCount": 1,
        "SubFileData": [{
            "index": 0,
            "fileType": ".bin",
            "fileIndex": 0,
            "fileUrl": format!(".\\{pack_name}\\payload.bin")
        }],
        "SubFileStructure": [{
            "type": "Item",
            "unk1": "00000000",
            "fileIndex": 0,
            "unk2": "00000000",
            "unk2_1": 0,
            "unk3": 0,
            "unk4": 0,
            "originalFileIndex": 0,
            "Name": "payload.bin"
        }]
    });
    let structure_path = dir.join(format!("{pack_name}_structure.json"));
    fs::write(
        &structure_path,
        serde_json::to_string_pretty(&structure).unwrap(),
    )
    .unwrap();
    let fhm2d_path = dir.join(format!("{pack_name}.fhm2d"));
    repack_fhm2d_from_structure(
        structure_path.to_str().unwrap(),
        fhm2d_path.to_str().unwrap(),
        false,
        None,
    )
    .expect("repack tiny GUI fixture");
    fhm2d_path
}

fn first_extracted_payload(extract_dir: &Path) -> Vec<u8> {
    let mut files = Vec::new();
    fn walk(dir: &Path, files: &mut Vec<PathBuf>) {
        for entry in fs::read_dir(dir).unwrap().flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, files);
                continue;
            }
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if name.ends_with("_structure.json") || name == "meta.bin" {
                continue;
            }
            files.push(path);
        }
    }
    walk(extract_dir, &mut files);
    files.sort();
    fs::read(files.first().expect("extracted inner file")).unwrap()
}

fn sample_relena_navi_list(navi_bt_hash: u32) -> Vec<u8> {
    let mut commands = HashMap::new();
    commands.insert(NAVI_UNIQUE_ID_HASH, 16);
    commands.insert(0x5F9E_BE2A, navi_bt_hash);
    commands.insert(0x692B_6C6E, 0);
    commands.insert(0xFE2E_83D0, 1);
    let mut strings = HashMap::new();
    strings.insert(0xAA6A_29E5, "リリーナ".to_string());
    let data = ListData {
        header: ParamBinaryHeader {
            magic: PARAM_BIN_MAGIC,
            unk_04: 0,
            file_size: 0,
            unk_0c: 0,
            entry_count: 1,
            commands_count: 12,
            entry_size: 0x34,
            unk_1c: 0,
        },
        field_specs: Vec::new(),
        entry_ids: vec![1],
        entries: vec![ListEntry {
            entry_id: 1,
            commands,
            strings,
        }],
        trailing_data: Vec::new(),
        source_entries_raw: Vec::new(),
    };
    build_navilist_data(&data).expect("build navi_list fixture")
}
