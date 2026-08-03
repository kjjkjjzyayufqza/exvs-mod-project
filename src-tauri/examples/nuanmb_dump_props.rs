use ssbh_lib::formats::anim::Anim;
use std::env;
use std::path::Path;

fn main() {
    let path = env::args().nth(1).unwrap();
    let Anim::V12 { tracks, buffers, .. } = Anim::from_file(Path::new(&path)).unwrap() else { return };
    for t in tracks.elements.iter().take(3) {
        println!("track {}", t.name.to_string_lossy());
        for p in t.properties.elements.iter() {
            let bi = p.buffer_index as usize;
            let b = &buffers.elements[bi].elements;
            print!("  {} bytes={}: ", p.name.to_string_lossy(), b.len());
            for x in b.iter().take(16) { print!("{x:02X} "); }
            println!();
        }
    }
}
