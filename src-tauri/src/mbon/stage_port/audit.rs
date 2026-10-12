//! Read-only audit of converted static stage resources. EXVS Mod Project, kjjkjjzyayufqza.
//! Agents: read AGENTS.md and .cursor/rules/ai-source-notice.mdc before changing this module.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use nutexb::NutexbFile;
use serde_json::{json, Value};
use ssbh_data::mesh_data::{MeshData, VectorData};
use ssbh_data::modl_data::ModlData;
use ssbh_data::skel_data::SkelData;

fn read(path: &Path) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|error| format!("{}: {error}", path.display()))
}

fn vectors(data: &VectorData) -> (usize, bool) {
    match data {
        VectorData::Vector2(values) => (values.len(), values.iter().all(|v| v.is_finite())),
        VectorData::Vector3(values) => (values.len(), values.iter().all(|v| v.is_finite())),
        VectorData::Vector4(values) => (values.len(), values.iter().all(|v| v.is_finite())),
    }
}

fn require(test: bool, message: impl Into<String>) -> Result<(), String> {
    if test {
        Ok(())
    } else {
        Err(message.into())
    }
}

fn collect(path: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in std::fs::read_dir(path).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir() {
            collect(&path, files)?;
        } else {
            files.push(path);
        }
    }
    files.sort();
    Ok(())
}

fn texture(path: &Path) -> Result<Value, String> {
    let data = read(path)?;
    let file = NutexbFile::read_from_file(path).map_err(|error| error.to_string())?;
    let footer = &file.footer;
    require(
        footer.width > 0 && footer.height > 0 && footer.depth > 0,
        "zero texture dimension",
    )?;
    require(
        footer.mipmap_count > 0 && footer.layer_count > 0,
        "empty texture chain",
    )?;
    require(
        footer.data_size as usize == file.data.len(),
        "texture footer data_size mismatch",
    )?;
    require(
        file.layer_mipmaps.len() == footer.layer_count as usize,
        "texture layer table mismatch",
    )?;
    // The OB fork writes linear DX11 data with unk3=0. The inherited
    // deswizzled_data method always applies Tegra tiling, even to linear data.
    let chain = if footer.unk3 == 0 {
        file.data.clone()
    } else if footer.unk3 == 0x1000 {
        file.deswizzled_data().map_err(|error| error.to_string())?
    } else {
        return Err(format!("unknown texture swizzle flag {}", footer.unk3));
    };
    let format = footer.image_format;
    let mut expected = 0usize;
    for mip in 0..footer.mipmap_count {
        let w = (footer.width >> mip).max(1).div_ceil(format.block_width());
        let h = (footer.height >> mip)
            .max(1)
            .div_ceil(format.block_height());
        let d = (footer.depth >> mip).max(1).div_ceil(format.block_depth());
        expected += (w * h * d * format.bytes_per_pixel() * footer.layer_count) as usize;
    }
    require(
        chain.len() == expected,
        format!("texture mip chain: {} != {expected}", chain.len()),
    )?;
    if footer.version == (1, 2) {
        require(
            data.len() == file.data.len() + 64 * footer.layer_count as usize + 112,
            "unaccounted nutexb bytes",
        )?;
    }
    let name = footer.string.to_string();
    require(
        name == path.file_stem().unwrap().to_string_lossy(),
        "texture footer/file stem mismatch",
    )?;
    Ok(
        json!({"bytes":data.len(),"dimensions":[footer.width,footer.height,footer.depth],
        "format":format!("{:?}",format),"mips":footer.mipmap_count,"layers":footer.layer_count,
        "name":name,"version":footer.version,"linearBytes":chain.len(),"swizzleFlag":footer.unk3}),
    )
}

