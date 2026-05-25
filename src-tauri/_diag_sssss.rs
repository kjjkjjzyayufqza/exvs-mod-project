use ssbh_data::matl_data::MatlData;
use ssbh_data::modl_data::ModlData;
fn main() {
    let root = r"E:\XB\解包\com\test\0x16F73C97\0\0\sssssccccc\0";
    let modl = ModlData::from_file(&format!("{root}\\sssssccccc.numdlb")).unwrap();
    println!("model_name={}", modl.model_name);
    println!("material_file_names={:?}", modl.material_file_names);
    for e in &modl.entries {
        println!("mesh={} mat={}", e.mesh_object_name, e.material_label);
    }
    for name in ["sssssccccc__nust__.numatb", "sssssccccc__maya__.numatb"] {
        let m = MatlData::from_file(&format!("{root}\\{name}")).unwrap();
        println!("--- {name} entries={} ---", m.entries.len());
        for entry in &m.entries {
            print!("  label={}", entry.material_label);
            let mut refs = vec![];
            for t in entry.textures.iter().chain(entry.textures2.iter()) {
                let s = t.data.trim();
                if !s.is_empty() { refs.push(s.to_string()); }
            }
            println!(" textures={:?}", refs);
        }
    }
}
