//! Source-driven stage motion repair for EXVS Mod Project, by kjjkjjzyayufqza.
//! Agents must read AGENTS.md and .cursor/rules/ai-source-notice.mdc before editing.
//! Container/skeleton reference: descatal's BoostStudio; OMO 1.0 codec evidence:
//! original MBON CUSA15006 mapped ELF, sub_F27730, sub_F27BF0, sub_F28260.
//! License: PolyForm Shield; use policy: ACCEPTABLE_USE.md. Keep author identity.

use std::collections::BTreeMap;
use std::path::Path;

use exvs_mbon::{nud::Nud, stage::StagePackage, vbn::Vbn};
use glam::{Mat4, Quat, Vec3};
use serde_json::{json, Value};
use ssbh_data::{
    anim_data::Transform,
    mesh_data::{MeshData, VectorData},
    skel_data::{BillboardType, BoneData, SkelData},
};

use crate::ssbh_motion_interchange::{MotionBone, MotionClip, MotionFrame, MotionSkeleton};
use super::model::{nud_meshes, VertexColorMode, IDENTITY};

fn require(test: bool, message: &str) -> Result<(), String> {
    if test { Ok(()) } else { Err(message.into()) }
}

fn be16(b: &[u8], at: usize) -> Result<u16, String> {
    let x = b.get(at..at + 2).ok_or("truncated OMO word")?;
    Ok(u16::from_be_bytes(x.try_into().unwrap()))
}

fn be32(b: &[u8], at: usize) -> Result<u32, String> {
    let x = b.get(at..at + 4).ok_or("truncated OMO dword")?;
    Ok(u32::from_be_bytes(x.try_into().unwrap()))
}

/// Deliberately limited to the proven single-bone Heliopolis codec. Reject
/// other OMO versions/encodings rather than treating them as this layout.
fn decode(bytes: &[u8], rig: &Vbn, name: String) -> Result<MotionClip, String> {
    require(bytes.get(..4) == Some(b"OMO\0"), "missing OMO magic")?;
    require(be16(bytes,4)? == 1 && be16(bytes,6)? == 0, "OMO must be 1.0")?;
    require(rig.bones.len() == 1 && be16(bytes,14)? == 1, "single-bone OMO required")?;
    require(be16(bytes,12)? as u32 == rig.flags, "OMO/VBN identity mismatch")?;
    let frames = be16(bytes,16)? as usize;
    let stride = be16(bytes,18)? as usize;
    let nodes = be32(bytes,20)? as usize;
    let parameters = be32(bytes,24)? as usize;
    let keys = be32(bytes,28)? as usize;
    require(frames > 0 && stride == 12, "unexpected OMO frame layout")?;
    require(nodes == 32 && parameters == nodes + 12 && keys == parameters + 48,
        "unexpected OMO section layout")?;
    require(keys + frames * stride == bytes.len(), "unaccounted OMO bytes")?;
    // Flags are TRS presence + T encoding 2 + R encoding 5. Each node stores
    // flags, parameter byte offset, key byte offset; it is NOT a bone hash.
    require(be32(bytes,nodes)? == 0x0308_5081 && be32(bytes,nodes+4)? == 0
        && be32(bytes,nodes+8)? == 0, "unsupported OMO channel codec")?;
    let bounds: Vec<f32> = (0..12).map(|i|be32(bytes, parameters+i*4).map(f32::from_bits))
        .collect::<Result<_,_>>()?;
    require(bounds.iter().all(|x|x.is_finite()), "non-finite OMO bounds")?;
    let bone = &rig.bones[0];
    require(bone.parent_index(1).is_none() && bone.bone_type == 0, "OMO bone must be an animated root")?;
    let mut samples = Vec::with_capacity(frames);
    // FD3BFC / FD3C10 both contain 0x37800080 = float(1 / 65535).
    let unit = f32::from_bits(0x3780_0080);
    for frame in 0..frames {
        let key = keys + frame * stride;
        let mut t = [0.0;3];
        let mut q = [0.0;4];
        for axis in 0..3 {
            t[axis] = (bounds[3+axis] * unit) * f32::from(be16(bytes,key+axis*2)?) + bounds[axis];
            q[axis] = (bounds[9+axis] * unit) * f32::from(be16(bytes,key+6+axis*2)?) + bounds[6+axis];
        }
        let remainder = 1.0 - (q[0]*q[0] + (q[1]*q[1] + q[2]*q[2]));
        // Native case 5 reconstructs positive W (clamps non-positive to zero).
        q[3] = remainder.max(0.0).sqrt();
        samples.push(MotionFrame { local_transforms: vec![Transform {
            translation: Vec3::from_array(t), rotation: Quat::from_array(q), scale: Vec3::ONE,
        }] });
    }
    // MBON F7BA70 stores -T(0), conjugate(R(0)); F7C660 combines
    // them with the current pose. F7F830/F7FC80 cancel the sampled
    // root from the one-bone palette before applying that root motion.
    // OB must therefore receive inverse(Pose(0)) * Pose(frame), not
    // the absolute OMO T/R. Executing these original AVX routines on
    // every source frame independently confirms the initial identity.
    let first = &samples[0].local_transforms[0];
    let origin = first.translation;
    let inverse_rotation = first.rotation.normalize().conjugate();
    for frame in &mut samples {
        let transform = &mut frame.local_transforms[0];
        transform.translation = inverse_rotation * (transform.translation - origin);
        transform.rotation = (inverse_rotation * transform.rotation.normalize()).normalize();
    }
    samples[0].local_transforms[0].translation = Vec3::ZERO;
    samples[0].local_transforms[0].rotation = Quat::IDENTITY;
    let clip = MotionClip { name, sample_rate_hz: 60,
        skeleton: MotionSkeleton { bones:vec![MotionBone { name:bone.name.clone(), parent_index:None,
            rest_local: Transform { scale:Vec3::ONE, rotation:Quat::IDENTITY, translation:Vec3::ZERO } }] }, frames:samples };
    clip.validate().map_err(|e|e.to_string())?;
    Ok(clip)
}

