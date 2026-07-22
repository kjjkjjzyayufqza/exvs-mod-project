use std::collections::BTreeMap;
use std::fs;

use serde_json::{json, Map, Value};

use super::character_id_table::{inspect_character_id_table, CHARACTER_ID_TABLE_MAGIC};
use super::ssbh::{detect_ssbh_type, inspect_numdlb, inspect_numshb, inspect_nusktb, SSBH_MAGIC};
use super::types::{InspectOptions, InspectType};
use super::util::{
    format_hex_u32, format_hex_usize, hash_json, insert_object_field, insert_roundtrip, le_bytes4,
    optional_hash_hex, pool_name, raw_value_json, supported_type_list,
};
use super::{SCHEMA_VERSION, TOOL_NAME};
use crate::format::armsparam::{build_armsparam, parse_armsparam, ARMSPARAM_COMMAND_POOL};
use crate::format::bulletparam::{build_bulletparam, parse_bulletparam, BULLETPARAM_COMMAND_POOL};
use crate::format::list_command_pool::ListData;
use crate::format::navilist::{
    build_navilist_data, parse_navilist, parse_navilist_data, NAVILIST_COMMAND_POOL,
};
use crate::format::param_bin_format::ParamFieldSpec;
use crate::format::param_entry_schema::{snake_to_camel, ParamCommandPool};
use crate::format::pilotlist::{
    build_pilotlist_data, parse_pilotlist, parse_pilotlist_data, PILOTLIST_COMMAND_POOL,
};
use crate::format::projectile_depiction_table::{
    build_projectile_depiction_table, parse_projectile_depiction_table,
    PROJECTILE_DEPICTION_TABLE_COMMAND_POOL,
};
use crate::format::speedparam::{build_speedparam, parse_speedparam, SPEEDPARAM_COMMAND_POOL};
use crate::format::vernier_table::{
    build_vernier_table, parse_vernier_table, VernierTableData, VERNIER_TABLE_COMMAND_POOL,
};
use crate::jnttbl_format::{bytes_to_hex_upper_spaced, parse_jnttbl_bytes, serialize_jnttbl};

pub fn inspect_path(source_path: &str, options: InspectOptions) -> Result<Value, String> {
    let bytes = fs::read(source_path).map_err(|e| format!("Failed to read {source_path}: {e}"))?;
    inspect_bytes(source_path, &bytes, options)
}

pub fn inspect_bytes(
    source_path: &str,
    bytes: &[u8],
    options: InspectOptions,
) -> Result<Value, String> {
    let mut warnings = Vec::new();
    let inspect_type = detect_type(source_path, bytes, options.inspect_type, &mut warnings)?;
    let data = match inspect_type {
        InspectType::Jnttbl => inspect_jnttbl(bytes, &options, &mut warnings)?,
        InspectType::CharacterIdTable => {
            inspect_character_id_table(bytes, &options, &mut warnings)?
        }
        InspectType::VernierTable => inspect_vernier_table(bytes, &options)?,
        InspectType::ArmsParam => inspect_armsparam(bytes, &options)?,
        InspectType::BulletParam => inspect_bulletparam(bytes, &options)?,
        InspectType::SpeedParam => inspect_speedparam(bytes, &options)?,
        InspectType::ProjectileDepictionTable => {
            inspect_projectile_depiction_table(bytes, &options)?
        }
        InspectType::NaviList => inspect_navi_list(bytes, &options)?,
        InspectType::PilotList => inspect_pilot_list(bytes, &options)?,
        InspectType::Nusktb => inspect_nusktb(bytes, &options, &mut warnings)?,
        InspectType::Numshb => inspect_numshb(bytes, &options, &mut warnings)?,
        InspectType::Numdlb => inspect_numdlb(bytes, &options, &mut warnings)?,
    };

    Ok(json!({
        "tool": TOOL_NAME,
        "schemaVersion": SCHEMA_VERSION,
        "sourcePath": source_path,
        "detectedType": inspect_type.as_str(),
        "byteLength": bytes.len(),
        "endianness": {
            "hashMatching": "little-endian",
            "displayCanConvert": true
        },
        "warnings": warnings,
        "data": data
    }))
}

