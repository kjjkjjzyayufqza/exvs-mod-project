use ssbh_lib::formats::anim::Anim;
use std::env;
use std::path::Path;
fn main() {
    let path = env::args().nth(1).unwrap();
    let Anim::V12 { tracks, buffers, .. } = Anim::from_file(Path::new(&path)).unwrap() else { return };
    for t in tracks.elements.iter() {
        for p in t.properties.elements.iter() {
            if p.name.to_string_lossy() != "Rotate" { continue; }
            let b = &buffers.elements[p.buffer_index as usize].elements;
            if b.len() < 16 { continue; }
            let h = u32::from_le_bytes([b[0],b[1],b[2],b[3]]);
            if matches!(h, 0x4300 | 0x4308 | 0x4409 | 0x4003) {
                println!("{} hdr=0x{h:04X} len={} head={:02X?}",
                    t.name.to_string_lossy(), b.len(), &b[..b.len().min(24)]);
            }
        }
    }
}
