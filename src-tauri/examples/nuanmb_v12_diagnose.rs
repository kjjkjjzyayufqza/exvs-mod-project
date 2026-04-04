//! Prints which v1.2 track/property/header fails ssbh_data NUANMB decoders (same path as AnimData::from_file).
//!
//! Usage:
//!   cargo run --example nuanmb_v12_diagnose -- "E:\\path\\to\\file.nuanmb"

use binrw::BinReaderExt;
use ssbh_data::anim_data::error::Error as AnimError;
use ssbh_data::anim_data::nuanmb_v12;
use ssbh_lib::formats::anim::Anim;
use std::io::Cursor;

fn decode_by_property(name: &str, header: u32, data: &[u8]) -> Result<(), AnimError> {
    match name {
        "Scale" => match header {
            0x3200 => nuanmb_v12::decode_scale_3200(data).map(|_| ()),
            0x3208 => nuanmb_v12::decode_scale_3208(data).map(|_| ()),
            0x3209 => nuanmb_v12::decode_scale_3209(data).map(|_| ()),
            0x3300 => nuanmb_v12::decode_scale_3300(data).map(|_| ()),
            0x3308 => nuanmb_v12::decode_scale_3308(data).map(|_| ()),
            0x3309 => nuanmb_v12::decode_scale_3309(data).map(|_| ()),
            0x3400 => nuanmb_v12::decode_scale_3400(data).map(|_| ()),
            0x3408 => nuanmb_v12::decode_scale_3408(data).map(|_| ()),
            0x3409 => nuanmb_v12::decode_scale_3409(data).map(|_| ()),
            _ => Ok(()),
        },
        "Rotate" => match header {
            0x4200 => nuanmb_v12::decode_rotate_4200(data).map(|_| ()),
            0x4208 => nuanmb_v12::decode_rotate_4208(data).map(|_| ()),
            0x4209 => nuanmb_v12::decode_rotate_4209(data).map(|_| ()),
            0x4300 => nuanmb_v12::decode_rotate_4300(data).map(|_| ()),
            0x4308 => nuanmb_v12::decode_rotate_4308(data).map(|_| ()),
            0x4309 => nuanmb_v12::decode_rotate_4309(data).map(|_| ()),
            0x4400 => nuanmb_v12::decode_rotate_4400(data).map(|_| ()),
            0x4408 => nuanmb_v12::decode_rotate_4408(data).map(|_| ()),
            0x4409 => nuanmb_v12::decode_rotate_4409(data).map(|_| ()),
            _ => Ok(()),
        },
        "Translate" => match header {
            0x3200 => nuanmb_v12::decode_translate_3200(data).map(|_| ()),
            0x3208 => nuanmb_v12::decode_translate_3208(data).map(|_| ()),
            0x3209 => nuanmb_v12::decode_translate_3209(data).map(|_| ()),
            0x3300 => nuanmb_v12::decode_translate_3300(data).map(|_| ()),
            0x3308 => nuanmb_v12::decode_translate_3308(data).map(|_| ()),
            0x3309 => nuanmb_v12::decode_translate_3309(data).map(|_| ()),
            0x3400 => nuanmb_v12::decode_translate_3400(data).map(|_| ()),
            0x3408 => nuanmb_v12::decode_translate_3408(data).map(|_| ()),
            0x3409 => nuanmb_v12::decode_translate_3409(data).map(|_| ()),
            _ => Ok(()),
        },
        _ => Ok(()),
    }
}

fn main() {
    let path = std::env::args()
        .nth(1)
        .expect("Pass path to .nuanmb");
    let anim = match Anim::from_file(&path) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("ssbh_lib Anim::from_file failed: {e}");
            std::process::exit(1);
        }
    };

    let Anim::V12 {
        tracks,
        buffers,
        final_frame_index,
        unk2,
        ..
    } = anim
    else {
        eprintln!("Expected Anim v1.2");
        std::process::exit(1);
    };

    println!("v1.2 header: final_frame_index={final_frame_index} unk2={unk2}");
    println!("tracks={} buffers={}", tracks.elements.len(), buffers.elements.len());

    for (ti, track) in tracks.elements.iter().enumerate() {
        let tname = track.name.to_string_lossy();
        for (pi, prop) in track.properties.elements.iter().enumerate() {
            let pname = prop.name.to_string_lossy();
            let buf = match buffers.elements.get(prop.buffer_index as usize) {
                Some(b) => b,
                None => {
                    println!(
                        "track[{ti}] {tname:?} prop[{pi}] {pname:?} -> BufferIndexOutOfRange index={}",
                        prop.buffer_index
                    );
                    continue;
                }
            };
            let data = &buf.elements;
            if data.len() < 4 {
                println!(
                    "track[{ti}] {tname:?} prop[{pi}] {pname:?} -> buffer too short len={}",
                    data.len()
                );
                continue;
            }
            let mut r = Cursor::new(data);
            let header: u32 = match r.read_le() {
                Ok(h) => h,
                Err(e) => {
                    println!(
                        "track[{ti}] {tname:?} prop[{pi}] {pname:?} -> header read {e}"
                    );
                    continue;
                }
            };
            if let Err(e) = decode_by_property(&pname, header, data) {
                println!(
                    "FAILED track[{ti}] name={tname:?} prop[{pi}] property={pname:?} header=0x{header:08x} buffer_len={} err={e}",
                    data.len()
                );
                std::process::exit(2);
            }
        }
    }

    println!("All property buffers decoded (dispatch matches ssbh_data create_track_data_v12).");
    eprintln!("Note: If this passes but AnimData::from_file fails, mismatch is elsewhere (e.g. TryFrom).");
}
