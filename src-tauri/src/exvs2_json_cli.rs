use std::collections::BTreeMap;
use std::fs;

use serde_json::{json, Map, Value};

use crate::format::armsparam::{build_armsparam, parse_armsparam, ARMSPARAM_COMMAND_POOL};
use crate::format::bulletparam::{build_bulletparam, parse_bulletparam, BULLETPARAM_COMMAND_POOL};
use crate::format::param_bin_format::ParamFieldSpec;
use crate::format::param_entry_schema::{
    snake_to_camel, ParamCommandPool, KIND_F32, KIND_I32, KIND_U32,
};
use crate::format::projectile_depiction_table::{
    build_projectile_depiction_table, parse_projectile_depiction_table,
    PROJECTILE_DEPICTION_TABLE_COMMAND_POOL,
};
use crate::format::vernier_table::{
    build_vernier_table, parse_vernier_table, VernierTableData, VERNIER_TABLE_COMMAND_POOL,
};
use crate::jnttbl_format::{bytes_to_hex_upper_spaced, parse_jnttbl_bytes, serialize_jnttbl};

const TOOL_NAME: &str = "exvs2-json";
const SCHEMA_VERSION: u32 = 1;
const CHARACTER_ID_TABLE_MAGIC: [u8; 4] = [0xA9, 0xB8, 0xAB, 0xCE];
const CHARACTER_ID_TABLE_HEADER_SIZE: usize = 0x20;
const CHARACTER_ID_TABLE_ENTRY_SIZE: usize = 0x18;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InspectType {
    Jnttbl,
    CharacterIdTable,
    VernierTable,
    ArmsParam,
    BulletParam,
    ProjectileDepictionTable,
}

impl InspectType {
    pub fn as_str(self) -> &'static str {
        match self {
            InspectType::Jnttbl => "jnttbl",
            InspectType::CharacterIdTable => "character_id_table",
            InspectType::VernierTable => "vernier_table",
            InspectType::ArmsParam => "armsparam",
            InspectType::BulletParam => "bulletparam",
            InspectType::ProjectileDepictionTable => "projectile_depiction_table",
        }
    }

    fn parse(value: &str) -> Result<Self, String> {
        match normalize_type_name(value).as_str() {
            "jnttbl" => Ok(InspectType::Jnttbl),
            "character_id_table" => Ok(InspectType::CharacterIdTable),
            "vernier_table" => Ok(InspectType::VernierTable),
            "armsparam" => Ok(InspectType::ArmsParam),
            "bulletparam" => Ok(InspectType::BulletParam),
            "projectile_depiction_table" => Ok(InspectType::ProjectileDepictionTable),
            other => Err(format!(
                "Unsupported --type '{other}'. Supported types: {}",
                supported_type_list()
            )),
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct InspectOptions {
    pub inspect_type: Option<InspectType>,
    pub pretty: bool,
    pub summary: bool,
    pub raw_fields: bool,
    pub roundtrip_check: bool,
}

#[derive(Debug, Default)]
struct CorrelateOptions {
    unit: Option<String>,
    weapon: Option<String>,
    dispatcher_id: Option<u32>,
    player_facing_name: Option<String>,
    atwiki_url: Option<String>,
    ida_dispatcher: Option<String>,
    ida_wrapper: Option<String>,
    ida_constructor: Option<String>,
    task_class: Option<String>,
    object_size: Option<String>,
    pretty: bool,
}

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
        InspectType::ProjectileDepictionTable => {
            inspect_projectile_depiction_table(bytes, &options)?
        }
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

pub fn run_cli_with_args<I, S>(args: I) -> Result<String, String>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let args = args.into_iter().map(Into::into).collect::<Vec<_>>();
    if args.is_empty() || matches!(args[0].as_str(), "-h" | "--help" | "help") {
        return Ok(usage());
    }

    match args[0].as_str() {
        "inspect" => {
            let (source_path, options) = parse_inspect_args(&args[1..])?;
            let pretty = options.pretty;
            let report = inspect_path(&source_path, options)?;
            format_json(&report, pretty)
        }
        "correlate" => {
            let options = parse_correlate_args(&args[1..])?;
            let pretty = options.pretty;
            let report = build_correlation_report(options)?;
            format_json(&report, pretty)
        }
        other => Err(format!("Unknown command '{other}'.\n\n{}", usage())),
    }
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
                ARMSPARAM_COMMAND_POOL,
            ),
        )?;
    }
    if options.roundtrip_check {
        let rebuilt = build_armsparam(&parsed)?;
        insert_roundtrip(&mut data, bytes, &rebuilt)?;
    }
    Ok(data)
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
                BULLETPARAM_COMMAND_POOL,
            ),
        )?;
    }
    if options.roundtrip_check {
        let rebuilt = build_bulletparam(&parsed)?;
        insert_roundtrip(&mut data, bytes, &rebuilt)?;
    }
    Ok(data)
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
                PROJECTILE_DEPICTION_TABLE_COMMAND_POOL,
            ),
        )?;
    }
    if options.roundtrip_check {
        let rebuilt = build_projectile_depiction_table(&parsed)?;
        insert_roundtrip(&mut data, bytes, &rebuilt)?;
    }
    Ok(data)
}

