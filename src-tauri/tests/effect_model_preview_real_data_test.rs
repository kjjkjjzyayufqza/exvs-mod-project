use std::path::Path;

use app_lib::ssbh_preview::load_model_preview_bundle;

/// A real effect model folder. Effect models are extracted flat: the modl records
/// `nusubf/<name>` paths but the files sit beside the modl.
const EFFECT_MODEL_FOLDER: &str = r"E:\XB\mod\006effect\053gbftry_005tsient_001\0\0\16";

fn skip_unless_fixture_present() -> bool {
    if Path::new(EFFECT_MODEL_FOLDER).is_dir() {
        return false;
    }
    eprintln!("SKIP: real effect model fixture is unavailable: {EFFECT_MODEL_FOLDER}");
    true
}

/// Effect models never ship a NUMATB.
///
/// Every effect `.numdlb` lists `nusubf/<name>__maya__.numatb`, but the reference is
/// vestigial: across the 2,314 `nusubf` folders in the shipped tree there are 2,317
/// `.numshb` and 2,317 `.nusktb` and zero `.numatb`. Effect materials come from the
/// EFXBN model-control parameters, which is why the draw path is the unlit
/// `efxDrawFace` / `efxDrawModel` shader rather than the model's NUMATB.
///
/// Reporting that as a missing file produced one warning per effect model, and the path
/// it printed pointed inside a `nusubf` folder that extracted packs do not even contain.
#[test]
fn effect_model_without_numatb_does_not_report_a_missing_material_file() {
    if skip_unless_fixture_present() {
        return;
    }

    let bundle = load_model_preview_bundle(EFFECT_MODEL_FOLDER).expect("load effect model");

    let missing_material_warnings: Vec<&String> = bundle
        .warnings
        .iter()
        .filter(|warning| warning.contains("Material file listed in model but missing"))
        .collect();

    assert!(
        missing_material_warnings.is_empty(),
        "effect models legitimately have no NUMATB, but got: {missing_material_warnings:?}"
    );
    assert!(bundle.matl.is_none());
    assert!(bundle.matl_paths.is_empty());
}

/// The mesh and skeleton in the same folder must still resolve through the flattened
/// fallback, so silencing the material warning cannot hide a real resolution failure.
#[test]
fn effect_model_resolves_flattened_mesh_and_skeleton() {
    if skip_unless_fixture_present() {
        return;
    }

    let bundle = load_model_preview_bundle(EFFECT_MODEL_FOLDER).expect("load effect model");

    assert!(bundle.mesh_path.ends_with("__maya__.numshb"));
    assert!(bundle
        .skel_path
        .as_deref()
        .is_some_and(|path| path.ends_with("__maya__.nusktb")));
    assert!(!bundle.mesh_path.contains("nusubf"));
}

/// A genuinely missing material must still be reported, and the message has to name the
/// locations that were actually searched instead of only the modl-recorded path.
#[test]
fn missing_material_warning_names_every_searched_location() {
    if skip_unless_fixture_present() {
        return;
    }

    let temp = tempfile::tempdir().expect("temp dir");
    let folder = temp.path();
    for entry in std::fs::read_dir(EFFECT_MODEL_FOLDER).expect("read effect model folder") {
        let entry = entry.expect("dir entry");
        if entry.path().is_file() {
            std::fs::copy(entry.path(), folder.join(entry.file_name())).expect("copy fixture");
        }
    }
    // A sibling NUMATB makes this folder look like a character model, so an unresolved
    // reference is a real problem again.
    std::fs::write(folder.join("decoy.numatb"), b"HBSS").expect("write decoy");

    let bundle = load_model_preview_bundle(folder.to_string_lossy().as_ref())
        .expect("load copied effect model");

    let warning = bundle
        .warnings
        .iter()
        .find(|warning| warning.contains("Material file listed in model but missing"))
        .expect("missing-material warning");
    assert!(
        warning.contains("nusubf/"),
        "warning should name the modl-recorded path: {warning}"
    );
    assert!(
        warning.contains("__maya__.numatb"),
        "warning should name the flattened candidate: {warning}"
    );
}

/// A materialless model must explain itself exactly once. The generic
/// "no material files could be loaded" line is redundant when the folder already
/// reported that it holds no `.numatb`.
#[test]
fn materialless_effect_model_reports_a_single_material_warning() {
    if skip_unless_fixture_present() {
        return;
    }

    let bundle = load_model_preview_bundle(EFFECT_MODEL_FOLDER).expect("load effect model");

    let material_warnings: Vec<&String> = bundle
        .warnings
        .iter()
        .filter(|warning| warning.to_lowercase().contains("material"))
        .collect();

    assert_eq!(
        material_warnings.len(),
        1,
        "expected one material warning, got: {material_warnings:?}"
    );
    assert!(material_warnings[0].contains("no .numatb"));
}
