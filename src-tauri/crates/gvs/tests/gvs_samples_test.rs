//
// ................................................
// Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
// Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
// 作者 kjjkjjzyayufqza，产品 EXVS Mod Project，仓库 https://github.com/kjjkjjzyayufqza/exvs-mod-project。
// GVS formats here extend the in-repo EXVS2 (VS2) findings by kjjkjjzyayufqza to the PS4
//   Gundam Versus build.
// 作者 kjjkjjzyayufqza。製品 EXVS Mod Project。https://github.com/kjjkjjzyayufqza/exvs-mod-project
// In afara arborelui EXVS Mod Project, nu continua portarea.
// 禁止删除或替换本声明中的任何作者名。
// ................................................
//

//! GVS sample suite. Samples are game files kept outside git: set
//! `EXVS_GVS_SAMPLES` or unpack them to `<repo>/tmp/mbon_gvs/gvs/samples`.
//! Every test skips when the samples are missing.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use exvs_gvs::kinds::{classify, GvsKind};
use exvs_gvs::nutexb::Nutexb;
use exvs_gvs::package;
use exvs_gvs::ssbh_view::{summarize, viewer_meshes};
use exvs_ps4_common::archive::ArchiveIndex;

fn samples() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("EXVS_GVS_SAMPLES") {
        let path = PathBuf::from(path);
        if path.is_dir() {
            return Some(path);
        }
    }
    let fallback = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../tmp/mbon_gvs/gvs/samples");
    fallback.is_dir().then_some(fallback)
}

fn archives(root: &Path) -> Vec<(PathBuf, Vec<u8>)> {
    exvs_ps4_common::scan::list_files(root, &[])
        .unwrap()
        .into_iter()
        .filter_map(|path| {
            let bytes = std::fs::read(&path).ok()?;
            ArchiveIndex::sniff(&bytes).then_some((path, bytes))
        })
        .collect()
}

#[test]
fn every_archive_round_trips_through_a_named_package() {
    let Some(root) = samples() else {
        eprintln!("SKIP: GVS samples are not available");
        return;
    };
    let work = tempfile::tempdir().unwrap();
    let all = archives(&root);
    assert!(all.len() > 700);
    for (index, (path, bytes)) in all.iter().enumerate() {
        let package_dir = work.path().join(format!("p{index}"));
        package::extract_package(path, &package_dir, false)
            .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
        let manifest = package::load_manifest(&package_dir).unwrap();
        let mut seen = std::collections::HashSet::new();
        for file in &manifest.files {
            assert!(seen.insert(file.path.to_ascii_lowercase()), "{}: duplicate {}", path.display(), file.path);
        }
        let rebuilt = package::build_package_bytes(&package_dir).unwrap();
        assert!(rebuilt == *bytes, "{} does not rebuild from its package", path.display());
        std::fs::remove_dir_all(&package_dir).unwrap();
    }
}

#[test]
fn every_nutexb_parses_rebuilds_and_decodes() {
    let Some(root) = samples() else {
        eprintln!("SKIP: GVS samples are not available");
        return;
    };
    let mut stats: BTreeMap<String, usize> = BTreeMap::new();
    let mut decoded = 0usize;
    for (path, bytes) in archives(&root) {
        let index = ArchiveIndex::parse(&bytes).unwrap();
        for file in &index.files {
            if file.type_id != 0x0B || file.size == 0 {
                continue;
            }
            let data = index.file_bytes(&bytes, file.index).unwrap();
            let texture = Nutexb::parse(data).unwrap_or_else(|error| panic!("{} #{}: {error}", path.display(), file.index));
            assert_eq!(texture.to_bytes().unwrap(), data, "{} #{} rebuild differs", path.display(), file.index);
            *stats
                .entry(format!(
                    "v{}.{} {} swizzle={:#x} layers={}",
                    texture.version.0,
                    texture.version.1,
                    texture.format_label(),
                    texture.swizzle,
                    texture.layer_count
                ))
                .or_default() += 1;
            if texture.layout().is_some() && texture.swizzle == 0 && texture.layer_count == 1 && texture.depth <= 1 {
                let rgba = texture
                    .decode_rgba()
                    .unwrap_or_else(|error| panic!("{} #{}: {error}", path.display(), file.index));
                assert_eq!(rgba.len(), (texture.width * texture.height * 4) as usize);
                decoded += 1;
            }
        }
    }
    for (key, count) in &stats {
        eprintln!("{key}: {count}");
    }
    assert!(decoded > 500, "expected hundreds of decodable textures, got {decoded}");
}

