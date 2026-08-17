use ssbh_data::skel_data::SkelData;
use std::env;
use std::path::Path;
fn main() {
    let skel = SkelData::from_file(Path::new(&env::args().nth(1).unwrap())).unwrap();
    for (i, b) in skel.bones.iter().enumerate() {
        let parent = b
            .parent_index
            .map(|p| format!("{}({})", skel.bones[p].name, p))
            .unwrap_or_else(|| "-".into());
        if b.name.contains("KOSHI")
            || b.name.contains("MUNE")
            || b.name == "BASE"
            || b.name.contains("SAKOTSU")
            || b.name.starts_with("ATH_IP_KATA")
            || b.name.starts_with("ATH_OR")
        {
            println!("[{i}] {} parent={parent}", b.name);
        }
    }
    // print chain from MUNE1 to root
    let find = |n: &str| skel.bones.iter().position(|b| b.name == n);
    for target in ["MUNE1", "KOSHI", "SAKOTSU_L", "KATA_L", "TE_L"] {
        if let Some(mut i) = find(target) {
            print!("{target} chain: ");
            loop {
                print!("{}", skel.bones[i].name);
                match skel.bones[i].parent_index {
                    Some(p) => {
                        print!(" <- ");
                        i = p;
                    }
                    None => break,
                }
            }
            println!();
        }
    }
}
