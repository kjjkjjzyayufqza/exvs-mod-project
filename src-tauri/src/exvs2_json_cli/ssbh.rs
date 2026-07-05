use std::io::Cursor;

use serde_json::{json, Value};
use ssbh_data::mesh_data::VectorData;
use ssbh_data::prelude::{MeshData, ModlData, SkelData, SsbhData};

use super::types::{InspectOptions, InspectType};
use super::util::{insert_object_field, insert_roundtrip};

pub(crate) const SSBH_MAGIC: &[u8; 4] = b"HBSS";
const SSBH_SKEL_TAG: &[u8; 4] = b"LEKS";
const SSBH_MESH_TAG: &[u8; 4] = b"HSEM";
const SSBH_MODL_TAG: &[u8; 4] = b"LDOM";
const NUMSHB_LARGE_FILE_WARNING_BYTES: usize = 1_048_576;

pub(crate) fn inspect_nusktb(
    bytes: &[u8],
    options: &InspectOptions,
    warnings: &mut Vec<String>,
) -> Result<Value, String> {
    let skel = read_ssbh::<SkelData>(bytes)?;
    let mut data = if options.summary {
        json!({
            "majorVersion": skel.major_version,
            "minorVersion": skel.minor_version,
            "boneCount": skel.bones.len(),
            "boneNames": skel.bones.iter().map(|bone| bone.name.as_str()).collect::<Vec<_>>(),
            "bones": skel.bones.iter().enumerate().map(|(index, bone)| json!({
                "index": index,
                "name": bone.name,
                "parentIndex": bone.parent_index,
            })).collect::<Vec<_>>()
        })
    } else {
        serde_json::to_value(&skel).map_err(|e| format!("Serialize nusktb failed: {e}"))?
    };

    insert_object_field(
        &mut data,
        "fieldNotes",
        json!({
            "format": "SSBH Skel (.nusktb). Bone transforms are parent-relative; roundtrip may recalculate matrices.",
            "jnttblCorrelation": "Compare bone names against sibling .jnttbl or vernier_table bone_hash fields."
        }),
    )?;

    if options.roundtrip_check {
        let rebuilt = write_ssbh(&skel)?;
        insert_ssbh_roundtrip(&mut data, bytes, &rebuilt, warnings)?;
    }

    Ok(data)
}

pub(crate) fn inspect_numshb(
    bytes: &[u8],
    options: &InspectOptions,
    warnings: &mut Vec<String>,
) -> Result<Value, String> {
    if bytes.len() >= NUMSHB_LARGE_FILE_WARNING_BYTES && !options.summary && !options.raw_fields {
        warnings.push(format!(
            "numshb is {} bytes; prefer --summary unless you explicitly need full mesh JSON",
            bytes.len()
        ));
    }

    let mesh = read_ssbh::<MeshData>(bytes)?;
    let mut data = if options.raw_fields {
        serde_json::to_value(&mesh).map_err(|e| format!("Serialize numshb failed: {e}"))?
    } else {
        json!({
            "majorVersion": mesh.major_version,
            "minorVersion": mesh.minor_version,
            "isVs2": mesh.is_vs2,
            "objectCount": mesh.objects.len(),
            "objects": mesh.objects.iter().map(|object| json!({
                "name": object.name,
                "subindex": object.subindex,
                "parentBoneName": object.parent_bone_name,
                "vertexCount": mesh_object_vertex_count(object),
                "indexCount": object.vertex_indices.len(),
                "attributeNames": mesh_object_attribute_names(object),
                "riggingBoneCount": object.bone_influences.len()
            })).collect::<Vec<_>>()
        })
    };

    insert_object_field(
        &mut data,
        "fieldNotes",
        json!({
            "format": "SSBH Mesh (.numshb). Full vertex buffers are omitted unless --raw-fields is set.",
            "roundtrip": "Bounding volumes and buffer encodings may differ after rewrite even when geometry is equivalent."
        }),
    )?;

    if options.roundtrip_check {
        let rebuilt = write_ssbh(&mesh)?;
        insert_ssbh_roundtrip(&mut data, bytes, &rebuilt, warnings)?;
    }

    Ok(data)
}

