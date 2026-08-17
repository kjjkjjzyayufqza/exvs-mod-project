use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;

use serde_json::Value;

use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};
use crate::format::param_entry_schema::{
    entry_commands_from_named_json, entry_commands_to_named_json, entry_row_matches_command_map,
    expected_field_specs_ordered, min_entry_data_size_for_specs, parse_commands_map_from_entry_row,
    validate_file_specs_kind_match_pool, ParamCommandPool,
};

// Please keep comments for analysis.
//
// Consumer evidence is tagged with the IDA location that contains the hash:
//   [V:sub_ADDR]  = found in executable code; the comment states only the proven role
//   [V:data_ADDR] = found in a static hash table; this alone does not prove semantics
//   (no tag)      = unverified or documented in the active audit ledger
//
// Cross-version coverage and naming confidence are tracked in
// docs/characterparam-native-coverage-ledger.md and docs/characterparam-field-notes.md.
pub const CHARACTERPARAM_COMMAND_POOL: ParamCommandPool = &[
    // Three static hash arrays in .rdata select characterparam fields by index
    // instead of by an inline immediate. Members are annotated `[V:data_<addr>
    // idx=N]`. Verified 2026-07-25 against OB `vsac27_Release.exe`; see
    // docs/characterparam-native-consumer-map-ob.md.
    //
    //   0x14133F258  8 entries, `sub_1405F8DF0(base, idx<8)`
    //     -> sub_140682A30 case 8 -> sub_1405F9480, i.e. the operand of
    //        HP -= value * burstIncoming * gutsBand * ratioBand
    //
    //   0x14134BD58  9 entries = three local-space 3D offset vectors,
    //     `sub_140690480` reads x=[3i], y=[3i+1], z=[3i+2] with x sign-flipped
    //     on the mirror flag -> sub_140690610 case 4 -> sub_1405FB520
    //
    //   0x141342D80  16 entries laid out as a 4x4 matrix of collision spheres.
    //     `sub_140628FD0` builds one `vdkSpheref` per row:
    //       radius   = array[4*r + 0]  (multiplied by field 0xFEADD5BE)
    //       centre   = (array[4*r + 1], array[4*r + 2], array[4*r + 3])
    //       attachId = caller table, default unk_141342DC4
    //     and stops at the first row whose radius is <= 0.0. `sub_140628B70`
    //     performs the same stride-4 walk of column 0 purely to count how many
    //     spheres are active, maximised across every row in the file.
    //     Corroboration: sphere 0's radius is > 0 in every sampled file
    //     (7.0 / 32.0 / 40.0) while spheres 1-3 may be 0.0, which is exactly what
    //     the counting loop needs; centre components are small signed offsets
    //     (-60 .. +60); and 0xFEADD5BE is 1.0 .. 1.2, a scale just above unity.
    //     0xFEADD5BE is additionally read by the trivial getter sub_140634FE0,
    //     whose caller sub_1406394E0 computes
    //       otherField * (scale * sphere0Radius / 7.0 * 10.0)
    //     i.e. it normalises the scaled radius against the smallest observed
    //     radius. Both of its consumers therefore treat it as a radius multiplier,
    //     which is why the former name `final_damage_multiplier` was dropped.
    // ---- damage dispatcher: sub_1405F9010 switch(attack_type) ----
    (0x00D7CEDB, 2, "damage_dispatch_value_selector_8"), // [V:sub_1405F9010] case 8
    (0x00EC483C, 5, "damage_calculation_multiplier_slot_4"), // [V:sub_140625060] helper supports selector 4; sole observed caller sub_140622010 only supplies slots 0-3
    (0x01F15731, 5, "hp_ratio_family_b_band_35_to_40"),
    (0x04371326, 2, "base_unit_cost"), // [V:sub_1405F9180] case 14/15/18 — base cost; case 18 also multiplied by character_list 0xCAE69E45
    (0x07B8E157, 2, "burst_gauge_event_base_delta"), // [V:sub_14060E340] int -> float, optionally scaled by 0x1C936B77, then accumulated by sub_1405FA270
    (
        0x0804605C,
        5,
        "target_tracking_response_retention_multiplier",
    ), // [V:sub_1406824F0 -> sub_140683070 object+0x6C; sub_140626D04] multiplies the previous three-axis response vector before new input is added
    (0x080AF70C, 2, "unresolved_018"), // [V:OB sub_1406109E0/sub_140625740] first runtime integer-capacity family: config -> current reset, gradual recovery to config; exact gameplay identity remains open
    (0x08218288, 5, "hp_ratio_family_a_band_15_to_20"),
    (0x0872029D, 2, "sub_shot_cost"), // [V:sub_1405F9180] case 3
    (0x08A0ADE8, 5, "hp_ratio_family_b_band_00_to_05"),
    // [V:sub_1405F8600] selector 0; no direct mapping to a HUD color is proven.
    (0x08ECF0BE, 5, "lock_distance_threshold_family_1_slot_0"),
    (0x0911077E, 2, "unresolved_02c"), // [V:OB sub_1406109E0/sub_140625740] second runtime integer-state family: config -> current/snapshot reset with independent event timer; exact gameplay identity remains open
    (0x0ACCE031, 5, "burst_mobility_multiplier_slot_1"),
    (0x0B25CB7F, 2, "unit_numeric_id"), // [V:CharaParamData loader sub_1408ED7D0 -> object id field +0xF0; virtual getter sub_1408ED740] [D:1001001..3015001]
    (0x0F8134A7, 5, "lock_distance_threshold_family_1_slot_4"), // [V:sub_1405F8600] selector 4
    (0x104DFF9D, 5, "burst_ranged_attack_multiplier_slot_3"),
    (0x1113F30E, 5, "unresolved_040"), // [V:sub_140634F00 -> runtime+0x94] member of a three-float runtime configuration tuple; also recomputed as base*external percentage; final identity open
    (0x14F89980, 5, "burst_melee_attack_multiplier_slot_1"),
    (
        0x157CC9FE,
        5,
        "low_durability_incoming_damage_multiplier_band_05_to_10",
    ), // [V:sub_1405F8E70 -> sub_1405F9480] HP 5-10% band; value*0.01 multiplies incoming damage
    (0x15B67A85, 5, "collision_sphere_0_center_z"), // [V:data_141342D80 r0c3 -> sub_140628FD0]
    (0x1698E3D8, 5, "unresolved_050"),              // [D:4.0,4.4,4.8,60.0] absent from the OB image
    (0x18415DC4, 2, "runtime_progress_percentage_denominator"), // [V:sub_14068FFA0/sys_0(0xD000C)] runtime counter / field * 100, truncated to int
    (0x1B2228B5, 1, "lock_band_cached_state_override_enabled"),
    (0x1B8808F8, 2, "reserved_05c"), // [D:0] constant across the sampled corpus and absent from the OB image; was "has_shield"
    (0x1BB18A48, 5, "burst_mobility_multiplier_slot_0"),
    (0x1BFADFD3, 5, "lock_elevation_upper_limit_degrees"), // [V:pending OB revalidation] clamped to +89, converted to radians, rejects elevation above it
    (0x1C936B77, 5, "burst_gauge_event_delta_multiplier"), // [V:sub_14060E340] multiplies 0x07B8E157 before the Burst-gauge accumulator call
    (0x1D6EA3F1, 2, "assist_damage"),                      // [V:sub_1405F9010] case 6/7
    (
        0x1E61CF9F,
        5,
        "conditional_incoming_damage_multiplier_slot_2",
    ), // [V:sub_1405F8D40 -> sub_1405F9480] selector slot 2 while state+0xC is 2 or 3
    (0x1EA3FAE1, 2, "burst_cost"),                         // [V:sub_1405F9180] case 9
    (0x21632B7A, 5, "hp_ratio_family_b_band_25_to_30"),
    (0x21E2041A, 5, "hp_ratio_family_a_band_10_to_15"),
    (0x22169CCE, 5, "damage_calculation_multiplier_slot_2"), // [V:sub_140625060 <- sub_140622010] selected by hit-record slot 2 and multiplied into final damage
    (0x22823596, 2, "special_cost"),                         // [V:sub_1405F9180] case 2
    (0x24FA2A04, 5, "collision_sphere_3_center_y"), // [V:data_141342D80 r3c2 -> sub_140628FD0]
    (0x25346DCD, 2, "reserved_flag_08c"),
    (0x25384033, 5, "collision_sphere_3_center_x"), // [V:data_141342D80 r3c1 -> sub_140628FD0]
    (0x2698D841, 5, "unresolved_094"), // [V:sub_140634BD0 -> runtime+0x9C] third member of the same runtime tuple; no proven downstream scalar meaning
    (0x26BC945D, 5, "collision_sphere_3_center_z"), // [V:data_141342D80 r3c3 -> sub_140628FD0]
    (0x27F7E08A, 5, "lock_elevation_lower_limit_degrees"), // [V:pending OB revalidation] clamped to -89, converted to radians, rejects elevation below it
    (0x283634C3, 5, "burst_mobility_multiplier_slot_3"),
    (0x28B3FEC3, 5, "hp_ratio_family_a_band_45_to_50"),
    (0x2B99569A, 2, "self_hp_reduction_amount_slot_0"), // [V:data_14133F258 idx=0 -> sub_1405F8DF0 -> sub_1405F9480] HP -= value * burst * guts * ratio
    (0x2C6DC778, 5, "reserved_0ac"), // [D:0.8] constant across the sampled corpus and absent from the OB image; was "aerial_damage_rate"
    (0x2C8221E6, 2, "reserved_flag_0b0"),
    (0x2CF49283, 2, "self_hp_reduction_amount_slot_4"), // [V:data_14133F258 idx=4 -> sub_1405F9480]
    (0x2DA8874F, 2, "special_melee_damage"),            // [V:sub_1405F9010] case 11
    (0x2DF82AD5, 5, "target_position_offset_default_y"), // [V:sub_1405FC010 -> sub_1405FB520] default local-space vector Y
    (0x30099C4D, 5, "target_position_offset_slot_0_z"), // [V:data_14134BD58 idx=2 -> sub_140690480] local-space Z of offset vector 0
    (0x324F2214, 5, "target_position_offset_slot_0_y"), // [V:data_14134BD58 idx=1 -> sub_140690480] local-space Y of offset vector 0
    (0x32F4D4BE, 2, "reserved_flag_0c8"),
    (0x333722B6, 2, "melee_damage"), // [V:sub_1405F9010] case 2/14
    (0x338D4823, 5, "target_position_offset_slot_0_x"), // [V:data_14134BD58 idx=0 -> sub_140690480] local-space X, sign-flipped when the mirror flag is set
    (0x379D0C45, 5, "unresolved_0d4"),
    (0x38FDFC10, 5, "unit_position_query_local_offset_x"), // [V:sub_1406461D0 -> sub_1406423F0/sub_1406426C0/sub_140645860] X of a local vector transformed by the unit matrix and added to the queried world position
    (0x3AA41969, 5, "collision_sphere_0_radius"), // [V:data_141342D80 r0c0 -> sub_140628FD0; also sub_140639530 -> sub_1406394E0 radius normalisation]
    (0x3C1E9E3B, 2, "runtime_durability_upper_clamp"), // [V:sub_1405F8C60, sub_1405F9500]
    (0x3C43A0D1, 5, "collision_sphere_3_radius"), // [V:data_141342D80 r3c0 -> sub_140628FD0]
    (0x3C475420, 5, "lock_distance_threshold_family_2_slot_2"), // [V:sub_1405F8720] selector 2
    (
        0x3CBF4F6C,
        5,
        "low_durability_incoming_damage_multiplier_band_20_to_25",
    ), // [V:sub_1405F8E70 -> sub_1405F9480] HP 20-25% band
    (0x3D302D72, 5, "burst_melee_attack_multiplier_slot_0"),
    (0x3D501F3B, 2, "hp_regen_value"), // [V:sub_1405F9500] HP regen when a2!=0; adds to current HP, clamped to [0, hp_max]
    (0x3F29DFF4, 2, "reserved_flag_0f8"),
    (0x432ADAA1, 5, "camera_vertical_height_correction"), // [V:sub_140640A20 -> sub_14063FD80] subtracted from the target-aware camera placement branch's vertical height baseline
    (0x43DC9679, 5, "burst_ranged_attack_multiplier_slot_1"),
    (0x45C84958, 2, "reserved_104"), // [D:1000,1200] absent from the OB image; was "respawn_invincibility_frame"
    (
        0x46E6927A,
        5,
        "low_durability_incoming_damage_multiplier_band_15_to_20",
    ), // [V:sub_1405F8E70 -> sub_1405F9480] HP 15-20% band
    (0x4769F064, 5, "burst_melee_attack_multiplier_slot_3"),
    (0x4778AB75, 1, "unresolved_110"),
    (0x4B4064B6, 5, "lock_distance_threshold_family_2_slot_1"), // [V:sub_1405F8720] selector 1
    (0x4B449047, 5, "collision_sphere_2_radius"), // [V:data_141342D80 r2c0 -> sub_140628FD0]
    (0x4CF8985A, 2, "reserved_flag_11c"),
    (0x4D2405E0, 2, "reserved_flag_120"),
    (0x4FFACC86, 5, "unit_position_query_local_offset_y"), // [V:sub_140646290 -> same position-query vector consumers] Y component
    (0x5175F1DE, 5, "reserved_128"), // [D:0.0] constant across the sampled corpus and absent from the OB image; was "camera_offset_partner_x"
    (0x51BBA4CB, 5, "collision_sphere_2_center_z"), // [V:data_141342D80 r2c3 -> sub_140628FD0]
    (0x51DD39F0, 5, "target_relative_camera_height_far"), // [V:sub_140640BA0 -> sub_140640230] far-distance Y value; blended from the near value over horizontal distance 0..130
    (0x52335D5B, 2, "reserved_flag_134"),
    (0x523F70A5, 5, "collision_sphere_2_center_x"), // [V:data_141342D80 r2c1 -> sub_140628FD0]
    (0x5245EE3E, 2, "self_hp_reduction_amount_slot_7"), // [V:data_14133F258 idx=7 -> sub_1405F9480]
    (0x539BC76D, 2, "charge_shot_damage"),          // [V:sub_1405F9010] case 10
    (0x53FD1A92, 5, "collision_sphere_2_center_y"), // [V:data_141342D80 r2c2 -> sub_140628FD0]
    (0x55E4FF75, 5, "lock_distance_threshold_family_1_default"), // [V:sub_1405F8600] default branch
    (0x5AC06BD2, 5, "unresolved_14c"), // [V:sub_140646110 -> sub_140643A00/sub_140DC1300] generic selector-query scalar; second consumer exports value*1000; no proof of the legacy lock-range-min name
    (0x5B3AF66C, 5, "hp_ratio_family_b_band_30_to_35"),
    (0x5B851170, 2, "reserved_flag_154"),
    (0x5BBBD90C, 5, "hp_ratio_family_a_band_05_to_10"),
    (0x5BF3A215, 2, "self_hp_reduction_amount_slot_3"), // [V:data_14133F258 idx=3 -> sub_1405F9480]
    (0x5CE8D569, 2, "reserved_flag_160"),
    (0x5E0DDDD8, 2, "special_melee_cost"), // [V:sub_1405F9180] case 13
    (0x6133A20B, 2, "unresolved_168"),     // [D:0,1000] absent from the OB image
    (
        0x6674EE31,
        5,
        "low_durability_incoming_damage_multiplier_band_45_to_50",
    ), // [V:sub_1405F8E70 -> sub_1405F9480] HP 45-50% band
    (0x6A14228B, 5, "burst_ranged_attack_multiplier_slot_0"),
    (
        0x6AF92610,
        5,
        "conditional_incoming_damage_multiplier_slot_3",
    ), // [V:sub_1405F8D40 -> sub_1405F9480] selector slot 3 while state+0xC is 2 or 3
    (0x6ED37B1F, 5, "unresolved_178"), // [V:sub_1406395F0 -> sub_1406394E0] multiplies ((collisionSphereRadiusScale * sphere0Radius) / 7) * 10; final gameplay identity open
    (
        0x6F2514E8,
        5,
        "low_durability_incoming_damage_multiplier_band_10_to_15",
    ), // [V:sub_1405F8E70 -> sub_1405F9480] HP 10-15% band
    (0x71D35821, 1, "target_position_resolver_mode"), // [V:sub_1405FC230 -> sub_1405FC490] equality with 2 becomes the final boolean mode argument of sub_1405FB520
    (0x71D87C2C, 5, "unresolved_184"),
    (0x72785F9E, 5, "hp_ratio_family_a_band_20_to_25"),
    (0x776BBBE9, 2, "burst_damage"), // [V:sub_1405F9010] case 9 — multiplied by correction rate at a1+20
    (0x78860431, 5, "lock_distance_threshold_family_1_slot_3"), // [V:sub_1405F8600] selector 3
    (0x78C70D3F, 5, "target_relative_camera_height_near"), // [V:sub_140640C60 -> sub_140640230] camera Y value at zero horizontal target distance
    (0x7B9D7024, 2, "reserved_flag_198"),
    (0x7BA88A27, 5, "hp_ratio_family_b_band_40_to_45"),
    (0x7D1A0ACF, 2, "unit_cost_value"), // [V:CharacterList sub_140532860/sub_1405345B0; runtime sub_14060AE50] exact 1500/2000/2500/3000 unit-cost filtering and cost-tier mapping
    // ---- cost dispatcher: sub_1405F9180 switch(attack_type) ----
    (0x8199A311, 2, "main_shot_cost"), // [V:sub_1405F9180] case 0
    (0x8248401F, 2, "hp_regen_value_default"), // [V:sub_1405F9500] HP regen when a2==0; paired with hp_regen_value
    (
        0x82B967A9,
        5,
        "target_relative_camera_height_high_elevation",
    ), // [V:sub_140640E80 -> sub_140640230] height endpoint selected as the target elevation blend approaches its high-angle limit
    (0x8381BE8A, 2, "unresolved_1b0"),
    (
        0x85C483F0,
        5,
        "conditional_incoming_damage_multiplier_slot_1",
    ), // [V:sub_1405F8D40 -> sub_1405F9480] selector slot 1 while state+0xC is 2 or 3
    (0x86579C72, 5, "hp_ratio_family_b_band_45_to_50"),
    (0x8A902D5F, 5, "damage_calculation_multiplier_slot_0"), // [V:sub_140625060 <- sub_140622010] selected by hit-record slot 0 and multiplied into final damage
    (0x8CBF2B3F, 5, "collision_sphere_0_center_y"), // [V:data_141342D80 r0c2 -> sub_140628FD0]
    (0x8F0666AB, 5, "hp_ratio_family_b_band_10_to_15"),
    (0x8F8749CB, 5, "hp_ratio_family_a_band_25_to_30"),
    (0x904C7CF0, 2, "special_damage"), // [V:sub_1405F9010] case 3/15/18
    (0x91CDEF2B, 5, "burst_mobility_multiplier_slot_4"),
    (0x91E5A104, 5, "lock_distance_threshold_family_1_slot_1"), // [V:sub_1405F8600] selector 1
    (0x9B20A527, 5, "unresolved_1d8"), // [D:0.0,1.0] absent from the OB image
    (
        0x9B8BF864,
        5,
        "low_durability_incoming_damage_multiplier_band_40_to_45",
    ), // [V:sub_1405F8E70 -> sub_1405F9480] HP 40-45% band
    (0x9BED4726, 5, "damage_calculation_multiplier_slot_1"), // [V:sub_140625060 <- sub_140622010] selected by hit-record slot 1 and multiplied into final damage
    (0x9D8ADBDF, 2, "reserved_flag_1e4"),
    // User in-game 2026-07-11: 红锁距离 (with alert_range_distance). See docs/characterparam-field-notes.md.
    (0xA223C183, 5, "lock_distance_threshold_family_2_slot_3"), // [V:sub_1405F8720] selector 3
    (0xA60B0684, 1, "reserved_1ec"), // [D:0] constant across the sampled corpus and absent from the OB image; was "weapon_attribute_flags"
    (0xA644CF59, 5, "hp_ratio_family_a_band_00_to_05"),
    (0xA6C5E039, 5, "hp_ratio_family_b_band_15_to_20"),
    (0xA6DC5C53, 5, "unresolved_1f8"), // [V:sub_14060E340] replaces coefficient 1.0 when record flag 0x10000000 is set; written to event-state +0x30; no proof of damage semantics
    (0xA83A8232, 5, "unresolved_1fc"),
    (0xA900CDF7, 5, "target_position_offset_slot_1_z"), // [V:data_14134BD58 idx=5 -> sub_140690480] was "aim_correction_offset_x"; the array proves this is the Z component
    (0xAA841999, 5, "target_position_offset_slot_1_x"), // [V:data_14134BD58 idx=3 -> sub_140690480] was "aim_correction_offset_y"; this is the mirrored X component
    (0xAB4673AE, 5, "target_position_offset_slot_1_y"), // [V:data_14134BD58 idx=4 -> sub_140690480] was "aim_correction_offset_z"; the array proves this is the Y component
    (0xAE7FF94F, 2, "sub_shot_cost_scaled"),            // [V:sub_1405F9180] case 4/5/12
    (0xAEAC01A7, 2, "unresolved_210"), // [V:sub_1405D9260 <- sub_1405D6010] fetched for record indices 0 and 1; stored at owner +0x6908/+0x690C, downstream meaning open
    (0xAF153580, 5, "hp_ratio_family_a_band_35_to_40"),
    (0xB2900720, 2, "self_hp_reduction_amount_slot_1"), // [V:data_14133F258 idx=1 -> sub_1405F9480]
    (0xB2E6B445, 2, "reserved_flag_21c"),
    (0xB3373BD9, 5, "burst_mobility_multiplier_slot_2"),
    (0xB4F17B6F, 5, "target_position_offset_default_z"), // [V:sub_1405FC010 -> sub_1405FB520] default local-space vector Z
    (0xB58B705C, 2, "reserved_flag_228"),
    (0xB5FDC339, 2, "self_hp_reduction_amount_slot_5"), // [V:data_14133F258 idx=5 -> sub_1405F9480]
    // Raw base maximum durability before the runtime scale/offset transform.
    // Verified across native consumers and OB-matched Gyan/Hyaku corpus. See docs/characterparam-field-notes.md.
    (0xB7D5327E, 2, "base_max_durability"),
    (0xB91793D4, 5, "damage_calculation_multiplier_slot_3"), // [V:sub_140625060 <- sub_140622010] selected by hit-record slot 3 and multiplied into final damage
    (0xBA900811, 5, "burst_melee_attack_multiplier_slot_2"),
    // User in-game 2026-07-11: also 红锁距离 (with lock_on_distance_max). See docs/characterparam-field-notes.md.
    (0xBAE8C388, 5, "lock_distance_threshold_family_2_default"), // [V:sub_1405F8720] default branch
    (
        0xBB19842F,
        5,
        "low_durability_incoming_damage_multiplier_band_30_to_35",
    ), // [V:sub_1405F8E70 -> sub_1405F9480] HP 30-35% band
    (
        0xBC427D55,
        5,
        "target_relative_camera_back_distance_high_elevation",
    ), // [V:sub_140640D20 -> sub_140640230] backward-distance endpoint for the high target-elevation blend
    (0xBE256E0C, 5, "burst_ranged_attack_multiplier_slot_4"),
    (0xBE8D97FB, 2, "reserved_flag_24c"),
    (
        0xC1405939,
        5,
        "low_durability_incoming_damage_multiplier_band_25_to_30",
    ), // [V:sub_1405F8E70 -> sub_1405F9480] HP 25-30% band
    (0xC28C40CA, 2, "reserved_flag_254"),
    (0xC2FAF3AF, 2, "self_hp_reduction_amount_slot_6"), // [V:data_14133F258 idx=6 -> sub_1405F9480]
    (0xC3F64BF9, 5, "target_position_offset_default_x"), // [V:sub_1405FC010] local-space X, sign-flipped by mirror bit
    (0xC4852F00, 2, "reserved_flag_260"),
    (0xC59737B6, 2, "self_hp_reduction_amount_slot_2"), // [V:data_14133F258 idx=2 -> sub_1405F9480]
    (0xC5E184D3, 2, "reserved_flag_268"),
    (0xC6A88D7F, 2, "charge_shot_cost"), // [V:sub_1405F9180] case 10
    (0xC6E2AD28, 5, "unresolved_270"), // [V:sub_140634D00 -> runtime+0x98] tuple member also recomputed as base*external percentage; no proof of legacy charge-damage semantics
    (0xC8B2F571, 5, "collision_sphere_1_center_z"), // [V:data_141342D80 r1c3 -> sub_140628FD0]
    (0xCAF44B28, 5, "collision_sphere_1_center_y"), // [V:data_141342D80 r1c2 -> sub_140628FD0]
    (0xCB36211F, 5, "collision_sphere_1_center_x"), // [V:data_141342D80 r1c1 -> sub_140628FD0]
    (0xD01D00DF, 5, "unresolved_280"), // [V:sub_14060E340] divided by baseMaxDurability, multiplied by one type-0x29 event bucket, then accumulated into Burst state; dealt/received direction open
    // ---- range/radar distance dispatcher: sub_1405F8720 switch(category) ----
    (0xD249350C, 5, "lock_distance_threshold_family_2_slot_0"), // [V:sub_1405F8720] selector 0
    (0xD24DC1FD, 5, "collision_sphere_1_radius"), // [V:data_141342D80 r1c0 -> sub_140628FD0]
    (0xD2D0C774, 5, "unresolved_28c"),
    (0xD524F115, 5, "lock_distance_threshold_family_2_slot_4"), // [V:sub_1405F8720] selector 4
    (0xD54CE896, 5, "hp_ratio_family_a_band_40_to_45"),
    (0xD6F39D3C, 5, "unit_position_query_local_offset_z"), // [V:sub_140646350 -> same position-query vector consumers] Z component
    (0xD854F864, 5, "reserved_29c"), // [D:0.0] constant across the sampled corpus and absent from the OB image; was "radar_display_offset"
    (0xD8F4FBD2, 2, "melee_cost"),   // [V:sub_1405F9180] case 1
    (0xDC414338, 5, "target_position_offset_slot_2_y"), // [V:data_14134BD58 idx=7 -> sub_140690480]
    (0xDC9C3D2F, 5, "hp_ratio_family_b_band_20_to_25"),
    (0xDD83290F, 5, "target_position_offset_slot_2_x"), // [V:data_14134BD58 idx=6 -> sub_140690480] mirrored X component
    (0xDE07FD61, 5, "target_position_offset_slot_2_z"), // [V:data_14134BD58 idx=8 -> sub_140690480]
    (0xDF888E8B, 2, "unresolved_2b4"),                  // [D:0,180] absent from the OB image
    (
        0xE1D22572,
        5,
        "low_durability_incoming_damage_multiplier_band_35_to_40",
    ), // [V:sub_1405F8E70 -> sub_1405F9480] HP 35-40% band
    (
        0xE1D56972,
        5,
        "target_relative_camera_back_distance_normal_elevation",
    ), // [V:sub_140640AE0 -> sub_140640230] normal-elevation backward camera distance
    (0xE2C6FD16, 2, "sub_shot_damage"), // [V:sub_1405F9010] case 4/5/12 — multiplied by correction rate at a1+20
    (0xE3E5D41D, 5, "unresolved_2c4"), // [V:sub_14060E340] linear coefficient for the other type-0x29 event bucket accumulated into Burst state; bucket direction open
    (0xE6213731, 7, "action_label_offset"),
    (0xE6E29192, 5, "lock_distance_threshold_family_1_slot_2"), // [V:sub_1405F8600] selector 2
    (
        0xE883DFAB,
        5,
        "low_durability_incoming_damage_multiplier_band_00_to_05",
    ), // [V:sub_1405F8E70 -> sub_1405F9480] HP 0-5% band
    (0xE90161F5, 5, "burst_melee_attack_multiplier_slot_4"),
    (0xE9F462F6, 5, "target_tracking_response_component_limit"), // [V:sub_1406825B0 -> sub_140683070 object+0x68; sub_140626D04] symmetric per-component clamp for the tracking response vector
    (0xEB1219A4, 2, "main_shot_damage"),                         // [V:sub_1405F9010] case 0/1
    (0xECBC202D, 5, "reserved_2e4"), // [D:0.55] constant across the sampled corpus and absent from the OB image; was "combo_proration_rate"
    (0xED170E69, 2, "state_lt_2_positive_accumulator_add_2e8"), // [V:sub_14060E340 -> sub_1405FA270] positive integer is accumulated while state+0xC < 2
    (0xEDB407E8, 5, "burst_ranged_attack_multiplier_slot_2"),
    (0xEE92BCAB, 5, "state_bit_0100_multiplier_2f0"), // [V:sub_14060E340] global/default record bit 0x100 gates multiplication into object+0x30
    (
        0xF15C6A7F,
        5,
        "conditional_incoming_damage_multiplier_slot_4",
    ), // [V:sub_1405F8D40 -> sub_1405F9480] selector slot 4 while state+0xC is 2 or 3
    (
        0xF25A5100,
        5,
        "conditional_incoming_damage_multiplier_slot_0",
    ), // [V:sub_1405F8D40 -> sub_1405F9480] selector slot 0 while state+0xC is 2 or 3
    (0xF3C4CAE9, 7, "resource_label_offset"),
    (0xF55FBBBD, 5, "hp_ratio_family_b_band_05_to_10"),
    (0xF5DE94DD, 5, "hp_ratio_family_a_band_30_to_35"),
    (0xF73592C7, 5, "reserved_30c"), // [D:50000.0] constant across the sampled corpus and absent from the OB image; was "max_render_distance"
    (0xFBB81BA9, 5, "collision_sphere_0_center_x"), // [V:data_141342D80 r0c1 -> sub_140628FD0]
    (0xFEADD5BE, 5, "collision_sphere_radius_scale"), // [V:sub_140628FD0 scales every sphere radius; V:sub_140634FE0 -> sub_1406394E0 radius normalisation] [D:1.0..1.2]
    (0xFEE76495, 2, "assist_cost"),                   // [V:sub_1405F9180] case 6/7
];

