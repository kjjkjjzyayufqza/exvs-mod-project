// EXVS Mod Project, author kjjkjjzyayufqza. Read AGENTS.md before editing.
// PolyForm Shield 1.0.0. MBON format research: descatal/BoostStudio.
//! Read-only visual provenance probes for native and converted stage assets.

use exvs_mbon::{ntp3::Ntp3, nud::Nud, stage::StagePackage};
use serde_json::{json, Value};
use ssbh_data::mesh_data::{MeshData, VectorData};
use ssbh_data::modl_data::ModlData;
use std::path::Path;

fn stats(values: impl Iterator<Item = [f64; 4]>) -> Value {
    let mut n = 0usize;
    let mut lo = [f64::INFINITY; 4];
    let mut hi = [f64::NEG_INFINITY; 4];
    let mut sum = [0.0; 4];
    let mut near_zero = 0usize;
    let mut near_one = 0usize;
    for v in values {
        n += 1;
        near_zero += usize::from(v[3] <= 0.05);
        near_one += usize::from(v[3] >= 0.95);
        for i in 0..4 {
            lo[i] = lo[i].min(v[i]);
            hi[i] = hi[i].max(v[i]);
            sum[i] += v[i];
        }
    }
    if n == 0 {
        return json!({"count":0});
    }
    json!({"count":n,"min":lo,"max":hi,"mean":sum.map(|v|v/n as f64),
        "alphaAtMost005":near_zero,"alphaAtLeast095":near_one})
}

fn pixels(bytes: &[u8]) -> Value {
    stats(bytes.chunks_exact(4).map(|v| {
        [
            f64::from(v[0]) / 255.0,
            f64::from(v[1]) / 255.0,
            f64::from(v[2]) / 255.0,
            f64::from(v[3]) / 255.0,
        ]
    }))
}

pub fn model(path: &Path) -> Result<Value, String> {
    let model = ModlData::from_file(path).map_err(|e| e.to_string())?;
    let parent = path.parent().ok_or("model parent absent")?;
    let resolve = |s: &str| parent.join(s.replace('\\', "/").rsplit('/').next().unwrap_or(s));
    let mesh = MeshData::from_file(resolve(&model.mesh_file_name)).map_err(|e| e.to_string())?;
    let materials = model
        .material_file_names
        .iter()
        .map(|name| super::material::read_matl(&resolve(name)))
        .collect::<Result<Vec<_>, _>>()?;
    let objects = mesh.objects.iter().map(|object| {
        let attributes:Vec<_> = object.texture_coordinates.iter().chain(&object.color_sets).map(|a| {
            let statistic = match &a.data {
                VectorData::Vector4(v)=>stats(v.iter().map(|v|v.to_array().map(f64::from))),
                VectorData::Vector3(v)=>stats(v.iter().map(|v|[f64::from(v.x),f64::from(v.y),f64::from(v.z),1.0])),
                VectorData::Vector2(v)=>stats(v.iter().map(|v|[f64::from(v.x),f64::from(v.y),0.0,1.0])),
            };
            json!({"name":a.name,"statistics":statistic})
        }).collect();
        let binding=model.entries.iter().find(|e| e.mesh_object_name==object.name && e.mesh_object_subindex==object.subindex);
        json!({"name":object.name,"sortBias":object.sort_bias,"depthTestDisabled":object.disable_depth_test,
            "depthWriteDisabled":object.disable_depth_write,
            "binding":binding,"attributes":attributes})
    }).collect::<Vec<_>>();
    Ok(json!({"model":path,"materials":materials,"objects":objects}))
}

pub fn texture(path: &Path) -> Result<Value, String> {
    let file = nutexb::NutexbFile::read_from_file(path).map_err(|e| e.to_string())?;
    let rgba = image_dds::image_from_dds(&file.to_dds().map_err(|e| e.to_string())?, 0)
        .map_err(|e| e.to_string())?;
    Ok(
        json!({"path":path,"format":format!("{:?}",file.footer.image_format),
        "dimensions":[file.footer.width,file.footer.height,file.footer.depth],"mips":file.footer.mipmap_count,
        "statistics":pixels(rgba.as_raw())}),
    )
}