fn mesh(path: &Path, sky: bool) -> Result<Value, String> {
    let file = MeshData::from_file(path).map_err(|error| error.to_string())?;
    require(
        file.is_vs2 && (file.major_version, file.minor_version) == (1, 8),
        "mesh is not VS2/OB v1.8",
    )?;
    let mut names = BTreeSet::new();
    let mut vertices = 0usize;
    let mut indices = 0usize;
    let mut objects = Vec::new();
    for object in &file.objects {
        require(
            names.insert((&object.name, object.subindex)),
            "duplicate mesh object identity",
        )?;
        let count = object.vertex_count().map_err(|error| error.to_string())?;
        require(
            object.vertex_indices.len() % 3 == 0,
            "index buffer is not triangles",
        )?;
        require(
            object
                .vertex_indices
                .iter()
                .all(|index| (*index as usize) < count),
            "mesh index out of bounds",
        )?;
        require(
            object.bone_influences.is_empty(),
            "stage rigid mesh unexpectedly has skin weights",
        )?;
        let attributes = object
            .positions
            .iter()
            .chain(&object.normals)
            .chain(&object.binormals)
            .chain(&object.tangents)
            .chain(&object.texture_coordinates)
            .chain(&object.color_sets);
        let mut attr_names = BTreeSet::new();
        for attribute in attributes {
            let (len, finite) = vectors(&attribute.data);
            require(
                len == count && finite,
                format!(
                    "{}: invalid vertex attribute {}",
                    object.name, attribute.name
                ),
            )?;
            require(
                attr_names.insert(attribute.name.clone()),
                "duplicate vertex attribute name",
            )?;
        }
        if sky {
            require(
                object.disable_depth_test && matches!(object.sort_bias, 510 | 610),
                "incorrect sky depth/sort flags",
            )?;
        } else {
            require(
                !object.disable_depth_test && object.sort_bias == 0,
                "field mesh has sky flags",
            )?;
        }
        if object.name == "SKY_TRNSP_EMPTY_SOURCE" {
            let alpha = object
                .texture_coordinates
                .iter()
                .find(|a| a.name == "HalfFloat2_0")
                .ok_or("empty sky alpha attribute absent")?;
            require(
                matches!(&alpha.data,VectorData::Vector4(v) if v.iter().all(|c|c.w==0.0)),
                "empty sky is not zero alpha",
            )?;
        }
        vertices += count;
        indices += object.vertex_indices.len();
        objects.push(json!({"name":object.name,"subindex":object.subindex,"vertices":count,
            "indices":object.vertex_indices.len(),"sortBias":object.sort_bias,"disableDepthTest":object.disable_depth_test,
            "disableDepthWrite":object.disable_depth_write,"attributes":attr_names}));
    }
    Ok(
        json!({"version":[file.major_version,file.minor_version],"isVs2":file.is_vs2,
        "vertices":vertices,"indices":indices,"objects":objects}),
    )
}

fn material(path: &Path, root: &Path) -> Result<Value, String> {
    let matl = super::material::read_matl(path)?;
    let mut labels = BTreeSet::new();
    let mut entries = Vec::new();
    for entry in &matl.entries {
        require(
            labels.insert(&entry.material_label),
            "duplicate material label",
        )?;
        let value = serde_json::to_value(entry).map_err(|error| error.to_string())?;
        for param in value["textures"].as_array().into_iter().flatten() {
            let reference = param["data"]
                .as_str()
                .ok_or("non-string texture parameter")?;
            require(!reference.is_empty(), "empty texture reference")?;
            let name = reference
                .replace('\\', "/")
                .rsplit('/')
                .next()
                .unwrap()
                .to_string();
            require(
                root.join("0/0/textures")
                    .join(format!("{name}.nutexb"))
                    .is_file(),
                format!("texture {reference} missing"),
            )?;
        }
        entries.push(value);
    }
    Ok(json!({"version":[matl.major_version,matl.minor_version],"entries":entries}))
}