pub fn characterparam_entry_to_json_value(entry: &CharacterParamEntry) -> Value {
    entry_commands_to_named_json(entry.entry_id, &entry.commands, CHARACTERPARAM_COMMAND_POOL)
}

const CHARACTERPARAM_LEGACY_KEY_ALIASES: &[(&str, &str)] = &[
    ("unresolved058", "lockBandCachedStateOverrideEnabled"),
    // Getter/table reachability alone does not prove the historical English
    // labels. Preserve them as input aliases while canonical output remains
    // neutral until downstream arithmetic closes each identity.
    ("unresolved010", "burstGaugeEventBaseDelta"),
    ("ammoCountMain", "burstGaugeEventBaseDelta"),
    ("unresolved014", "targetTrackingResponseRetentionMultiplier"),
    ("downValueRate", "targetTrackingResponseRetentionMultiplier"),
    ("boostGaugeMax", "unresolved018"),
    ("boostRecoverySpeed", "unresolved02c"),
    ("unresolved034", "unitNumericId"),
    ("unitIdComposite", "unitNumericId"),
    ("modelScale", "unresolved040"),
    ("unresolved054", "runtimeProgressPercentageDenominator"),
    ("isTransformable", "runtimeProgressPercentageDenominator"),
    ("unitAttributeFlags", "lockBandCachedStateOverrideEnabled"),
    ("lockOnFovAngle", "lockElevationUpperLimitDegrees"),
    ("unresolved068", "burstGaugeEventDeltaMultiplier"),
    ("downValueThreshold", "burstGaugeEventDeltaMultiplier"),
    ("damageCorrectionBase", "unresolved094"),
    ("cameraPitchDownAngle", "lockElevationLowerLimitDegrees"),
    ("specialMeleeCorrectionRate", "targetPositionOffsetDefaultY"),
    ("unresolved0d8", "unitPositionQueryLocalOffsetX"),
    ("meleeBonusRate", "unitPositionQueryLocalOffsetX"),
    ("unresolved0fc", "cameraVerticalHeightCorrection"),
    ("cameraOffsetX", "cameraVerticalHeightCorrection"),
    ("unresolved124", "unitPositionQueryLocalOffsetY"),
    ("cameraOffsetZ", "unitPositionQueryLocalOffsetY"),
    ("unresolved130", "targetRelativeCameraHeightFar"),
    ("bodyHeight", "targetRelativeCameraHeightFar"),
    ("lockOnRangeMin", "unresolved14c"),
    ("burstCorrectionBase", "unresolved178"),
    ("unresolved180", "targetPositionResolverMode"),
    ("burstAttributeFlags", "targetPositionResolverMode"),
    ("unresolved194", "targetRelativeCameraHeightNear"),
    ("hitboxHeight", "targetRelativeCameraHeightNear"),
    ("unresolved1a0", "unitCostValue"),
    ("respawnCost", "unitCostValue"),
    ("unresolved1ac", "targetRelativeCameraHeightHighElevation"),
    ("walkSpeed", "targetRelativeCameraHeightHighElevation"),
    ("burstDamageMultiplier", "unresolved1f8"),
    ("reservedFlag210", "unresolved210"),
    ("meleeLungeOffset", "targetPositionOffsetDefaultZ"),
    (
        "unresolved244",
        "targetRelativeCameraBackDistanceHighElevation",
    ),
    (
        "radarDisplayScale",
        "targetRelativeCameraBackDistanceHighElevation",
    ),
    ("ammoCorrectionOffset", "targetPositionOffsetDefaultX"),
    ("chargeDamageMultiplier", "unresolved270"),
    ("meleeLockAngle", "unresolved280"),
    ("unresolved298", "unitPositionQueryLocalOffsetZ"),
    ("radarCorrectionOffset", "unitPositionQueryLocalOffsetZ"),
    (
        "unresolved2bc",
        "targetRelativeCameraBackDistanceNormalElevation",
    ),
    (
        "meleeReachDistance",
        "targetRelativeCameraBackDistanceNormalElevation",
    ),
    ("downValuePerHit", "unresolved2c4"),
    ("unresolved2dc", "targetTrackingResponseComponentLimit"),
    (
        "damageProrationRate",
        "targetTrackingResponseComponentLimit",
    ),
    ("reservedFlag2e8", "stateLt2PositiveAccumulatorAdd2e8"),
    ("mainShotDamageMultiplier", "stateBit0100Multiplier2f0"),
    // The eight members of the static array at 0x14133F258 were named as reload
    // frames, charge times and counters. Their single native reader is
    // sub_1405F8DF0(base, idx<8), whose only consumer is sub_140682A30 case 8,
    // which feeds the value straight into sub_1405F9480 as the operand of
    //   HP -= value * burstIncoming * gutsBand * ratioBand
    // A reload frame or a combo limit cannot be that operand, and three of the
    // observed values (1000, 1200, 1500) exceed every unit's maximum durability
    // (600-680), which only makes sense as self-destruct damage.
    // Evidence: docs/characterparam-native-consumer-map-ob.md.
    ("mainAmmoReloadFrame", "selfHpReductionAmountSlot0"),
    ("assistReloadFrame", "selfHpReductionAmountSlot1"),
    ("chargeTimeFrame", "selfHpReductionAmountSlot2"),
    ("subAmmoReloadFrame", "selfHpReductionAmountSlot3"),
    ("meleeComboLimit", "selfHpReductionAmountSlot4"),
    ("stepCancelCount", "selfHpReductionAmountSlot5"),
    ("ammoReserveCount", "selfHpReductionAmountSlot6"),
    ("partnerCostPenaltyFrame", "selfHpReductionAmountSlot7"),
    // The nine members of the static array at 0x14134BD58 are three local-space
    // 3D offset vectors, not nine unrelated scalars. sub_140690480 reads them as
    //   x = array[3*i + 0]  (sign-flipped when the mirror flag is set)
    //   y = array[3*i + 1]
    //   z = array[3*i + 2]
    // and sub_140690610 case 4 feeds the vector to sub_1405FB520 to resolve a
    // world position on a target actor. The previous names assigned x/y/z by row
    // offset order, which is rotated one place from the real component order, so
    // editing the field labelled `_x` moved the Z axis.
    ("aimCorrectionOffsetX", "targetPositionOffsetSlot1Z"),
    ("aimCorrectionOffsetY", "targetPositionOffsetSlot1X"),
    ("aimCorrectionOffsetZ", "targetPositionOffsetSlot1Y"),
    ("meleeCorrectionOffset", "targetPositionOffsetSlot0X"),
    ("barrierDamageRate", "targetPositionOffsetSlot0Y"),
    ("guardDamageRate", "targetPositionOffsetSlot0Z"),
    ("meleeAimCorrectionOffset", "targetPositionOffsetSlot2X"),
    ("meleeCostCorrectionOffset", "targetPositionOffsetSlot2Y"),
    ("meleeRangeOffset", "targetPositionOffsetSlot2Z"),
    // The sixteen members of the static array at 0x141342D80 are a 4x4 matrix of
    // collision spheres, one per row: (radius, centreX, centreY, centreZ).
    // sub_140628FD0 builds a vdkSpheref per row and stops at the first radius
    // <= 0.0; sub_140628B70 counts the active spheres with the same stride-4 walk.
    // The previous names were derived independently of that structure and were
    // mutually incoherent under it. 0xFEADD5BE multiplies every sphere radius and
    // is normalised against the smallest observed radius in sub_1406394E0, so it
    // is a radius scale, not a damage multiplier.
    ("meleeReachBase", "collisionSphere0Radius"),
    ("renderCorrectionOffset", "collisionSphere0CenterX"),
    ("gravityMultiplier", "collisionSphere0CenterY"),
    ("gravityOffset", "collisionSphere0CenterZ"),
    ("targetCorrectionOffset", "collisionSphere1Radius"),
    ("chargeGaugeOffset", "collisionSphere1CenterX"),
    ("chargeBonusOffset", "collisionSphere1CenterY"),
    ("chargeCorrectionOffset", "collisionSphere1CenterZ"),
    ("cameraOffsetY", "collisionSphere2Radius"),
    ("bodyOffsetY", "collisionSphere2CenterX"),
    ("chargeShotCorrectionOffset", "collisionSphere2CenterY"),
    ("cameraOffsetPartnerY", "collisionSphere2CenterZ"),
    ("chargeTimeOffset", "collisionSphere3Radius"),
    ("landingRecoveryRate", "collisionSphere3CenterX"),
    ("specialGaugeStartRate", "collisionSphere3CenterY"),
    ("stepSpeedRate", "collisionSphere3CenterZ"),
    ("finalDamageMultiplier", "collisionSphereRadiusScale"),
    // Added by the 2026-07-25 mechanical audit. Each of these fields is constant
    // across every sampled real file AND its hash occurs nowhere in the OB
    // executable image, so no evidence can support a gameplay name. The keys were
    // demoted to neutral offsets; the old names remain readable on input.
    // Evidence: docs/characterparam-native-consumer-map-ob.md.
    ("hasShield", "reserved05c"),
    ("aerialDamageRate", "reserved0ac"),
    ("respawnInvincibilityFrame", "reserved104"),
    ("cameraOffsetPartnerX", "reserved128"),
    ("weaponAttributeFlags", "reserved1ec"),
    ("radarDisplayOffset", "reserved29c"),
    ("comboProrationRate", "reserved2e4"),
    ("maxRenderDistance", "reserved30c"),
    // Lock-distance colour aliases, re-pointed 2026-07-25 after the whole chain
    // was decompiled (docs/lock-on-range-native-resolution-ob.md):
    //   outer radius  = Family2 * scale + offset, *0.9 under state 19
    //   inner radius  = min(Family1, outer - 1)
    //   band 3 = d < inner, band 2 = inner <= d < outer, band 1 = d >= outer
    // The outer radius is produced by sub_1405F86A0, which reads Family-2 ONLY;
    // sub_1405F8600 (Family-1) has exactly one caller, the inner radius. Pointing
    // a green-lock alias at a Family-1 slot therefore wrote to a field the outer
    // boundary never consults. Both aliases now target the DEFAULT slot of the
    // correct family, because the selector falls back to default unless the
    // attack record's type field is 2 or 3.
    ("redLockDistance", "lockDistanceThresholdFamily1Default"),
    ("greenLockDistance", "alertRangeDistance"),
    ("yellowLockDistance", "lockDistanceThresholdFamily1Default"),
    ("engagementRangeNear", "lockDistanceThresholdFamily1Slot3"),
    ("engagementRangeFar", "lockDistanceThresholdFamily1Slot1"),
    ("targetSwitchDistance", "lockDistanceThresholdFamily1Slot2"),
    ("targetRangeDistance", "lockDistanceThresholdFamily2Slot0"),
    ("cameraDistanceFar", "lockDistanceThresholdFamily2Slot1"),
    ("cameraDistanceNear", "lockDistanceThresholdFamily2Slot2"),
    ("radarRangeDistance", "lockDistanceThresholdFamily2Slot4"),
    ("boostGaugeInitial", "baseMaxDurability"),
    ("maxHp", "damageDispatchValueSelector8"),
    ("hpMaxValue", "runtimeDurabilityUpperClamp"),
    ("cameraPitchUpAngle", "hpRatioFamilyABand45To50"),
    ("radarSweepAngle", "hpRatioFamilyABand40To45"),
    ("meleeCameraAngle", "hpRatioFamilyABand35To40"),
    ("projectileTrackingAngleMax", "hpRatioFamilyABand30To35"),
    ("rangedTrackingAngleMax", "hpRatioFamilyABand25To30"),
    ("burstLockOnAngle", "hpRatioFamilyABand20To25"),
    ("frontTrackingAngle", "hpRatioFamilyABand15To20"),
    ("stepTrackingAngleMax", "hpRatioFamilyABand10To15"),
    ("aimAssistAngle", "hpRatioFamilyABand05To10"),
    ("wideCameraAngle", "hpRatioFamilyABand00To05"),
    ("closeTrackingAngle", "hpRatioFamilyBBand45To50"),
    ("autoAimAngleLimit", "hpRatioFamilyBBand40To45"),
    ("boostGaugePct", "hpRatioFamilyBBand35To40"),
    ("lockOnAngleMain", "hpRatioFamilyBBand30To35"),
    ("stepTrackingAngleMin", "hpRatioFamilyBBand25To30"),
    ("meleeAimAngle", "hpRatioFamilyBBand20To25"),
    ("narrowCameraAngle", "hpRatioFamilyBBand15To20"),
    ("rangedTrackingAngleMin", "hpRatioFamilyBBand10To15"),
    ("projectileTrackingAngleMin", "hpRatioFamilyBBand05To10"),
    ("rearTrackingAngle", "hpRatioFamilyBBand00To05"),
    (
        "hpCorrectionPctTier01",
        "lowDurabilityIncomingDamageMultiplierBand45To50",
    ),
    (
        "hpCorrectionPctTier02",
        "lowDurabilityIncomingDamageMultiplierBand40To45",
    ),
    (
        "hpCorrectionPctTier03",
        "lowDurabilityIncomingDamageMultiplierBand35To40",
    ),
    (
        "hpCorrectionPctTier04",
        "lowDurabilityIncomingDamageMultiplierBand30To35",
    ),
    (
        "hpCorrectionPctTier05",
        "lowDurabilityIncomingDamageMultiplierBand25To30",
    ),
    (
        "hpCorrectionPctTier06",
        "lowDurabilityIncomingDamageMultiplierBand20To25",
    ),
    (
        "hpCorrectionPctTier07",
        "lowDurabilityIncomingDamageMultiplierBand15To20",
    ),
    (
        "hpCorrectionPctTier08",
        "lowDurabilityIncomingDamageMultiplierBand10To15",
    ),
    (
        "hpCorrectionPctTier09",
        "lowDurabilityIncomingDamageMultiplierBand05To10",
    ),
    (
        "hpCorrectionPctTier10",
        "lowDurabilityIncomingDamageMultiplierBand00To05",
    ),
    (
        "rangedDamageCorrectionRate",
        "conditionalIncomingDamageMultiplierSlot0",
    ),
    (
        "subDamageCorrectionRate",
        "conditionalIncomingDamageMultiplierSlot1",
    ),
    (
        "assistCorrectionRate",
        "conditionalIncomingDamageMultiplierSlot2",
    ),
    (
        "specialCorrectionRate",
        "conditionalIncomingDamageMultiplierSlot3",
    ),
    (
        "meleeDamageCorrectionRate",
        "conditionalIncomingDamageMultiplierSlot4",
    ),
    (
        "burstFBoostConsumptionMultiplier",
        "conditionalIncomingDamageMultiplierSlot0",
    ),
    (
        "burstSBoostConsumptionMultiplier",
        "conditionalIncomingDamageMultiplierSlot1",
    ),
    (
        "burstCBoostConsumptionMultiplier",
        "conditionalIncomingDamageMultiplierSlot2",
    ),
    (
        "burstVBoostConsumptionMultiplier",
        "conditionalIncomingDamageMultiplierSlot3",
    ),
    (
        "burstRBoostConsumptionMultiplier",
        "conditionalIncomingDamageMultiplierSlot4",
    ),
    ("dmgMultiplierTierE", "burstMeleeAttackMultiplierSlot0"),
    ("movementSpeedBase", "burstMeleeAttackMultiplierSlot1"),
    ("airDashSpeedBase", "burstMeleeAttackMultiplierSlot2"),
    ("dmgMultiplierTierG", "burstMeleeAttackMultiplierSlot3"),
    ("mainShotSpeedBase", "burstMeleeAttackMultiplierSlot4"),
    ("specialCorrectionBase", "burstRangedAttackMultiplierSlot0"),
    ("dmgMultiplierTierF", "burstRangedAttackMultiplierSlot1"),
    ("shotVelocityBase", "burstRangedAttackMultiplierSlot2"),
    ("dmgMultiplierTierB", "burstRangedAttackMultiplierSlot3"),
    ("dashSpeedBase", "burstRangedAttackMultiplierSlot4"),
    ("mainShotCorrectionRate", "damageCalculationMultiplierSlot0"),
    ("subShotCorrectionRate", "damageCalculationMultiplierSlot1"),
    ("boostDashSpeedRate", "damageCalculationMultiplierSlot2"),
    ("fallSpeedBase", "damageCalculationMultiplierSlot3"),
    ("hpCorrectionRate", "damageCalculationMultiplierSlot4"),
    (
        "burstFDefenseMultiplier",
        "damageCalculationMultiplierSlot0",
    ),
    (
        "burstSDefenseMultiplier",
        "damageCalculationMultiplierSlot1",
    ),
    (
        "burstCDefenseMultiplier",
        "damageCalculationMultiplierSlot2",
    ),
    (
        "burstVDefenseMultiplier",
        "damageCalculationMultiplierSlot3",
    ),
    (
        "burstRDefenseMultiplier",
        "damageCalculationMultiplierSlot4",
    ),
    ("dmgMultiplierTierC", "burstMobilityMultiplierSlot0"),
    ("dmgMultiplierTierA", "burstMobilityMultiplierSlot1"),
    ("dmgMultiplierTierI", "burstMobilityMultiplierSlot2"),
    ("dmgMultiplierTierD", "burstMobilityMultiplierSlot3"),
    ("dmgMultiplierTierH", "burstMobilityMultiplierSlot4"),
    // Canonical names retired by the 2026-08 evidence audit remain input-only
    // aliases. Serialization emits the neutral slot/offset names above.
    ("bodyCollisionRadius", "unresolved050"),
    ("meleeTrackingAngle", "unresolved0d4"),
    ("movementType", "unresolved110"),
    ("specialReloadFrame", "unresolved168"),
    ("burstSpeedMultiplier", "unresolved184"),
    ("teamCostValue", "unresolved1b0"),
    ("subShotCorrectionBase", "unresolved1d8"),
    ("minimumAimAngle", "unresolved1fc"),
    ("targetFovPct", "unresolved28c"),
    ("rotationSpeedDegrees", "unresolved2b4"),
    ("lockOnDistanceMax", "lockDistanceThresholdFamily2Slot3"),
    ("alertRangeDistance", "lockDistanceThresholdFamily2Default"),
    (
        "burstFIncomingDamageMultiplier",
        "conditionalIncomingDamageMultiplierSlot0",
    ),
    (
        "burstSIncomingDamageMultiplier",
        "conditionalIncomingDamageMultiplierSlot1",
    ),
    (
        "burstCIncomingDamageMultiplier",
        "conditionalIncomingDamageMultiplierSlot2",
    ),
    (
        "burstVIncomingDamageMultiplier",
        "conditionalIncomingDamageMultiplierSlot3",
    ),
    (
        "burstRIncomingDamageMultiplier",
        "conditionalIncomingDamageMultiplierSlot4",
    ),
    (
        "burstFMeleeAttackMultiplier",
        "burstMeleeAttackMultiplierSlot0",
    ),
    (
        "burstSMeleeAttackMultiplier",
        "burstMeleeAttackMultiplierSlot1",
    ),
    (
        "burstCMeleeAttackMultiplier",
        "burstMeleeAttackMultiplierSlot2",
    ),
    (
        "burstVMeleeAttackMultiplier",
        "burstMeleeAttackMultiplierSlot3",
    ),
    (
        "burstRMeleeAttackMultiplier",
        "burstMeleeAttackMultiplierSlot4",
    ),
    (
        "burstFRangedAttackMultiplier",
        "burstRangedAttackMultiplierSlot0",
    ),
    (
        "burstSRangedAttackMultiplier",
        "burstRangedAttackMultiplierSlot1",
    ),
    (
        "burstCRangedAttackMultiplier",
        "burstRangedAttackMultiplierSlot2",
    ),
    (
        "burstVRangedAttackMultiplier",
        "burstRangedAttackMultiplierSlot3",
    ),
    (
        "burstRRangedAttackMultiplier",
        "burstRangedAttackMultiplierSlot4",
    ),
    ("burstFMobilityMultiplier", "burstMobilityMultiplierSlot0"),
    ("burstSMobilityMultiplier", "burstMobilityMultiplierSlot1"),
    ("burstCMobilityMultiplier", "burstMobilityMultiplierSlot2"),
    ("burstVMobilityMultiplier", "burstMobilityMultiplierSlot3"),
    ("burstRMobilityMultiplier", "burstMobilityMultiplierSlot4"),
];