/// Native OB sub_140055E80 dispatches flags & 0xF00 == 0x200 to u16 key
/// indices, aligned to four bytes. sub_140055C20 reads raw float values when
/// the low nibble is zero: 0x3200 (vec3) and 0x4200 (quat). This stage-only
/// path keeps every source frame; the FBX importer's u8-index policy is intact.
fn write_long_stage_clip(clip: &MotionClip, path: &Path) -> Result<(), String> {
    use ssbh_lib::formats::anim::{Anim, Property, TrackTypeV1, TrackV1};
    use ssbh_lib::SsbhByteBuffer;
    clip.validate().map_err(|e|e.to_string())?;
    require(clip.frames.len() <= u16::MAX as usize + 1, "stage clip exceeds u16 frame indices")?;
    let constant = |magic:u32, values:&[f32]| {
        let mut b = magic.to_le_bytes().to_vec();
        for v in values { b.extend_from_slice(&v.to_le_bytes()); }
        b
    };
    let indexed = |magic:u32, rotate:bool| {
        let mut b = magic.to_le_bytes().to_vec();
        b.extend_from_slice(&(clip.frames.len() as u32).to_le_bytes());
        b.extend_from_slice(&1.0f32.to_le_bytes());
        for frame in 0..clip.frames.len() { b.extend_from_slice(&(frame as u16).to_le_bytes()); }
        while b.len()%4!=0 { b.push(0); }
        for frame in &clip.frames {
            let t = &frame.local_transforms[0];
            if rotate {
                for v in t.rotation.to_array() { b.extend_from_slice(&v.to_le_bytes()); }
            } else {
                for v in t.translation.to_array() { b.extend_from_slice(&v.to_le_bytes()); }
            }
        }
        b
    };
    let flag = |v:u16| { let mut b=0x1013u32.to_le_bytes().to_vec(); b.extend_from_slice(&v.to_le_bytes()); b };
    let raw = [flag(0), constant(0x3003,&[1.0,1.0,1.0]),indexed(0x4200,true),indexed(0x3200,false),flag(0x7fff)];
    let end = (clip.frames.len()-1) as f32;
    let animation = Anim::V12 {
        name:path.file_name().unwrap().to_string_lossy().as_ref().into(),
        unk1:end/60.0, final_frame_index:60.0, unk2:end, unk3:0.0,
        tracks:vec![TrackV1 { name:clip.skeleton.bones[0].name.as_str().into(),
            track_type:TrackTypeV1::Transform,
            properties:["CompensateScale","Scale","Rotate","Translate","Visibility"].iter().enumerate()
                .map(|(i,n)|Property { name:(*n).into(), buffer_index:i as u64 }).collect::<Vec<_>>().into(),
        }].into(), buffers:raw.into_iter().map(SsbhByteBuffer::from).collect::<Vec<_>>().into(),
    };
    animation.write_to_file(path).map_err(|e|e.to_string())
}

