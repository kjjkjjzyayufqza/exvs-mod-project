use crate::format::fhm2d::Fhm2dFormat;

pub(crate) fn usage() -> String {
    [
        "Usage:",
        r#"  fhm2d-extract "<source.fhm2d>" --output <out_dir> --type <type> --layout <folder|flat>"#,
        r#"  fhm2d-extract "<source.fhm2d>" -o <out_dir> -t <type> -l <folder|flat> [--write-meta-bin]"#,
        "",
        "Required:",
        "  SOURCE_FHM2D          Path to an OB .fhm2d archive",
        "  --output, -o          Output directory for extracted files",
        "  --type, -t            Naming type (no default; must be set explicitly)",
        "  --layout, -l          folder = preserve archive folders; flat = basenames only",
        "",
        "Optional:",
        "  --write-meta-bin      Write decompressed meta.bin into the output directory",
        "  --list-output-name    List payload file name override (stage_list / list)",
        "  -h, --help            Show this help",
        "",
        "Supported types:",
        &format!("  {}", Fhm2dFormat::supported_type_list()),
        "  (also accepts fhm2d_* ids, e.g. fhm2d_motion)",
        "",
        "Layouts:",
        "  folder                Keep SubFileStructure relative paths under out_dir",
        "  flat                  Write all files as basenames under out_dir",
        "",
        "Notes:",
        "  Writes <out_dir>_structure.json next to the output directory.",
        "  Naming warnings are printed to stderr; extraction still succeeds when files were written.",
        "  Agent policy: put --output under repo tmp/fhm2d-extract/<task>/ (see AGENTS.md,",
        "  docs/fhm2d-extract-cli.md, .cursor/rules/fhm2d-extract-artifacts.mdc).",
    ]
    .join("\n")
}