fn inspect_character_id_table(
    bytes: &[u8],
    options: &InspectOptions,
    warnings: &mut Vec<String>,
) -> Result<Value, String> {
    let parsed = parse_character_id_table(bytes)?;
    let mut seen = BTreeMap::<i32, usize>::new();
    let mut duplicate_ids = Vec::new();
    let rows = parsed
        .rows
        .iter()
        .enumerate()
        .map(|(index, row)| {
            if seen.insert(row.character_id, index).is_some() {
                duplicate_ids.push(row.character_id);
            }
            json!({
                "index": index,
                "characterId": row.character_id,
                "characterIdHex": format_hex_u32(row.character_id as u32),
                "idOffset": format_hex_usize(row.id_offset),
                "entryOffset": format_hex_usize(row.entry_offset),
                "model": signed_resource_json(row.model),
                "effect": signed_resource_json(row.effect),
                "sound": signed_resource_json(row.sound),
                "param": signed_resource_json(row.param),
                "msc": signed_resource_json(row.msc),
                "motion": signed_resource_json(row.motion),
                "rawLeBytes": bytes_to_hex_upper_spaced(
                    bytes.get(row.entry_offset..row.entry_offset + CHARACTER_ID_TABLE_ENTRY_SIZE)
                        .unwrap_or_default()
                )
            })
        })
        .collect::<Vec<_>>();

    duplicate_ids.sort_unstable();
    duplicate_ids.dedup();
    for id in &duplicate_ids {
        warnings.push(format!(
            "duplicate character id {id} appears in character_id_table"
        ));
    }

    let lookup_by_character_id = parsed
        .rows
        .iter()
        .map(|row| {
            (
                row.character_id.to_string(),
                json!({
                    "model": format_hex_u32(row.model as u32),
                    "effect": format_hex_u32(row.effect as u32),
                    "sound": format_hex_u32(row.sound as u32),
                    "param": format_hex_u32(row.param as u32),
                    "msc": format_hex_u32(row.msc as u32),
                    "motion": format_hex_u32(row.motion as u32)
                }),
            )
        })
        .collect::<Map<String, Value>>();

    let header = json!({
        "magic": "A9 B8 AB CE",
        "fileSize": parsed.file_size,
        "declaredCharacterCount": parsed.character_count,
        "entrySize": parsed.entry_size,
        "entrySizeHex": format_hex_u32(parsed.entry_size as u32),
        "idArrayOffset": format_hex_usize(CHARACTER_ID_TABLE_HEADER_SIZE),
        "dataArrayOffset": format_hex_usize(parsed.data_start),
        "requiredByteLength": parsed.required_size
    });

    let mut data = if options.summary {
        json!({
            "header": header,
            "rowCount": parsed.rows.len(),
            "duplicateCharacterIds": duplicate_ids,
            "resourceColumns": ["model", "effect", "sound", "param", "msc", "motion"]
        })
    } else {
        json!({
            "header": header,
            "rows": rows,
            "lookupByCharacterId": lookup_by_character_id
        })
    };

    if options.roundtrip_check {
        let rebuilt = build_character_id_table(&parsed)?;
        insert_roundtrip(&mut data, bytes, &rebuilt)?;
    }

    Ok(data)
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

fn raw_value_json(kind: u32, raw: u32) -> Value {
    match kind {
        KIND_U32 => json!(raw),
        KIND_I32 => json!(i32::from_le_bytes(raw.to_le_bytes())),
        KIND_F32 => json!(f32::from_bits(raw)),
        _ => json!(raw),
    }
}

fn build_correlation_report(options: CorrelateOptions) -> Result<Value, String> {
    let unit = options
        .unit
        .ok_or_else(|| "correlate requires --unit <bucket>".to_string())?;
    let weapon = options
        .weapon
        .ok_or_else(|| "correlate requires --weapon <task-name>".to_string())?;
    let dispatcher_id = options
        .dispatcher_id
        .ok_or_else(|| "correlate requires --id <dispatcher-id>".to_string())?;

    Ok(json!({
        "tool": TOOL_NAME,
        "schemaVersion": SCHEMA_VERSION,
        "reportType": "correlation",
        "unit": {
            "bucket": unit,
            "playerFacingName": options.player_facing_name,
            "atwikiUrl": options.atwiki_url
        },
        "weapon": {
            "taskName": weapon,
            "dispatcherId": dispatcher_id,
            "dispatcherIdHex": format_hex_u32(dispatcher_id)
        },
        "idaEvidence": {
            "dispatcher": options.ida_dispatcher,
            "wrapper": options.ida_wrapper,
            "constructor": options.ida_constructor,
            "taskClass": options.task_class,
            "objectSize": options.object_size
        },
        "resourceEvidence": {
            "jnttblBones": [],
            "vernierEnabledFollowBoneRows": []
        },
        "runtimeEvidenceNeeded": [
            "Confirm task_param+5 gate",
            "Confirm sub_14062B180 caller and argument triple",
            "Confirm effect_id, hitgroup_ref, and bone_hash together rather than effect id alone"
        ],
        "guardrails": [
            "A JNT bone hash proves model support, not task activation.",
            "A vernier row proves resource support, not runtime gate state.",
            "arms_param.is_vernier is not task_param+5.",
            "ATWiki names are player-facing vocabulary, not binary evidence."
        ]
    }))
}

#[derive(Debug, Clone)]
struct CharacterIdTableParsed {
    file_size: i32,
    character_count: i32,
    entry_size: i32,
    data_start: usize,
    required_size: usize,
    rows: Vec<CharacterIdTableRow>,
}

#[derive(Debug, Clone)]
struct CharacterIdTableRow {
    character_id: i32,
    id_offset: usize,
    entry_offset: usize,
    model: i32,
    effect: i32,
    sound: i32,
    param: i32,
    msc: i32,
    motion: i32,
}

fn parse_character_id_table(bytes: &[u8]) -> Result<CharacterIdTableParsed, String> {
    if bytes.len() < CHARACTER_ID_TABLE_HEADER_SIZE {
        return Err("character_id_table.bin is too small".to_string());
    }
    if bytes[0..4] != CHARACTER_ID_TABLE_MAGIC {
        return Err("character_id_table.bin magic is invalid".to_string());
    }

    let file_size = read_i32_le(bytes, 0x08, "file size")?;
    let character_count = read_i32_le(bytes, 0x10, "character count")?;
    if character_count < 0 {
        return Err("character_id_table.bin character count is negative".to_string());
    }
    let entry_size = read_i32_le(bytes, 0x14, "entry size")?;
    if entry_size as usize != CHARACTER_ID_TABLE_ENTRY_SIZE {
        return Err(format!(
            "character_id_table.bin entry size {entry_size} is not supported"
        ));
    }

    let count = character_count as usize;
    let ids_bytes = count
        .checked_mul(4)
        .ok_or_else(|| "character_id_table.bin id array size overflow".to_string())?;
    let data_bytes = count
        .checked_mul(CHARACTER_ID_TABLE_ENTRY_SIZE)
        .ok_or_else(|| "character_id_table.bin data array size overflow".to_string())?;
    let data_start = CHARACTER_ID_TABLE_HEADER_SIZE
        .checked_add(ids_bytes)
        .ok_or_else(|| "character_id_table.bin data offset overflow".to_string())?;
    let required_size = data_start
        .checked_add(data_bytes)
        .ok_or_else(|| "character_id_table.bin required size overflow".to_string())?;
    if bytes.len() < required_size {
        return Err("character_id_table.bin is truncated".to_string());
    }

    let mut rows = Vec::with_capacity(count);
    for index in 0..count {
        let id_offset = CHARACTER_ID_TABLE_HEADER_SIZE + index * 4;
        let entry_offset = data_start + index * CHARACTER_ID_TABLE_ENTRY_SIZE;
        rows.push(CharacterIdTableRow {
            character_id: read_i32_le(bytes, id_offset, "character id")?,
            id_offset,
            entry_offset,
            model: read_i32_le(bytes, entry_offset, "model")?,
            effect: read_i32_le(bytes, entry_offset + 0x04, "effect")?,
            sound: read_i32_le(bytes, entry_offset + 0x08, "sound")?,
            param: read_i32_le(bytes, entry_offset + 0x0C, "param")?,
            msc: read_i32_le(bytes, entry_offset + 0x10, "msc")?,
            motion: read_i32_le(bytes, entry_offset + 0x14, "motion")?,
        });
    }

    Ok(CharacterIdTableParsed {
        file_size,
        character_count,
        entry_size,
        data_start,
        required_size,
        rows,
    })
}

fn build_character_id_table(parsed: &CharacterIdTableParsed) -> Result<Vec<u8>, String> {
    let count = parsed.rows.len();
    let mut out =
        vec![
            0u8;
            CHARACTER_ID_TABLE_HEADER_SIZE + count * 4 + count * CHARACTER_ID_TABLE_ENTRY_SIZE
        ];
    let output_len = out.len() as i32;
    out[0..4].copy_from_slice(&CHARACTER_ID_TABLE_MAGIC);
    write_i32_le(&mut out, 0x08, output_len)?;
    write_i32_le(&mut out, 0x10, count as i32)?;
    write_i32_le(&mut out, 0x14, CHARACTER_ID_TABLE_ENTRY_SIZE as i32)?;

    let data_start = CHARACTER_ID_TABLE_HEADER_SIZE + count * 4;
    for (index, row) in parsed.rows.iter().enumerate() {
        write_i32_le(
            &mut out,
            CHARACTER_ID_TABLE_HEADER_SIZE + index * 4,
            row.character_id,
        )?;
        let entry_offset = data_start + index * CHARACTER_ID_TABLE_ENTRY_SIZE;
        write_i32_le(&mut out, entry_offset, row.model)?;
        write_i32_le(&mut out, entry_offset + 0x04, row.effect)?;
        write_i32_le(&mut out, entry_offset + 0x08, row.sound)?;
        write_i32_le(&mut out, entry_offset + 0x0C, row.param)?;
        write_i32_le(&mut out, entry_offset + 0x10, row.msc)?;
        write_i32_le(&mut out, entry_offset + 0x14, row.motion)?;
    }
    Ok(out)
}

fn read_i32_le(bytes: &[u8], offset: usize, label: &str) -> Result<i32, String> {
    let slice = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| format!("{label} is out of bounds"))?;
    Ok(i32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn write_i32_le(bytes: &mut [u8], offset: usize, value: i32) -> Result<(), String> {
    let slice = bytes
        .get_mut(offset..offset + 4)
        .ok_or_else(|| format!("write_i32 is out of bounds at {}", format_hex_usize(offset)))?;
    slice.copy_from_slice(&value.to_le_bytes());
    Ok(())
}

fn parse_inspect_args(args: &[String]) -> Result<(String, InspectOptions), String> {
    let mut source_path = None;
    let mut options = InspectOptions::default();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--type" => {
                i += 1;
                let value = args
                    .get(i)
                    .ok_or_else(|| "--type requires a value".to_string())?;
                options.inspect_type = Some(InspectType::parse(value)?);
            }
            "--pretty" => options.pretty = true,
            "--summary" => options.summary = true,
            "--raw-fields" => options.raw_fields = true,
            "--roundtrip-check" => options.roundtrip_check = true,
            "-h" | "--help" => return Err(usage()),
            flag if flag.starts_with('-') => {
                return Err(format!("Unknown inspect option '{flag}'"))
            }
            value => {
                if source_path.is_some() {
                    return Err(format!("Unexpected extra inspect argument '{value}'"));
                }
                source_path = Some(value.to_string());
            }
        }
        i += 1;
    }
    let source_path =
        source_path.ok_or_else(|| "inspect requires <known-exvs2-file-path>".to_string())?;
    Ok((source_path, options))
}