fn model(path: &Path) -> Result<Value, String> {
    let file = ModlData::from_file(path).map_err(|error| error.to_string())?;
    require(
        (file.major_version, file.minor_version) == (1, 7),
        "model is not v1.7",
    )?;
    let parent = path.parent().unwrap();
    let resolve = |name: &str| parent.join(name.replace('\\', "/").rsplit('/').next().unwrap());
    let mesh =
        MeshData::from_file(resolve(&file.mesh_file_name)).map_err(|error| error.to_string())?;
    require(
        resolve(&file.skeleton_file_name).is_file(),
        "model skeleton missing",
    )?;
    let skeleton = SkelData::from_file(resolve(&file.skeleton_file_name)).map_err(|e|e.to_string())?;
    let bone_names: BTreeSet<_> = skeleton.bones.iter().map(|b|b.name.as_str()).collect();
    for object in &mesh.objects {
        require(object.parent_bone_name.is_empty() || bone_names.contains(object.parent_bone_name.as_str()),
            "rigid mesh parent bone missing from skeleton")?;
    }
    if !skeleton.bones.is_empty() {
        require(file.animation_file_name.as_ref().is_some_and(|p|resolve(p).is_file()),
            "rigid animated model has no animation")?;
        let animation = ssbh_data::anim_data::AnimData::from_file(resolve(file.animation_file_name.as_ref().unwrap()))
            .map_err(|e|e.to_string())?;
        require(animation.groups.iter().filter(|g|g.group_type==ssbh_data::anim_data::GroupType::Transform)
            .flat_map(|g|&g.nodes).all(|n|bone_names.contains(n.name.as_str())),
            "animation targets a missing bone")?;
    }
    let identities: BTreeSet<_> = mesh.objects.iter().map(|o| (&o.name, o.subindex)).collect();
    let mut labels = BTreeSet::new();
    for name in &file.material_file_names {
        let mat = super::material::read_matl(&resolve(name))?;
        labels.extend(mat.entries.into_iter().map(|e| e.material_label));
    }
    require(
        file.entries.len() == mesh.objects.len(),
        "model/mesh entry count mismatch",
    )?;
    for entry in &file.entries {
        require(
            identities.contains(&(&entry.mesh_object_name, entry.mesh_object_subindex)),
            "model mesh target missing",
        )?;
        require(
            labels.contains(&entry.material_label),
            "model material target missing",
        )?;
    }
    Ok(
        json!({"version":[file.major_version,file.minor_version],"entries":file.entries,
        "mesh":file.mesh_file_name,"skeleton":file.skeleton_file_name,"materials":file.material_file_names,
        "animation":file.animation_file_name,"animationExists":file.animation_file_name.as_ref().is_some_and(|p|resolve(p).is_file())}),
    )
}

pub fn stage(root: &Path) -> Result<Value, String> {
    let mut files = Vec::new();
    collect(root, &mut files)?;
    let mut entries = Vec::new();
    let mut errors = Vec::new();
    let mut counts = BTreeMap::new();
    for path in files {
        let relative = path
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        *counts.entry(ext.to_string()).or_insert(0usize) += 1;
        let check=match ext {
            "numshb"=>mesh(&path,relative.contains("/sky/")),
            "numatb"=>material(&path,root),
            "numdlb"=>model(&path),
            "nusktb"=>SkelData::from_file(&path).map_err(|e|e.to_string()).and_then(|s|{
                require((s.major_version,s.minor_version)==(1,0),"stage skeleton must be v1.0")?;
                let names:BTreeSet<_>=s.bones.iter().map(|b|&b.name).collect();
                require(names.len()==s.bones.len(),"duplicate skeleton bone")?;
                require(s.bones.iter().enumerate().all(|(i,b)|b.transform.is_finite()
                    && b.parent_index.is_none_or(|p|p<i)),"invalid skeleton transform/parent")?;
                Ok(json!({"version":[s.major_version,s.minor_version],"bones":s.bones.len()}))}),
            "nuanmb"=>crate::ssbh_motion_interchange::read_nuanmb_as_motion_clip(&path,
                &path.with_extension("nusktb"),path.file_stem().unwrap().to_string_lossy().into_owned())
                .map_err(|e|e.to_string()).map(|c|json!({"frames":c.frames.len(),"bones":c.skeleton.bones.len()})),
            "nutexb"=>texture(&path),
            "jnttbl"=>read(&path).and_then(|b|{require(b.is_empty(),"static joint table is not empty")?;Ok(json!({"bytes":0}))}),
            "csv"=>read(&path).and_then(|b|{let text=std::str::from_utf8(&b).map_err(|e|e.to_string())?;
                require(!text.contains('\0'),"CSV has embedded NUL")?;Ok(json!({"bytes":b.len(),"lines":text.lines().count()}))}),
            "hkt"=>read(&path).and_then(|b|{require(b.len()>=8 && b[4..8]==*b"TAG0","HKT is not a Havok tagfile")?;Ok(json!({"bytes":b.len(),"deepCheck":"audit-hkt"}))}),
            "spbin"=>read(&path).map(|b|json!({"bytes":b.len(),"magic":b.iter().take(4).copied().collect::<Vec<_>>(),"deepCheck":"independent plan decoder"})),
            other=>Err(format!("unclassified stage resource extension {other}")),
        };
        match check {
            Ok(result) => entries.push(json!({"path":relative,"status":"PASS","data":result})),
            Err(error) => {
                errors.push(json!({"path":relative,"error":error}));
                entries.push(json!({"path":relative,"status":"FAIL","error":error}));
            }
        }
    }
    Ok(
        json!({"valid":errors.is_empty(),"root":root,"counts":counts,"files":entries,"errors":errors}),
    )
}