pub fn source(path: &Path) -> Result<Value, String> {
    let stage = StagePackage::read_path(path).map_err(|e| e.to_string())?;
    let ntp = Ntp3::parse(&stage.textures).map_err(|e| e.to_string())?;
    let mut records = Vec::new();
    let mut used = std::collections::BTreeSet::new();
    for model in &stage.models {
        let nud = Nud::parse(&model.bytes).map_err(|e| e.to_string())?;
        let buffers = nud.mesh_buffers(&model.bytes).map_err(|e| e.to_string())?;
        for ((set, polygon), buffer) in nud
            .polysets
            .iter()
            .flat_map(|s| s.polygons.iter().map(move |p| (s, p)))
            .zip(buffers)
        {
            for material in &polygon.materials {
                for texture in &material.textures {
                    used.insert(texture.texture_id);
                }
            }
            records.push(json!({"role":model.role.manifest_key(),"entry":model.entry,"set":set.name,
                "materials":polygon.materials.iter().map(|m|json!({"flags":format!("0x{:08X}",m.flags),
                    "src":m.src_factor,"dst":m.dst_factor,"alphaTest":m.alpha_test,
                    "textureIds":m.textures.iter().map(|t|format!("{:08x}",t.texture_id)).collect::<Vec<_>>()})).collect::<Vec<_>>(),
                "vertexColor":stats(buffer.colors.chunks_exact(4).map(|v|[f64::from(v[0]),f64::from(v[1]),f64::from(v[2]),f64::from(v[3])]))}));
        }
    }
    let mut textures = Vec::new();
    for t in ntp
        .textures
        .iter()
        .filter(|t| used.contains(&t.texture_id) && !t.cube_map)
    {
        let rgba = if t.format == 17 {
            t.data
                .chunks_exact(4)
                .take(usize::from(t.width) * usize::from(t.height))
                .flat_map(|p| [p[1], p[2], p[3], p[0]])
                .collect()
        } else {
            t.decode_rgba().map_err(|e| e.to_string())?
        };
        textures.push(
            json!({"gidx":format!("{:08x}",t.texture_id),"format":t.format,
            "dimensions":[t.width,t.height],"statistics":pixels(&rgba)}),
        );
    }
    Ok(
        json!({"source":path,"models":records,"textures":textures,"graphicParam":stage.graphic_param}),
    )
}

/// Export complete source geometry for ray tests and render-state comparisons.
pub fn source_geometry(path: &Path) -> Result<Value, String> {
    let stage = StagePackage::read_path(path).map_err(|e| e.to_string())?;
    let mut records = Vec::new();
    for model in &stage.models {
        let nud = Nud::parse(&model.bytes).map_err(|e| e.to_string())?;
        let buffers = nud.mesh_buffers(&model.bytes).map_err(|e| e.to_string())?;
        for ((set, polygon), buffer) in nud
            .polysets
            .iter()
            .flat_map(|s| s.polygons.iter().map(move |p| (s, p)))
            .zip(buffers)
        {
            records.push(json!({"role":model.role.manifest_key(),"entry":model.entry,"set":set.name,
                "positions":buffer.positions,"normals":buffer.normals,"uvs":buffer.uvs,"colors":buffer.colors,"indices":buffer.indices,
                "materials":polygon.materials.iter().map(|m|json!({"flags":m.flags,"src":m.src_factor,"dst":m.dst_factor,
                    "alphaTest":m.alpha_test,"cull":m.cull_mode,
                    "textureIds":m.textures.iter().map(|t|t.texture_id).collect::<Vec<_>>()})).collect::<Vec<_>>() }));
        }
    }
    Ok(json!({"source":path,"meshes":records}))
}

