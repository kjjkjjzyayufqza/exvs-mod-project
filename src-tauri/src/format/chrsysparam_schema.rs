//! Field schema for `chrsysparam.csyspm` (see `docs/msc-research/chrsysparam-new-script-generation-research.md`).
//!
//! Evidence grades follow `docs/msc-research/msc-evidence-grade-and-ingame-audit-protocol.md`:
//! E2 = proven from the OB v27 engine (IDA) or identical across vanilla units, E1 = read from
//! one decompiled script family, E0 = observed data shape only. No field here is E3.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ChrSysValueFormat {
    /// 32-bit identifier, written as an `0x`-prefixed hex string.
    Hash,
    /// Two's-complement integer, written as a JSON number.
    Signed,
    /// Bit mask, written as an `0x`-prefixed hex string.
    Mask,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ChrSysFieldSection {
    Identity,
    InputCommand,
    Routing,
    PhaseHooks,
    DerivedChain,
    MotionTuning,
    ArchetypeParams,
    Transition,
    Unused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum EvidenceGrade {
    E0,
    E1,
    E2,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ChrSysTableKind {
    Action,
    Transition,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChrSysFieldSpec {
    pub field: u32,
    pub key: String,
    pub label: String,
    pub section: ChrSysFieldSection,
    pub format: ChrSysValueFormat,
    pub evidence: EvidenceGrade,
    pub description: String,
}

struct KnownField {
    field: u32,
    key: &'static str,
    label: &'static str,
    section: ChrSysFieldSection,
    format: ChrSysValueFormat,
    evidence: EvidenceGrade,
    description: &'static str,
}

use ChrSysFieldSection as Section;
use ChrSysValueFormat as Format;
use EvidenceGrade as Grade;

const fn known(
    field: u32,
    key: &'static str,
    label: &'static str,
    section: Section,
    format: Format,
    evidence: Grade,
    description: &'static str,
) -> KnownField {
    KnownField {
        field,
        key,
        label,
        section,
        format,
        evidence,
        description,
    }
}

const ACTION_FIELDS: &[KnownField] = &[
    known(0x00, "unusedField00", "Unused", Section::Unused, Format::Signed, Grade::E1,
        "Not read by the native command builder or by the checked 0.c/2.c families; zero in every sample."),
    known(0x01, "formIndex", "Form", Section::InputCommand, Format::Signed, Grade::E2,
        "Unit form this row belongs to (global143). Every checked new-generation 0.c builds the command records with sys_41(0, 4): the row's form bits are 1 << formIndex plus 1 << extraFormIndex0..5, negative values add nothing, and a row with no form bits matches every form. sys_41 input checks and 0x700003 derived lookups skip rows whose form bits miss the current form. (sys_41(0, 1), unused by shipped scripts, would read 100/101/102 as forms {0,1}/{1,2}/{0,1,2}.)"),
    known(0x02, "phaseTickKey", "Tick hook", Section::PhaseHooks, Format::Hash, Grade::E2,
        "Function key resolved by the 2.c phase resolver and stored in slot 0x10001/0x10; the script calls it every action tick. 0 = no tick hook."),
    known(0x03, "commandType", "Command", Section::InputCommand, Format::Signed, Grade::E2,
        "value % 100 = global48 button bit the row reacts to (0 shot 0x1, 1 melee 0x2 with any 0x7E direction button, 6 0x40, 7 sub 0x80, 8 special shot 0x100, 9 special melee 0x200, 10 burst attack 0x400, 11 shooting charge 0x800, 12 melee charge 0x1000). 31 and 400 are never picked by input (derived or script-driven rows); 300 is the awakening row scanned by 0.c func_146 (bit 0x2000). value / 100 + 1 is the charge tier. value > 300 swaps the 0x700002 base flag 0x20000 for 0x200. 0.c func_144 derives the old category from this field and leverMask."),
    known(0x04, "leverMask", "Lever", Section::InputCommand, Format::Mask, Grade::E2,
        "Direction requirement. Normal rows: must intersect global2 lever bits (0x04 front, 0x08 back, 0x10 left, 0x20 right, 0x3C any). Melee rows (commandType % 100 == 1) are matched against the melee direction buttons instead (0x04->0x04, 0x08->0x20, 0x10->0x08, 0x20->0x10). Values >= 100 require (value - 100) to intersect sys_41 argument 3. Value 71 needs sys_41 argument 5 (0.c func_97(0x71)). Derived rows store 0x40..0x46 here as the 2.c func_536 schedule class. Rows with a lever requirement are checked before neutral rows."),
    known(0x05, "stateMask05", "State mask", Section::InputCommand, Format::Mask, Grade::E2,
        "Native command-record word 7. While global20 bit 14 is set the row needs value == 4; otherwise a non-zero value must intersect (global20 bit 24 ? 1 : 2). Gameplay meaning of the two states is not identified (E0)."),
    known(0x06, "postureMask06", "Posture mask", Section::InputCommand, Format::Mask, Grade::E2,
        "Native command-record word 8. A non-zero value must intersect 2 when the unit state word is 2 or 3, else 1. Which posture each state is has not been identified (E0)."),
    known(0x07, "holdCheck07", "Hold check", Section::InputCommand, Format::Signed, Grade::E2,
        "Native command-record word 9. Non-zero enables an extra button-history check against sys_41 arguments 7 and 8 (global28|global29, global30). Gameplay meaning is E0."),
    known(0x08, "armsSlot", "Arms slot", Section::InputCommand, Format::Signed, Grade::E2,
        "armsparam slot used by the ammo gate. 0..4 = slot, 5 = no ammo gate, >= 100 = slot (value - 100) through the reload-state gate. 2.c func_311 reports values >= 100 as 5 to the action scripts."),
    known(0x09, "emptyAmmoPolicy", "Empty ammo", Section::InputCommand, Format::Signed, Grade::E2,
        "What sys_41 does when the arms slot has no ammo: 1 = return slot | 0x10000000 so 0.c runs the empty-fire path (func_98), 2 = ignore the input, 3 = like 1 and also while the slot is locked. 0 = no ammo gate."),
    known(0x0A, "archetypeGroup", "Group", Section::Routing, Format::Signed, Grade::E2,
        "Action archetype. Selects the 0x700002 route/flags row (engine table has groups 0..0x35 and no bounds check) and the 2.c group resolver ENTER callback that func_241 binds to actionHash. Group 39 (0x27) rows are never picked by input."),
    known(0x2C, "routeFlag400", "Route +0x400", Section::Routing, Format::Signed, Grade::E2,
        "Non-zero adds 0x400 to the 0x700002 flags word handed to func_95/func_81."),
    known(0x2D, "steeringMix", "Steering mix", Section::MotionTuning, Format::Signed, Grade::E1,
        "Read on action ENTER (FA Unicorn func_299): 0 = analog mix 0x32/0x5C/0x5E, negative = 0/0/0 (no steering), positive = 0x64 / min(0x5E + value, 0x63)."),
    known(0x2E, "actionHash", "Action hash", Section::Identity, Format::Hash, Grade::E2,
        "Action identifier. 2.c registers func_241(actionHash, groupEnter) and the hash->row map 0x10002/0x1F; sys_41 and 0x700003 return rows by this key. Must be non-zero and unique."),
    known(0x30, "derivedActionHash0", "Derived 0", Section::DerivedChain, Format::Hash, Grade::E2,
        "Follow-up action scheduled by the 2.c derived scheduler through 0x700003(hash, 1 << global143); fires after derivedDelay0 frames."),
    known(0x31, "derivedActionHash1", "Derived 1", Section::DerivedChain, Format::Hash, Grade::E2, "Derived follow-up slot 1 (delay derivedDelay1)."),
    known(0x32, "derivedActionHash2", "Derived 2", Section::DerivedChain, Format::Hash, Grade::E2, "Derived follow-up slot 2 (delay derivedDelay2)."),
    known(0x33, "derivedActionHash3", "Derived 3", Section::DerivedChain, Format::Hash, Grade::E2, "Derived follow-up slot 3 (delay derivedDelay3)."),
    known(0x34, "derivedActionHash4", "Derived 4", Section::DerivedChain, Format::Hash, Grade::E2, "Derived follow-up slot 4 (delay derivedDelay4)."),
    known(0x35, "derivedActionHash5", "Derived 5", Section::DerivedChain, Format::Hash, Grade::E2, "Derived follow-up slot 5 (delay derivedDelay5)."),
    known(0x36, "derivedActionHash6", "Derived 6", Section::DerivedChain, Format::Hash, Grade::E2, "Derived follow-up slot 6 (delay derivedDelay6)."),
    known(0x37, "derivedActionHash7", "Derived 7", Section::DerivedChain, Format::Hash, Grade::E2, "Derived follow-up slot 7 (delay derivedDelay7)."),
    known(0x38, "derivedActionHash8", "Derived 8", Section::DerivedChain, Format::Hash, Grade::E2, "Derived follow-up slot 8 (delay derivedDelay8)."),
    known(0x39, "derivedActionHash9", "Derived 9", Section::DerivedChain, Format::Hash, Grade::E2, "Derived follow-up slot 9 (delay derivedDelay9)."),
    known(0x42, "requiresResource42", "Needs resource", Section::InputCommand, Format::Signed, Grade::E2,
        "Native command-record word 14. Non-zero rows are rejected while the unit resource the checker reads is empty. Which resource that is has not been identified (E0)."),
    known(0x44, "motionTuning44", "sys_46(5) arg A", Section::MotionTuning, Format::Signed, Grade::E1,
        "Passed to sys_46(0x5, ...) by the FA Unicorn archetypes; negative values are replaced by 100 when loaded."),
    known(0x45, "motionTuning45", "sys_46(5) arg B", Section::MotionTuning, Format::Signed, Grade::E1,
        "Passed to sys_46(0x5, ...) by the FA Unicorn archetypes; negative values are replaced by 100 when loaded."),
    known(0x46, "motionTuning46", "sys_46(5) arg C", Section::MotionTuning, Format::Signed, Grade::E1,
        "Passed to sys_46(0x5, ...) by the FA Unicorn archetypes; negative values are replaced by 100 when loaded."),
    known(0x56, "enterPoseLayer56", "ENTER sys_4C(8)", Section::MotionTuning, Format::Signed, Grade::E1,
        "Read on action ENTER (FA Unicorn func_299): 1..8 calls sys_4C(0x8, value) and clears global183."),
    known(0x59, "derivedDelay0", "Delay 0", Section::DerivedChain, Format::Signed, Grade::E1, "Frames before derivedActionHash0 is scheduled."),
    known(0x5A, "derivedDelay1", "Delay 1", Section::DerivedChain, Format::Signed, Grade::E1, "Frames before derivedActionHash1 is scheduled."),
    known(0x5B, "derivedDelay2", "Delay 2", Section::DerivedChain, Format::Signed, Grade::E1, "Frames before derivedActionHash2 is scheduled."),
    known(0x5C, "derivedDelay3", "Delay 3", Section::DerivedChain, Format::Signed, Grade::E1, "Frames before derivedActionHash3 is scheduled."),
    known(0x5D, "derivedDelay4", "Delay 4", Section::DerivedChain, Format::Signed, Grade::E1, "Frames before derivedActionHash4 is scheduled."),
    known(0x5E, "derivedDelay5", "Delay 5", Section::DerivedChain, Format::Signed, Grade::E1, "Frames before derivedActionHash5 is scheduled."),
    known(0x5F, "derivedDelay6", "Delay 6", Section::DerivedChain, Format::Signed, Grade::E1, "Frames before derivedActionHash6 is scheduled."),
    known(0x60, "derivedDelay7", "Delay 7", Section::DerivedChain, Format::Signed, Grade::E1, "Frames before derivedActionHash7 is scheduled."),
    known(0x61, "derivedDelay8", "Delay 8", Section::DerivedChain, Format::Signed, Grade::E1, "Frames before derivedActionHash8 is scheduled."),
    known(0x62, "derivedDelay9", "Delay 9", Section::DerivedChain, Format::Signed, Grade::E1, "Frames before derivedActionHash9 is scheduled."),
    known(0x68, "extraFormIndex0", "Extra form 0", Section::InputCommand, Format::Signed, Grade::E2,
        "With sys_41(0, N > 1) (every checked new-generation 0.c uses N = 4) each non-negative value adds form bit 1 << value to the row, next to formIndex. -1 = unused."),
    known(0x69, "extraFormIndex1", "Extra form 1", Section::InputCommand, Format::Signed, Grade::E2, "Additional form index, -1 = unused."),
    known(0x6A, "extraFormIndex2", "Extra form 2", Section::InputCommand, Format::Signed, Grade::E2, "Additional form index, -1 = unused."),
    known(0x6B, "extraFormIndex3", "Extra form 3", Section::InputCommand, Format::Signed, Grade::E2, "Additional form index, -1 = unused."),
    known(0x6C, "extraFormIndex4", "Extra form 4", Section::InputCommand, Format::Signed, Grade::E2, "Additional form index, -1 = unused."),
    known(0x6D, "extraFormIndex5", "Extra form 5", Section::InputCommand, Format::Signed, Grade::E2, "Additional form index, -1 = unused."),
    known(0x6E, "routeAltSelector", "Route alt", Section::Routing, Format::Signed, Grade::E2,
        "Non-zero picks the alternate 0x700002 flags of groups 0x1B/0x1E/0x1F/0x20 (0x2 or 0x402). Also loaded by 2.c for the archetype callbacks."),
    known(0x6F, "commandRecordWord16", "Record word 16", Section::InputCommand, Format::Signed, Grade::E2,
        "Copied into native command-record word 16. No consumer located yet (E0); keep the value of a working row."),
    known(0x70, "commandRecordWord15", "Record word 15", Section::InputCommand, Format::Signed, Grade::E2,
        "Copied into native command-record word 15. No consumer located yet (E0); keep the value of a working row."),
    known(0x7C, "phaseEnterKey", "Enter hook", Section::PhaseHooks, Format::Hash, Grade::E2,
        "Function key resolved by the 2.c phase resolver into slot 0x10001/0x11; called once when the action starts, after steeringMix and enterPoseLayer56 are applied."),
    known(0x7D, "phaseExitKey", "Exit hook", Section::PhaseHooks, Format::Hash, Grade::E2,
        "Function key resolved by the 2.c phase resolver into slot 0x10001/0x12; called when the action ends or is interrupted."),
    known(0x7E, "transitionRangeFirst", "Transition first", Section::DerivedChain, Format::Signed, Grade::E1,
        "First transition-table row consulted by this action (zero-based in the file, the script adds 1). -1 = none."),
    known(0x7F, "transitionRangeLast", "Transition last", Section::DerivedChain, Format::Signed, Grade::E1,
        "Last transition-table row consulted by this action (zero-based in the file). -1 = none."),
];

const TRANSITION_FIELDS: &[KnownField] = &[
    known(0x01, "sourceActionHash0", "Source 0", Section::Transition, Format::Hash, Grade::E2,
        "Action hash compared with the current action by the 2.c transition reader."),
    known(0x02, "stateMatch", "State", Section::Transition, Format::Signed, Grade::E2,
        "Compared with the current action state by the 2.c transition reader."),
    known(0x04, "resultA", "Result A", Section::Transition, Format::Signed, Grade::E2,
        "Value returned by the transition reader when the entry matches."),
    known(0x05, "resultB", "Result B", Section::Transition, Format::Signed, Grade::E2,
        "Second value returned by the transition reader for some modes."),
    known(0x06, "mode", "Mode", Section::Transition, Format::Signed, Grade::E2,
        "Transition mode that decides how resultA/resultB are used."),
    known(0x1C, "predicateKey", "Predicate", Section::Transition, Format::Hash, Grade::E2,
        "Optional predicate function key resolved by the 2.c phase resolver."),
    known(0x1D, "windowStart", "Window start", Section::Transition, Format::Signed, Grade::E2,
        "Timing window start compared by the transition reader."),
    known(0x1E, "windowEnd", "Window end", Section::Transition, Format::Signed, Grade::E2,
        "Timing window end compared by the transition reader."),
    known(0x1F, "sourceActionHash1", "Source 1", Section::Transition, Format::Hash, Grade::E2, "Additional source action hash."),
    known(0x20, "sourceActionHash2", "Source 2", Section::Transition, Format::Hash, Grade::E2, "Additional source action hash."),
    known(0x21, "sourceActionHash3", "Source 3", Section::Transition, Format::Hash, Grade::E2, "Additional source action hash."),
    known(0x22, "sourceActionHash4", "Source 4", Section::Transition, Format::Hash, Grade::E2, "Additional source action hash."),
];

fn generic_action_field(field: u32) -> ChrSysFieldSpec {
    let description = match field {
        0x1C | 0x1D => "Archetype parameter. Most groups play it as a motion hash (sys_47(0x2)); group 0x26 in some units resolves it as a phase function key.",
        0x1E..=0x22 => "Archetype parameter. Seen as timing frames (sys_47(0xF)) and as bullet hashes (sys_4F) depending on the group.",
        0x25..=0x27 => "Archetype parameter. Some groups pass it to sys_46(0x2) movement.",
        0x0B..=0x2B | 0x2F | 0x3A..=0x41 | 0x43 | 0x47..=0x55 | 0x57 | 0x58 | 0x63..=0x67 => {
            "Archetype parameter loaded into a global by the 2.c row loader; its meaning depends on the group callback that reads it."
        }
        _ => "Not read by the native builder or the checked 2.c row loader.",
    };
    let (section, evidence) = match field {
        0x0B..=0x2B | 0x2F | 0x3A..=0x41 | 0x43 | 0x47..=0x55 | 0x57 | 0x58 | 0x63..=0x67 => {
            (Section::ArchetypeParams, Grade::E1)
        }
        _ => (Section::Unused, Grade::E0),
    };
    ChrSysFieldSpec {
        field,
        key: format!("param0x{:02X}", field),
        label: format!("0x{:02X}", field),
        section,
        format: Format::Signed,
        evidence,
        description: description.to_string(),
    }
}

fn generic_transition_field(field: u32) -> ChrSysFieldSpec {
    ChrSysFieldSpec {
        field,
        key: format!("param0x{:02X}", field),
        label: format!("0x{:02X}", field),
        section: Section::Unused,
        format: Format::Signed,
        evidence: Grade::E0,
        description: "Not read by the checked 2.c transition reader.".to_string(),
    }
}

fn to_spec(known: &KnownField) -> ChrSysFieldSpec {
    ChrSysFieldSpec {
        field: known.field,
        key: known.key.to_string(),
        label: known.label.to_string(),
        section: known.section,
        format: known.format,
        evidence: known.evidence,
        description: known.description.to_string(),
    }
}

pub fn field_spec(table: ChrSysTableKind, field: u32) -> ChrSysFieldSpec {
    let (known_fields, generic): (&[KnownField], fn(u32) -> ChrSysFieldSpec) = match table {
        ChrSysTableKind::Action => (ACTION_FIELDS, generic_action_field),
        ChrSysTableKind::Transition => (TRANSITION_FIELDS, generic_transition_field),
    };
    known_fields
        .iter()
        .find(|known| known.field == field)
        .map(to_spec)
        .unwrap_or_else(|| generic(field))
}

pub fn field_specs(table: ChrSysTableKind, columns: u32) -> Vec<ChrSysFieldSpec> {
    (0..columns).map(|field| field_spec(table, field)).collect()
}

/// Native 0x700002 route table (OB v27 sub_140695450): `(route, flags, alternate flags)` per
/// archetype group. The engine indexes it without a bounds check.
pub const ROUTE_TABLE: [(u32, u32, u32); 54] = [
    (0, 0x1, 0), (0, 0x1, 0), (0, 0x1, 0), (1, 0x1, 0), (1, 0x1, 0), (1, 0x1, 0),
    (0, 0x1, 0), (1, 0x1, 0), (0, 0x1, 0), (1, 0x1, 0), (0, 0x1, 0), (0, 0x1, 0),
    (1, 0x2, 0), (1, 0x2, 0), (1, 0x2, 0), (1, 0x2, 0), (1, 0x1, 0), (0, 0x1, 0),
    (0, 0x401, 0), (1, 0x401, 0), (1, 0x1, 0), (1, 0x401, 0), (1, 0x2, 0), (1, 0x2, 0),
    (1, 0x2, 0), (1, 0x402, 0), (1, 0x2, 0), (1, 0x1, 0x2), (1, 0x1, 0), (1, 0x4, 0),
    (1, 0x4, 0x402), (1, 0x4, 0x402), (0, 0x4, 0x402), (1, 0x402, 0), (1, 0x402, 0), (0, 0x1, 0),
    (1, 0x1, 0), (1, 0x2, 0), (1, 0x4, 0), (1, 0x2, 0), (1, 0x2, 0), (1, 0x2, 0),
    (1, 0x2, 0), (1, 0x402, 0), (1, 0x2, 0), (1, 0x2, 0), (1, 0x2, 0), (1, 0x4, 0),
    (1, 0x4, 0), (1, 0x4, 0), (1, 0x4, 0), (1, 0x2, 0), (1, 0x2, 0), (1, 0x401, 0),
];

pub const ROUTE_GROUP_LIMIT: u32 = ROUTE_TABLE.len() as u32;

/// Reproduces native `sys_0(0x700002, group, 0|1, row, 1)` for one action row.
/// Returns `None` for a group outside the engine table (undefined behaviour in game).
pub fn route_for_row(row: &[u32]) -> Option<(u32, u32)> {
    let cell = |field: usize| row.get(field).copied().unwrap_or(0);
    let (route, flags, alternate_flags) = *ROUTE_TABLE.get(cell(0x0A) as usize)?;
    let command_type = cell(0x03) as i32;
    let base = if command_type > 300 { 0x200 } else { 0x20000 };
    let heavy = if cell(0x2C) != 0 { 0x400 } else { 0 };
    let selected = if cell(0x6E) != 0 && alternate_flags != 0 {
        alternate_flags
    } else {
        flags
    };
    Some((route, selected | base | heavy))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn action_keys_are_unique_across_all_columns() {
        let specs = field_specs(ChrSysTableKind::Action, 128);
        let mut keys: Vec<&str> = specs.iter().map(|spec| spec.key.as_str()).collect();
        keys.sort_unstable();
        keys.dedup();
        assert_eq!(keys.len(), 128);
    }

    #[test]
    fn transition_keys_are_unique_across_all_columns() {
        let specs = field_specs(ChrSysTableKind::Transition, 35);
        let mut keys: Vec<&str> = specs.iter().map(|spec| spec.key.as_str()).collect();
        keys.sort_unstable();
        keys.dedup();
        assert_eq!(keys.len(), 35);
    }

    #[test]
    fn route_matches_old_b4ac_formula_for_shared_groups() {
        let mut row = vec![0u32; 128];
        row[0x0A] = 0x0C;
        assert_eq!(route_for_row(&row), Some((1, 0x20002)));
        row[0x0A] = 0x1F;
        row[0x6E] = 1;
        assert_eq!(route_for_row(&row), Some((1, 0x20402)));
        row[0x03] = 0x190;
        assert_eq!(route_for_row(&row), Some((1, 0x402 | 0x200)));
        row[0x0A] = 0x36;
        assert_eq!(route_for_row(&row), None);
    }
}