pub fn repair(source: &Path, root: &Path, report: &Path) -> Result<Value, String> {
    let stage = StagePackage::read_path(source).map_err(|e|e.to_string())?;
    let info: Value = serde_json::from_slice(&std::fs::read(report).map_err(|e|e.to_string())?)
        .map_err(|e|e.to_string())?;
    let object_reports = info["objects"].as_array().ok_or("missing port object report")?;
    let mut changes = Vec::new();
    let mut number_to_source = BTreeMap::new();
    // Validate and prepare every model before writing any file.
    let mut prepared = Vec::new();
    for (number, row) in object_reports.iter().enumerate() {
        let index = row["mbonObject"].as_u64().ok_or("missing source object index")? as usize;
        number_to_source.insert(number, index);
        let definition = stage.objects.get(index).ok_or("source object out of range")?;
        if !definition.animated { continue; }
        let placements: Vec<_> = stage.placements.objects.iter().filter(|p|p.object==index).collect();
        let program = placements.first().ok_or("animated model has no source placements")?.program_id;
        require(placements.iter().all(|p|p.program_id==program && p.program_params.iter().all(|v|*v==0)),
            "mixed or unsupported source motion programs/parameters")?;
        require(program==0 || program==4, "unsupported source stage motion program")?;
        let playing = program==4;
        require(definition.skeletons.len()==1 && definition.motions.len()==1, "one source rig/motion required")?;
        let binds = definition.text.values("bind");
        require(binds.len()==1 && binds[0]==["0","0"],
            "motion repair requires the original part-0 to bone-0 binding")?;
        let rig = Vbn::parse(&definition.skeletons[0]).map_err(|e|e.to_string())?;
        let folder = row["folder"].as_str().ok_or("missing object folder")?;
        require(Path::new(folder).components().count()==1 && !folder.contains(['/', '\\']), "invalid object folder")?;
        let dir = root.join("0/0").join(folder).join("0");
        let mesh_path = dir.join(format!("{folder}__maya__.numshb"));
        require(!dir.join(format!("{folder}__maya__.nuanmb")).exists(),
            "motion repair requires the original static conversion; stage a fresh candidate first")?;
        let mut mesh = MeshData::from_file(&mesh_path).map_err(|e|e.to_string())?;
        let mut originals = BTreeMap::new();
        for (part_i, part) in definition.parts.iter().enumerate() {
            for (nud_i, bytes) in part.nuds.iter().enumerate() {
                if !part.nud_visible_intact(nud_i) { continue; }
                let nud = Nud::parse(bytes).map_err(|e|e.to_string())?;
                require(nud.polysets.iter().all(|s|s.single_bind == -1 && s.polygons.iter().all(|p|p.bone_type==0)),
                    "motion repair requires unskinned world-space source polygons")?;
                for m in nud_meshes(bytes,&format!("p{part_i}n{nud_i}"),false,VertexColorMode::White,
                    &|_,_|Some("unused".into()), &|_|Ok(IDENTITY))? {
                    require(!originals.contains_key(&m.name), "duplicate original mesh identity")?;
                    originals.insert(m.name.clone(),m);
                }
            }
        }
        require(originals.len()==mesh.objects.len(), "original/target mesh count mismatch")?;
        for object in &mut mesh.objects {
            let original = originals.get(&object.name).ok_or("original mesh identity missing")?;
            require(object.vertex_indices==original.indices && object.bone_influences.is_empty(),
                "unexpected mesh topology/skinning")?;
            require(object.parent_bone_name.is_empty(), "motion repair requires unmodified baked source meshes")?;
            require(object.positions.len()==1 && object.normals.len()==1, "unexpected mesh attributes")?;
            // MBON's C58290 multiplies animated bone worlds by the original
            // VBN world-to-bind matrices before assigning the bound part matrix.
            // OB rigid parents instead need the source vertices in bone space.
            let inverse = Mat4::from_cols_array_2d(&rig.bones[0].bind);
            object.positions[0].data = VectorData::Vector3(original.positions.iter().copied()
                .map(|p|inverse.transform_point3(Vec3::from_array(p))).collect());
            object.normals[0].data = VectorData::Vector3(original.normals.iter().copied()
                .map(|n|inverse.transform_vector3(Vec3::from_array(n)).normalize_or_zero()).collect());
            object.parent_bone_name = if playing {rig.bones[0].name.clone()} else {String::new()};
            // Existing tangents live in baked world space too. Rotate them back
            // into original bone space; keep W (handedness) and other attributes.
            for attribute in object.tangents.iter_mut().chain(&mut object.binormals) {
                match &mut attribute.data {
                    VectorData::Vector3(values) => for v in values {
                        *v = inverse.transform_vector3(*v).normalize_or_zero();
                    },
                    VectorData::Vector4(values) => for v in values {
                        let xyz = inverse.transform_vector3(v.truncate()).normalize_or_zero();
                        *v = xyz.extend(v.w);
                    },
                    _ => require(false,"unexpected tangent vector encoding")?,
                }
            }
        }
        let clip = decode(&definition.motions[0], &rig, folder.into())?;
        require(definition.parts.len()==1 && definition.parts[0].collisions.len()==1,
            "motion collision repair requires the original single bound part")?;
        let mut collision = super::collision::vcl_mesh(&definition.parts[0].collisions)?;
        let inverse = Mat4::from_cols_array_2d(&rig.bones[0].bind);
        let inverse64 = glam::DMat4::from_cols_array(&inverse.to_cols_array().map(f64::from));
        for point in &mut collision.vertices {
            *point = inverse64.transform_point3(glam::DVec3::from_array(*point)).to_array();
        }
        let manager = super::collision::havok_filter_manager()?;
        let (hit, hit_report) = super::collision::mesh_to_hkt(&collision,&manager)?;
        require(hit_report.source_triangles==hit_report.hkt_triangles,
            "bound collision lost source faces")?;
        let skel = SkelData { major_version:1,minor_version:0,bones:if playing {vec![BoneData {
            name:rig.bones[0].name.clone(), parent_index:None,
            transform:Mat4::IDENTITY,
            billboard_type:BillboardType::Disabled,
        }]} else {vec![]} };
        changes.push(json!({"sourceObject":index,"objectNumber":number,"folder":folder,"frames":clip.frames.len(),
            "playing":playing,"loop":false,"posePolicy":"original root motion relative to frame zero",
            "collision":hit_report,"collisionPose":"same original VBN inverse bind as the rigid mesh",
            "bone":rig.bones[0].name,"sourceProgramIds":stage.placements.objects.iter()
            .filter(|p|p.object==index).map(|p|p.program_id).collect::<Vec<_>>()}));
        prepared.push((dir,folder.to_string(),mesh,skel,clip,playing,hit));
    }
    require(!prepared.is_empty(), "no supported source motions")?;
    let csv_path = root.join("0/0/info/placement.csv");
    let csv = std::fs::read_to_string(&csv_path).map_err(|e|e.to_string())?;
    let mut lines = Vec::new();
    let mut used = std::collections::BTreeSet::new();
    for line in csv.lines() {
        let mut fields: Vec<String> = line.split(',').map(str::to_owned).collect();
        require(fields.len()%2==0, "malformed target placement row")?;
        let get = |key:&str|fields.chunks_exact(2).find(|p|p[0]==key).map(|p|p[1].clone());
        if get("VDK_TYPE").as_deref()==Some("OBJECT") {
            let number:usize = get("VDK_OBJECTNUMBER").ok_or("missing object number")?.parse().map_err(|_|"invalid object number")?;
            let index = *number_to_source.get(&number).ok_or("unmapped object number")?;
            let coordinate = |key:&str|->Result<f32,String> { get(key).ok_or("missing coordinate")?.parse().map_err(|_|"bad coordinate".into()) };
            let position = [coordinate("VDK_POSITION_X")?,coordinate("VDK_POSITION_Y")?,coordinate("VDK_POSITION_Z")?];
            let rotation = [coordinate("VDK_ROTATION_X")?,coordinate("VDK_ROTATION_Y")?,coordinate("VDK_ROTATION_Z")?];
            let (locator,p) = stage.placements.objects.iter().enumerate().find(|(i,p)|
                !used.contains(i) && p.object==index && p.position==position && p.rotation==rotation)
                .ok_or("target placement does not match original MBON locator")?;
            used.insert(locator);
            for pair in fields.chunks_exact_mut(2) {
                if pair[0]=="VDK_PLACEMENT_NAME" { pair[1]=p.name.clone(); }
                if pair[0]=="VDK_PROGRAMID" && stage.objects[index].animated {
                    pair[1]=if p.program_id==4 {"1"} else {"0"}.into();
                }
            }
            if stage.objects[index].animated && p.program_id==4 {
                for (key,value) in [("VDK_ANIM_INDEX","1"),("VDK_ANIM_WAIT","0"),
                    ("VDK_ANIM_OFFSET","0"),("VDK_ANIM_LOOP","FALSE")] {
                    if let Some(pair) = fields.chunks_exact_mut(2).find(|p|p[0]==key) { pair[1]=value.into(); }
                    else { fields.extend([key.into(),value.into()]); }
                }
            }
        }
        lines.push(fields.join(","));
    }
    require(used.len()==stage.placements.objects.len(), "source placement coverage incomplete")?;
    for (dir,folder,mesh,skel,clip,playing,hit) in prepared {
        mesh.write_to_file(dir.join(format!("{folder}__maya__.numshb"))).map_err(|e|e.to_string())?;
        skel.write_to_file(dir.join(format!("{folder}__maya__.nusktb"))).map_err(|e|e.to_string())?;
        if playing { write_long_stage_clip(&clip,&dir.join(format!("{folder}__maya__.nuanmb")))?; }
        std::fs::write(dir.parent().ok_or("missing object directory")?.join("map_hit.hkt"),hit)
            .map_err(|e|e.to_string())?;
    }
    std::fs::write(csv_path,format!("{}\r\n",lines.join("\r\n"))).map_err(|e|e.to_string())?;
    Ok(json!({"objects":changes,"placementCount":used.len(),"codec":"OMO 1.0: T16/R16 positive W",
        "motionPolicy":"native root-relative pose; source pid 4 plays once, pid 0 holds first pose",
        "runtimeStatus":"requires OB game verification"}))
}