/// Move selected authored background overlays to the shipped blended sky recipe.
/// Geometry, vertex opacity, texture data and material values remain intact.
pub fn move_sky_overlays(root: &Path, names: &[String]) -> Result<Value, String> {
    use std::collections::BTreeSet;
    let wanted: BTreeSet<_> = names.iter().cloned().collect();
    if wanted.is_empty() || wanted.len() != names.len() {
        return Err("sky overlay selection must be nonempty and unique".into());
    }
    let name = root
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("stage name absent")?;
    let base_dir = root.join(format!("0/0/base/{name}_base"));
    let sky_dir = root.join("0/0/sky/0");
    let base_name = format!("{name}_base");
    let sky_name = format!("{name}_sky");
    let base_model_path = base_dir.join(format!("{base_name}.numdlb"));
    let sky_model_path = sky_dir.join(format!("{sky_name}.numdlb"));
    let base_mesh_path = base_dir.join(format!("{base_name}__maya__.numshb"));
    let sky_mesh_path = sky_dir.join(format!("{sky_name}__maya__.numshb"));
    let mut base_model = ModlData::from_file(&base_model_path).map_err(|e| e.to_string())?;
    let mut sky_model = ModlData::from_file(&sky_model_path).map_err(|e| e.to_string())?;
    let mut base = MeshData::from_file(&base_mesh_path).map_err(|e| e.to_string())?;
    let mut sky = MeshData::from_file(&sky_mesh_path).map_err(|e| e.to_string())?;
    let mut moved = Vec::new();
    for mesh in &base.objects {
        if wanted.contains(&mesh.name) {
            if sky
                .objects
                .iter()
                .any(|s| s.name == mesh.name && s.subindex == mesh.subindex)
                || !mesh.bone_influences.is_empty()
                || !mesh.parent_bone_name.is_empty()
            {
                return Err(format!(
                    "overlay must be a unique static mesh: {}",
                    mesh.name
                ));
            }
            moved.push(mesh.clone());
        }
    }
    if moved.len() != wanted.len() {
        return Err("each selected sky overlay must exist exactly once in the base model".into());
    }
    let bindings: Vec<_> = base_model
        .entries
        .iter()
        .filter(|e| wanted.contains(&e.mesh_object_name))
        .cloned()
        .collect();
    if bindings.len() != moved.len() {
        return Err("overlay mesh/model bindings do not match".into());
    }
    let labels: BTreeSet<_> = bindings.iter().map(|e| e.material_label.clone()).collect();
    let remaining_labels: BTreeSet<_> = base_model
        .entries
        .iter()
        .filter(|e| !wanted.contains(&e.mesh_object_name))
        .map(|e| e.material_label.clone())
        .collect();
    let mut materials = Vec::new();
    for suffix in ["__maya__.numatb", "__nust__.numatb"] {
        let base_path = base_dir.join(format!("{base_name}{suffix}"));
        let sky_path = sky_dir.join(format!("{sky_name}{suffix}"));
        let mut original = super::material::read_matl(&base_path)?;
        let mut destination = super::material::read_matl(&sky_path)?;
        let selected: Vec<_> = original
            .entries
            .iter()
            .filter(|e| labels.contains(&e.material_label))
            .cloned()
            .collect();
        if selected.len() != labels.len()
            || selected.iter().any(|e| {
                destination
                    .entries
                    .iter()
                    .any(|s| s.material_label == e.material_label)
            })
        {
            return Err(
                "overlay material labels must exist once and be unique in the sky model".into(),
            );
        }
        if suffix.starts_with("__nust__")
            && selected
                .iter()
                .any(|e| e.shader_label != "vsngTransparent_BeforeEffect")
        {
            return Err(
                "overlay must already use the shipped vertex-opacity transparent shader".into(),
            );
        }
        destination.entries.extend(selected);
        original.entries.retain(|e| {
            !labels.contains(&e.material_label) || remaining_labels.contains(&e.material_label)
        });
        materials.push((base_path, original, sky_path, destination));
    }
    base.objects.retain(|m| !wanted.contains(&m.name));
    base_model
        .entries
        .retain(|e| !wanted.contains(&e.mesh_object_name));
    for mesh in &mut moved {
        mesh.sort_bias = 610;
        mesh.disable_depth_test = true;
    }
    sky.objects.extend(moved);
    sky_model.entries.extend(bindings);
    if base.objects.is_empty() {
        return Err("moving overlays must leave the battle field in the base model".into());
    }
    base.write_to_file(base_mesh_path)
        .map_err(|e| e.to_string())?;
    sky.write_to_file(sky_mesh_path)
        .map_err(|e| e.to_string())?;
    base_model
        .write_to_file(base_model_path)
        .map_err(|e| e.to_string())?;
    sky_model
        .write_to_file(sky_model_path)
        .map_err(|e| e.to_string())?;
    for (base_path, original, sky_path, destination) in materials {
        original
            .write_to_file(base_path)
            .map_err(|e| e.to_string())?;
        destination
            .write_to_file(sky_path)
            .map_err(|e| e.to_string())?;
    }
    crate::format::fhm2d_stage::rebuild_structure_json_for_stage_forced_with_shared_textures(
        &root.to_string_lossy(),
    )?;
    Ok(
        json!({"stage":root,"movedMeshes":names,"baseMeshes":base.objects.len(),"skyMeshes":sky.objects.len(),
        "policy":"authored_horizon_overlays_native_sky_layer_v1","runtimeStatus":"IN_GAME_RETEST_REQUIRED"}),
    )
}

