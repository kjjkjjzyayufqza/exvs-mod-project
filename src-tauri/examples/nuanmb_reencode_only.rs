use ssbh_data::anim_data::AnimData;
use std::env;
use std::path::Path;
fn main() {
    let mut args = env::args().skip(1);
    let input = args.next().unwrap();
    let output = args.next().unwrap();
    let mut anim = AnimData::from_file(Path::new(&input)).unwrap();
    anim.name = ssbh_data::anim_data::disk_anim_name_from_path(Path::new(&output));
    let encoded = anim.to_anim_uncompressed().unwrap();
    encoded.write_to_file(Path::new(&output)).unwrap();
    println!("rewrote lossless? bytes will differ but samples should match");
}