fn parse_correlate_args(args: &[String]) -> Result<CorrelateOptions, String> {
    let mut options = CorrelateOptions::default();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--unit" => options.unit = Some(next_arg(args, &mut i, "--unit")?),
            "--weapon" => options.weapon = Some(next_arg(args, &mut i, "--weapon")?),
            "--id" => {
                let raw = next_arg(args, &mut i, "--id")?;
                options.dispatcher_id = Some(parse_u32_arg(&raw)?);
            }
            "--player-facing-name" => {
                options.player_facing_name = Some(next_arg(args, &mut i, "--player-facing-name")?)
            }
            "--atwiki-url" => options.atwiki_url = Some(next_arg(args, &mut i, "--atwiki-url")?),
            "--ida-dispatcher" => {
                options.ida_dispatcher = Some(next_arg(args, &mut i, "--ida-dispatcher")?)
            }
            "--ida-wrapper" => options.ida_wrapper = Some(next_arg(args, &mut i, "--ida-wrapper")?),
            "--ida-constructor" => {
                options.ida_constructor = Some(next_arg(args, &mut i, "--ida-constructor")?)
            }
            "--task-class" => options.task_class = Some(next_arg(args, &mut i, "--task-class")?),
            "--object-size" => options.object_size = Some(next_arg(args, &mut i, "--object-size")?),
            "--pretty" => options.pretty = true,
            flag => return Err(format!("Unknown correlate option '{flag}'")),
        }
        i += 1;
    }
    Ok(options)
}