/// Route migrated overlays through RenderSkydome, rather than EffectBefore.
/// Transfer an authored V-dependent fade to a dedicated coverage texture.
pub fn repair_sky_overlay_passes(source: &Path, root: &Path) -> Result<Value, String> {
    let stage = StagePackage::read_path(source).map_err(|e| e.to_string())?;
    let ntp = Ntp3::parse(&stage.textures).map_err(|e| e.to_string())?;
    let name = root
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("stage name missing")?;
    let sky_dir = root.join("0/0/sky/0");
    let mesh = MeshData::from_file(sky_dir.join(format!("{name}_sky__maya__.numshb")))
        .map_err(|e| e.to_string())?;
    let model = ModlData::from_file(sky_dir.join(format!("{name}_sky.numdlb")))
        .map_err(|e| e.to_string())?;
    let nust_path = sky_dir.join(format!("{name}_sky__nust__.numatb"));
    let maya_path = sky_dir.join(format!("{name}_sky__maya__.numatb"));
    let mut nust = super::material::read_matl(&nust_path)?;
    let mut maya = super::material::read_matl(&maya_path)?;
    let (mut baked, mut changed, mut obsolete) = (Vec::new(), Vec::new(), Vec::new());
    for entry in &mut nust.entries {
        if entry.shader_label != "vsngTransparent_BeforeEffect" {
            continue;
        }
        let objects: Vec<_> = model
            .entries
            .iter()
            .filter(|m| m.material_label == entry.material_label)
            .map(|m| {
                mesh.objects
                    .iter()
                    .find(|o| o.name == m.mesh_object_name && o.subindex == m.mesh_object_subindex)
                    .ok_or("sky mesh binding missing")
            })
            .collect::<Result<_, _>>()?;
        if objects.is_empty()
            || objects.iter().any(|o| {
                !(o.name.starts_with("far") || o.name.starts_with("tfar"))
                    || o.sort_bias != 610
                    || !o.disable_depth_test
            })
        {
            return Err(
                "only explicitly migrated authored background overlays may change sky pass".into(),
            );
        }
        let diffuse = entry
            .textures
            .iter_mut()
            .find(|t| format!("{:?}", t.param_id) == "DiffuseMap")
            .ok_or("sky DiffuseMap missing")?;
        let old_stem = diffuse
            .data
            .rsplit('/')
            .next()
            .ok_or("sky texture name missing")?
            .to_string();
        let id = u32::from_str_radix(
            old_stem
                .strip_prefix(&format!("{name}_"))
                .ok_or("unexpected sky texture prefix")?,
            16,
        )
        .map_err(|e| e.to_string())?;
        let original = ntp
            .textures
            .iter()
            .find(|t| t.texture_id == id)
            .ok_or("sky texture absent from source")?;
        let (mut zero_alpha, mut offset) = (true, 0usize);
        for (mip, stored) in original.mip_sizes.iter().enumerate() {
            let single = exvs_mbon::ntp3::Ntp3Texture {
                format: original.format,
                width: (original.width >> mip).max(1),
                height: (original.height >> mip).max(1),
                mip_sizes: vec![*stored],
                texture_id: id,
                cube_map: false,
                data: original
                    .data
                    .get(offset..offset + *stored as usize)
                    .ok_or("sky mip truncated")?
                    .to_vec(),
            };
            let pixels = if original.format == 17 {
                single
                    .data
                    .chunks_exact(4)
                    .take(usize::from(single.width) * usize::from(single.height))
                    .flat_map(|p| [p[1], p[2], p[3], p[0]])
                    .collect::<Vec<_>>()
            } else {
                single.decode_rgba().map_err(|e| e.to_string())?
            };
            zero_alpha &= pixels.chunks_exact(4).all(|p| p[3] == 0);
            offset += *stored as usize;
        }
        if !zero_alpha {
            let mut samples = Vec::new();
            for object in &objects {
                let VectorData::Vector2(uv) = &object
                    .texture_coordinates
                    .first()
                    .ok_or("sky UV absent")?
                    .data
                else {
                    return Err("sky UV must be Vector2".into());
                };
                let VectorData::Vector4(colors) = &object
                    .texture_coordinates
                    .iter()
                    .find(|a| a.name == "HalfFloat2_0")
                    .ok_or("sky vertex opacity absent")?
                    .data
                else {
                    return Err("sky opacity must be Vector4".into());
                };
                if uv.len() != colors.len()
                    || colors
                        .iter()
                        .any(|c| c.x != 1.0 || c.y != 1.0 || c.z != 1.0)
                {
                    return Err("sky bake requires white RGB and matching UV/opacity".into());
                }
                samples.extend(uv.iter().zip(colors).map(|(v, c)| (v.y, c.w)));
            }
            samples.sort_by(|a, b| a.0.total_cmp(&b.0));
            let mut knots: Vec<(f32, f32)> = Vec::new();
            for sample in samples {
                if let Some(last) = knots.last() {
                    if last.0 == sample.0 {
                        if last.1 != sample.1 {
                            return Err("sky opacity is not a function of V".into());
                        }
                        continue;
                    }
                }
                knots.push(sample);
            }
            for object in &objects {
                let VectorData::Vector2(uv) = &object.texture_coordinates[0].data else {
                    unreachable!()
                };
                for tri in object.vertex_indices.chunks_exact(3) {
                    let lo = tri
                        .iter()
                        .map(|i| uv[*i as usize].y)
                        .fold(f32::INFINITY, f32::min);
                    let hi = tri
                        .iter()
                        .map(|i| uv[*i as usize].y)
                        .fold(f32::NEG_INFINITY, f32::max);
                    if knots.iter().any(|k| k.0 > lo && k.0 < hi) {
                        return Err("sky triangle crosses an opacity-curve breakpoint".into());
                    }
                }
            }
            let stem = format!("{name}_{id:08x}_skyfade");
            let output = root.join("0/0/textures").join(format!("{stem}.nutexb"));
            super::texture::bake_sky_vertex_alpha(original, &stem, &knots)?
                .write_to_file(&output)
                .map_err(|e| e.to_string())?;
            diffuse.data = format!("../../textures/{stem}");
            let mirror = maya
                .entries
                .iter_mut()
                .find(|m| m.material_label == entry.material_label)
                .ok_or("sky mirror absent")?;
            for t in &mut mirror.textures {
                if t.data.ends_with(&old_stem) {
                    t.data = diffuse.data.clone();
                }
            }
            obsolete.push(old_stem);
            baked.push(json!({"texture":output,"gidx":id,"knots":knots,"mips":original.mip_count(),"maxTexelAlphaQuantizationError":0.5/255.0}));
        }
        entry.shader_label = "vsngSkyTransparent".into();
        entry.uv_transforms.clear();
        changed.push(entry.material_label.clone());
    }
    nust.write_to_file(nust_path).map_err(|e| e.to_string())?;
    maya.write_to_file(maya_path).map_err(|e| e.to_string())?;
    let references: std::collections::BTreeSet<_> = files(root)?
        .iter()
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("numatb"))
        .map(|p| super::material::read_matl(p))
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .flat_map(|m| &m.entries)
        .flat_map(|e| &e.textures)
        .map(|t| t.data.rsplit('/').next().unwrap_or(&t.data).to_string())
        .collect();
    for stem in obsolete {
        if !references.contains(&stem) {
            let texture_dir = root
                .join("0/0/textures")
                .canonicalize()
                .map_err(|e| e.to_string())?;
            let path = texture_dir.join(format!("{stem}.nutexb"));
            if path.parent() != Some(texture_dir.as_path()) {
                return Err("obsolete texture outside the stage texture folder".into());
            }
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }
    crate::format::fhm2d_stage::rebuild_structure_json_for_stage_forced_with_shared_textures(
        &root.to_string_lossy(),
    )?;
    Ok(
        json!({"policy":"authored_horizon_render_skydome_uv_alpha_v2","materials":changed,"baked":baked,"renderPass":"RenderSkydome"}),
    )
}