pub fn hkt(source: &Path, output: &Path) -> Result<Value, String> {
    std::fs::create_dir_all(output).map_err(|e| e.to_string())?;
    let config = crate::havok_cli::HavokCliConfig::detect().ok_or("Havok tools not found")?;
    let xml =
        crate::havok_cli::convert_hkt_bytes_to_xml(&config.filter_manager_path, &read(source)?)?;
    std::fs::write(output.join("collision.xml"), &xml).map_err(|e| e.to_string())?;
    let obj = output.join("collision.obj");
    let summary = crate::havok_mesh_export::havok_xml_to_obj(&xml, &obj)?;
    Ok(json!({"source":source,"xml":output.join("collision.xml"),"obj":obj,"summary":summary}))
}

/// Recover the authored opacity curve independently from the original NUD.
fn source_sky_alpha_curve(
    stage: &exvs_mbon::stage::StagePackage,
    id: u32,
) -> Result<Vec<(f32, f32)>, String> {
    let mut samples = Vec::new();
    let mut meshes = Vec::new();
    for model in &stage.models {
        let nud = exvs_mbon::nud::Nud::parse(&model.bytes).map_err(|e| e.to_string())?;
        for buffer in nud.mesh_buffers(&model.bytes).map_err(|e| e.to_string())? {
            if !buffer.texture_ids.contains(&id) {
                continue;
            }
            let count = buffer.positions.len() / 3;
            require(
                buffer.uvs.len() == count * 2 && buffer.colors.len() == count * 4,
                "source sky UV/color lengths differ",
            )?;
            for (uv, color) in buffer
                .uvs
                .chunks_exact(2)
                .zip(buffer.colors.chunks_exact(4))
            {
                require(
                    color[..3] == [1.0, 1.0, 1.0]
                        && uv[1].is_finite()
                        && color[3].is_finite()
                        && (0.0..=1.0).contains(&color[3]),
                    "source sky fade requires white RGB and finite opacity",
                )?;
                samples.push((uv[1], color[3]));
            }
            meshes.push(buffer);
        }
    }
    samples.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut curve: Vec<(f32, f32)> = Vec::new();
    for sample in samples {
        if let Some(last) = curve.last() {
            if last.0 == sample.0 {
                require(
                    last.1 == sample.1,
                    "source sky opacity is ambiguous at equal V",
                )?;
                continue;
            }
        }
        curve.push(sample);
    }
    require(
        curve.len() >= 2 && curve.first().unwrap().0 == 0.0 && curve.last().unwrap().0 == 1.0,
        "source sky fade must cover exactly V=0..1",
    )?;
    for buffer in meshes {
        for tri in buffer.indices.chunks_exact(3) {
            let v: Vec<_> = tri
                .iter()
                .map(|i| {
                    buffer
                        .uvs
                        .get(*i as usize * 2 + 1)
                        .copied()
                        .ok_or("source sky triangle index out of range")
                })
                .collect::<Result<_, _>>()?;
            let lo = v.iter().copied().fold(f32::INFINITY, f32::min);
            let hi = v.iter().copied().fold(f32::NEG_INFINITY, f32::max);
            require(
                !curve.iter().any(|k| k.0 > lo && k.0 < hi),
                "source sky triangle crosses an opacity breakpoint",
            )?;
        }
    }
    Ok(curve)
}

