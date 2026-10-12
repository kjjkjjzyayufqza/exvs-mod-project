//! Regression fixtures for OB's native sky HDR encoding and vertex opacity.
use app_lib::mbon::stage_port::material::{build_matl_pair, MaterialKey, Surface};
use app_lib::mbon::stage_port::model::{empty_sky_mesh, write_model};
use app_lib::mbon::stage_port::texture::{alpha_stem, sky_nutexb, TextureAlpha};
use exvs_mbon::ntp3::Ntp3Texture;

fn texture(format: u8, width: u16, height: u16, sizes: Vec<u32>, data: Vec<u8>) -> Ntp3Texture {
    Ntp3Texture {
        format,
        width,
        height,
        mip_sizes: sizes,
        data,
        texture_id: 7,
        cube_map: false,
    }
}

#[test]
fn opaque_hdr_alpha_survives_without_the_27x_gain() {
    let bytes = vec![8, 8, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0, 0, 0, 0, 0, 0];
    let output = sky_nutexb(
        &texture(2, 4, 4, vec![16], bytes.clone()),
        "test_skyhdr",
        true,
    )
    .unwrap();
    assert_eq!(output.data, bytes);
    let shader_gain = |alpha: f64| (1.0 + 2.0 * alpha).powi(3);
    assert_eq!(shader_gain(1.0), 27.0);
    assert!(shader_gain(f64::from(output.data[0]) / 255.0) < 1.21);
}

#[test]
fn rgb_only_sky_preserves_all_mips_and_three_color_bc1_pixels() {
    // BC1's three-color mode: index 3 is black. BC3 would decode it as a
    // fourth interpolant, so simply prefixing alpha bytes is not lossless.
    let block = vec![0, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
    let mut data = block.clone();
    data.extend(&block);
    let output = sky_nutexb(&texture(0, 4, 4, vec![8, 8], data), "rgb_sky", true).unwrap();
    assert_eq!(
        output.footer.image_format,
        nutexb::NutexbFormat::R8G8B8A8Srgb
    );
    assert_eq!(output.footer.mipmap_count, 2);
    assert_eq!(output.data, vec![0; (16 + 4) * 4]);
}

#[test]
fn dxt3_sky_keeps_authored_mips_and_hdr_alpha() {
    let red = [0x00, 0xf8, 0, 0, 0, 0, 0, 0];
    let blue = [0x1f, 0, 0, 0, 0, 0, 0, 0];
    let mut data = vec![0x11; 8];
    data.extend(red);
    data.extend([0x22; 8]);
    data.extend(blue);
    let output = sky_nutexb(&texture(1, 4, 4, vec![16, 16], data), "bc2_sky", true).unwrap();
    assert_eq!(&output.data[..4], &[255, 0, 0, 17]);
    assert_eq!(&output.data[64..68], &[0, 0, 255, 34]);
}

#[test]
fn coverage_shader_actually_receives_vertex_opacity_and_empty_sky_stays_hidden() {
    let sky = empty_sky_mesh("coverage".into());
    let key = sky.material.clone().unwrap();
    let (nust, _) = build_matl_pair(&[("empty".into(), key)]).unwrap();
    assert_eq!(nust.entries[0].shader_label, "vsngTransparent_BeforeEffect");
    assert!(sky.colors.iter().all(|color| color[3] == 0.0));
    let directory = tempfile::tempdir().unwrap();
    write_model(directory.path(), "sky", "sky", &[sky]).unwrap();
    let reread =
        ssbh_data::mesh_data::MeshData::from_file(directory.path().join("sky__maya__.numshb"))
            .unwrap();
    assert!(reread.objects[0].disable_depth_test);
    assert_eq!(reread.objects[0].sort_bias, 610);
    let plain = MaterialKey {
        texture: "coverage".into(),
        surface: Surface::Blend,
        double_sided: true,
        sky: true,
        vertex_opacity: false,
    };
    let (nust, _) = build_matl_pair(&[("plain".into(), plain)]).unwrap();
    assert_eq!(nust.entries[0].shader_label, "vsngSkyTransparent");
    assert_ne!(
        alpha_stem("sky", 7, TextureAlpha::Opaque),
        alpha_stem("sky", 7, TextureAlpha::SkyHdr)
    );
}