/// Repair sky resources in place without rebuilding any field geometry or HKT.
pub fn repair_sky(source: &Path, root: &Path) -> Result<Value, String> {
    use super::model::{nud_meshes, write_model, VertexColorMode};
    use super::texture::{alpha_stem, convert_alpha, has_alpha_channel, TextureAlpha};
    use exvs_mbon::stage::StageModelRole;
    let stage = StagePackage::read_path(source).map_err(|e| e.to_string())?;
    let ntp = Ntp3::parse(&stage.textures).map_err(|e| e.to_string())?;
    let textures: std::collections::BTreeMap<_, _> = ntp
        .textures
        .iter()
        .filter(|t| !t.cube_map)
        .map(|t| (t.texture_id, t))
        .collect();
    let name = root
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("stage name missing")?;
    // Preserve explicitly migrated background overlays on subsequent sky repairs.
    // Their source role is Far/TransparentFar, so selecting Sky alone loses them.
    let existing_sky = root.join(format!("0/0/sky/0/{name}_sky__maya__.numshb"));
    let overlays: std::collections::BTreeSet<_> = if existing_sky.exists() {
        MeshData::from_file(&existing_sky)
            .map_err(|e| e.to_string())?
            .objects
            .into_iter()
            .filter(|m| m.name.starts_with("far") || m.name.starts_with("tfar"))
            .map(|m| m.name)
            .collect()
    } else {
        std::collections::BTreeSet::new()
    };
    let used = std::cell::RefCell::new(std::collections::BTreeSet::new());
    let stem = |id: u32, alpha: TextureAlpha| {
        let texture = textures.get(&id)?;
        let alpha = if alpha == TextureAlpha::Opaque && !has_alpha_channel(texture) {
            TextureAlpha::Coverage
        } else {
            alpha
        };
        used.borrow_mut().insert((id, alpha));
        Some(alpha_stem(name, id, alpha))
    };
    let mut sky = Vec::new();
    for model in &stage.models {
        let is_sky = model.role == StageModelRole::Sky;
        let prefix = if is_sky {
            format!("sky{:03}", model.entry)
        } else {
            format!("{}{:03}", super::short_role(model.role), model.entry)
        };
        if !is_sky
            && !overlays
                .iter()
                .any(|n| n.starts_with(&format!("{prefix}_")))
        {
            continue;
        }
        let meshes = nud_meshes(
            &model.bytes,
            &prefix,
            true,
            VertexColorMode::White,
            &stem,
            &|bone| Err(format!("unexpected sky bone {bone}")),
        )?;
        sky.extend(
            meshes
                .into_iter()
                .filter(|m| is_sky || overlays.contains(&m.name)),
        );
    }
    if sky.is_empty() && !stage.models.iter().any(|m| m.role == StageModelRole::Sky) {
        let id = *textures.keys().next().ok_or("source texture missing")?;
        sky.push(super::model::empty_sky_mesh(
            stem(id, TextureAlpha::Opaque).ok_or("empty sky texture missing")?,
        ));
    }
    let model_name = format!("{name}_sky");
    write_model(&root.join("0/0/sky/0"), &model_name, &model_name, &sky)?;
    let mut written = Vec::new();
    for (id, alpha) in used.into_inner() {
        let name = alpha_stem(name, id, alpha);
        let path = root.join("0/0/textures").join(format!("{name}.nutexb"));
        convert_alpha(textures[&id], &name, alpha)?
            .write_to_file(&path)
            .map_err(|e| e.to_string())?;
        written.push(json!({"path":path,"gidx":id,"policy":format!("{alpha:?}")}));
    }
    let overlay_pass = if overlays.is_empty() {
        None
    } else {
        Some(repair_sky_overlay_passes(source, root)?)
    };
    Ok(
        json!({"stage":root,"source":source,"skyMeshes":sky.len(),"textures":written,
        "policy":"source_hdr_alpha_rgb_gain_one_vertex_opacity_v1","overlayRenderPass":overlay_pass}),
    )
}