pub(crate) fn detect_type(
    source_path: &str,
    bytes: &[u8],
    explicit: Option<InspectType>,
    warnings: &mut Vec<String>,
) -> Result<InspectType, String> {
    if let Some(kind) = explicit {
        return Ok(kind);
    }

    if bytes.starts_with(b"JNTT") {
        return Ok(InspectType::Jnttbl);
    }
    if bytes.starts_with(&CHARACTER_ID_TABLE_MAGIC) {
        return Ok(InspectType::CharacterIdTable);
    }

    let lower = source_path.replace('\\', "/").to_ascii_lowercase();
    if lower.ends_with(".jnttbl") {
        return Ok(InspectType::Jnttbl);
    }
    if lower.ends_with("character_id_table.bin") || lower.contains("character_id_table") {
        return Ok(InspectType::CharacterIdTable);
    }
    if lower.contains("vernier_table") {
        return Ok(InspectType::VernierTable);
    }
    if lower.ends_with("armsparam.bin") || lower.contains("/armsparam") {
        return Ok(InspectType::ArmsParam);
    }
    if lower.ends_with("bulletparam.bin") || lower.contains("/bulletparam") {
        return Ok(InspectType::BulletParam);
    }
    if lower.ends_with("speedparam.bin") || lower.contains("/speedparam") {
        return Ok(InspectType::SpeedParam);
    }
    if lower.contains("projectile_depiction_table") {
        return Ok(InspectType::ProjectileDepictionTable);
    }
    if lower.contains("navi_list") || lower.ends_with("navi_list.bin") || lower.ends_with("navi_list.vgsht2")
    {
        return Ok(InspectType::NaviList);
    }
    if lower.contains("pilot_list")
        || lower.ends_with("pilot_list.bin")
        || lower.ends_with("pilot_list.vgsht2")
    {
        return Ok(InspectType::PilotList);
    }
    if let Some(kind) = detect_ssbh_type(bytes, source_path) {
        return Ok(kind);
    }

    if bytes.len() >= 4 && bytes.get(0..4) == Some(SSBH_MAGIC) {
        warnings.push(format!(
            "HBSS container found but SSBH data tag at 0x10 is {:?}; pass --type explicitly",
            bytes
                .get(0x10..0x14)
                .map(|tag| String::from_utf8_lossy(tag).to_string())
        ));
    }

    if bytes.len() >= 4
        && u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
            == crate::format::param_bin_format::PARAM_BIN_MAGIC
    {
        warnings.push(
            "param binary magic found, but the concrete table type is not inferable from this path"
                .to_string(),
        );
    }

    Err(format!(
        "Unable to detect EXVS2 resource type for '{source_path}'. Pass --type with one of: {}",
        supported_type_list()
    ))
}

