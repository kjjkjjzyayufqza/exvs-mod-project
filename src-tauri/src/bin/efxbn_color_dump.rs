fn main() {
    let path = std::env::args().nth(1).expect("path");
    let summary = app_lib::format::effect_folder::parse_efxbn_file(&path).expect("parse");
    println!("effects={}", summary.effect_count);
    println!("lookup_entries={}", summary.control_lookup_entries.len());
    for effect in &summary.effects {
        let color_refs: Vec<_> = effect
            .control_references
            .iter()
            .filter(|r| r.name.starts_with("color"))
            .collect();
        if color_refs.is_empty() {
            continue;
        }
        println!("--- block {} type={} ---", effect.index, effect.effect_type);
        for r in color_refs {
            let mode = if r.selector == 0 {
                "unused"
            } else if r.selector == 1 {
                "const"
            } else {
                "curve"
            };
            let value = if r.selector == 1 {
                summary
                    .control_lookup_entries
                    .get(r.lookup_index as usize)
                    .map(|e| format!("value={:.6}", e.value))
                    .unwrap_or_else(|| "missing-lookup".into())
            } else if r.selector > 1 {
                format!("keys={}", r.selector)
            } else {
                "-".into()
            };
            println!(
                "  {:8} selector={} lookup={} mode={} {}",
                r.name, r.selector, r.lookup_index, mode, value
            );
        }
    }
}