/// Independent expected chains/field layout; deliberately does not call the converters.
pub fn source(source: &Path, root: &Path, report: &Path) -> Result<Value, String> {
    use exvs_mbon::{ntp3::Ntp3, stage::StagePackage};
    let stage = StagePackage::read_path(source).map_err(|e| e.to_string())?;
    let ntp = Ntp3::parse(&stage.textures).map_err(|e| e.to_string())?;
    let by_id: BTreeMap<_, _> = ntp.textures.iter().map(|t| (t.texture_id, t)).collect();
    let slug = root.file_name().unwrap().to_string_lossy();
    let prefix = format!("{slug}_");
    let mut textures = Vec::new();
    for entry in std::fs::read_dir(root.join("0/0/textures")).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        let stem = path.file_stem().unwrap().to_string_lossy();
        let suffix = stem
            .strip_prefix(&prefix)
            .ok_or("unexpected texture prefix")?;
        let opaque = suffix.ends_with("_o");
        let sky_hdr = suffix.ends_with("_skyhdr");
        let sky_rgb = suffix.ends_with("_sky0");
        let sky_fade = suffix.ends_with("_skyfade");
        let digits = suffix
            .strip_suffix("_o")
            .or_else(|| suffix.strip_suffix("_skyhdr"))
            .or_else(|| suffix.strip_suffix("_sky0"))
            .or_else(|| suffix.strip_suffix("_skyfade"))
            .unwrap_or(suffix);
        let id = u32::from_str_radix(digits, 16).map_err(|e| e.to_string())?;
        let input = by_id
            .get(&id)
            .ok_or("converted texture GIDX absent from source")?;
        let output = NutexbFile::read_from_file(&path).map_err(|e| e.to_string())?;
        require(
            output.footer.width == u32::from(input.width)
                && output.footer.height == u32::from(input.height)
                && output.footer.mipmap_count == input.mip_count() as u32,
            "source/target dimensions or mip count mismatch",
        )?;
        require(
            output.footer.depth == 1 && output.footer.layer_count == 1 && output.footer.unk3 == 0,
            "target texture is not a linear single-layer 2D image",
        )?;
        let format = input.format;
        let decoded_sky = sky_fade || sky_rgb || (sky_hdr && matches!(format, 0 | 1));
        let expected_format = if decoded_sky {
            nutexb::NutexbFormat::R8G8B8A8Srgb
        } else {
            match format {
                0 => nutexb::NutexbFormat::BC1Srgb,
                1 | 2 => nutexb::NutexbFormat::BC3Srgb,
                14 | 17 => nutexb::NutexbFormat::R8G8B8A8Srgb,
                _ => return Err(format!("unsupported source format {format}")),
            }
        };
        require(
            output.footer.image_format == expected_format,
            "source/target GPU format mismatch",
        )?;
        let mut record = json!({"path":path,"gidx":id,"sourceFormat":format,"opaque":opaque,
            "skyHdr":sky_hdr,"skyRgbGainOne":sky_rgb || (sky_hdr && format==0),"skyVertexAlphaBaked":sky_fade});
        if decoded_sky {
            let curve = if sky_fade {
                source_sky_alpha_curve(&stage, id)?
            } else {
                Vec::new()
            };
            let mut expected = Vec::new();
            let mut at = 0usize;
            for (mip, stored) in input.mip_sizes.iter().enumerate() {
                let width = (input.width >> mip).max(1);
                let height = (input.height >> mip).max(1);
                let single = exvs_mbon::ntp3::Ntp3Texture {
                    format,
                    width,
                    height,
                    mip_sizes: vec![*stored],
                    texture_id: id,
                    cube_map: false,
                    data: input
                        .data
                        .get(at..at + *stored as usize)
                        .ok_or("source sky mip truncated")?
                        .to_vec(),
                };
                let pixels = if format == 17 {
                    single
                        .data
                        .chunks_exact(4)
                        .take(usize::from(width) * usize::from(height))
                        .flat_map(|p| [p[1], p[2], p[3], p[0]])
                        .collect::<Vec<_>>()
                } else {
                    single.decode_rgba().map_err(|e| e.to_string())?
                };
                for (index, p) in pixels.chunks_exact(4).enumerate() {
                    let alpha = if sky_fade {
                        let v = (index / usize::from(width)) as f64 / f64::from(height)
                            + 0.5 / f64::from(height);
                        let upper = curve
                            .iter()
                            .position(|k| f64::from(k.0) >= v)
                            .unwrap_or(curve.len() - 1)
                            .max(1);
                        let (v0, a0) = curve[upper - 1];
                        let (v1, a1) = curve[upper];
                        let fraction =
                            ((v - f64::from(v0)) / (f64::from(v1) - f64::from(v0))).clamp(0.0, 1.0);
                        (f64::from(p[3])
                            * (f64::from(a0) + fraction * (f64::from(a1) - f64::from(a0))))
                        .round() as u8
                    } else if sky_rgb || format == 0 {
                        0
                    } else {
                        p[3]
                    };
                    expected.extend_from_slice(&[p[0], p[1], p[2], alpha]);
                }
                at += *stored as usize;
            }
            require(
                output.data == expected,
                "all authored sky mip RGBA bytes differ",
            )?;
            record["comparison"] = json!(if sky_fade {
                "ALL_MIP_RGB_EQUAL_ALPHA_EQUALS_SOURCE_NUD_CURVE"
            } else {
                "ALL_AUTHORED_SKY_MIP_RGBA_BYTES_EQUAL"
            });
            if sky_fade {
                record["sourceVertexAlphaCurve"] = json!(curve);
            }
            record["comparedBytes"] = json!(expected.len());
        } else if format == 1 {
            let mut original = input.decode_rgba().map_err(|e| e.to_string())?;
            if opaque {
                for p in original.chunks_exact_mut(4) {
                    p[3] = 255;
                }
            }
            let decoded =
                image_dds::image_from_dds(&output.to_dds().map_err(|e| e.to_string())?, 0)
                    .map_err(|e| e.to_string())?
                    .into_raw();
            require(
                original.len() == decoded.len(),
                "BC2/BC3 decoded pixel length mismatch",
            )?;
            let absolute: Vec<_> = original
                .iter()
                .zip(&decoded)
                .map(|(a, b)| a.abs_diff(*b))
                .collect();
            record["comparison"] = json!("LOSSY_BC2_TO_BC3_MIPS_REGENERATED");
            record["baseRgbaMaxError"] = json!(absolute.iter().max().copied().unwrap_or(0));
            record["baseRgbaMeanAbsoluteError"] = json!(
                absolute.iter().map(|v| f64::from(*v)).sum::<f64>() / absolute.len().max(1) as f64
            );
        } else {
            let mut expected = Vec::new();
            let mut at = 0usize;
            for (mip, stored) in input.mip_sizes.iter().enumerate() {
                let w = (usize::from(input.width) >> mip).max(1);
                let h = (usize::from(input.height) >> mip).max(1);
                let size = match format {
                    0 => w.div_ceil(4) * h.div_ceil(4) * 8,
                    2 => w.div_ceil(4) * h.div_ceil(4) * 16,
                    _ => w * h * 4,
                };
                require(size <= *stored as usize, "source mip stored size too small")?;
                expected.extend_from_slice(
                    input
                        .data
                        .get(at..at + size)
                        .ok_or("source mip out of range")?,
                );
                at += *stored as usize;
            }
            if format == 2 && opaque {
                for block in expected.chunks_exact_mut(16) {
                    block[..8].copy_from_slice(&[255, 255, 0, 0, 0, 0, 0, 0]);
                }
            }
            if matches!(format, 14 | 17) {
                expected = expected
                    .chunks_exact(4)
                    .flat_map(|p| [p[1], p[2], p[3], if opaque { 255 } else { p[0] }])
                    .collect();
            }
            require(
                output.data == expected,
                format!("GIDX {id:08x}: source-to-target texture bytes differ"),
            )?;
            record["comparison"] = json!("ALL_MIP_BYTES_EQUAL_EXPECTED_TRANSFORMATION");
            record["sourcePaddingRemoved"] = json!(input.data.len() - expected.len());
            record["comparedBytes"] = json!(expected.len());
        }
        textures.push(record);
    }
    // Exact little-endian target field layout from the source table values.
    let p = &stage.spawn_plan;
    require(
        p.limits.len() == 1,
        "source spawn plan has multiple limit words",
    )?;
    let mut plan = Vec::new();
    for word in [
        0xafacb8a9,
        p.spawn_pairs.len() as u32,
        p.markers.len() as u32,
        p.respawn_points.len() as u32,
    ] {
        plan.extend_from_slice(&word.to_le_bytes());
    }
    let pairs_at = 56u64;
    let markers_at = pairs_at + p.spawn_pairs.len() as u64 * 32;
    let respawn_at = markers_at + p.markers.len() as u64 * 16;
    for offset in [48, pairs_at, markers_at, respawn_at] {
        plan.extend_from_slice(&offset.to_le_bytes());
    }
    plan.extend_from_slice(&p.limits[0].to_le_bytes());
    plan.extend_from_slice(&0u32.to_le_bytes());
    for pair in &p.spawn_pairs {
        for v in pair {
            require(v.is_finite(), "nonfinite spawn")?;
            plan.extend_from_slice(&v.to_le_bytes());
        }
    }
    for (pos, _) in &p.markers {
        for v in pos {
            plan.extend_from_slice(&v.to_le_bytes());
        }
        plan.extend_from_slice(&0u32.to_le_bytes());
    }
    for pos in &p.respawn_points {
        for v in pos {
            plan.extend_from_slice(&v.to_le_bytes());
        }
        plan.extend_from_slice(&0u32.to_le_bytes());
    }
    require(
        read(&root.join("0/0/info/plan_param.spbin"))? == plan,
        "plan_param differs from expected source table fields",
    )?;
    let port: Value = serde_json::from_slice(&read(report)?).map_err(|e| e.to_string())?;
    let mapping: BTreeMap<_, _> = port["objects"]
        .as_array()
        .ok_or("missing object map")?
        .iter()
        .enumerate()
        .map(|(i, o)| (o["mbonObject"].as_u64().unwrap() as usize, i))
        .collect();
    let csv = String::from_utf8(read(&root.join("0/0/info/placement.csv"))?)
        .map_err(|e| e.to_string())?;
    require(
        csv.ends_with("\r\n") && csv.matches('\n').count() == csv.matches("\r\n").count(),
        "placement is not CRLF terminated",
    )?;
    let mut actual = Vec::new();
    let mut sky_count = 0;
    for line in csv.lines() {
        let fields: Vec<_> = line.split(',').collect();
        require(fields.len() % 2 == 0, "placement key/value count mismatch")?;
        let row: BTreeMap<_, _> = fields.chunks_exact(2).map(|p| (p[0], p[1])).collect();
        if row.get("VDK_TYPE") == Some(&"SKY") {
            sky_count += 1;
            require(
                row["VDK_OBJECTNUMBER"]
                    .parse::<usize>()
                    .map_err(|e| e.to_string())?
                    == mapping.len(),
                "sky placement object number mismatch",
            )?;
            continue;
        }
        let number = row["VDK_OBJECTNUMBER"]
            .parse::<usize>()
            .map_err(|e| e.to_string())?;
        let mut values = Vec::new();
        for key in [
            "VDK_POSITION_X",
            "VDK_POSITION_Y",
            "VDK_POSITION_Z",
            "VDK_ROTATION_X",
            "VDK_ROTATION_Y",
            "VDK_ROTATION_Z",
        ] {
            values.push(
                row[key]
                    .parse::<f32>()
                    .map_err(|e| e.to_string())?
                    .to_bits(),
            );
        }
        actual.push((number, values, row["VDK_SHADOW_CAST"].to_string()));
    }
    let mut expected = Vec::new();
    for p in &stage.placements.objects {
        expected.push((
            *mapping
                .get(&p.object)
                .ok_or("source placement object was skipped")?,
            p.position
                .iter()
                .chain(&p.rotation)
                .map(|v| v.to_bits())
                .collect::<Vec<_>>(),
            if p.cast_shadow { "TRUE" } else { "FALSE" }.to_string(),
        ));
    }
    actual.sort();
    expected.sort();
    require(
        sky_count == 1 && actual == expected,
        "placement source/target values differ",
    )?;
    Ok(
        json!({"valid":true,"source":source,"stage":root,"textures":textures,"planBytesCompared":plan.len(),
        "spawnPairs":p.spawn_pairs.len(),"respawns":p.respawn_points.len(),"markers":p.markers.len(),
        "unmappedMarkerWords":p.markers.iter().map(|(_,word)|word).collect::<Vec<_>>(),"placementsCompared":actual.len(),
        "ignoredSourceScales":stage.placements.objects.iter().filter(|p|p.scale!=[1.0;3]).count(),
        "placementCaveat":"MB scale and OB multi-axis Euler semantics require engine evidence"}),
    )
}