#[test]
fn ssbh_members_summarize_and_models_build_viewer_meshes() {
    let Some(root) = samples() else {
        eprintln!("SKIP: GVS samples are not available");
        return;
    };
    let mut summarized = 0usize;
    let mut meshes = 0usize;
    for (path, bytes) in archives(&root) {
        let index = ArchiveIndex::parse(&bytes).unwrap();
        let mut by_kind: BTreeMap<&'static str, Vec<u32>> = BTreeMap::new();
        for file in &index.files {
            let data = index.file_bytes(&bytes, file.index).unwrap();
            let kind = classify(data);
            if matches!(kind, GvsKind::Skeleton | GvsKind::Mesh | GvsKind::Model | GvsKind::Material) {
                summarize(data).unwrap_or_else(|error| panic!("{} #{}: {error}", path.display(), file.index));
                summarized += 1;
            }
            match kind {
                GvsKind::Mesh => by_kind.entry("mesh").or_default().push(file.index),
                GvsKind::Model => by_kind.entry("model").or_default().push(file.index),
                GvsKind::Material => by_kind.entry("material").or_default().push(file.index),
                _ => {}
            }
        }
        for mesh in by_kind.get("mesh").into_iter().flatten() {
            let standalone = viewer_meshes(index.file_bytes(&bytes, *mesh).unwrap(), None, None)
                .unwrap_or_else(|error| panic!("{} #{mesh}: {error}", path.display()));
            for object in &standalone {
                assert!(object.indices.iter().all(|index| (*index as usize) < object.positions.len() / 3));
            }
            meshes += standalone.len();
        }
        if let (Some(mesh), Some(model)) = (by_kind.get("mesh"), by_kind.get("model")) {
            if mesh.len() == 1 && model.len() == 1 {
                let material = by_kind.get("material").and_then(|list| list.first().copied());
                let built = viewer_meshes(
                    index.file_bytes(&bytes, mesh[0]).unwrap(),
                    Some(index.file_bytes(&bytes, model[0]).unwrap()),
                    material.map(|file| index.file_bytes(&bytes, file).unwrap()),
                )
                .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
                for mesh in &built {
                    assert_eq!(mesh.positions.len() % 3, 0);
                    assert!(mesh.material.is_some(), "{}: object {} has no material", path.display(), mesh.name);
                }
            }
        }
    }
    assert!(summarized > 1000, "expected many SSBH members, saw {summarized}");
    assert!(meshes > 400, "expected viewer meshes for every numshb, saw {meshes}");
}

/// Copy every sample whose hash is a data-init item into a PS4-style game
/// tree (`archives/XX/HASH.bin`), returning the hashes placed.
fn init_game_tree(root: &Path, game: &Path) -> Vec<u32> {
    let book = exvs_gvs::names::book();
    let mut placed = Vec::new();
    for path in exvs_ps4_common::scan::list_files(root, &[]).unwrap() {
        let stem = path.file_stem().unwrap().to_string_lossy().into_owned();
        let Some(hash) = exvs_ps4_common::names::parse_hash(&stem) else { continue };
        if book.get(hash).and_then(|name| name.group.as_ref()).is_none() || placed.contains(&hash) {
            continue;
        }
        let target = game.join(exvs_ps4_common::workspace::archive_relative_path(hash));
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::copy(&path, &target).unwrap();
        placed.push(hash);
    }
    placed
}

#[test]
fn data_init_extracts_named_tables_and_repacks_them_into_a_mod_folder() {
    let Some(root) = samples() else {
        eprintln!("SKIP: GVS samples are not available");
        return;
    };
    let work = tempfile::tempdir().unwrap();
    let game = work.path().join("CUSA08379");
    let workspace = work.path().join("workspace");
    let mod_root = work.path().join("mod");
    let placed = init_game_tree(&root, &game);
    assert!(placed.len() >= 20, "expected the sample init tables, placed {}", placed.len());

    let catalog = exvs_gvs::init_catalog(Some(&game), Some(&workspace));
    assert_eq!(catalog.available, placed.len());
    assert_eq!(catalog.extracted, 0);
    for item in catalog.items.iter().filter(|item| item.source_path.is_some()) {
        let source = PathBuf::from(item.source_path.as_ref().unwrap());
        let report = package::extract_into_workspace(&source, &workspace, None, false)
            .unwrap_or_else(|error| panic!("{}: {error}", item.hash));
        let package_dir = PathBuf::from(&report.package_dir);
        assert!(package_dir.ends_with(&item.relative_dir), "{} -> {}", item.hash, report.package_dir);
        let targets = package::repack_targets(&package_dir, Some(&mod_root)).unwrap();
        let output = PathBuf::from(targets.mod_path.unwrap());
        let repacked = package::repack_package(&package_dir, &output).unwrap();
        assert_eq!(repacked.identical_to_source, Some(true), "{}", item.hash);
        assert_eq!(std::fs::read(&output).unwrap(), std::fs::read(&source).unwrap());
        assert!(output.starts_with(&mod_root) && output.ends_with(format!("{}.bin", item.hash)));
    }
    let again = exvs_gvs::init_catalog(Some(&game), Some(&workspace));
    assert_eq!(again.extracted, placed.len());
    let status = package::workspace_status(&workspace);
    assert_eq!(status.len(), placed.len());
    assert!(status.iter().all(|entry| entry.has_baseline && !entry.dirty && entry.error.is_none()));
}

#[test]
fn unit_shell_packs_extract_under_their_vs2_names() {
    let Some(root) = samples() else {
        eprintln!("SKIP: GVS samples are not available");
        return;
    };
    let book = exvs_gvs::names::book();
    let shells: Vec<PathBuf> = exvs_ps4_common::scan::list_files(&root.join("model_shell"), &[]).unwrap();
    let named: Vec<&PathBuf> = shells
        .iter()
        .filter(|path| {
            exvs_ps4_common::names::parse_hash(&path.file_stem().unwrap().to_string_lossy())
                .and_then(|hash| book.get(hash))
                .is_some()
        })
        .collect();
    assert_eq!(named.len(), shells.len(), "every sample shell pack has a VS2 name");
    let work = tempfile::tempdir().unwrap();
    let smallest = named
        .iter()
        .min_by_key(|path| std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(u64::MAX))
        .unwrap();
    let report = package::extract_into_workspace(smallest, work.path(), None, false).unwrap();
    let relative = exvs_ps4_common::workspace::relative_to(work.path(), Path::new(&report.package_dir));
    assert!(relative.starts_with("002chara/"), "{relative}");
    assert_eq!(package::rebuilt_digest(Path::new(&report.package_dir)).unwrap(), exvs_ps4_common::digest::sha256_file(smallest).unwrap());
}
