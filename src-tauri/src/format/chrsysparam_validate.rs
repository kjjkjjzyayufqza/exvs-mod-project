//! Semantic checks for `chrsysparam.csyspm` edits, derived from the OB v27 engine consumers
//! (sys_41 command builder/checker, 0x700002 route table, 0x700003 derived lookup) and the
//! new-generation 2.c registration loop. Structural checks live in `chrsysparam.rs`.

use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;

use super::chrsysparam::ChrSysParamFile;
use super::chrsysparam_msc_links::ChrSysMscLinks;
use super::chrsysparam_schema::ROUTE_GROUP_LIMIT;

/// sys_41 command builder stores at most 0x80 records, taken from action rows 1..=128.
pub const MAX_COMMAND_RECORDS: usize = 0x80;
const ACTION_COLUMNS_READ_BY_ENGINE: u32 = 0x80;
const DERIVED_HASH_FIELDS: std::ops::RangeInclusive<usize> = 0x30..=0x39;
const PHASE_FIELDS: [(usize, &str); 3] = [(0x7C, "enter"), (0x02, "tick"), (0x7D, "exit")];
const TRANSITION_PREDICATE_FIELD: usize = 0x1C;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ChrSysIssueLevel {
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChrSysIssue {
    pub level: ChrSysIssueLevel,
    pub table: &'static str,
    pub row: Option<usize>,
    pub field: Option<u32>,
    pub message: String,
}

fn issue(
    level: ChrSysIssueLevel,
    table: &'static str,
    row: Option<usize>,
    field: Option<u32>,
    message: String,
) -> ChrSysIssue {
    ChrSysIssue {
        level,
        table,
        row,
        field,
        message,
    }
}

fn cell(row: &[u32], field: usize) -> u32 {
    row.get(field).copied().unwrap_or(0)
}

const FORM_FIELDS: [usize; 7] = [0x01, 0x68, 0x69, 0x6A, 0x6B, 0x6C, 0x6D];

/// Form bits exactly as the sys_41(0, 4) builder computes them (fields 0x01, 0x68..0x6D; every
/// checked new-generation 0.c passes 4). The shift count is masked to 5 bits like the native
/// `shl`. A zero mask means "every form": both the checker and 0x700003 skip the form test.
pub fn form_mask(row: &[u32]) -> u32 {
    FORM_FIELDS
        .iter()
        .map(|field| cell(row, *field) as i32)
        .filter(|index| *index >= 0)
        .fold(0, |mask, index| mask | (1u32 << (index & 31)))
}

fn effective_form_mask(row: &[u32]) -> u32 {
    match form_mask(row) {
        0 => u32::MAX,
        mask => mask,
    }
}

/// Mirrors the native "input selectable" record bit: field 0x03 != 400, field 0x03 % 100 != 31,
/// field 0x0A != 39.
pub fn is_input_selectable(row: &[u32]) -> bool {
    let command_type = cell(row, 0x03);
    command_type != 400 && command_type % 100 != 31 && cell(row, 0x0A) != 39
}

fn check_action_rows(file: &ChrSysParamFile, issues: &mut Vec<ChrSysIssue>) {
    let rows = &file.action_table.rows;
    if rows.len() > 1 && file.action_table.columns < ACTION_COLUMNS_READ_BY_ENGINE {
        issues.push(issue(
            ChrSysIssueLevel::Warning,
            "action",
            None,
            None,
            format!(
                "action table has {} columns; the engine and scripts read fields up to 0x7F and get 0 for missing ones",
                file.action_table.columns
            ),
        ));
    }
    if rows.len() > MAX_COMMAND_RECORDS + 1 {
        issues.push(issue(
            ChrSysIssueLevel::Error,
            "action",
            Some(MAX_COMMAND_RECORDS + 1),
            None,
            format!(
                "{} action rows; sys_41 keeps only {} command records, so rows {}.. can never be picked by input or by derived lookups",
                rows.len(),
                MAX_COMMAND_RECORDS,
                MAX_COMMAND_RECORDS + 1
            ),
        ));
    }
    if let Some(reserved) = rows.first() {
        if reserved.iter().any(|value| *value != 0) {
            issues.push(issue(
                ChrSysIssueLevel::Warning,
                "action",
                Some(0),
                None,
                "row 0 is skipped by every consumer (loops start at 1) but holds non-zero data".to_string(),
            ));
        }
    }

    let mut hash_rows: BTreeMap<u32, Vec<usize>> = BTreeMap::new();
    for (index, row) in rows.iter().enumerate().skip(1) {
        let hash = cell(row, 0x2E);
        if hash == 0 {
            issues.push(issue(
                ChrSysIssueLevel::Warning,
                "action",
                Some(index),
                Some(0x2E),
                "actionHash is 0; 0.c skips the row and 2.c registers nothing for it".to_string(),
            ));
        } else {
            hash_rows.entry(hash).or_default().push(index);
        }

        let group = cell(row, 0x0A);
        if group >= ROUTE_GROUP_LIMIT {
            issues.push(issue(
                ChrSysIssueLevel::Error,
                "action",
                Some(index),
                Some(0x0A),
                format!(
                    "archetypeGroup 0x{:X} is outside the engine route table (0..0x{:X}); sys_0(0x700002) would read past it",
                    group,
                    ROUTE_GROUP_LIMIT - 1
                ),
            ));
        }

        let arms_slot = cell(row, 0x08);
        if !(arms_slot <= 5 || (100..=104).contains(&arms_slot)) {
            issues.push(issue(
                ChrSysIssueLevel::Warning,
                "action",
                Some(index),
                Some(0x08),
                format!("armsSlot {} is not 0..5 or 100..104", arms_slot as i32),
            ));
        }
        if cell(row, 0x09) > 3 {
            issues.push(issue(
                ChrSysIssueLevel::Warning,
                "action",
                Some(index),
                Some(0x09),
                format!("emptyAmmoPolicy {} is not 0..3", cell(row, 0x09) as i32),
            ));
        }
        if let Some(field) = FORM_FIELDS.iter().find(|field| (cell(row, **field) as i32) >= 32) {
            issues.push(issue(
                ChrSysIssueLevel::Warning,
                "action",
                Some(index),
                Some(*field as u32),
                format!(
                    "form index {} is >= 32; the sys_41(0, 4) builder wraps it to form bit {}",
                    cell(row, *field) as i32,
                    cell(row, *field) & 31
                ),
            ));
        }
    }

    for (hash, indexes) in &hash_rows {
        if indexes.len() > 1 {
            issues.push(issue(
                ChrSysIssueLevel::Error,
                "action",
                Some(indexes[1]),
                Some(0x2E),
                format!(
                    "actionHash 0x{:08X} is used by rows {:?}; the hash->row map keeps only the last row, so the others lose their hooks",
                    hash, indexes
                ),
            ));
        }
    }

    for (index, row) in rows.iter().enumerate().skip(1) {
        for field in DERIVED_HASH_FIELDS {
            let target_hash = cell(row, field);
            if target_hash == 0 {
                continue;
            }
            match hash_rows.get(&target_hash) {
                None => issues.push(issue(
                    ChrSysIssueLevel::Error,
                    "action",
                    Some(index),
                    Some(field as u32),
                    format!(
                        "derived action 0x{:08X} has no row; 0x700003 returns -1 and the follow-up never runs",
                        target_hash
                    ),
                )),
                Some(targets) => {
                    let target_forms = targets
                        .iter()
                        .map(|target| effective_form_mask(&rows[*target]))
                        .fold(0, |mask, forms| mask | forms);
                    if target_forms & effective_form_mask(row) == 0 {
                        issues.push(issue(
                            ChrSysIssueLevel::Warning,
                            "action",
                            Some(index),
                            Some(field as u32),
                            format!(
                                "derived action 0x{:08X} exists only in other forms; 0x700003 filters by the current form",
                                target_hash
                            ),
                        ));
                    }
                }
            }
        }

        let first = cell(row, 0x7E) as i32;
        let last = cell(row, 0x7F) as i32;
        let transition_rows = file.transition_table.rows.len() as i32;
        let range_ok = (first == -1 && last == -1)
            || (0 <= first && first <= last && last < transition_rows);
        if !range_ok {
            issues.push(issue(
                ChrSysIssueLevel::Error,
                "action",
                Some(index),
                Some(0x7E),
                format!(
                    "transition range {}..{} is invalid for a transition table with {} rows (use -1/-1 for none)",
                    first, last, transition_rows
                ),
            ));
        }
    }
}

fn check_script_links(file: &ChrSysParamFile, links: &ChrSysMscLinks, issues: &mut Vec<ChrSysIssue>) {
    let groups: BTreeSet<u32> = links
        .group_callbacks
        .iter()
        .filter(|entry| entry.function.is_some() || entry.raw_value.is_some())
        .map(|entry| entry.key)
        .collect();
    let phases: BTreeSet<u32> = links.phase_callbacks.iter().map(|entry| entry.key).collect();

    for (index, row) in file.action_table.rows.iter().enumerate().skip(1) {
        if cell(row, 0x2E) == 0 {
            continue;
        }
        let group = cell(row, 0x0A);
        if is_input_selectable(row) && !groups.contains(&group) {
            issues.push(issue(
                ChrSysIssueLevel::Warning,
                "action",
                Some(index),
                Some(0x0A),
                format!(
                    "{} has no ENTER callback for group 0x{:X}; func_241 binds the action to 0 even though input can pick the row",
                    links.group_resolver_function, group
                ),
            ));
        }
        for (field, phase) in PHASE_FIELDS {
            let key = cell(row, field);
            if key != 0 && !phases.contains(&key) {
                issues.push(issue(
                    ChrSysIssueLevel::Error,
                    "action",
                    Some(index),
                    Some(field as u32),
                    format!(
                        "{} hook key 0x{:08X} is not handled by {}; add the case in 2.c or reuse an existing key",
                        phase, key, links.phase_resolver_function
                    ),
                ));
            }
        }
    }

    for (index, row) in file.transition_table.rows.iter().enumerate().skip(1) {
        let key = cell(row, TRANSITION_PREDICATE_FIELD);
        if key != 0 && !phases.contains(&key) {
            issues.push(issue(
                ChrSysIssueLevel::Error,
                "transition",
                Some(index),
                Some(TRANSITION_PREDICATE_FIELD as u32),
                format!(
                    "predicate key 0x{:08X} is not handled by {}",
                    key, links.phase_resolver_function
                ),
            ));
        }
    }
}

pub fn validate_chrsysparam(file: &ChrSysParamFile, links: Option<&ChrSysMscLinks>) -> Vec<ChrSysIssue> {
    let mut issues = Vec::new();
    check_action_rows(file, &mut issues);
    if let Some(links) = links {
        check_script_links(file, links, &mut issues);
    }
    issues
}

#[cfg(test)]
mod tests {
    use super::super::chrsysparam::{ChrSysParamTable, ACTION_TABLE_MARKER, TRANSITION_TABLE_MARKER};
    use super::*;

    fn blank_row() -> Vec<u32> {
        let mut row = vec![0u32; 128];
        row[0x08] = 5;
        row[0x7E] = u32::MAX;
        row[0x7F] = u32::MAX;
        row[0x68..=0x6D].fill(u32::MAX);
        row
    }

    fn file_with(rows: Vec<Vec<u32>>) -> ChrSysParamFile {
        ChrSysParamFile {
            unit_id: 1,
            header_reserved: 0,
            action_table: ChrSysParamTable {
                marker: ACTION_TABLE_MARKER,
                reserved: 0,
                columns: 128,
                rows,
            },
            transition_table: ChrSysParamTable {
                marker: TRANSITION_TABLE_MARKER,
                reserved: 0,
                columns: 1,
                rows: vec![vec![0]],
            },
        }
    }

    #[test]
    fn duplicate_hash_missing_derived_target_and_bad_group_are_errors() {
        let mut first = blank_row();
        first[0x2E] = 0x1111_1111;
        first[0x30] = 0x3333_3333;
        let mut second = blank_row();
        second[0x2E] = 0x1111_1111;
        second[0x0A] = 0x36;
        let issues = validate_chrsysparam(&file_with(vec![vec![0; 128], first, second]), None);
        let messages: Vec<&str> = issues
            .iter()
            .filter(|issue| issue.level == ChrSysIssueLevel::Error)
            .map(|issue| issue.message.as_str())
            .collect();
        assert!(messages.iter().any(|m| m.contains("is used by rows [1, 2]")));
        assert!(messages.iter().any(|m| m.contains("derived action 0x33333333 has no row")));
        assert!(messages.iter().any(|m| m.contains("outside the engine route table")));
    }

    #[test]
    fn more_than_128_command_rows_is_an_error() {
        let rows: Vec<Vec<u32>> = (0..130u32)
            .map(|index| {
                let mut row = blank_row();
                if index > 0 {
                    row[0x2E] = 0x1000 + index;
                }
                row
            })
            .collect();
        let issues = validate_chrsysparam(&file_with(rows), None);
        assert!(issues.iter().any(|issue| issue.level == ChrSysIssueLevel::Error
            && issue.message.contains("command records")));
    }

    #[test]
    fn form_mask_matches_native_builder() {
        let mut row = blank_row();
        row[0x01] = 0;
        row[0x68] = 1;
        row[0x69] = 2;
        assert_eq!(form_mask(&row), 0b111);
        row[0x03] = 31;
        assert!(!is_input_selectable(&row));
    }
}