pub fn characterparam_entry_from_json_value(v: &Value) -> Result<CharacterParamEntry, String> {
    let mut normalized = v.clone();
    if let Some(obj) = normalized.as_object_mut() {
        for &(legacy_key, canonical_key) in CHARACTERPARAM_LEGACY_KEY_ALIASES {
            if !obj.contains_key(canonical_key) {
                if let Some(legacy_value) = obj.get(legacy_key).cloned() {
                    obj.insert(canonical_key.to_string(), legacy_value);
                }
            }
        }
    }
    let (entry_id, commands) =
        entry_commands_from_named_json(&normalized, CHARACTERPARAM_COMMAND_POOL)?;
    Ok(CharacterParamEntry { entry_id, commands })
}

#[derive(Debug, Clone, PartialEq)]
pub struct CharacterParamEntry {
    pub entry_id: u32,
    pub commands: HashMap<u32, u32>,
}

impl Serialize for CharacterParamEntry {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        characterparam_entry_to_json_value(self).serialize(s)
    }
}

impl<'de> Deserialize<'de> for CharacterParamEntry {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        characterparam_entry_from_json_value(&v).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterParamData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<CharacterParamEntry>,
    pub trailing_data: Vec<u8>,
    #[serde(skip)]
    pub source_entries_raw: Vec<Vec<u8>>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    expected_field_specs_ordered(CHARACTERPARAM_COMMAND_POOL)
}

