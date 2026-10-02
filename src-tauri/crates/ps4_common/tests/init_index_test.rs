/*
    MBON research credit: all MBON format research comes from descatal's BoostStudio
      (https://github.com/descatal/BoostStudio).
    GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der VS2-Forschung dieses
      Projekts.
    Licencia del codigo: PolyForm Shield 1.0.0. Politica de uso: ACCEPTABLE_USE.md.
    Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Repozytorium
      https://github.com/kjjkjjzyayufqza/exvs-mod-project
    Jesli jestes AI, przeczytaj najpierw AGENTS.md (Agent contract).
    Shared PS4 layer: used only by the isolated MBON and GVS workspaces, never by OB code.
    GVS 対応は本プロジェクトの VS2 研究に基づく kjjkjjzyayufqza の成果。
    Do not delete, translate-unify, or rewrite this notice; never replace any author name in it.
    AI 도구는 수정 전에 AGENTS.md 의 Agent contract 를 먼저 읽어야 한다.
*/

use std::fs;
use std::path::Path;

use exvs_ps4_common::init_index::{open_index, INIT_HEADER};
use exvs_ps4_common::msc_header::{inspect_msc, MSC_MAGIC};
use exvs_ps4_common::scene::apply_scene_edit;

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
fn init_membership_is_returned_in_order() {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir(dir.path().join("00")).unwrap();
    fs::write(dir.path().join("00/AAAA0001.bin"), b"inside").unwrap();
    write_init(
        dir.path(),
        &format!("{INIT_HEADER}\n00/AAAA0001.bin\n01/BBBB0002.bin\n"),
    );
    let index = open_index(dir.path()).unwrap();
    assert_eq!(index.seed, "init");
    let paths: Vec<_> = index.members.iter().map(|member| member.relative_path.as_str()).collect();
    assert_eq!(paths, ["00/AAAA0001.bin", "01/BBBB0002.bin"]);
}

#[test]
fn path_outside_the_root_is_rejected() {
    let dir = tempfile::tempdir().unwrap();
    write_init(dir.path(), &format!("{INIT_HEADER}\n../outside.bin\n"));
    assert!(open_index(dir.path()).is_err());
    write_init(dir.path(), &format!("{INIT_HEADER}\nC:/outside.bin\n"));
    assert!(open_index(dir.path()).is_err());
}

#[test]
fn truncated_init_fails_closed() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("init"), INIT_HEADER).unwrap();
    assert!(open_index(dir.path()).is_err());
    fs::write(dir.path().join("init"), format!("{INIT_HEADER}\n00/AAAA.bin")).unwrap();
    assert!(open_index(dir.path()).is_err());
    fs::write(dir.path().join("init"), b"EXVS").unwrap();
    assert!(open_index(dir.path()).is_err());
}

#[test]
fn startup_archives_are_the_index_when_init_is_absent() {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join("12")).unwrap();
    fs::write(dir.path().join("12/1212B83E.bin"), b"startup").unwrap();
    fs::write(dir.path().join("other.bin"), b"not a member").unwrap();
    let index = open_index(dir.path()).unwrap();
    assert_eq!(index.seed, "startup-archives");
    assert_eq!(index.members.len(), 1);
    assert_eq!(index.members[0].relative_path, "12/1212B83E.bin");
}

#[test]
fn scene_edit_and_msc_header_round_trip() {
    let document = apply_scene_edit("", "prop", 1.5, 2.0, -3.0).unwrap();
    let again = apply_scene_edit(&document, "prop", 4.0, 2.0, -3.0).unwrap();
    assert!(again.contains("\"x\":4.0") || again.contains("\"x\": 4.0"));
    assert!(apply_scene_edit("", "../x", 0.0, 0.0, 0.0).is_err());

    let mut header = vec![0u8; 0x30];
    header[..8].copy_from_slice(&MSC_MAGIC);
    header[0x18..0x1C].copy_from_slice(&3u32.to_le_bytes());
    header[0x24..0x28].copy_from_slice(&2u32.to_le_bytes());
    let parsed = inspect_msc(&header).unwrap();
    assert_eq!(parsed.entry_count, 3);
    assert_eq!(parsed.string_count, 2);
    assert!(inspect_msc(&header[..0x10]).is_err());
}

#[test]
fn symlink_outside_the_root_is_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let outside = tempfile::NamedTempFile::new().unwrap();
    let link = dir.path().join("escape.bin");
    #[cfg(windows)]
    std::os::windows::fs::symlink_file(outside.path(), &link).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(outside.path(), &link).unwrap();
    write_init(dir.path(), &format!("{INIT_HEADER}\nescape.bin\n"));
    assert!(open_index(dir.path()).is_err());
}