fn inspect_jnttbl(
    bytes: &[u8],
    options: &InspectOptions,
    warnings: &mut Vec<String>,
) -> Result<Value, String> {
    let doc = parse_jnttbl_bytes(bytes)?;
    let mut seen = BTreeMap::<u32, Vec<u32>>::new();
    let mut bones = Vec::with_capacity(doc.entries.len());

    for (index, entry) in doc.entries.iter().enumerate() {
        seen.entry(entry.hash_id)
            .or_default()
            .push(entry.bone_index);
        let offset = 16 + index * 8;
        let raw = bytes
            .get(offset..offset + 8)
            .ok_or_else(|| format!("JNTT entry {index} is out of range"))?;
        let hash = hash_json(entry.hash_id);
        bones.push(json!({
            "boneHash": hash,
            "boneIndex": entry.bone_index,
            "offset": format_hex_usize(offset),
            "rawLeBytes": bytes_to_hex_upper_spaced(raw),
            "idaBytePattern": le_bytes4(entry.hash_id),
        }));
    }

    for (hash, indexes) in &seen {
        if indexes.len() > 1 {
            warnings.push(format!(
                "duplicate bone hash {} appears at bone indices {}",
                format_hex_u32(*hash),
                indexes
                    .iter()
                    .map(u32::to_string)
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }
    }

    let lookup_by_hash = seen
        .iter()
        .map(|(hash, indexes)| (format_hex_u32(*hash), json!(indexes)))
        .collect::<Map<String, Value>>();

    let mut data = json!({
        "header": {
            "magic": "JNTT",
            "version": doc.version,
            "declaredBoneCount": doc.bone_count,
            "entryCount": doc.entries.len(),
            "flag": doc.flag,
            "flagHex": format_hex_u32(doc.flag as u32)
        },
        "bones": bones,
        "lookupByHash": lookup_by_hash
    });

    if options.summary {
        data = json!({
            "entryCount": doc.entries.len(),
            "duplicateHashCount": seen.values().filter(|indexes| indexes.len() > 1).count(),
            "boneHashes": doc.entries.iter().map(|entry| format_hex_u32(entry.hash_id)).collect::<Vec<_>>()
        });
    }

    if options.roundtrip_check {
        let rebuilt = serialize_jnttbl(&doc)?;
        insert_object_field(
            &mut data,
            "roundtripCheck",
            json!({
                "byteIdentical": rebuilt == bytes,
                "rebuiltByteLength": rebuilt.len()
            }),
        )?;
    }

    Ok(data)
}

fn inspect_vernier_table(bytes: &[u8], options: &InspectOptions) -> Result<Value, String> {
    let parsed = parse_vernier_table(bytes)?;
    let summary = vernier_summary(&parsed);
    let mut data = if options.summary {
        json!({
            "header": parsed.header,
            "enabledFollowBoneRows": summary
        })
    } else {
        let mut value = serde_json::to_value(&parsed)
            .map_err(|e| format!("Serialize vernier_table failed: {e}"))?;
        insert_object_field(&mut value, "enabledFollowBoneRows", summary)?;
        value
    };

    if options.raw_fields {
        insert_object_field(
            &mut data,
            "rawEntries",
            raw_entry_fields(
                parsed
                    .entries
                    .iter()
                    .map(|entry| (entry.entry_id, &entry.commands))
                    .collect::<Vec<_>>()
                    .as_slice(),
                &parsed.field_specs,
                VERNIER_TABLE_COMMAND_POOL,
            ),
        )?;
    }

    if options.roundtrip_check {
        let rebuilt = build_vernier_table(&parsed)?;
        insert_roundtrip(&mut data, bytes, &rebuilt)?;
    }

    Ok(data)
}

fn inspect_armsparam(bytes: &[u8], options: &InspectOptions) -> Result<Value, String> {
    let parsed = parse_armsparam(bytes)?;
    let mut data = typed_param_data(
        "armsparam",
        serde_json::to_value(&parsed).map_err(|e| format!("Serialize armsparam failed: {e}"))?,
        options.summary,
    );
    insert_object_field(
        &mut data,
        "fieldNotes",
        json!({
            "isVernier": "arms_param field 0x5B072B6C; not the same as task_param+5 runtime vernier-controller gate"
        }),
    )?;
    insert_raw_fields_and_roundtrip(
        &mut data,
        bytes,
        options,
        &parsed
            .entries
            .iter()
            .map(|entry| (entry.entry_id, &entry.commands))
            .collect::<Vec<_>>(),
        &parsed.field_specs,
        ARMSPARAM_COMMAND_POOL,
        || build_armsparam(&parsed),
    )
}

fn inspect_bulletparam(bytes: &[u8], options: &InspectOptions) -> Result<Value, String> {
    let parsed = parse_bulletparam(bytes)?;
    let mut data = typed_param_data(
        "bulletparam",
        serde_json::to_value(&parsed).map_err(|e| format!("Serialize bulletparam failed: {e}"))?,
        options.summary,
    );
    insert_object_field(
        &mut data,
        "fieldNotes",
        json!({
            "identity": "Do not infer gameplay move names from bullet rows without explicit local or atwiki mapping."
        }),
    )?;
    insert_raw_fields_and_roundtrip(
        &mut data,
        bytes,
        options,
        &parsed
            .entries
            .iter()
            .map(|entry| (entry.entry_id, &entry.commands))
            .collect::<Vec<_>>(),
        &parsed.field_specs,
        BULLETPARAM_COMMAND_POOL,
        || build_bulletparam(&parsed),
    )
}

fn inspect_speedparam(bytes: &[u8], options: &InspectOptions) -> Result<Value, String> {
    let parsed = parse_speedparam(bytes)?;
    let mut data = typed_param_data(
        "speedparam",
        serde_json::to_value(&parsed).map_err(|e| format!("Serialize speedparam failed: {e}"))?,
        options.summary,
    );
    insert_object_field(
        &mut data,
        "fieldNotes",
        json!({
            "runtimeLookup": "MSC reads movement rows with sys_0(0x60006, speedparamRow, fieldHash)."
        }),
    )?;
    insert_raw_fields_and_roundtrip(
        &mut data,
        bytes,
        options,
        &parsed
            .entries
            .iter()
            .map(|entry| (entry.entry_id, &entry.commands))
            .collect::<Vec<_>>(),
        &parsed.field_specs,
        SPEEDPARAM_COMMAND_POOL,
        || build_speedparam(&parsed),
    )
}

fn inspect_projectile_depiction_table(
    bytes: &[u8],
    options: &InspectOptions,
) -> Result<Value, String> {
    let parsed = parse_projectile_depiction_table(bytes)?;
    let mut data = typed_param_data(
        "projectile_depiction_table",
        serde_json::to_value(&parsed)
            .map_err(|e| format!("Serialize projectile_depiction_table failed: {e}"))?,
        options.summary,
    );
    insert_object_field(
        &mut data,
        "fieldNotes",
        json!({
            "identity": "Projectile depiction rows are resource evidence; hook behavior still needs dispatcher and runtime evidence."
        }),
    )?;
    insert_raw_fields_and_roundtrip(
        &mut data,
        bytes,
        options,
        &parsed
            .entries
            .iter()
            .map(|entry| (entry.entry_id, &entry.commands))
            .collect::<Vec<_>>(),
        &parsed.field_specs,
        PROJECTILE_DEPICTION_TABLE_COMMAND_POOL,
        || build_projectile_depiction_table(&parsed),
    )
}

fn inspect_navi_list(bytes: &[u8], options: &InspectOptions) -> Result<Value, String> {
    let parsed = parse_navilist_data(bytes)?;
    let mut data = if options.summary {
        navi_list_summary(&parsed)
    } else {
        parse_navilist(bytes)?
    };
    insert_object_field(
        &mut data,
        "fieldNotes",
        json!({
            "role": "Support navi (プレイヤー/バトルナビ). Not the MS pilot costume table.",
            "characterUniqueId": "Small navi id (ハロ=1). Multiple rows share one id for costumes.",
            "costumeIndex": "0 = default outfit; 1+ = alternate costume rows.",
            "seriesListEntryId": "Foreign key to series_list.entryIds.",
            "displayName": "Obfuscated Japanese name decoded by the param_bin string pool."
        }),
    )?;
    insert_raw_fields_and_roundtrip(
        &mut data,
        bytes,
        options,
        &parsed
            .entries
            .iter()
            .map(|entry| (entry.entry_id, &entry.commands))
            .collect::<Vec<_>>(),
        &parsed.field_specs,
        NAVILIST_COMMAND_POOL,
        || build_navilist_data(&parsed),
    )
}

fn inspect_pilot_list(bytes: &[u8], options: &InspectOptions) -> Result<Value, String> {
    let parsed = parse_pilotlist_data(bytes)?;
    let mut data = if options.summary {
        pilot_list_summary(&parsed)
    } else {
        parse_pilotlist(bytes)?
    };
    insert_object_field(
        &mut data,
        "fieldNotes",
        json!({
            "role": "MS pilot presentation / costume resource keys. Not the left-side support navi.",
            "pilotNameShortFull": "Internal codes like PS001A01 / P001A01; Japanese names live on character_list + localization.",
            "seriesListEntryId": "Foreign key to series_list.entryIds.",
            "msPilotLabel": "S_MS_PILOT_### keys; empty string on some unused rows."
        }),
    )?;
    insert_raw_fields_and_roundtrip(
        &mut data,
        bytes,
        options,
        &parsed
            .entries
            .iter()
            .map(|entry| (entry.entry_id, &entry.commands))
            .collect::<Vec<_>>(),
        &parsed.field_specs,
        PILOTLIST_COMMAND_POOL,
        || build_pilotlist_data(&parsed),
    )
}

fn navi_list_summary(parsed: &ListData) -> Value {
    let mut unique_navi = std::collections::BTreeSet::new();
    let mut costume_rows = 0u32;
    let rows: Vec<Value> = parsed
        .entries
        .iter()
        .map(|entry| {
            let uid = entry.commands.get(&0xA88E762A).copied().unwrap_or(0);
            let costume = entry.commands.get(&0x692B6C6E).copied().unwrap_or(0);
            unique_navi.insert(uid);
            if costume != 0 {
                costume_rows += 1;
            }
            json!({
                "entryId": entry.entry_id,
                "entryIdHex": format_hex_u32(entry.entry_id),
                "characterUniqueId": uid,
                "costumeIndex": costume,
                "displayName": entry.strings.get(&0xAA6A29E5),
                "seriesListEntryId": optional_hash_hex(entry.commands.get(&0xBF885105).copied()),
                "enabledCode": entry.commands.get(&0xFE2E83D0).copied()
            })
        })
        .collect();
    json!({
        "fileType": "navi_list",
        "header": {
            "entryCount": parsed.header.entry_count,
            "commandsCount": parsed.header.commands_count,
            "entrySize": parsed.header.entry_size
        },
        "uniqueNaviCount": unique_navi.len(),
        "costumeVariantRows": costume_rows,
        "entries": rows
    })
}

fn pilot_list_summary(parsed: &ListData) -> Value {
    let rows: Vec<Value> = parsed
        .entries
        .iter()
        .map(|entry| {
            json!({
                "entryId": entry.entry_id,
                "pilotNameShort": entry.strings.get(&0x44359307),
                "pilotNameFull": entry.strings.get(&0x4F03C86C),
                "msPilotLabel": entry.strings.get(&0x321F8B3F),
                "pilotLabel": entry.strings.get(&0xBA0F2DED),
                "seriesListEntryId": optional_hash_hex(entry.commands.get(&0xBF885105).copied())
            })
        })
        .collect();
    json!({
        "fileType": "pilot_list",
        "header": {
            "entryCount": parsed.header.entry_count,
            "commandsCount": parsed.header.commands_count,
            "entrySize": parsed.header.entry_size
        },
        "entryCount": parsed.entries.len(),
        "entries": rows
    })
}

fn insert_raw_fields_and_roundtrip(
    data: &mut Value,
    bytes: &[u8],
    options: &InspectOptions,
    entries: &[(u32, &std::collections::HashMap<u32, u32>)],
    field_specs: &[ParamFieldSpec],
    pool: ParamCommandPool,
    build: impl FnOnce() -> Result<Vec<u8>, String>,
) -> Result<Value, String> {
    if options.raw_fields {
        insert_object_field(
            data,
            "rawEntries",
            raw_entry_fields(entries, field_specs, pool),
        )?;
    }
    if options.roundtrip_check {
        let rebuilt = build()?;
        insert_roundtrip(data, bytes, &rebuilt)?;
    }
    Ok(data.clone())
}

fn typed_param_data(file_type: &str, parsed: Value, summary: bool) -> Value {
    if !summary {
        return parsed;
    }

    json!({
        "fileType": file_type,
        "header": parsed.get("header").cloned().unwrap_or(Value::Null),
        "entryCount": parsed
            .get("entries")
            .and_then(Value::as_array)
            .map(|entries| entries.len())
            .unwrap_or(0),
        "fieldSpecCount": parsed
            .get("fieldSpecs")
            .and_then(Value::as_array)
            .map(|fields| fields.len())
            .unwrap_or(0)
    })
}

fn vernier_summary(parsed: &VernierTableData) -> Value {
    let rows = parsed
        .entries
        .iter()
        .filter(|entry| {
            entry.commands.get(&0xFA45_A15F).copied().unwrap_or(0) != 0
                && entry.commands.get(&0x2DB5_26FD).copied().unwrap_or(0) != 0
        })
        .map(|entry| {
            json!({
                "entryIdHex": format_hex_u32(entry.entry_id),
                "hitgroupRef": optional_hash_hex(entry.commands.get(&0xEDD1_C108).copied()),
                "boneHash": optional_hash_hex(entry.commands.get(&0xD32D_39ED).copied()),
                "effectId": optional_hash_hex(entry.commands.get(&0x4967_2094).copied()),
                "effectModelHash": optional_hash_hex(entry.commands.get(&0x0FDB_D536).copied()),
                "isEnabled": true,
                "isFollowBone": true
            })
        })
        .collect::<Vec<_>>();
    Value::Array(rows)
}

fn raw_entry_fields(
    entries: &[(u32, &std::collections::HashMap<u32, u32>)],
    field_specs: &[ParamFieldSpec],
    pool: ParamCommandPool,
) -> Value {
    let rows = entries
        .iter()
        .map(|(entry_id, commands)| {
            let fields = field_specs
                .iter()
                .filter_map(|spec| {
                    commands.get(&spec.hash).copied().map(|raw| {
                        json!({
                            "hash": hash_json(spec.hash),
                            "name": pool_name(pool, spec.hash),
                            "jsonKey": pool_name(pool, spec.hash).map(snake_to_camel),
                            "kind": spec.kind,
                            "entryOffset": spec.entry_offset,
                            "entryOffsetHex": format_hex_u32(spec.entry_offset),
                            "rawValue": raw_value_json(spec.kind, raw),
                            "rawU32": raw,
                            "rawHex": format_hex_u32(raw),
                            "rawLeBytes": le_bytes4(raw)
                        })
                    })
                })
                .collect::<Vec<_>>();
            json!({
                "entryId": entry_id,
                "entryIdHex": format_hex_u32(*entry_id),
                "fields": fields
            })
        })
        .collect::<Vec<_>>();
    Value::Array(rows)
}