fn validate_field_specs(field_specs: &[ParamFieldSpec]) -> Result<(), String> {
    validate_file_specs_kind_match_pool(CHARACTERPARAM_COMMAND_POOL, field_specs)
}

fn parse_entry_from_raw(
    raw: &[u8],
    field_specs: &[ParamFieldSpec],
    entry_id: u32,
) -> CharacterParamEntry {
    let commands = parse_commands_map_from_entry_row(raw, field_specs);
    CharacterParamEntry { entry_id, commands }
}

fn entry_matches_raw(
    entry: &CharacterParamEntry,
    raw: &[u8],
    field_specs: &[ParamFieldSpec],
) -> bool {
    entry_row_matches_command_map(&entry.commands, raw, field_specs)
}

pub fn parse_characterparam(data: &[u8]) -> Result<CharacterParamData, String> {
    let file = read_param_binary(data)?;
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        let id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(parse_entry_from_raw(raw, &file.field_specs, id));
    }

    Ok(CharacterParamData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
        source_entries_raw: file.entries_raw,
    })
}

pub fn build_characterparam(b: &CharacterParamData) -> Result<Vec<u8>, String> {
    if !b.field_specs.is_empty() {
        validate_field_specs(&b.field_specs)?;
    }
    let field_specs = if b.field_specs.is_empty() {
        expected_field_specs()
    } else {
        b.field_specs.clone()
    };

    let min_size = min_entry_data_size_for_specs(&field_specs);
    let default_floor = b.header.entry_size.max(min_size);
    let entry_size = default_floor as usize;

    let mut entries_raw: Vec<Vec<u8>> = Vec::with_capacity(b.entries.len());
    for (entry_index, entry) in b.entries.iter().enumerate() {
        if entry_index < b.source_entries_raw.len()
            && b.source_entries_raw[entry_index].len() == entry_size
        {
            let r = &b.source_entries_raw[entry_index];
            if entry_matches_raw(entry, r, &field_specs) {
                entries_raw.push(b.source_entries_raw[entry_index].clone());
                continue;
            }
        }

        let mut raw = if entry_index < b.source_entries_raw.len()
            && b.source_entries_raw[entry_index].len() == entry_size
        {
            b.source_entries_raw[entry_index].clone()
        } else {
            vec![0u8; entry_size]
        };

        for spec in &field_specs {
            let o = spec.entry_offset as usize;
            if o + 4 > raw.len() {
                return Err(
                    "characterparam entry field offset out of range for entry_size".to_string(),
                );
            }
            if let Some(v) = entry.commands.get(&spec.hash) {
                raw[o..o + 4].copy_from_slice(&v.to_le_bytes());
            }
        }
        entries_raw.push(raw);
    }

    let mut header = b.header.clone();
    header.entry_count = b.entries.len() as u32;
    header.commands_count = field_specs.len() as u32;
    header.entry_size = entry_size as u32;

    let file = ParamBinaryFile {
        header,
        field_specs,
        entry_ids: b.entries.iter().map(|entry| entry.entry_id).collect(),
        entries_raw,
        trailing_data: b.trailing_data.clone(),
    };
    build_param_binary(&file)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_PATH: &str = "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\characterparam.bin";
    const GYAN_PATH: &str = "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\041cpm\\gundam_005gyan00_35b195cc\\characterparam.bin";
    const HYAKU_SHIKI_PATH: &str =
        "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\041cpm\\zgundm_002hyaksk\\characterparam.bin";

    #[test]
    fn characterparam_read_write_crud() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read characterparam sample file");

        let parsed =
            parse_characterparam(&source).expect("failed to parse characterparam sample file");
        let rebuilt =
            build_characterparam(&parsed).expect("failed to rebuild characterparam sample file");
        assert_eq!(rebuilt, source);

        assert!(
            !parsed.entries.is_empty(),
            "characterparam sample has no entries"
        );

        let mut with_added = parsed.clone();
        let mut added = with_added.entries[0].clone();
        let next_id = with_added
            .entries
            .iter()
            .map(|entry| entry.entry_id)
            .max()
            .unwrap_or(0)
            .wrapping_add(1);
        added.entry_id = next_id;
        with_added.entries.push(added);
        let added_bytes =
            build_characterparam(&with_added).expect("failed to build characterparam after add");
        let added_parsed =
            parse_characterparam(&added_bytes).expect("failed to parse characterparam after add");
        assert_eq!(added_parsed.entries.len(), parsed.entries.len() + 1);
        assert_eq!(
            added_parsed.entries.last().map(|entry| entry.entry_id),
            Some(next_id)
        );

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes = build_characterparam(&with_updated)
            .expect("failed to build characterparam after update");
        let updated_parsed = parse_characterparam(&updated_bytes)
            .expect("failed to parse characterparam after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes = build_characterparam(&with_deleted)
            .expect("failed to build characterparam after delete");
        let deleted_parsed = parse_characterparam(&deleted_bytes)
            .expect("failed to parse characterparam after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }

    #[test]
    fn named_ob_samples_round_trip_and_publish_verified_damage_keys() {
        let cases = [
            (
                GYAN_PATH,
                600,
                [0.90_f32, 1.12_f32, 1.00_f32, 0.80_f32, 1.04_f32],
            ),
            (
                HYAKU_SHIKI_PATH,
                620,
                [0.80_f32, 1.08_f32, 1.00_f32, 1.00_f32, 1.10_f32],
            ),
        ];
        let representative_hashes = [0xF25A5100, 0x3D302D72, 0x6A14228B, 0x8A902D5F, 0x1BB18A48];

        for (path, expected_durability, expected_burst_values) in cases {
            let source = std::fs::read(path).unwrap_or_else(|error| panic!("{path}: {error}"));
            let parsed = parse_characterparam(&source)
                .unwrap_or_else(|error| panic!("parse {path}: {error}"));
            let rebuilt = build_characterparam(&parsed)
                .unwrap_or_else(|error| panic!("build {path}: {error}"));
            assert_eq!(rebuilt, source, "byte-exact round trip for {path}");

            let first = parsed.entries.first().expect("sample entry");
            assert_eq!(first.commands.get(&0xB7D5327E), Some(&expected_durability));
            for (hash, expected) in representative_hashes.into_iter().zip(expected_burst_values) {
                assert_eq!(first.commands.get(&hash), Some(&expected.to_bits()));
            }

            let output = characterparam_entry_to_json_value(first);
            assert!(output
                .get("conditionalIncomingDamageMultiplierSlot0")
                .is_some());
            assert!(output.get("burstMeleeAttackMultiplierSlot0").is_some());
            assert!(output.get("burstRangedAttackMultiplierSlot0").is_some());
            assert!(output.get("damageCalculationMultiplierSlot0").is_some());
            assert!(output.get("burstMobilityMultiplierSlot0").is_some());
            assert!(output.get("rangedDamageCorrectionRate").is_none());
            assert!(output.get("burstFBoostConsumptionMultiplier").is_none());
            assert!(output.get("burstFDefenseMultiplier").is_none());
            assert!(output.get("dmgMultiplierTierE").is_none());
        }
    }

    #[test]
    fn characterparam_uses_base_durability_key_and_accepts_legacy_alias() {
        let canonical = characterparam_entry_from_json_value(&serde_json::json!({
            "entryId": 1,
            "baseMaxDurability": 600
        }))
        .expect("canonical durability key");
        assert_eq!(canonical.commands.get(&0xB7D5327E), Some(&600));

        let legacy = characterparam_entry_from_json_value(&serde_json::json!({
            "entryId": 1,
            "boostGaugeInitial": 600
        }))
        .expect("legacy durability key");
        assert_eq!(legacy.commands.get(&0xB7D5327E), Some(&600));

        let output = characterparam_entry_to_json_value(&canonical);
        assert_eq!(output["baseMaxDurability"], serde_json::json!(600));
        assert!(output.get("boostGaugeInitial").is_none());
    }

    #[test]
    fn characterparam_does_not_publish_selector_8_damage_as_max_hp() {
        let canonical = characterparam_entry_from_json_value(&serde_json::json!({
            "entryId": 1,
            "damageDispatchValueSelector8": 30
        }))
        .expect("canonical selector-8 key");
        assert_eq!(canonical.commands.get(&0x00D7CEDB), Some(&30));

        let legacy = characterparam_entry_from_json_value(&serde_json::json!({
            "entryId": 1,
            "maxHp": 30
        }))
        .expect("legacy maxHp key");
        assert_eq!(legacy.commands.get(&0x00D7CEDB), Some(&30));

        let output = characterparam_entry_to_json_value(&canonical);
        assert_eq!(
            output["damageDispatchValueSelector8"],
            serde_json::json!(30)
        );
        assert!(output.get("maxHp").is_none());
    }

    #[test]
    fn characterparam_names_runtime_durability_clamp_explicitly() {
        let canonical = characterparam_entry_from_json_value(&serde_json::json!({
            "entryId": 1,
            "runtimeDurabilityUpperClamp": 10000
        }))
        .expect("canonical runtime clamp key");
        assert_eq!(canonical.commands.get(&0x3C1E9E3B), Some(&10000));

        let legacy = characterparam_entry_from_json_value(&serde_json::json!({
            "entryId": 1,
            "hpMaxValue": 10000
        }))
        .expect("legacy hpMaxValue key");
        assert_eq!(legacy.commands.get(&0x3C1E9E3B), Some(&10000));

        let output = characterparam_entry_to_json_value(&canonical);
        assert_eq!(
            output["runtimeDurabilityUpperClamp"],
            serde_json::json!(10000)
        );
        assert!(output.get("hpMaxValue").is_none());
    }

    #[test]
    fn characterparam_publishes_neutral_lock_threshold_keys_and_accepts_old_labels() {
        let canonical = characterparam_entry_from_json_value(&serde_json::json!({
            "entryId": 1,
            "lockDistanceThresholdFamily1Slot0": 130.0,
            "lockDistanceThresholdFamily2Slot2": 300.0
        }))
        .expect("canonical lock threshold keys");
        assert_eq!(
            canonical.commands.get(&0x08ECF0BE),
            Some(&130.0_f32.to_bits())
        );
        assert_eq!(
            canonical.commands.get(&0x3C475420),
            Some(&300.0_f32.to_bits())
        );

        // Legacy colour labels target the DEFAULT slot of the family that actually
        // produces the boundary they name. The engine reads the default slot unless
        // the attack record's type field is 2 or 3, and the outer (green) boundary
        // is produced by sub_1405F86A0, which reads Family-2 only.
        // See docs/lock-on-range-native-resolution-ob.md.
        let legacy = characterparam_entry_from_json_value(&serde_json::json!({
            "entryId": 1,
            "redLockDistance": 130.0,
            "greenLockDistance": 900.0,
            "cameraDistanceNear": 300.0
        }))
        .expect("legacy lock threshold labels");
        assert_eq!(legacy.commands.get(&0x55E4FF75), Some(&130.0_f32.to_bits()));
        assert_eq!(legacy.commands.get(&0xBAE8C388), Some(&900.0_f32.to_bits()));
        assert_eq!(legacy.commands.get(&0x3C475420), Some(&300.0_f32.to_bits()));

        let output = characterparam_entry_to_json_value(&canonical);
        assert_eq!(
            output["lockDistanceThresholdFamily1Slot0"],
            serde_json::json!(130.0)
        );
        assert_eq!(
            output["lockDistanceThresholdFamily2Slot2"],
            serde_json::json!(300.0)
        );
        assert!(output.get("redLockDistance").is_none());
        assert!(output.get("cameraDistanceNear").is_none());
    }

    #[test]
    fn characterparam_publishes_hp_ratio_dispatch_bands_and_accepts_legacy_aliases() {
        let cases = [
            (0x28B3FEC3, "cameraPitchUpAngle", "hpRatioFamilyABand45To50"),
            (0xD54CE896, "radarSweepAngle", "hpRatioFamilyABand40To45"),
            (0xAF153580, "meleeCameraAngle", "hpRatioFamilyABand35To40"),
            (
                0xF5DE94DD,
                "projectileTrackingAngleMax",
                "hpRatioFamilyABand30To35",
            ),
            (
                0x8F8749CB,
                "rangedTrackingAngleMax",
                "hpRatioFamilyABand25To30",
            ),
            (0x72785F9E, "burstLockOnAngle", "hpRatioFamilyABand20To25"),
            (0x08218288, "frontTrackingAngle", "hpRatioFamilyABand15To20"),
            (
                0x21E2041A,
                "stepTrackingAngleMax",
                "hpRatioFamilyABand10To15",
            ),
            (0x5BBBD90C, "aimAssistAngle", "hpRatioFamilyABand05To10"),
            (0xA644CF59, "wideCameraAngle", "hpRatioFamilyABand00To05"),
            (0x86579C72, "closeTrackingAngle", "hpRatioFamilyBBand45To50"),
            (0x7BA88A27, "autoAimAngleLimit", "hpRatioFamilyBBand40To45"),
            (0x01F15731, "boostGaugePct", "hpRatioFamilyBBand35To40"),
            (0x5B3AF66C, "lockOnAngleMain", "hpRatioFamilyBBand30To35"),
            (
                0x21632B7A,
                "stepTrackingAngleMin",
                "hpRatioFamilyBBand25To30",
            ),
            (0xDC9C3D2F, "meleeAimAngle", "hpRatioFamilyBBand20To25"),
            (0xA6C5E039, "narrowCameraAngle", "hpRatioFamilyBBand15To20"),
            (
                0x8F0666AB,
                "rangedTrackingAngleMin",
                "hpRatioFamilyBBand10To15",
            ),
            (
                0xF55FBBBD,
                "projectileTrackingAngleMin",
                "hpRatioFamilyBBand05To10",
            ),
            (0x08A0ADE8, "rearTrackingAngle", "hpRatioFamilyBBand00To05"),
        ];

        for (hash, legacy_key, canonical_key) in cases {
            let canonical = characterparam_entry_from_json_value(&serde_json::json!({
                "entryId": 1,
                canonical_key: 125
            }))
            .unwrap_or_else(|error| panic!("canonical key {canonical_key}: {error}"));
            assert_eq!(canonical.commands.get(&hash), Some(&125.0_f32.to_bits()));

            let legacy = characterparam_entry_from_json_value(&serde_json::json!({
                "entryId": 1,
                legacy_key: 125
            }))
            .unwrap_or_else(|error| panic!("legacy key {legacy_key}: {error}"));
            assert_eq!(legacy.commands.get(&hash), Some(&125.0_f32.to_bits()));

            let output = characterparam_entry_to_json_value(&canonical);
            assert_eq!(output[canonical_key], serde_json::json!(125.0));
            assert!(output.get(legacy_key).is_none());
        }
    }

    #[test]
    fn characterparam_publishes_multiplier_families_and_accepts_legacy_aliases() {
        let cases = [
            (
                0xF25A5100,
                "rangedDamageCorrectionRate",
                "conditionalIncomingDamageMultiplierSlot0",
            ),
            (
                0x85C483F0,
                "subDamageCorrectionRate",
                "conditionalIncomingDamageMultiplierSlot1",
            ),
            (
                0x1E61CF9F,
                "assistCorrectionRate",
                "conditionalIncomingDamageMultiplierSlot2",
            ),
            (
                0x6AF92610,
                "specialCorrectionRate",
                "conditionalIncomingDamageMultiplierSlot3",
            ),
            (
                0xF15C6A7F,
                "meleeDamageCorrectionRate",
                "conditionalIncomingDamageMultiplierSlot4",
            ),
            (
                0x3D302D72,
                "dmgMultiplierTierE",
                "burstMeleeAttackMultiplierSlot0",
            ),
            (
                0x14F89980,
                "movementSpeedBase",
                "burstMeleeAttackMultiplierSlot1",
            ),
            (
                0xBA900811,
                "airDashSpeedBase",
                "burstMeleeAttackMultiplierSlot2",
            ),
            (
                0x4769F064,
                "dmgMultiplierTierG",
                "burstMeleeAttackMultiplierSlot3",
            ),
            (
                0xE90161F5,
                "mainShotSpeedBase",
                "burstMeleeAttackMultiplierSlot4",
            ),
            (
                0x6A14228B,
                "specialCorrectionBase",
                "burstRangedAttackMultiplierSlot0",
            ),
            (
                0x43DC9679,
                "dmgMultiplierTierF",
                "burstRangedAttackMultiplierSlot1",
            ),
            (
                0xEDB407E8,
                "shotVelocityBase",
                "burstRangedAttackMultiplierSlot2",
            ),
            (
                0x104DFF9D,
                "dmgMultiplierTierB",
                "burstRangedAttackMultiplierSlot3",
            ),
            (
                0xBE256E0C,
                "dashSpeedBase",
                "burstRangedAttackMultiplierSlot4",
            ),
            (
                0x8A902D5F,
                "mainShotCorrectionRate",
                "damageCalculationMultiplierSlot0",
            ),
            (
                0x9BED4726,
                "subShotCorrectionRate",
                "damageCalculationMultiplierSlot1",
            ),
            (
                0x22169CCE,
                "boostDashSpeedRate",
                "damageCalculationMultiplierSlot2",
            ),
            (
                0xB91793D4,
                "fallSpeedBase",
                "damageCalculationMultiplierSlot3",
            ),
            (
                0x00EC483C,
                "hpCorrectionRate",
                "damageCalculationMultiplierSlot4",
            ),
            (
                0x1BB18A48,
                "dmgMultiplierTierC",
                "burstMobilityMultiplierSlot0",
            ),
            (
                0x0ACCE031,
                "dmgMultiplierTierA",
                "burstMobilityMultiplierSlot1",
            ),
            (
                0xB3373BD9,
                "dmgMultiplierTierI",
                "burstMobilityMultiplierSlot2",
            ),
            (
                0x283634C3,
                "dmgMultiplierTierD",
                "burstMobilityMultiplierSlot3",
            ),
            (
                0x91CDEF2B,
                "dmgMultiplierTierH",
                "burstMobilityMultiplierSlot4",
            ),
        ];

        for (hash, legacy_key, canonical_key) in cases {
            let canonical = characterparam_entry_from_json_value(&serde_json::json!({
                "entryId": 1,
                canonical_key: 1.25
            }))
            .unwrap_or_else(|error| panic!("canonical key {canonical_key}: {error}"));
            assert_eq!(canonical.commands.get(&hash), Some(&1.25_f32.to_bits()));

            let legacy = characterparam_entry_from_json_value(&serde_json::json!({
                "entryId": 1,
                legacy_key: 1.25
            }))
            .unwrap_or_else(|error| panic!("legacy key {legacy_key}: {error}"));
            assert_eq!(legacy.commands.get(&hash), Some(&1.25_f32.to_bits()));

            let output = characterparam_entry_to_json_value(&canonical);
            assert_eq!(output[canonical_key], serde_json::json!(1.25));
            assert!(output.get(legacy_key).is_none());
        }
    }

    #[test]
    fn characterparam_publishes_low_durability_damage_bands_and_accepts_tier_aliases() {
        let cases = [
            (
                0x6674EE31,
                "hpCorrectionPctTier01",
                "lowDurabilityIncomingDamageMultiplierBand45To50",
            ),
            (
                0x9B8BF864,
                "hpCorrectionPctTier02",
                "lowDurabilityIncomingDamageMultiplierBand40To45",
            ),
            (
                0xE1D22572,
                "hpCorrectionPctTier03",
                "lowDurabilityIncomingDamageMultiplierBand35To40",
            ),
            (
                0xBB19842F,
                "hpCorrectionPctTier04",
                "lowDurabilityIncomingDamageMultiplierBand30To35",
            ),
            (
                0xC1405939,
                "hpCorrectionPctTier05",
                "lowDurabilityIncomingDamageMultiplierBand25To30",
            ),
            (
                0x3CBF4F6C,
                "hpCorrectionPctTier06",
                "lowDurabilityIncomingDamageMultiplierBand20To25",
            ),
            (
                0x46E6927A,
                "hpCorrectionPctTier07",
                "lowDurabilityIncomingDamageMultiplierBand15To20",
            ),
            (
                0x6F2514E8,
                "hpCorrectionPctTier08",
                "lowDurabilityIncomingDamageMultiplierBand10To15",
            ),
            (
                0x157CC9FE,
                "hpCorrectionPctTier09",
                "lowDurabilityIncomingDamageMultiplierBand05To10",
            ),
            (
                0xE883DFAB,
                "hpCorrectionPctTier10",
                "lowDurabilityIncomingDamageMultiplierBand00To05",
            ),
        ];

        for (hash, legacy_key, canonical_key) in cases {
            let legacy = characterparam_entry_from_json_value(&serde_json::json!({
                "entryId": 1,
                legacy_key: 80.0
            }))
            .unwrap_or_else(|error| panic!("legacy key {legacy_key}: {error}"));
            assert_eq!(legacy.commands.get(&hash), Some(&80.0_f32.to_bits()));

            let output = characterparam_entry_to_json_value(&legacy);
            assert_eq!(output[canonical_key], serde_json::json!(80.0));
            assert!(output.get(legacy_key).is_none());
        }
    }

    #[test]
    fn characterparam_accepts_previous_intermediate_damage_names() {
        let parsed = characterparam_entry_from_json_value(&serde_json::json!({
            "entryId": 1,
            "burstFBoostConsumptionMultiplier": 0.9,
            "burstFDefenseMultiplier": 0.8
        }))
        .expect("previous intermediate names");

        assert_eq!(parsed.commands.get(&0xF25A5100), Some(&0.9_f32.to_bits()));
        assert_eq!(parsed.commands.get(&0x8A902D5F), Some(&0.8_f32.to_bits()));
    }

    #[test]
    fn default_characterparam_specs_preserve_kind_7_padding() {
        let specs = expected_field_specs();
        let offset_for = |hash| {
            specs
                .iter()
                .find(|spec| spec.hash == hash)
                .map(|spec| spec.entry_offset)
                .expect("field spec")
        };
        let index_for = |hash| {
            CHARACTERPARAM_COMMAND_POOL
                .iter()
                .position(|(pool_hash, _, _)| *pool_hash == hash)
                .expect("pool field") as u32
        };

        assert_eq!(offset_for(0xE6213731), index_for(0xE6213731) * 4);
        assert_eq!(offset_for(0xF3C4CAE9), index_for(0xF3C4CAE9) * 4 + 4);
        assert_eq!(min_entry_data_size_for_specs(&specs), 0x31C);
    }
}
