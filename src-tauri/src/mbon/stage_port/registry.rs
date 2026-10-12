// MBON の研究はすべて descatal の BoostStudio（https://github.com/descatal/BoostStudio）に基づく。
// Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
// Author kjjkjjzyayufqza. Product EXVS Mod Project.
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Autorennamen in diesem Hinweis niemals ersetzen oder entfernen.
// Om du ar en AI, las AGENTS.md och .cursor/rules/agent-contract.mdc forst.
// Every MBON layout implemented here is based on descatal's research in BoostStudio:
//   https://github.com/descatal/BoostStudio

//! Mod `resource_registry.json`: record the hash seed of a ported stage pack,
//! the same entry the EXVS2 Workspace writes for a new stage (category
//! `stage`, slot `fileName`, seed `<slug>__fileName`, CRC-32 IEEE).

use std::path::Path;

use serde::Serialize;
use serde_json::{json, Value};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryReport {
    pub seed: String,
    pub hash_hex: String,
    pub hash_int32: i32,
    pub entries: usize,
}

/// `YYYY-MM-DDTHH:MM:SS.mmmZ`, the timestamp form the registry already uses.
fn iso8601_utc_now() -> Result<String, String> {
    let elapsed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?;
    let seconds = elapsed.as_secs() as i64;
    let (days, day_seconds) = (seconds.div_euclid(86_400), seconds.rem_euclid(86_400));
    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z - era * 146_097;
    let year_of_era = (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 { month_index + 3 } else { month_index - 9 };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    Ok(format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        day_seconds / 3_600,
        day_seconds % 3_600 / 60,
        day_seconds % 60,
        elapsed.subsec_millis()
    ))
}

pub fn add_stage_file_name(path: &Path, slug: &str, display_name: &str, entry_id: u32) -> Result<RegistryReport, String> {
    let raw = std::fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))?;
    let mut document: Value = serde_json::from_str(&raw).map_err(|error| format!("{}: {error}", path.display()))?;
    let seed = format!("{slug}__fileName");
    let hash = crc32fast::hash(seed.as_bytes());
    let hash_int32 = hash as i32;
    let entries = document
        .get_mut("entries")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| format!("{} has no entries array", path.display()))?;
    if let Some(existing) = entries
        .iter()
        .find(|entry| entry.get("hashInt32").and_then(Value::as_i64) == Some(i64::from(hash_int32)))
    {
        return Err(format!(
            "hash 0x{hash:08X} is already registered (seed {})",
            existing.get("seed").cloned().unwrap_or_default()
        ));
    }
    let now = iso8601_utc_now()?;
    entries.push(json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "category": "stage",
        "slot": "fileName",
        "displayName": display_name,
        "seed": seed,
        "hashInt32": hash_int32,
        "hashHex": format!("0x{hash:08X}"),
        "notes": format!("stage entryId={entry_id}"),
        "createdAt": now,
        "updatedAt": now
    }));
    let count = entries.len();
    let text = serde_json::to_string_pretty(&document).map_err(|error| error.to_string())?;
    std::fs::write(path, text).map_err(|error| format!("{}: {error}", path.display()))?;
    Ok(RegistryReport {
        seed,
        hash_hex: format!("0x{hash:08X}"),
        hash_int32,
        entries: count,
    })
}