pub fn collision_source(source: &Path, report: &Path, output: &Path) -> Result<Value, String> {
    use exvs_mbon::{stage::StagePackage, vcl::Vcl};
    let stage = StagePackage::read_path(source).map_err(|e| e.to_string())?;
    let port: Value = serde_json::from_slice(&read(report)?).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(output).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    let mut export = |name: &str, relative: &str, blobs: &[Vec<u8>]| -> Result<(), String> {
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        let mut normals = Vec::new();
        let mut kinds = Vec::new();
        for blob in blobs {
            let vcl = Vcl::parse(blob).map_err(|e| e.to_string())?;
            for group in vcl.groups {
                let base = vertices.len() as u32;
                vertices.extend(group.vertices);
                for triangle in group.triangles {
                    indices.push(triangle.indices.map(|i| i + base));
                    normals.push(triangle.normal);
                    kinds.push(group.surface_kind);
                }
            }
        }
        if indices.is_empty() {
            return Ok(());
        }
        let mut data = Vec::new();
        data.extend_from_slice(b"VCG1");
        data.extend_from_slice(&(vertices.len() as u32).to_le_bytes());
        data.extend_from_slice(&(indices.len() as u32).to_le_bytes());
        for v in &vertices {
            for x in v {
                data.extend_from_slice(&f64::from(*x).to_le_bytes());
            }
        }
        for t in &indices {
            for i in t {
                data.extend_from_slice(&i.to_le_bytes());
            }
        }
        for n in &normals {
            for x in n {
                data.extend_from_slice(&f64::from(*x).to_le_bytes());
            }
        }
        for k in kinds {
            data.extend_from_slice(&k.to_le_bytes());
        }
        let path = output.join(format!("{name}.geom"));
        std::fs::write(&path, data).map_err(|e| e.to_string())?;
        entries.push(json!({"geometry":path,"target":relative,"vertices":vertices.len(),"triangles":indices.len()}));
        Ok(())
    };
    export("ground", "0/0/base/map_hit.hkt", &stage.hit_collisions)?;
    export("border", "0/0/info/border_hit.hkt", &stage.wall_collisions)?;
    for o in port["objects"].as_array().ok_or("object mapping missing")? {
        let index = o["mbonObject"].as_u64().ok_or("object index missing")? as usize;
        let folder = o["folder"].as_str().ok_or("object folder missing")?;
        let blobs: Vec<_> = stage.objects[index]
            .parts
            .iter()
            .flat_map(|p| p.collisions.iter().cloned())
            .collect();
        export(folder, &format!("0/0/{folder}/map_hit.hkt"), &blobs)?;
    }
    Ok(json!({"source":source,"collisionFiles":entries}))
}