pub(crate) fn inspect_numdlb(
    bytes: &[u8],
    options: &InspectOptions,
    warnings: &mut Vec<String>,
) -> Result<Value, String> {
    let modl = read_ssbh::<ModlData>(bytes)?;
    let mut data = if options.summary {
        json!({
            "majorVersion": modl.major_version,
            "minorVersion": modl.minor_version,
            "modelName": modl.model_name,
            "skeletonFileName": modl.skeleton_file_name,
            "meshFileName": modl.mesh_file_name,
            "materialFileNames": modl.material_file_names,
            "animationFileName": modl.animation_file_name,
            "entryCount": modl.entries.len(),
            "entries": modl.entries.iter().map(|entry| json!({
                "meshObjectName": entry.mesh_object_name,
                "meshObjectSubindex": entry.mesh_object_subindex,
                "materialLabel": entry.material_label
            })).collect::<Vec<_>>()
        })
    } else {
        serde_json::to_value(&modl).map_err(|e| format!("Serialize numdlb failed: {e}"))?
    };

    insert_object_field(
        &mut data,
        "fieldNotes",
        json!({
            "format": "SSBH Modl (.numdlb). Links sibling .nusktb, .numshb, and .numatb files in the same model folder."
        }),
    )?;

    if options.roundtrip_check {
        let rebuilt = write_ssbh(&modl)?;
        insert_ssbh_roundtrip(&mut data, bytes, &rebuilt, warnings)?;
    }

    Ok(data)
}

pub(crate) fn detect_ssbh_type(bytes: &[u8], source_path: &str) -> Option<InspectType> {
    if bytes.get(0..4) != Some(SSBH_MAGIC) {
        return None;
    }

    let lower = source_path.replace('\\', "/").to_ascii_lowercase();
    if lower.ends_with(".nusktb") {
        return Some(InspectType::Nusktb);
    }
    if lower.ends_with(".numshb") {
        return Some(InspectType::Numshb);
    }
    if lower.ends_with(".numdlb") || lower.ends_with(".nusrcmdlb") {
        return Some(InspectType::Numdlb);
    }

    match ssbh_data_tag(bytes) {
        Some("nusktb") => Some(InspectType::Nusktb),
        Some("numshb") => Some(InspectType::Numshb),
        Some("numdlb") => Some(InspectType::Numdlb),
        _ => None,
    }
}

fn read_ssbh<T: SsbhData>(bytes: &[u8]) -> Result<T, String> {
    let mut cursor = Cursor::new(bytes);
    T::read(&mut cursor).map_err(|error| format!("Failed to parse SSBH payload: {error}"))
}

fn write_ssbh<T: SsbhData>(value: &T) -> Result<Vec<u8>, String> {
    let mut cursor = Cursor::new(Vec::new());
    value
        .write(&mut cursor)
        .map_err(|error| format!("Failed to write SSBH payload: {error}"))?;
    Ok(cursor.into_inner())
}

fn mesh_object_vertex_count(object: &ssbh_data::mesh_data::MeshObjectData) -> usize {
    object
        .positions
        .first()
        .map(|attribute| match &attribute.data {
            VectorData::Vector2(values) => values.len(),
            VectorData::Vector3(values) => values.len(),
            VectorData::Vector4(values) => values.len(),
        })
        .unwrap_or(0)
}

fn mesh_object_attribute_names(object: &ssbh_data::mesh_data::MeshObjectData) -> Vec<&str> {
    object
        .positions
        .iter()
        .chain(object.normals.iter())
        .chain(object.binormals.iter())
        .chain(object.tangents.iter())
        .chain(object.texture_coordinates.iter())
        .chain(object.color_sets.iter())
        .map(|attribute| attribute.name.as_str())
        .collect()
}

fn ssbh_data_tag(bytes: &[u8]) -> Option<&'static str> {
    let tag = bytes.get(0x10..0x14)?;
    if tag == SSBH_SKEL_TAG {
        Some("nusktb")
    } else if tag == SSBH_MESH_TAG {
        Some("numshb")
    } else if tag == SSBH_MODL_TAG {
        Some("numdlb")
    } else {
        None
    }
}

fn insert_ssbh_roundtrip(
    target: &mut Value,
    source: &[u8],
    rebuilt: &[u8],
    warnings: &mut Vec<String>,
) -> Result<(), String> {
    if source != rebuilt {
        warnings.push(
            "SSBH roundtrip is not byte-identical; this is expected for Skel/Mesh/Modl rewrites"
                .to_string(),
        );
    }
    insert_roundtrip(target, source, rebuilt)
}