fn files(root: &Path) -> Result<Vec<std::path::PathBuf>, String> {
    let mut result = Vec::new();
    for e in std::fs::read_dir(root).map_err(|e| e.to_string())? {
        let path = e.map_err(|e| e.to_string())?.path();
        if path.is_dir() {
            result.extend(files(&path)?);
        } else {
            result.push(path);
        }
    }
    result.sort();
    Ok(result)
}

fn replace_strings(value: &mut Value, old: &str, new: &str) {
    match value {
        Value::String(s) => *s = s.replace(old, new),
        Value::Array(values) => values.iter_mut().for_each(|v| replace_strings(v, old, new)),
        Value::Object(values) => values
            .values_mut()
            .for_each(|v| replace_strings(v, old, new)),
        _ => {}
    }
}

/// Clone asset names, optionally applying one isolated color experiment.
/// The identity profile preserves all gameplay and rendering data.
pub fn clone_profile(
    source: &Path,
    output: &Path,
    name: &str,
    hash: &str,
    profile: &str,
) -> Result<Value, String> {
    use nutexb::{NutexbFile, NutexbFormat};
    use ssbh_data::matl_data::{MatlData, MatlEntryData};
    if !name.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_') || name.is_empty() {
        return Err("invalid variant stage name".into());
    }
    if !matches!(
        profile,
        "identity" | "nonmetal" | "linear" | "neutral-grade"
    ) {
        return Err("unknown color profile".into());
    }
    let old = source
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("source name absent")?;
    if profile == "identity" {
        let structure: Value = serde_json::from_slice(
            &std::fs::read(
                source
                    .parent()
                    .ok_or("parent absent")?
                    .join(format!("{old}_structure.json")),
            )
            .map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        if structure["HashName"].as_str() != Some(hash) {
            return Err("an identity clone must preserve the resource hash".into());
        }
    }
    let root = output.join(name);
    if root.exists() {
        return Err("variant already exists".into());
    }
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    for path in files(source)? {
        let relative = path
            .strip_prefix(source)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace(old, name);
        let target = root.join(relative);
        std::fs::create_dir_all(target.parent().ok_or("parent absent")?)
            .map_err(|e| e.to_string())?;
        std::fs::copy(&path, &target).map_err(|e| e.to_string())?;
    }
    let mut materials = 0usize;
    let mut changed_textures = std::collections::BTreeSet::new();
    let texture_dir = root.join("0/0/textures");
    let metal_name = format!("{name}_compat_metallic_zero");
    for path in files(&root)? {
        match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
            "numdlb" => {
                let mut value =
                    serde_json::to_value(ModlData::from_file(&path).map_err(|e| e.to_string())?)
                        .map_err(|e| e.to_string())?;
                replace_strings(&mut value, old, name);
                let data: ModlData = serde_json::from_value(value).map_err(|e| e.to_string())?;
                data.write_to_file(&path).map_err(|e| e.to_string())?;
            }
            "numatb" => {
                let mut mat = super::material::read_matl(&path)?;
                for entry in &mut mat.entries {
                    let mut value = serde_json::to_value(&*entry).map_err(|e| e.to_string())?;
                    replace_strings(&mut value, old, name);
                    if profile == "nonmetal" && entry.shader_label == "vstgStandard_VertexColor" {
                        value["textures"].as_array_mut().ok_or("textures absent")?.push(json!({"param_id":"MetallicMap","data":format!("../../textures/{metal_name}")}));
                        let booleans = value["booleans"].as_array_mut().ok_or("booleans absent")?;
                        booleans.retain(|v| v["param_id"] != "UseMetallicMap");
                        booleans.push(json!({"param_id":"UseMetallicMap","data":true}));
                        materials += 1;
                    }
                    if profile == "linear"
                        && !path.to_string_lossy().replace('\\', "/").contains("/sky/")
                    {
                        for t in value["textures"].as_array_mut().ok_or("textures absent")? {
                            if matches!(t["param_id"].as_str(), Some("BaseColorMap" | "DiffuseMap"))
                            {
                                if let Some(reference) = t["data"].as_str() {
                                    changed_textures
                                        .insert(reference.rsplit('/').next().unwrap().to_string());
                                }
                            }
                        }
                    }
                    *entry = serde_json::from_value::<MatlEntryData>(value)
                        .map_err(|e| e.to_string())?;
                }
                mat.write_to_file(&path).map_err(|e| e.to_string())?;
            }
            "numshb" => {
                let mut mesh = MeshData::from_file(&path).map_err(|e| e.to_string())?;
                for o in &mut mesh.objects {
                    o.name = o.name.replace(old, name);
                }
                mesh.write_to_file(&path).map_err(|e| e.to_string())?;
            }
            "nutexb" => {
                let mut texture = NutexbFile::read_from_file(&path).map_err(|e| e.to_string())?;
                texture.footer.string = texture.footer.string.to_string().replace(old, name).into();
                if texture.footer.string.to_string().len() > 63 {
                    return Err("variant texture name exceeds 63 bytes".into());
                }
                texture.write_to_file(&path).map_err(|e| e.to_string())?;
            }
            _ => {}
        }
    }
    if profile == "nonmetal" {
        let t = NutexbFile::from_surface(
            nutexb::Surface {
                width: 1,
                height: 1,
                depth: 1,
                image_data: vec![0, 0, 0, 255],
                mipmap_count: 1,
                layer_count: 1,
                image_format: NutexbFormat::R8G8B8A8Unorm,
            },
            metal_name,
        )
        .map_err(|e| e.to_string())?;
        t.write_to_file(texture_dir.join(format!("{name}_compat_metallic_zero.nutexb")))
            .map_err(|e| e.to_string())?;
    }
    if profile == "linear" {
        // Preserve sky's sRGB sampling even when a color map is shared.
        let sky_refs = files(&root.join("0/0/sky"))?
            .into_iter()
            .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("numatb"))
            .map(|p| super::material::read_matl(&p))
            .collect::<Result<Vec<MatlData>, _>>()?;
        let sky_names: std::collections::BTreeSet<_> = sky_refs
            .iter()
            .flat_map(|m| &m.entries)
            .flat_map(|e| &e.textures)
            .map(|t| {
                t.data
                    .replace('\\', "/")
                    .rsplit('/')
                    .next()
                    .unwrap()
                    .to_string()
            })
            .collect();
        for stem in &changed_textures {
            let path = texture_dir.join(format!("{stem}.nutexb"));
            let mut texture = NutexbFile::read_from_file(&path).map_err(|e| e.to_string())?;
            texture.footer.image_format = match texture.footer.image_format {
                NutexbFormat::BC1Srgb => NutexbFormat::BC1Unorm,
                NutexbFormat::BC3Srgb => NutexbFormat::BC3Unorm,
                NutexbFormat::R8G8B8A8Srgb => NutexbFormat::R8G8B8A8Unorm,
                other => return Err(format!("unexpected experiment color format {other:?}")),
            };
            if sky_names.contains(stem) {
                let variant = format!("{stem}_lin");
                texture.footer.string = variant.clone().into();
                texture
                    .write_to_file(texture_dir.join(format!("{variant}.nutexb")))
                    .map_err(|e| e.to_string())?;
                for path in files(&root)? {
                    if path.extension().and_then(|s| s.to_str()) != Some("numatb")
                        || path.to_string_lossy().replace('\\', "/").contains("/sky/")
                    {
                        continue;
                    }
                    let mut m = super::material::read_matl(&path)?;
                    for e in &mut m.entries {
                        for t in &mut e.textures {
                            if t.data.ends_with(stem) {
                                t.data = t.data.replace(stem, &variant);
                            }
                        }
                    }
                    m.write_to_file(&path).map_err(|e| e.to_string())?;
                }
            } else {
                texture.write_to_file(&path).map_err(|e| e.to_string())?;
            }
        }
    }
    if profile == "neutral-grade" {
        let path = root.join("0/0/info/graphic_param.csv");
        let original = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let changed = original
            .split_inclusive('\n')
            .map(|line| {
                if line.starts_with("color_grading_3dbg_enable,") {
                    format!(
                        "color_grading_3dbg_enable,0{}",
                        if line.ends_with("\r\n") { "\r\n" } else { "\n" }
                    )
                } else {
                    line.to_string()
                }
            })
            .collect::<String>();
        std::fs::write(path, changed).map_err(|e| e.to_string())?;
    }
    let structure_path = output.join(format!("{name}_structure.json"));
    let mut structure: Value = serde_json::from_str(
        &std::fs::read_to_string(
            source
                .parent()
                .ok_or("parent absent")?
                .join(format!("{old}_structure.json")),
        )
        .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    replace_strings(&mut structure, old, name);
    structure["Name"] = json!(name);
    structure["HashName"] = json!(hash);
    std::fs::write(
        &structure_path,
        serde_json::to_vec_pretty(&structure).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    crate::format::fhm2d_stage::rebuild_structure_json_for_stage_forced_with_shared_textures(
        &root.to_string_lossy(),
    )?;
    let name_audit = if profile == "identity" {
        Some(audit_rename(source, &root)?)
    } else {
        None
    };
    Ok(
        json!({"stage":root,"structure":structure_path,"profile":profile,"materialsChanged":materials,
        "texturesWithLinearSampling":changed_textures.len(),"nameAudit":name_audit,
        "runtimeStatus":if profile == "identity" { "NAMES_ONLY_STATIC_PASS_RUNTIME_RETEST_REQUIRED" } else { "EXPERIMENT_NOT_VALIDATED_IN_GAME" }}),
    )
}

/// Compare every parsed model/material/mesh field and every texture byte after
/// substituting only the source asset prefix. All remaining files are byte exact.
pub fn audit_rename(source: &Path, renamed: &Path) -> Result<Value, String> {
    let old = source
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("source name absent")?;
    let new = renamed
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("target name absent")?;
    let originals = files(source)?;
    if originals.len() != files(renamed)?.len() {
        return Err("asset rename changed the file count".into());
    }
    let mut raw_files = 0usize;
    let mut textures = 0usize;
    let mut parsed_files = 0usize;
    for path in &originals {
        let relative = path.strip_prefix(source).map_err(|e| e.to_string())?;
        let target = renamed.join(relative.to_string_lossy().replace(old, new));
        let as_json = |p: &Path| -> Result<Option<Value>, String> {
            match p.extension().and_then(|s| s.to_str()).unwrap_or("") {
                "numdlb" => {
                    serde_json::to_value(ModlData::from_file(p).map_err(|e| e.to_string())?)
                        .map(Some)
                        .map_err(|e| e.to_string())
                }
                "numshb" => {
                    serde_json::to_value(MeshData::from_file(p).map_err(|e| e.to_string())?)
                        .map(Some)
                        .map_err(|e| e.to_string())
                }
                "numatb" => serde_json::to_value(super::material::read_matl(p)?)
                    .map(Some)
                    .map_err(|e| e.to_string()),
                _ => Ok(None),
            }
        };
        if let Some(mut expected) = as_json(path)? {
            replace_strings(&mut expected, old, new);
            if Some(expected) != as_json(&target)? {
                return Err(format!(
                    "asset data changed beyond names: {}",
                    path.display()
                ));
            }
            parsed_files += 1;
        } else if path.extension().and_then(|s| s.to_str()) == Some("nutexb") {
            let mut expected =
                nutexb::NutexbFile::read_from_file(path).map_err(|e| e.to_string())?;
            let actual = nutexb::NutexbFile::read_from_file(&target).map_err(|e| e.to_string())?;
            expected.footer.string = expected.footer.string.to_string().replace(old, new).into();
            if expected.data != actual.data
                || format!("{:?}", expected.layer_mipmaps) != format!("{:?}", actual.layer_mipmaps)
                || format!("{:?}", expected.footer) != format!("{:?}", actual.footer)
            {
                return Err(format!(
                    "texture data changed beyond names: {}",
                    path.display()
                ));
            }
            textures += 1;
        } else {
            if std::fs::read(path).map_err(|e| e.to_string())?
                != std::fs::read(&target).map_err(|e| e.to_string())?
            {
                return Err(format!(
                    "protected resource bytes changed: {}",
                    path.display()
                ));
            }
            raw_files += 1;
        }
    }
    Ok(
        json!({"valid":true,"files":originals.len(),"parsedModelMaterialMeshFiles":parsed_files,
        "textures":textures,"byteExactProtectedFiles":raw_files}),
    )
}
