use ssbh_data::prelude::{MatlData, ModlData};

fn main() {
    let numdlb = r"E:\XB\extract_tools\test\0\0\3\0\35.numdlb";
    let numatbs = [
        r"E:\XB\extract_tools\test\0\0\3\0\25.numatb",
        r"E:\XB\extract_tools\test\0\0\3\0\26.numatb",
    ];

    // ── MODL: which material_label does each mesh reference? ──
    let modl = ModlData::from_file(numdlb).expect("read numdlb (MODL)");
    println!("=== MODL {numdlb} ===");
    println!("model_name           = {:?}", modl.model_name);
    println!("skeleton_file_name   = {:?}", modl.skeleton_file_name);
    println!("material_file_names  = {:?}", modl.material_file_names);
    println!("mesh_file_name       = {:?}", modl.mesh_file_name);
    println!("entries ({}):", modl.entries.len());
    let mut modl_refs: Vec<String> = Vec::new();
    for e in &modl.entries {
        println!(
            "  mesh={:<24} subindex={:<3} -> material_label={:?}",
            e.mesh_object_name, e.mesh_object_subindex, e.material_label
        );
        modl_refs.push(e.material_label.clone());
    }

    // ── MATL: which material_label / shader_label does each numatb define? ──
    let mut defined: Vec<String> = Vec::new();
    for path in numatbs {
        let matl = MatlData::from_file(path).expect("read numatb (MATL)");
        println!("\n=== MATL {path} ===");
        println!("entries ({}):", matl.entries.len());
        for en in &matl.entries {
            println!(
                "  material_label={:?}  shader_label={:?}",
                en.material_label, en.shader_label
            );
            defined.push(en.material_label.clone());
        }
    }

    // ── Verdict: is every MODL material reference satisfied by a MATL entry? ──
    println!("\n=== VERDICT ===");
    println!("MODL references : {modl_refs:?}");
    println!("MATL defines    : {defined:?}");
    let mut all_ok = true;
    for r in &modl_refs {
        let found = defined.iter().any(|d| d == r);
        println!("  MODL ref {r:?} present in MATL? {found}");
        if !found {
            all_ok = false;
        }
    }
    println!(
        "\nRESULT: {}",
        if all_ok {
            "MATCH - every mesh's material_label resolves to a MATL entry"
        } else {
            "MISMATCH - at least one mesh references a material_label that NO numatb defines"
        }
    );
}