pub fn rebuild_collision(geometry: &Path, output: &Path) -> Result<Value, String> {
    let bytes = read(geometry)?;
    require(
        bytes.get(..4) == Some(b"VCG1"),
        "not a complete VCL geometry dump",
    )?;
    let count = |at| -> Result<usize, String> {
        Ok(u32::from_le_bytes(
            bytes
                .get(at..at + 4)
                .ok_or("short geometry count")?
                .try_into()
                .unwrap(),
        ) as usize)
    };
    let nv = count(4)?;
    let nt = count(8)?;
    let expected = 12usize
        .checked_add(nv.checked_mul(24).ok_or("vertex size overflow")?)
        .and_then(|v| v.checked_add(nt.checked_mul(40)?))
        .ok_or("geometry length overflow")?;
    require(
        bytes.len() == expected,
        "geometry dump byte accounting mismatch",
    )?;
    let mut vertices = Vec::with_capacity(nv);
    let mut at = 12;
    for _ in 0..nv {
        let mut v = [0.0; 3];
        for x in &mut v {
            *x = f64::from_le_bytes(bytes[at..at + 8].try_into().unwrap());
            at += 8;
        }
        require(
            v.iter().all(|x| x.is_finite()),
            "nonfinite collision vertex",
        )?;
        vertices.push(v);
    }
    let mut indices = Vec::with_capacity(nt * 3);
    for _ in 0..nt * 3 {
        let index = count(at)?;
        at += 4;
        require(index < nv, "collision index out of range")?;
        indices.push(index as u32);
    }
    let mesh = crate::collision_mesh::CollisionTriMesh { vertices, indices };
    let manager = super::collision::havok_filter_manager()?;
    let (hkt, report) = super::collision::mesh_to_hkt(&mesh, &manager)?;
    require(
        report.source_triangles == report.hkt_triangles,
        "faithful collision lost triangles",
    )?;
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(output, &hkt).map_err(|e| e.to_string())?;
    Ok(
        json!({"geometry":geometry,"output":output,"policy":"faithful_vcl_shared_vertices_bounds_v4","report":report}),
    )
}