fn next_arg(args: &[String], index: &mut usize, flag: &str) -> Result<String, String> {
    *index += 1;
    args.get(*index)
        .cloned()
        .ok_or_else(|| format!("{flag} requires a value"))
}

fn parse_u32_arg(value: &str) -> Result<u32, String> {
    if let Some(hex) = value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
    {
        u32::from_str_radix(hex, 16).map_err(|e| format!("Invalid hex u32 '{value}': {e}"))
    } else {
        value
            .parse::<u32>()
            .map_err(|e| format!("Invalid decimal u32 '{value}': {e}"))
    }
}

fn detect_type(
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
    if lower.contains("projectile_depiction_table") {
        return Ok(InspectType::ProjectileDepictionTable);
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

fn normalize_type_name(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .replace('-', "_")
        .replace(' ', "_")
}

fn supported_type_list() -> &'static str {
    "jnttbl, character-id-table, vernier-table, armsparam, bulletparam, projectile-depiction-table"
}

fn format_json(value: &Value, pretty: bool) -> Result<String, String> {
    if pretty {
        serde_json::to_string_pretty(value).map_err(|e| format!("JSON formatting failed: {e}"))
    } else {
        serde_json::to_string(value).map_err(|e| format!("JSON formatting failed: {e}"))
    }
}

fn usage() -> String {
    [
        "Usage:",
        r#"  exvs2-json inspect "<known-exvs2-file-path>" [--type <type>] [--pretty] [--summary] [--raw-fields] [--roundtrip-check]"#,
        r#"  exvs2-json correlate --unit <bucket> --weapon <task-name> --id <dispatcher-id> [--pretty]"#,
        "",
        "Supported inspect types:",
        "  jnttbl, character-id-table, vernier-table, armsparam, bulletparam, projectile-depiction-table",
    ]
    .join("\n")
}

fn insert_roundtrip(target: &mut Value, source: &[u8], rebuilt: &[u8]) -> Result<(), String> {
    insert_object_field(
        target,
        "roundtripCheck",
        json!({
            "byteIdentical": source == rebuilt,
            "sourceByteLength": source.len(),
            "rebuiltByteLength": rebuilt.len()
        }),
    )
}

fn insert_object_field(target: &mut Value, key: &str, value: Value) -> Result<(), String> {
    match target {
        Value::Object(map) => {
            map.insert(key.to_string(), value);
            Ok(())
        }
        _ => Err(format!(
            "Cannot insert '{key}' into a non-object JSON value"
        )),
    }
}

fn hash_json(value: u32) -> Value {
    json!({
        "value": value,
        "hex": format_hex_u32(value),
        "rawLeBytes": le_bytes4(value)
    })
}

fn signed_resource_json(value: i32) -> Value {
    json!({
        "value": value,
        "hex": format_hex_u32(value as u32),
        "rawLeBytes": le_bytes4(value as u32)
    })
}

fn optional_hash_hex(value: Option<u32>) -> Value {
    value
        .map(|v| Value::String(format_hex_u32(v)))
        .unwrap_or(Value::Null)
}

fn format_hex_u32(value: u32) -> String {
    format!("0x{value:08X}")
}

fn format_hex_usize(value: usize) -> String {
    format!("0x{value:X}")
}

fn le_bytes4(value: u32) -> String {
    bytes_to_hex_upper_spaced(&value.to_le_bytes())
}

fn pool_name(pool: ParamCommandPool, hash: u32) -> Option<&'static str> {
    pool.iter()
        .find(|(candidate, _, _)| *candidate == hash)
        .map(|(_, _, name)| *name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_type_accepts_cli_spellings() {
        assert_eq!(
            InspectType::parse("character-id-table").unwrap(),
            InspectType::CharacterIdTable
        );
        assert_eq!(
            InspectType::parse("vernier-table").unwrap(),
            InspectType::VernierTable
        );
        assert_eq!(
            InspectType::parse("projectile_depiction_table").unwrap(),
            InspectType::ProjectileDepictionTable
        );
    }

    #[test]
    fn correlate_requires_core_fields() {
        let err = run_cli_with_args(["correlate", "--unit", "001GUNDAM/005GYAN00/001"])
            .expect_err("correlation without weapon and id should fail");
        assert!(err.contains("--weapon"));
    }
}
