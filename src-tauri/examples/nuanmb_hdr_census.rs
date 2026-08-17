use ssbh_lib::formats::anim::Anim;
use std::collections::HashMap;
use std::env;
use std::path::Path;

fn main() {
    for path in env::args().skip(1) {
        let Ok(anim) = Anim::from_file(Path::new(&path)) else {
            println!("FAIL {path}");
            continue;
        };
        let Anim::V12 {
            tracks, buffers, ..
        } = anim
        else {
            continue;
        };
        let mut rot: HashMap<u32, usize> = HashMap::new();
        let mut trn: HashMap<u32, usize> = HashMap::new();
        let mut has_cs = 0usize;
        let mut has_vis = 0usize;
        let mut n_limb_translate = 0usize;
        for t in tracks.elements.iter() {
            let name = t.name.to_string_lossy();
            let is_root = matches!(name.as_str(), "GBL_RT" | "CENTER_RT" | "BASE");
            for p in t.properties.elements.iter() {
                let pn = p.name.to_string_lossy();
                let bi = p.buffer_index as usize;
                if bi >= buffers.elements.len() {
                    continue;
                }
                let b = &buffers.elements[bi].elements;
                if b.len() < 4 {
                    continue;
                }
                let h = u32::from_le_bytes([b[0], b[1], b[2], b[3]]);
                match pn.as_str() {
                    "Rotate" => *rot.entry(h).or_default() += 1,
                    "Translate" => {
                        *trn.entry(h).or_default() += 1;
                        if !is_root {
                            n_limb_translate += 1;
                        }
                    }
                    "CompensateScale" => has_cs += 1,
                    "Visibility" => has_vis += 1,
                    _ => {}
                }
            }
        }
        let base = Path::new(&path).file_name().unwrap().to_string_lossy();
        println!("{base}");
        println!(
            "  tracks={} CompScale={has_cs} Vis={has_vis} limbTranslateProps={n_limb_translate}",
            tracks.elements.len()
        );
        print!("  Rotate hdrs:");
        for (h, c) in rot {
            print!(" 0x{h:04X}x{c}");
        }
        println!();
        print!("  Translate hdrs:");
        for (h, c) in trn {
            print!(" 0x{h:04X}x{c}");
        }
        println!();
    }
}
