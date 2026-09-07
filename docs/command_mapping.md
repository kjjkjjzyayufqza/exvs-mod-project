# EXVS2 Command Hash Mapping

> **This file is a hypothesis list, not a source of truth — 2026-07-25.**
>
> The `game_name` column is a label list. It is the historical origin of most
> `speedparam` and `characterparam` field names in this project, and a mechanical
> audit found its labels wrong at a dimensional level in many cases: fields named
> `*_frame` that are multipliers, `*_speed` or `*_distance` that are magnitude
> accumulator seeds or floors, `*_type` that are never equality-tested, and
> `*_rate` that are durations.
>
> Known contradicted entries include `0xF5DE94DD` / `0xF55FBBBD` labelled as
> projectile tracking-angle bounds when they are rungs of ten-band float ladders,
> and the burst F/S/C/V/R slot assignment for the `sub_1405F8D40` family, which
> has no address-level basis.
>
> Authoritative name: the canonical key in `src-tauri/src/format/*param.rs`.
> Authoritative evidence: `docs/param-evidence-registry.tsv`.
> Guard: `python tools/check_param_name_evidence.py`.

## Format
Each entry documents a command hash and its game logic meaning.
```
hash_bytes_le | hex_value | game_name | ida_ref | notes
```

## Overview
Command hashes serve as "field keys" in the unified command table format.
Each hash identifies a specific data field within an entry/row.
The `kind` value determines how the field is interpreted:
- kind=1: u32 raw (hash, id, bitfield)
- kind=2: integer (enum, count, index)
- kind=5: float (parameter value)
- kind=7: string offset

---

## character_list (012list, vs2: cmd=61, OB: cmd=103)
_Field keys for character entries_

| Hash (LE hex) | Decimal | Field Name | Kind | Notes |
|---------------|---------|------------|------|-------|
| TBD | TBD | TBD | TBD | Pending IDA analysis |

## arms_param (041cpm, cmd=48, entry_size=200)
_Weapon/arms parameter fields. RTTI: CArmsParamAccessor@GAM@VDK_
_Entry IDs = weapon/arms action hash IDs_

| Hash | Offset | Kind | Value Range | Inferred Name | Notes |
|------|--------|------|-------------|---------------|-------|
| Hash | Offset | Kind | Value Range (30-file) | Confidence | Inferred Name | Reasoning |
|------|--------|------|-----------------------|------------|---------------|-----------|
| 0x020A35DD | 0x000 | u32 | {0,1} | High | is_enabled | Boolean on/off for this arms entry |
| 0x02D35F32 | 0x004 | u32 | {0} | Low | unk_04_reserved | Always zero; unused/reserved slot |
| 0x0496C136 | 0x008 | u32 | {0,1} | Medium | is_continuous_fire | Boolean; continuous vs single-shot flag |
| 0x04A2CFD6 | 0x00C | int | [0,1020] | **High** | **reload_start_frame** | Frame count; when reload begins after ammo depleted |
| 0x103171AE | 0x010 | int | [0,1800] | **High** | **reload_time_total** | Frame count; full reload duration (up to 30s at 60fps) |
| 0x11DEE0C8 | 0x014 | u32 | {0..3} | **High** | **reload_type** | Enum: 0=normal, 1=per-shot, 2=all-at-once, 3=time-based |
| 0x1348893F | 0x018 | u32 | {0,1} | Medium | is_charge_weapon | Boolean; whether weapon requires charging |
| 0x1E8E41EF | 0x01C | u32 | {0,1} | Medium | can_move_while_firing | Boolean; mobility during attack |
| 0x31427CC3 | 0x020 | int | [0,180] | **High** | **homing_angle** | Tracking arc in degrees (0=no tracking, 180=full hemisphere) |
| 0x3A1D6254 | 0x024 | float | [0,1] | Medium | induction_rate | Homing strength coefficient |
| 0x3BC65821 | 0x028 | float | [0,1] | Medium | homing_start_rate | Homing activation timing ratio |
| 0x3CAB9C38 | 0x02C | float | [0,1] | Medium | homing_end_rate | Homing deactivation timing ratio |
| 0x4961274C | 0x030 | int | [1,120] | **High** | **ammo_count** | Magazine/ammo capacity |
| 0x4A7796DB | 0x034 | float | [0,1] | Medium | damage_correction_rate | Combo proration/correction multiplier |
| 0x4BACACAE | 0x038 | float | [0,1] | Medium | down_correction_rate | Down value scaling coefficient |
| 0x4C527468 | 0x03C | int | [0,3] | **High** | **shot_type** | Enum: projectile behavior type (beam, physical, etc.) |
| 0x4C84F7C0 | 0x040 | int | [0,1500] | **High** | **damage** | Base damage value |
| 0x4D1A52C2 | 0x044 | float | [0,1] | Medium | stun_correction_rate | Stun/hitstun scaling coefficient |
| 0x4E692ACD | 0x048 | int | [0,120] | **High** | **down_value** | Contribution to enemy down gauge |
| 0x596FC1C3 | 0x04C | u32 | {0..2} | Medium | cancel_route_type | Cancel route enum (normal, step, boost) |
| 0x5B072B6C | 0x050 | u32 | {0,1} | Medium | is_vernier | Boolean; shows vernier/thruster during attack |
| 0x67364138 | 0x054 | int | [0,1800] | **High** | **cooldown_frame** | Cooldown between uses in frames |
| 0x73A5FF40 | 0x058 | int | [0,1020] | High | startup_frame | Frames before attack becomes active |
| 0x74C83B59 | 0x05C | int | [0,1020] | High | active_frame | Frames the attack hitbox is active |
| 0x89382014 | 0x060 | int | [0,1800] | High | recovery_frame | Frames to recover after attack ends |
| 0x8E55E40D | 0x064 | int | [0,1800] | High | total_duration_frame | Total animation length in frames |
| 0x9AC65A75 | 0x068 | int | [0,1020] | Medium | landing_recovery_frame | Recovery frames on landing during attack |
| 0xA06CAAD5 | 0x06C | int | [0,60] | Medium | stun_value | Hitstun/stagger inflicted on hit |
| 0xA2CF099B | 0x070 | float | [0,1] | Medium | boost_consumption_rate | Boost gauge cost ratio |
| 0xA353F222 | 0x074 | int | [0,600] | Medium | range | Effective range/distance in game units |
| 0xA479F7F7 | 0x078 | float | [0,1] | Medium | muzzle_correction_rate | Muzzle correction/aiming coefficient |
| 0xA502BCF2 | 0x07C | int | [0,1800] | Medium | reload_per_shot_frame | Per-shot reload interval in frames |
| 0xA635CFC2 | 0x080 | int | [0,120] | Medium | reload_lock_frame | Reload lockout duration |
| 0xAB9AEF6C | 0x084 | int | [0,1200] | Medium | overheat_frame | Overheat penalty duration in frames |
| 0xABC33F14 | 0x088 | int | [0,600] | Medium | charge_frame | Charge time for charged attacks |
| 0xAC243293 | 0x08C | u32 | {0..2} | Medium | guard_break_type | Guard interaction type (normal, break, pierce) |
| 0xB669A42A | 0x090 | u32 | {0..2} | Medium | landing_behavior_type | Behavior on landing during attack |
| 0xB686E88C | 0x094 | u32 | {0,1} | Medium | is_super_armor | Boolean; super armor during attack |
| 0xBB93D195 | 0x098 | u32 | {0..7} | **High** | **bullet_type** | Projectile type enum (shot, beam, funnel, etc.) |
| 0xD37EC761 | 0x09C | float | [0,1] | Medium | tracking_speed_rate | Projectile tracking speed coefficient |
| 0xD5C8390D | 0x0A0 | float | [0,1] | Medium | bullet_speed_rate | Projectile velocity coefficient |
| 0xE6213731 | 0x0A4 | string | - | **High** | **action_label** | String ref; shared across arms/char/speed_param families |
| 0xEDC16AE3 | 0x0AC | int | [0,900] | High | ammo_reload_wait_frame | Wait time before reload starts |
| 0xEF3F41B3 | 0x0B0 | u32 | {0..5} | Medium | hit_effect_type | Hit visual effect type enum |
| 0xF3C4CAE9 | 0x0B4 | string | - | **High** | **resource_label** | String ref; shared across arms/char/speed_param families |
| 0xF8AEEC77 | 0x0BC | int | [0,150] | Medium | bullet_count_per_shot | Bullets spawned per trigger pull |
| 0xF8E59F33 | 0x0C0 | int | [0,120] | Medium | firing_interval_frame | Interval between consecutive shots |
| 0xF952D49B | 0x0C4 | int | [0,1800] | Medium | full_charge_frame | Frames for full charge level |

## bullet_param (041cpm, cmd=80, entry_size=320)
_Projectile/bullet parameter fields. RTTI: BulletParam@GAM@VDK_

Collision-field caution: several names in this table are legacy parser labels,
not proven physical-collider controls for every projectile family. In the
checked Gyan Suibaku path, `0x13662C98` and `0x138B3675` are consumed by
transform/orientation logic rather than as collider extents, and custom id
`900300001` has the same collision-looking field values as native Suibaku
`10050102`. Do not use these labels alone to design a long ship collider.

| Hash | Offset | Kind | Field Name | Notes |
|------|--------|------|------------|-------|
| 0x0594D6D4 | 0x000 | float | initial_angle | [-25,130] launch elevation |
| 0x05D5D30D | 0x004 | float | max_range | [0,3600] maximum travel distance |
| 0x06E90346 | 0x008 | u32 | move_type | {0..8} projectile movement pattern |
| 0x0D6A5CD5 | 0x00C | u32 | hit_effect_hash | 105 unique; on-hit VFX hash ref |
| 0x130D4C0B | 0x010 | float | spread_angle | [-80,80] cone spread |
| 0x13662C98 | 0x014 | float | hitbox_width | legacy label; Gyan Suibaku consumer treats it as orientation/spread input, not proven collider width |
| 0x138B3675 | 0x018 | float | hitbox_height | legacy label; Gyan Suibaku consumer treats it as orientation/spread input, not proven collider height |
| 0x13C6C469 | 0x01C | float | hitbox_depth | legacy inferred label; not validated as the physical collider depth for Suibaku/custom `900300001` |
| 0x14AB0070 | 0x020 | float | aim_offset_vertical | [-120,60] vertical aim bias |
| 0x20FEDE31 | 0x024 | float | homing_range | [0,1000] homing activation range |
| 0x28BA5665 | 0x028 | float | visual_scale | [0,7.5] projectile visual size |
| 0x2E1E75E5 | 0x02C | float | hit_effect_scale | [0,5] hit VFX scale |
| 0x2F446A4F | 0x030 | float | spawn_offset_forward | [-175,200] forward spawn pos |
| 0x319126CE | 0x034 | u32 | inherit_speed_flag | {0,1} inherit parent velocity |
| 0x32ACABFB | 0x038 | int | lifetime | [0,10000] frames alive |
| 0x36FCE2D7 | 0x03C | u32 | child_bullet_hash | 26 unique; sub-bullet ref |
| 0x397CE80D | 0x040 | u32 | collision_type | legacy label; inspected consumer selects aiming/trajectory branches, not a proven collider selector |
| 0x3B52DAAB | 0x044 | float | rotation_angle | [-180,360] spin angle |
| 0x3C3F1EB2 | 0x048 | float | elevation_angle | [-60,120] vertical angle |
| 0x3CDF1516 | 0x04C | u32 | homing_type | {0..3} homing behavior enum |
| 0x41435BE6 | 0x050 | u32 | bullet_effect_hash | 126 unique; bullet VFX hash |
| 0x41FBD241 | 0x054 | u32 | trail_effect_hash | 28 unique; trail VFX hash |
| 0x46961658 | 0x058 | u32 | muzzle_flash_hash | 12 unique; muzzle flash VFX |
| 0x4B382E24 | 0x05C | float | target_height_offset | [-100,200] target height bias |
| 0x4B492895 | 0x060 | int | pierce_count | [0,29] penetration count |
| 0x4C55EA3D | 0x064 | float | acceleration_value | [-180,1000] speed change rate |
| 0x4D6BF281 | 0x068 | u32 | bullet_action_hash | 162 unique; runtime action ref |
| 0x52CA3B01 | 0x06C | float | homing_start_distance | [0,100] homing engage distance |
| 0x55C77696 | 0x070 | float | vertical_launch_angle | [-85,75] vertical launch bias |
| 0x58435AD9 | 0x074 | float | horizontal_aim_angle | [-102,165] horizontal aim bias |
| 0x59332F69 | 0x078 | int | hit_interval_frame | [0,60] multi-hit interval |
| 0x63AC30E6 | 0x07C | float | max_altitude | [0,150] altitude cap |
| 0x640A7C9D | 0x080 | float | spawn_offset_vertical | [-20,20] vertical spawn pos |
| 0x6481E0F7 | 0x084 | int | speed_internal | [0,100000] internal speed value |
| 0x64C1F4FF | 0x088 | float | collision_height | legacy inferred label; not proven to resize Suibaku/custom `900300001` physical collider |
| 0x67921CDD | 0x08C | int | homing_duration | [0,10000] homing active frames |
| 0x68CD7942 | 0x090 | u32 | on_expire_hash | 114 unique; expiry action hash |
| 0x6A62D65E | 0x094 | int | delay_frame | [0,1000] spawn delay frames |
| 0x74F469FA | 0x098 | float | gravity_rate | [0,0.15] gravity pull coefficient |
| 0x7696F452 | 0x09C | float | speed_scale | [0,2.0] speed multiplier |
| 0x7B4AA25E | 0x0A0 | float | effective_range | [0,200] effective combat range |
| 0x81A816EB | 0x0A4 | u32 | bullet_shape | {0..3} projectile shape enum |
| 0x8379D9F8 | 0x0A8 | float | model_scale | [0,8] 3D model scale |
| 0x846DDC39 | 0x0AC | float | max_distance | [0,3000] max travel distance |
| 0x89BE0F56 | 0x0B0 | u32 | bullet_resource_hash | 381 unique; bullet resource ref |
| 0x8ACF95D3 | 0x0B4 | float | blast_radius | legacy inferred label; custom `900300001` matches native Suibaku here and still needs native collision patch |
| 0x8DA251CA | 0x0B8 | float | offset_angle_vertical | [-20,80] vertical offset angle |
| 0x8DBD5433 | 0x0BC | float | homing_strength | [0,1] tracking strength |
| 0x90423264 | 0x0C0 | float | turn_rate | [0,20] turning speed |
| 0x9375A247 | 0x0C4 | float | homing_angle | [0,180] max homing arc |
| 0x9C9D876E | 0x0C8 | float | offset_angle_horizontal | [-20,110] horizontal offset |
| 0xA12E3B5F | 0x0CC | u32 | is_beam | {0,1} beam-type projectile |
| 0xA25B8B11 | 0x0D0 | float | target_distance | [-56,250] target distance |
| 0xA36593AD | 0x0D4 | u32 | behavior_type | 8 unique; behavior enum |
| 0xA5364F08 | 0x0D8 | float | aim_correction_angle | [-60,90] aim correction |
| 0xA8987774 | 0x0DC | u32 | ammo_type_hash | 16 unique; ammo type ref |
| 0xAB606D9E | 0x0E0 | float | bullet_size | [0,640] bullet size; `initial_speed` is a legacy alias |
| 0xABEDC73A | 0x0E4 | float | launch_angle_horizontal | [-90,120] horizontal launch |
| 0xAF2B7098 | 0x0E8 | float | tracking_angle | [0,180] tracking arc |
| 0xB306BEE8 | 0x0EC | float | min_homing_distance | [0,200] min homing engage |
| 0xBA9B8F5D | 0x0F0 | float | turn_acceleration | [0,15] turn accel rate |
| 0xD188329F | 0x0F4 | float | reserved_f4 | always 0 |
| 0xD32D39ED | 0x0F8 | u32 | hitgroup_hash | legacy label; inspected spawn path passes it into transform/model resolver, not direct local hitgroup entry id |
| 0xD462A33B | 0x0FC | u32 | spawn_pattern_hash | 14 unique; spawn pattern ref |
| 0xD55CBB87 | 0x100 | float | aim_limit_angle | [-120,140] aim limit arc |
| 0xD6290BC9 | 0x104 | u32 | is_penetrating | {0,1} penetration flag |
| 0xD8F283FB | 0x108 | u32 | secondary_effect_hash | 123 unique; secondary VFX |
| 0xDCEAF7AC | 0x10C | float | homing_effective_distance | [0,820] homing falloff |
| 0xDE6C0636 | 0x110 | u32 | reserved_flag_110 | always same value |
| 0xDF9F47E2 | 0x114 | u32 | explosion_effect_hash | 13 unique; explosion VFX |
| 0xEDD1C108 | 0x118 | u32 | interaction_hash | legacy label; inspected spawn path passes it into transform/model resolver, not direct local interaction entry id |
| 0xEF44FC6B | 0x11C | float | speed_acceleration | [-1,5] speed accel over time |
| 0xF33F8630 | 0x120 | int | duration_frame | [0,600] active duration |
| 0xF47EE96E | 0x124 | float | reserved_124 | always 0 |
| 0xF647567F | 0x128 | u32 | sound_effect_hash | 9 unique; SE hash ref |
| 0xFAA5615C | 0x12C | float | muzzle_offset_horizontal | [-70,70] muzzle H offset |
| 0xFD032D27 | 0x130 | float | muzzle_offset_vertical | [-25,35] muzzle V offset |
| 0xFD855759 | 0x134 | float | induction_angle | [0,90] induction arc |
| 0xFDC8A545 | 0x138 | float | spread_distance | [0,120] spread distance |
| 0xFF51E424 | 0x13C | float | tracking_start_distance | [0,100] tracking engage dist |

## character_param (041cpm, cmd=197, entry_size=796)
_Character gameplay parameter fields. RTTI: Character@GAM@VDK_

| Hash | Offset | Kind | Field Name | Notes |
|------|--------|------|------------|-------|
| 0x00D7CEDB | 0x000 | int | damage_dispatch_value_selector_8 | IDA:sub_1405F9010 case 8; not max HP |
| 0x00EC483C | 0x004 | float | damage_calculation_multiplier_slot_4 | helper supports slot 4; sole OB caller supplies only slots 0-3 |
| 0x01F15731 | 0x008 | float | boost_gauge_pct | boost gauge percentage |
| 0x04371326 | 0x00C | int | base_unit_cost | IDA:case14,15,18; unit deployment cost |
| 0x07B8E157 | 0x010 | int | ammo_count_main | main weapon ammo count |
| 0x0804605C | 0x014 | float | down_value_rate | down gauge scaling |
| 0x080AF70C | 0x018 | int | boost_gauge_max | max boost gauge value |
| 0x08218288 | 0x01C | float | front_tracking_angle | forward tracking arc |
| 0x0872029D | 0x020 | int | sub_shot_cost | IDA:case3; sub weapon cost |
| 0x08A0ADE8 | 0x024 | float | rear_tracking_angle | rear tracking arc |
| 0x08ECF0BE | 0x028 | float | lock_distance_threshold_family_1_slot_0 | first native lock-distance threshold family, selector 0; HUD color unproven |
| 0x0911077E | 0x02C | int | boost_recovery_speed | boost recovery rate |
| 0x0ACCE031 | 0x030 | float | dmg_multiplier_tier_a | damage tier A multiplier |
| 0x0B25CB7F | 0x034 | int | unit_id_composite | composite unit identifier |
| 0x0F8134A7 | 0x038 | float | lock_distance_threshold_family_1_slot_4 | first native lock-distance threshold family, selector 4 |
| 0x104DFF9D | 0x03C | float | dmg_multiplier_tier_b | damage tier B multiplier |
| 0x1113F30E | 0x040 | float | model_scale | 3D model scale factor |
| 0x14F89980 | 0x044 | float | movement_speed_base | base movement speed |
| 0x157CC9FE | 0x048 | float | low_durability_incoming_damage_multiplier_band_05_to_10 | incoming-damage percentage at 5-10% durability |
| 0x15B67A85 | 0x04C | float | gravity_offset | gravity offset value |
| 0x1698E3D8 | 0x050 | float | body_collision_radius | body collision sphere radius |
| 0x18415DC4 | 0x054 | int | is_transformable | transformation capability flag |
| 0x1B2228B5 | 0x058 | u32 | unit_attribute_flags | bitfield; unit attributes |
| 0x1B8808F8 | 0x05C | int | has_shield | shield capability flag |
| 0x1BB18A48 | 0x060 | float | dmg_multiplier_tier_c | damage tier C multiplier |
| 0x1BFADFD3 | 0x064 | float | lock_on_fov_angle | lock-on field of view |
| 0x1C936B77 | 0x068 | float | down_value_threshold | down gauge threshold |
| 0x1D6EA3F1 | 0x06C | int | assist_damage | IDA:case6,7; assist attack damage |
| 0x1E61CF9F | 0x070 | float | burst_c_incoming_damage_multiplier | active C Burst incoming-damage multiplier |
| 0x1EA3FAE1 | 0x074 | int | burst_cost | IDA:case9; EX burst gauge cost |
| 0x21632B7A | 0x078 | float | step_tracking_angle_min | step tracking minimum arc |
| 0x21E2041A | 0x07C | float | step_tracking_angle_max | step tracking maximum arc |
| 0x22169CCE | 0x080 | float | damage_calculation_multiplier_slot_2 | selected by hit-record slot 2; enters final damage |
| 0x22823596 | 0x084 | int | special_cost | IDA:case2; special weapon cost |
| 0x24FA2A04 | 0x088 | float | special_gauge_start_rate | special gauge start ratio |
| 0x25346DCD | 0x08C | int | reserved_flag_08c | reserved |
| 0x25384033 | 0x090 | float | landing_recovery_rate | landing recovery scaling |
| 0x2698D841 | 0x094 | float | damage_correction_base | base damage correction |
| 0x26BC945D | 0x098 | float | step_speed_rate | step speed ratio |
| 0x27F7E08A | 0x09C | float | camera_pitch_down_angle | camera pitch down limit |
| 0x283634C3 | 0x0A0 | float | dmg_multiplier_tier_d | damage tier D multiplier |
| 0x28B3FEC3 | 0x0A4 | float | camera_pitch_up_angle | camera pitch up limit |
| 0x2B99569A | 0x0A8 | int | main_ammo_reload_frame | main ammo reload time |
| 0x2C6DC778 | 0x0AC | float | aerial_damage_rate | aerial damage multiplier |
| 0x2C8221E6 | 0x0B0 | int | reserved_flag_0b0 | reserved |
| 0x2CF49283 | 0x0B4 | int | melee_combo_limit | max melee combo hits |
| 0x2DA8874F | 0x0B8 | int | special_melee_damage | IDA:case11; special melee dmg |
| 0x2DF82AD5 | 0x0BC | float | special_melee_correction_rate | special melee correction |
| 0x30099C4D | 0x0C0 | float | guard_damage_rate | guard damage reduction |
| 0x324F2214 | 0x0C4 | float | barrier_damage_rate | barrier damage reduction |
| 0x32F4D4BE | 0x0C8 | int | reserved_flag_0c8 | reserved |
| 0x333722B6 | 0x0CC | int | melee_damage | IDA:case2,14; base melee damage |
| 0x338D4823 | 0x0D0 | float | melee_correction_offset | melee correction offset |
| 0x379D0C45 | 0x0D4 | float | melee_tracking_angle | melee tracking arc |
| 0x38FDFC10 | 0x0D8 | float | melee_bonus_rate | melee bonus ratio |
| 0x3AA41969 | 0x0DC | float | melee_reach_base | base melee reach |
| 0x3C1E9E3B | 0x0E0 | int | runtime_durability_upper_clamp | IDA:sub_1405F8C60/sub_1405F9500 runtime clamp |
| 0x3C43A0D1 | 0x0E4 | float | charge_time_offset | charge time modifier |
| 0x3C475420 | 0x0E8 | float | lock_distance_threshold_family_2_slot_2 | second native lock-distance threshold family, selector 2 |
| 0x3CBF4F6C | 0x0EC | float | low_durability_incoming_damage_multiplier_band_20_to_25 | incoming-damage percentage at 20-25% durability |
| 0x3D302D72 | 0x0F0 | float | dmg_multiplier_tier_e | damage tier E multiplier |
| 0x3D501F3B | 0x0F4 | int | hp_regen_value | IDA:sub_1405F8E70; HP regen value |
| 0x3F29DFF4 | 0x0F8 | int | reserved_flag_0f8 | reserved |
| 0x432ADAA1 | 0x0FC | float | camera_offset_x | camera X offset |
| 0x43DC9679 | 0x100 | float | dmg_multiplier_tier_f | damage tier F multiplier |
| 0x45C84958 | 0x104 | int | respawn_invincibility_frame | i-frame duration on respawn |
| 0x46E6927A | 0x108 | float | low_durability_incoming_damage_multiplier_band_15_to_20 | incoming-damage percentage at 15-20% durability |
| 0x4769F064 | 0x10C | float | dmg_multiplier_tier_g | damage tier G multiplier |
| 0x4778AB75 | 0x110 | u32 | movement_type | movement type enum |
| 0x4B4064B6 | 0x114 | float | lock_distance_threshold_family_2_slot_1 | second native lock-distance threshold family, selector 1 |
| 0x4B449047 | 0x118 | float | camera_offset_y | camera Y offset |
| 0x4CF8985A | 0x11C | int | reserved_flag_11c | reserved |
| 0x4D2405E0 | 0x120 | int | reserved_flag_120 | reserved |
| 0x4FFACC86 | 0x124 | float | camera_offset_z | camera Z offset |
| 0x5175F1DE | 0x128 | float | camera_offset_partner_x | partner camera X offset |
| 0x51BBA4CB | 0x12C | float | camera_offset_partner_y | partner camera Y offset |
| 0x51DD39F0 | 0x130 | float | body_height | body height for collision |
| 0x52335D5B | 0x134 | int | reserved_flag_134 | reserved |
| 0x523F70A5 | 0x138 | float | body_offset_y | body Y-axis offset |
| 0x5245EE3E | 0x13C | int | partner_cost_penalty_frame | partner cost penalty timer |
| 0x539BC76D | 0x140 | int | charge_shot_damage | IDA:case10; charged shot dmg |
| 0x53FD1A92 | 0x144 | float | charge_shot_correction_offset | charge correction offset |
| 0x55E4FF75 | 0x148 | float | lock_distance_threshold_family_1_default | first native lock-distance threshold family, default selector |
| 0x5AC06BD2 | 0x14C | float | lock_on_range_min | minimum lock-on range |
| 0x5B3AF66C | 0x150 | float | lock_on_angle_main | main lock-on angle |
| 0x5B851170 | 0x154 | int | reserved_flag_154 | reserved |
| 0x5BBBD90C | 0x158 | float | aim_assist_angle | aim assist arc |
| 0x5BF3A215 | 0x15C | int | sub_ammo_reload_frame | sub weapon reload time |
| 0x5CE8D569 | 0x160 | int | reserved_flag_160 | reserved |
| 0x5E0DDDD8 | 0x164 | int | special_melee_cost | IDA:case13; special melee cost |
| 0x6133A20B | 0x168 | int | special_reload_frame | special weapon reload time |
| 0x6674EE31 | 0x16C | float | low_durability_incoming_damage_multiplier_band_45_to_50 | incoming-damage percentage at 45-50% durability |
| 0x6A14228B | 0x170 | float | special_correction_base | special correction base |
| 0x6AF92610 | 0x174 | float | burst_v_incoming_damage_multiplier | active V Burst incoming-damage multiplier |
| 0x6ED37B1F | 0x178 | float | burst_correction_base | EX burst correction base |
| 0x6F2514E8 | 0x17C | float | low_durability_incoming_damage_multiplier_band_10_to_15 | incoming-damage percentage at 10-15% durability |
| 0x71D35821 | 0x180 | u32 | burst_attribute_flags | bitfield; burst attributes |
| 0x71D87C2C | 0x184 | float | burst_speed_multiplier | burst speed multiplier |
| 0x72785F9E | 0x188 | float | burst_lock_on_angle | burst lock-on arc |
| 0x776BBBE9 | 0x18C | int | burst_damage | IDA:case9; burst attack dmg |
| 0x78860431 | 0x190 | float | lock_distance_threshold_family_1_slot_3 | first native lock-distance threshold family, selector 3 |
| 0x78C70D3F | 0x194 | float | hitbox_height | collision hitbox height |
| 0x7B9D7024 | 0x198 | int | reserved_flag_198 | reserved |
| 0x7BA88A27 | 0x19C | float | auto_aim_angle_limit | auto-aim angle cap |
| 0x7D1A0ACF | 0x1A0 | int | respawn_cost | respawn cost value |
| 0x8199A311 | 0x1A4 | int | main_shot_cost | IDA:case0; main shot cost |
| 0x8248401F | 0x1A8 | int | hp_regen_value_default | IDA:sub_1405F8E70; default HP regen value |
| 0x82B967A9 | 0x1AC | float | walk_speed | walking speed |
| 0x8381BE8A | 0x1B0 | int | team_cost_value | team cost contribution |
| 0x85C483F0 | 0x1B4 | float | burst_s_incoming_damage_multiplier | active S Burst incoming-damage multiplier |
| 0x86579C72 | 0x1B8 | float | close_tracking_angle | close-range tracking arc |
| 0x8A902D5F | 0x1BC | float | damage_calculation_multiplier_slot_0 | selected by hit-record slot 0; enters final damage |
| 0x8CBF2B3F | 0x1C0 | float | gravity_multiplier | gravity multiplier |
| 0x8F0666AB | 0x1C4 | float | ranged_tracking_angle_min | ranged tracking min arc |
| 0x8F8749CB | 0x1C8 | float | ranged_tracking_angle_max | ranged tracking max arc |
| 0x904C7CF0 | 0x1CC | int | special_damage | IDA:case3,15,18; special dmg |
| 0x91CDEF2B | 0x1D0 | float | dmg_multiplier_tier_h | damage tier H multiplier |
| 0x91E5A104 | 0x1D4 | float | lock_distance_threshold_family_1_slot_1 | first native lock-distance threshold family, selector 1 |
| 0x9B20A527 | 0x1D8 | float | sub_shot_correction_base | sub shot correction base |
| 0x9B8BF864 | 0x1DC | float | low_durability_incoming_damage_multiplier_band_40_to_45 | incoming-damage percentage at 40-45% durability |
| 0x9BED4726 | 0x1E0 | float | damage_calculation_multiplier_slot_1 | selected by hit-record slot 1; enters final damage |
| 0x9D8ADBDF | 0x1E4 | int | reserved_flag_1e4 | reserved |
| 0xA223C183 | 0x1E8 | float | lock_on_distance_max | USER-VERIFIED 2026-07-11: red lock (红锁); also set alert_range_distance — docs/characterparam-field-notes.md |
| 0xA60B0684 | 0x1EC | u32 | weapon_attribute_flags | bitfield; weapon attributes |
| 0xA644CF59 | 0x1F0 | float | wide_camera_angle | wide camera angle |
| 0xA6C5E039 | 0x1F4 | float | narrow_camera_angle | narrow camera angle |
| 0xA6DC5C53 | 0x1F8 | float | burst_damage_multiplier | burst damage multiplier |
| 0xA83A8232 | 0x1FC | float | minimum_aim_angle | minimum aim angle |
| 0xA900CDF7 | 0x200 | float | aim_correction_offset_x | aim correction X |
| 0xAA841999 | 0x204 | float | aim_correction_offset_y | aim correction Y |
| 0xAB4673AE | 0x208 | float | aim_correction_offset_z | aim correction Z |
| 0xAE7FF94F | 0x20C | int | sub_shot_cost_scaled | IDA:case4,5,12; scaled sub cost |
| 0xAEAC01A7 | 0x210 | int | reserved_flag_210 | reserved |
| 0xAF153580 | 0x214 | float | melee_camera_angle | melee camera angle |
| 0xB2900720 | 0x218 | int | assist_reload_frame | assist reload time |
| 0xB2E6B445 | 0x21C | int | reserved_flag_21c | reserved |
| 0xB3373BD9 | 0x220 | float | dmg_multiplier_tier_i | damage tier I multiplier |
| 0xB4F17B6F | 0x224 | float | melee_lunge_offset | melee lunge distance |
| 0xB58B705C | 0x228 | int | reserved_flag_228 | reserved |
| 0xB5FDC339 | 0x22C | int | step_cancel_count | step cancel limit |
| 0xB7D5327E | 0x230 | int | base_max_durability | raw base maximum durability before runtime transform |
| 0xB91793D4 | 0x234 | float | damage_calculation_multiplier_slot_3 | selected by hit-record slot 3; enters final damage |
| 0xBA900811 | 0x238 | float | air_dash_speed_base | base air dash speed |
| 0xBAE8C388 | 0x23C | float | alert_range_distance | USER-VERIFIED 2026-07-11: red lock (红锁); also set lock_on_distance_max — docs/characterparam-field-notes.md |
| 0xBB19842F | 0x240 | float | low_durability_incoming_damage_multiplier_band_30_to_35 | incoming-damage percentage at 30-35% durability |
| 0xBC427D55 | 0x244 | float | radar_display_scale | radar display scale |
| 0xBE256E0C | 0x248 | float | dash_speed_base | base dash speed |
| 0xBE8D97FB | 0x24C | int | reserved_flag_24c | reserved |
| 0xC1405939 | 0x250 | float | low_durability_incoming_damage_multiplier_band_25_to_30 | incoming-damage percentage at 25-30% durability |
| 0xC28C40CA | 0x254 | int | reserved_flag_254 | reserved |
| 0xC2FAF3AF | 0x258 | int | ammo_reserve_count | ammo reserve count |
| 0xC3F64BF9 | 0x25C | float | ammo_correction_offset | ammo correction offset |
| 0xC4852F00 | 0x260 | int | reserved_flag_260 | reserved |
| 0xC59737B6 | 0x264 | int | charge_time_frame | charge time in frames |
| 0xC5E184D3 | 0x268 | int | reserved_flag_268 | reserved |
| 0xC6A88D7F | 0x26C | int | charge_shot_cost | IDA:case10; charge shot cost |
| 0xC6E2AD28 | 0x270 | float | charge_damage_multiplier | charge damage multiplier |
| 0xC8B2F571 | 0x274 | float | charge_correction_offset | charge correction offset |
| 0xCAF44B28 | 0x278 | float | charge_bonus_offset | charge bonus offset |
| 0xCB36211F | 0x27C | float | charge_gauge_offset | charge gauge offset |
| 0xD01D00DF | 0x280 | float | melee_lock_angle | melee lock-on angle |
| 0xD249350C | 0x284 | float | lock_distance_threshold_family_2_slot_0 | second native lock-distance threshold family, selector 0 |
| 0xD24DC1FD | 0x288 | float | target_correction_offset | target correction offset |
| 0xD2D0C774 | 0x28C | float | target_fov_pct | target FOV percentage |
| 0xD524F115 | 0x290 | float | lock_distance_threshold_family_2_slot_4 | second native lock-distance threshold family, selector 4 |
| 0xD54CE896 | 0x294 | float | radar_sweep_angle | radar sweep angle |
| 0xD6F39D3C | 0x298 | float | radar_correction_offset | radar correction offset |
| 0xD854F864 | 0x29C | float | radar_display_offset | radar display offset |
| 0xD8F4FBD2 | 0x2A0 | int | melee_cost | IDA:case1; melee action cost |
| 0xDC414338 | 0x2A4 | float | melee_cost_correction_offset | melee cost correction |
| 0xDC9C3D2F | 0x2A8 | float | melee_aim_angle | melee aim angle |
| 0xDD83290F | 0x2AC | float | melee_aim_correction_offset | melee aim correction |
| 0xDE07FD61 | 0x2B0 | float | melee_range_offset | melee range offset |
| 0xDF888E8B | 0x2B4 | int | rotation_speed_degrees | rotation speed (degrees) |
| 0xE1D22572 | 0x2B8 | float | low_durability_incoming_damage_multiplier_band_35_to_40 | incoming-damage percentage at 35-40% durability |
| 0xE1D56972 | 0x2BC | float | melee_reach_distance | melee reach distance |
| 0xE2C6FD16 | 0x2C0 | int | sub_shot_damage | IDA:case4,5,12,13; sub dmg |
| 0xE3E5D41D | 0x2C4 | float | down_value_per_hit | down value per hit |
| 0xE6213731 | 0x2C8 | string | action_label | action label string ref (shared) |
| 0xE6E29192 | 0x2D0 | float | lock_distance_threshold_family_1_slot_2 | first native lock-distance threshold family, selector 2 |
| 0xE883DFAB | 0x2D4 | float | low_durability_incoming_damage_multiplier_band_00_to_05 | incoming-damage percentage at 0-5% durability |
| 0xE90161F5 | 0x2D8 | float | main_shot_speed_base | main shot base speed |
| 0xE9F462F6 | 0x2DC | float | damage_proration_rate | damage proration rate |
| 0xEB1219A4 | 0x2E0 | int | main_shot_damage | IDA:case0,1; main shot dmg |
| 0xECBC202D | 0x2E4 | float | combo_proration_rate | combo proration rate |
| 0xED170E69 | 0x2E8 | int | reserved_flag_2e8 | reserved |
| 0xEDB407E8 | 0x2EC | float | shot_velocity_base | shot velocity base |
| 0xEE92BCAB | 0x2F0 | float | main_shot_damage_multiplier | main shot dmg multiplier |
| 0xF15C6A7F | 0x2F4 | float | burst_r_incoming_damage_multiplier | active R Burst incoming-damage multiplier |
| 0xF25A5100 | 0x2F8 | float | burst_f_incoming_damage_multiplier | active F Burst incoming-damage multiplier |
| 0xF3C4CAE9 | 0x2FC | string | resource_label | resource label string ref (shared) |
| 0xF55FBBBD | 0x304 | float | projectile_tracking_angle_min | projectile tracking min |
| 0xF5DE94DD | 0x308 | float | projectile_tracking_angle_max | projectile tracking max |
| 0xF73592C7 | 0x30C | float | max_render_distance | max render distance |
| 0xFBB81BA9 | 0x310 | float | render_correction_offset | render correction offset |
| 0xFEADD5BE | 0x314 | float | final_damage_multiplier | final damage multiplier |
| 0xFEE76495 | 0x318 | int | assist_cost | IDA:case6,7; assist cost |

## speed_param (041cpm, cmd=74, entry_size=304)
_Movement speed parameter fields. All kind=2 (int) except action_label and resource_label (kind=7)._

| Hash | Offset | Kind | Field Name | Notes |
|------|--------|------|------------|-------|
| 0x06D1922D | 0x000 | int | walk_speed_forward | [0,100] forward walk speed |
| 0x086B475D | 0x004 | int | walk_speed_base | [40,60] base walk speed |
| 0x0B6480D5 | 0x008 | int | walk_speed_backward | [50,100] backward walk speed |
| 0x0B9EBECE | 0x00C | int | boost_gauge_capacity | [0,500] boost gauge max |
| 0x0CF37AD7 | 0x010 | int | alternate_free_flight_speed_delta | special free-flight per-update speed delta; `320` in three real OB rows |
| 0x0D5BB2EF | 0x014 | int | boost_recovery_speed | [198,303] recovery speed |
| 0x0E682BA8 | 0x018 | int | ground_run_speed | [100,180] ground run speed |
| 0x11FFDDB4 | 0x01C | int | boost_dash_initial_speed | [60,220] BD initial speed |
| 0x17A9D82D | 0x020 | int | step_distance | [4,31] step travel distance |
| 0x18895A55 | 0x024 | int | jump_initial_velocity | [0,93] jump launch speed |
| 0x29AA8A04 | 0x028 | int | gravity_modifier | always -2 |
| 0x2C76D0A7 | 0x02C | int | movement_class | always 7 |
| 0x2D28CC4B | 0x030 | int | air_dash_startup_frame | [0,200] air dash startup |
| 0x2DF7AF95 | 0x034 | int | step_startup_frame | [20,25] step startup |
| 0x2EAE942B | 0x038 | int | boost_dash_sustained_speed | [220,312] BD sustained |
| 0x32FD1EDC | 0x03C | int | dash_cancel_type | [1,10] dash cancel enum |
| 0x37D1D056 | 0x040 | int | fall_gravity | [-20,-10] fall gravity |
| 0x3BF9E21E | 0x044 | int | max_ground_speed | always 100 |
| 0x4031CB84 | 0x048 | int | boost_dash_startup_frame | OB-only |
| 0x41DABEC5 | 0x04C | int | boost_dash_recovery_frame | OB-only |
| 0x459455EA | 0x050 | int | landing_recovery_frame | [0,300] landing recovery |
| 0x4D4B65EA | 0x054 | int | air_brake_speed | [0,30] air brake decel |
| 0x4D601E55 | 0x058 | int | step_speed | [25,35] step movement speed |
| 0x4F705BAD | 0x05C | int | step_recovery_frame | [20,30] step recovery |
| 0x5481CCF4 | 0x060 | int | boost_dash_distance | [140,330] BD distance |
| 0x56C51E87 | 0x064 | int | air_dash_end_speed | [92,98] air dash end speed |
| 0x58313EF7 | 0x068 | int | step_type | [3,8] step behavior type |
| 0x5E8CAF43 | 0x06C | int | air_dash_duration_frame | [0,500] air dash duration |
| 0x5EF705B7 | 0x070 | int | boost_dash_type | [6,9] BD behavior type |
| 0x607C25BC | 0x074 | int | air_speed_base | [130,310] base air speed |
| 0x6C640897 | 0x078 | int | fall_speed | [-10,-2] fall speed |
| 0x6F6F1BF6 | 0x07C | int | guard_move_speed | [0,40] guard movement speed |
| 0x7242066A | 0x080 | int | air_dash_distance | [0,240] air dash distance |
| 0x737D64F4 | 0x084 | int | air_speed_max | [50,70] max air speed |
| 0x77749DD2 | 0x088 | int | speed_decay_base | always 92 |
| 0x7BF44A41 | 0x08C | int | alternate_free_flight_speed_initial | special free-flight initial speed; `30` in three real OB rows |
| 0x7C2572A1 | 0x090 | int | rotation_speed | [12,80] turning rotation |
| 0x7C3CF4DD | 0x094 | int | gauge_recovery_rate | OB-only |
| 0x7CD3A712 | 0x098 | int | boost_consumption_base | [50,60] boost use rate |
| 0x7D79F6FA | 0x09C | int | boost_dash_max_speed | [280,380] BD max speed |
| 0x7E5878A3 | 0x0A0 | int | turning_speed | [20,80] turning speed |
| 0x8173DA19 | 0x0A4 | int | jump_type | [3,4] jump behavior type |
| 0x84043A2D | 0x0A8 | int | fall_type | [3,6] fall behavior type |
| 0x8D0A9843 | 0x0AC | int | aerial_correction | OB-only |
| 0x8EDC8D6E | 0x0B0 | int | air_efficiency | [85,99] air efficiency % |
| 0x9297EF74 | 0x0B4 | int | air_gravity | [-5,0] air gravity |
| 0x95FA2B6D | 0x0B8 | int | air_dash_max_distance | [0,350] air dash max dist |
| 0x97BE8DFC | 0x0BC | int | step_cancel_frame | [10,12] step cancel window |
| 0x9A378388 | 0x0C0 | int | guard_recovery_frame | [0,60] guard recovery |
| 0x9EAA4E96 | 0x0C4 | int | vertical_move_speed | [20,80] vertical move speed |
| 0x9FD06227 | 0x0C8 | int | boost_startup_frame | [0,35] boost startup |
| 0xA49287B9 | 0x0CC | int | boost_dash_duration_frame | [240,588] BD duration |
| 0xA55D6C5E | 0x0D0 | int | dash_end_speed | [90,95] dash end speed |
| 0xA7CBBC07 | 0x0D4 | int | fixed_step_distance | always 35 |
| 0xB20B67C9 | 0x0D8 | int | air_boost_efficiency | [50,100] air boost % |
| 0xBC0127E1 | 0x0DC | int | guard_speed_rate | [70,80] guard speed rate |
| 0xC6157381 | 0x0E0 | int | air_dash_speed | [200,360] air dash speed |
| 0xC6BBC347 | 0x0E4 | int | fall_speed_rate | [12,16] fall speed rate |
| 0xCD5DF17C | 0x0E8 | int | air_dash_type | [6,16] air dash type enum |
| 0xCF452D59 | 0x0EC | int | guard_step_type | [4,14] guard step type |
| 0xD68023A4 | 0x0F0 | int | dash_range | [15,51] dash range |
| 0xDD7720EB | 0x0F4 | int | speed_decay_rate | always 92 |
| 0xDE1EF15A | 0x0F8 | int | boost_consumption_type | [2,5] consumption type |
| 0xE2FD1BFB | 0x0FC | int | air_deceleration | [-5,0] air decel rate |
| 0xE590DFE2 | 0x100 | int | boost_dash_count | [0,8] BD count limit |
| 0xE6213731 | 0x104 | string | action_label | action label string ref (shared) |
| 0xEC580BCC | 0x10C | int | turn_rate | [15,25] turn rate |
| 0xF3B9AD85 | 0x110 | int | air_steer_speed | [0,40] air steer speed |
| 0xF3C4CAE9 | 0x114 | string | resource_label | resource label string ref (shared) |
| 0xF559DCF1 | 0x11C | int | boost_extension_rate | OB-only |
| 0xF44C9D4E | 0x120 | int | boost_efficiency_air | [59,92] air boost efficiency |
| 0xF8B9B46E | 0x124 | int | boost_cap_rate | [0,95] boost cap rate |
| 0xFEC6069F | 0x128 | int | boost_dash_distance_max | [40,145] BD max distance |
| 0xFF7A9C8B | 0x12C | int | gravity_air_modifier | [-10,17] air gravity mod |

## grap_param (041cpm, cmd=16, entry_size=64)
_Grapple/grab melee action parameter fields. 16 fields, all kind=2 (integer)._
_RTTI: Grap@GAM@VDK. Icons: ICON_GRAP, ICON_CHARGE_GRAP, ICON_HIT_GRAP, ICON_HIT_GRAP_2ND, ICON_HIT_GRAP_3RD._
_Related: CCmdActionManager_SummonGrap@GAM@VDK, CUnitTaskAutomataSummonGrap@GAM@VDK._

_NOTE: Param hashes are NOT in EXE — loaded from .fhm2d data files at runtime via generic command table parser._
_Hash function is proprietary VDK engine hash (not standard CRC32/FNV). Field names below are inferred from value analysis + EXVS2 combat mechanics._

| Hash | Offset | Kind | Value Range (30-file) | OB Range | Confidence | Inferred Name | Reasoning |
|------|--------|------|-----------------------|----------|------------|---------------|-----------|
| 0x17A9E2E1 | 0x000 | int | [-6, 60] 25 unique | 5-23 | Medium | down_value | Signed small param; in EXVS2 down values range 5-60, can be negative for special properties |
| 0x2272E3D6 | 0x004 | int | [0, 300] 9 unique | 0,120 | Medium | charge_frame | Mostly 0 (no charge), rare non-zero = charge time; matches ICON_CHARGE_GRAP |
| 0x35857659 | 0x008 | int | [0, 400] 26 unique | 0-340 | High | grap_total_frame | Large frame count = total grapple animation duration |
| 0x465D80C6 | 0x00C | int | [0, 80] 16 unique | 5-36 | Medium | stun_value | Small combat param; EXVS2 stun/hitstun values typically 5-50 |
| 0x534643A2 | 0x010 | int | [0, 60] 7 unique | always 10 | Low | grap_priority | Few unique values, often fixed; could be grap clash priority |
| 0x550BCFAD | 0x014 | int | [0, 350] 13 unique | 30-320 | High | startup_frame | Frame count before grab becomes active |
| 0x55B8FC51 | 0x018 | int | [0, 300] 20 unique | 0-320 | High | tracking_frame | Frame count for homing/tracking toward target |
| 0x6906F0F4 | 0x01C | int | [0, 600] 21 unique | 300-480 | **High** | **damage** | Largest values (300-480 in OB); main grap damage |
| 0x7755981E | 0x020 | int | [0, 100] 9 unique | always 98 | **High** | **correction_pct** | Always 98 in OB = 98% combo correction (standard grap proration in EXVS2) |
| 0x83E900CD | 0x024 | int | [0, 40] 15 unique | 5-40 | Medium | reach | Grab reach/range distance |
| 0x976F9803 | 0x028 | int | [0, 40] 12 unique | 4-15 | Medium | cancel_frame | Small range; melee cancel window in frames |
| 0x99D42DBB | 0x02C | int | [0, 60] 28 unique | 30-60 | Medium | recovery_frame | Recovery after grap ends; 30-60 is typical recovery |
| 0xA89F3A61 | 0x030 | int | [0, 1] 2 unique | 0 or 1 | **High** | **is_multi_hit** | Boolean; true = grap has 2nd/3rd hits (ICON_HIT_GRAP_2ND/3RD) |
| 0xB084851E | 0x034 | int | [0, 550] 29 unique | 290-400 | **High** | **damage_2nd** | Large damage-like values; 2nd hit damage (slightly less than 1st) |
| 0xBEC81A41 | 0x038 | int | [0, 550] 31 unique | 270-400 | **High** | **damage_last** | Large damage-like values; final/3rd hit damage |
| 0xC21ED1D8 | 0x03C | int | [0, 100] 24 unique | 15-40 | Medium | down_value_last | Down value for the last hit of multi-hit grap |

## interaction (041cpm, cmd=31, entry_size=124)
_Interaction/collision parameter fields. RTTI: Interaction@GAM@VDK_

| Hash | Offset | Kind | Field Name | Notes |
|------|--------|------|------------|-------|
| 0x00C57BA3 | 0x000 | int | damage | base damage value |
| 0x06A06715 | 0x004 | int | correction_pct | combo correction (usually 100) |
| 0x08A3B0DC | 0x008 | u32 | interact_target_hash | target interaction hash ref |
| 0x148C8D49 | 0x00C | u32 | receive_mode_hash | receive-side interaction hash |
| 0x154EF1ED | 0x010 | u32 | interact_type | interaction type enum |
| 0x161FBB4F | 0x014 | float | interact_range | [6..10] interaction range |
| 0x18DC6CD1 | 0x018 | u32 | priority | interaction priority |
| 0x22C412CA | 0x01C | int | stun_value | stun inflicted |
| 0x270D2FD5 | 0x020 | u32 | hit_effect_id | hit visual effect type |
| 0x2A6A7D8F | 0x024 | int | down_value | down gauge contribution |
| 0x2EBC0DC3 | 0x028 | u32 | guard_interact_hash | guard interaction hash; OB-only |
| 0x3626F732 | 0x02C | int | stun_frame | stun duration frames |
| 0x3D457926 | 0x030 | u32 | se_hash | sound effect hash |
| 0x477C2470 | 0x034 | int | knockback_force | knockback force value |
| 0x50BC9332 | 0x038 | u32 | unk_barrier_hash | barrier interaction hash |
| 0x55815B3B | 0x03C | u32 | guard_type | {0=none,1=normal,2=super} |
| 0x5E1DC3E4 | 0x040 | float | damage_rate | [1.0..1.1] damage multiplier |
| 0x66957C67 | 0x044 | u32 | attack_property | attack attribute/element type |
| 0x6A0CCB8A | 0x048 | u32 | interact_id | unique interaction identifier |
| 0x720584BA | 0x04C | u32 | is_blockable | {0,1} can be blocked |
| 0x8029185D | 0x050 | u32 | wall_bounce_type | wall bounce behavior; OB-only |
| 0x90E41A78 | 0x054 | u32 | slide_type | ground slide behavior; OB-only |
| 0xA1A98180 | 0x058 | int | hitstop_frame | hit-freeze duration frames |
| 0xAD173242 | 0x05C | int | knockback_distance | knockback travel distance |
| 0xB69B7051 | 0x060 | int | ground_bounce | ground bounce behavior |
| 0xBB0F3D7F | 0x064 | u32 | knockback_type | knockback direction type |
| 0xC1361D23 | 0x068 | int | can_tech | can recover/tech after hit |
| 0xD5D4F8DB | 0x06C | int | hit_level | hit priority level |
| 0xEFEA436F | 0x070 | int | guard_break_level | guard break strength |
| 0xFA03CBDA | 0x074 | int | untechable_frame | forced untechable duration; OB-only |
| 0xFABCA946 | 0x078 | u32 | interact_category | interaction category enum |

## hitgroupiddef (041cpm, cmd=15, entry_size=60)
_Hit group ID definition fields. Collision shapes attached to bones._

| Hash | Offset | Kind | Field Name | Notes |
|------|--------|------|------------|-------|
| 0x11E501D5 | 0x000 | u32 | hit_type | collision shape type (0=sphere) |
| 0x3284A82D | 0x004 | float | offset_x | sphere center offset X |
| 0x42EE5CA2 | 0x008 | float | offset_y | sphere center offset Y |
| 0x458398BB | 0x00C | float | offset_z | sphere center offset Z |
| 0x6514C413 | 0x010 | float | radius | [9..15] sphere radius |
| 0x7395D184 | 0x014 | u32 | enable_state | enable state flag |
| 0x8B1AA53F | 0x018 | float | scale_x | scale X |
| 0xACE03D8E | 0x01C | float | scale_y | scale Y |
| 0xC3656A99 | 0x020 | u32 | bone_hash | attached bone name hash |
| 0xD32D39ED | 0x024 | u32 | is_enabled | enable flag (shared hash) |
| 0xDBE70D18 | 0x028 | float | scale_z | scale Z |
| 0xDC8AC901 | 0x02C | float | group_id | [6..7] collision group ID |
| 0xEDD1C108 | 0x030 | u32 | model_hash | model/resource hash (shared) |
| 0xF89A41E1 | 0x034 | u32 | collision_flags | collision behavior flags |
| 0xFC1D95A9 | 0x038 | float | joint_offset | [-1..3] joint offset value |

## chrsysparam (041cpm)
_Character system parameter fields. Magic: 0xB4ACACAF_
_Different format: hash-keyed entries with 4 raw u32 values each (not command table fields)._
_No field hash mapping applicable — entries are keyed by their own hash, not by field descriptor hashes._

## vernier_table (006effect, cmd=36, entry_size=144)
_Thruster/vernier visual effect fields. RTTI: CVernierTableAccessor@GAM@VDK_
_IDA: sub_140678CD0 loads 9 core fields + 27 boolean flag fields per entry._

| Hash | Offset | Kind | Field Name | Notes |
|------|--------|------|------------|-------|
| 0x01311D05 | 0x000 | u32 | effect_type | effect type enum |
| 0x0887512E | 0x004 | u32 | color_index | color index |
| 0x0FDBD536 | 0x008 | u32 | effect_model_hash | effect model resource ref |
| 0x0FEA9537 | 0x00C | u32 | keep_active | {0,1} persist while action active |
| 0x13EEB8F0 | 0x010 | float | aleo_1_size | particle size 1 |
| 0x21FFCD00 | 0x014 | u32 | is_loop | {0,1} looping effect |
| 0x2DB526FD | 0x018 | u32 | is_follow_bone | {0,1} attach to bone |
| 0x35B5281F | 0x01C | u32 | bone_offset_type | bone offset type |
| 0x3B6EA02D | 0x020 | u32 | rotation_type | rotation type |
| 0x3C036434 | 0x024 | u32 | alignment_type | alignment type |
| 0x42B21889 | 0x028 | u32 | blend_mode | blend mode |
| 0x43298ECB | 0x02C | float | aleo_2_size | particle size 2 |
| 0x49672094 | 0x030 | u32 | model_hash | shared model hash ref |
| 0x4B0454A2 | 0x034 | u32 | texture_hash | texture resource hash |
| 0x4C6990BB | 0x038 | u32 | animation_hash | animation resource hash |
| 0x618D354C | 0x03C | u32 | material_hash | material resource hash |
| 0x634CF0E5 | 0x040 | u32 | is_billboard | {0,1} billboard rendering |
| 0x64E98866 | 0x044 | float | aleo_z_distance | Z distance for particles |
| 0x6744C378 | 0x048 | u32 | fade_type | fade behavior type |
| 0x72E23F39 | 0x04C | u32 | is_world_space | {0,1} world vs local space |
| 0x76362D93 | 0x050 | u32 | cull_mode | cull mode |
| 0x7F8061B8 | 0x054 | u32 | depth_test_type | depth test type |
| 0x918E0094 | 0x058 | u32 | emit_count | particle emit count |
| 0x96E3C48D | 0x05C | u32 | lifetime_type | lifetime type |
| 0xA267F197 | 0x060 | u32 | velocity_type | velocity type |
| 0xA50A358E | 0x064 | u32 | inherit_parent_type | parent inheritance type |
| 0xB8F69CBA | 0x068 | u32 | render_order | {0,1} render priority |
| 0xD20D0518 | 0x06C | u32 | sort_bias | sort bias value |
| 0xD32D39ED | 0x070 | u32 | bone_hash | bone attachment hash (shared) |
| 0xD560C101 | 0x074 | u32 | second_bone_hash | secondary bone hash |
| 0xE1E4F41B | 0x078 | u32 | effect_flag_a | effect flag A |
| 0xE6893002 | 0x07C | u32 | effect_flag_b | effect flag B |
| 0xE694B5B6 | 0x080 | float | effect_scale | overall scale |
| 0xEDD1C108 | 0x084 | u32 | hitgroup_ref | hitgroup hash ref (shared) |
| 0xFA45A15F | 0x088 | u32 | is_enabled | {0,1} enable flag |
| 0xFDE0D9DC | 0x08C | float | spawn_offset_y | Y spawn offset |

## effect_project (006effect, cmd=240, entry_size=960)
_Effect project parameter fields. RTTI: CEffectProjectAccessor@GAM@VDK_
_240 fields (mix of kind=1 u32 and kind=5 float). IDA: sub_1405DC540 is the main loader._

| Hash | Offset | Kind | Field Name | Notes |
|------|--------|------|------------|-------|
| 0x08592D05 | 0x000 | u32 | field_00_flag | |
| 0x0859BF71 | 0x004 | u32 | field_04_flag | |
| 0x0A215564 | 0x008 | u32 | field_08_flag | |
| 0x0D4C917D | 0x00C | u32 | field_0c_flag | |
| 0x0F34E91C | 0x010 | u32 | field_10_flag | |
| 0x101A124D | 0x014 | u32 | field_14_flag | |
| 0x11C6760B | 0x018 | u32 | field_18_flag | |
| 0x125CAC14 | 0x01C | u32 | field_1c_flag | |
| 0x12E5377C | 0x020 | u32 | field_20_flag | |
| 0x133A6425 | 0x024 | u32 | field_24_flag | |
| 0x138E23E7 | 0x028 | u32 | field_28_flag | |
| 0x139EC623 | 0x02C | u32 | field_2c_flag | |
| 0x1457A03C | 0x030 | u32 | field_30_flag | |
| 0x14E3E7FE | 0x034 | u32 | field_34_flag | |
| 0x14F3023A | 0x038 | u32 | field_38_flag | |
| 0x1531680D | 0x03C | u32 | field_3c_flag | |
| 0x1588F365 | 0x040 | u32 | field_40_flag | |
| 0x1777D654 | 0x044 | u32 | field_44_flag | |
| 0x18703A20 | 0x048 | u32 | field_48_flag | |
| 0x19E548AE | 0x04C | u32 | field_4c_flag | |
| 0x1A619CC0 | 0x050 | u32 | field_50_flag | |
| 0x1B537B57 | 0x054 | u32 | field_54_flag | |
| 0x1B8325BD | 0x058 | u32 | field_58_flag | |
| 0x1BA3F6F7 | 0x05C | u32 | field_5c_flag | |
| 0x1CEEE1A4 | 0x060 | u32 | field_60_flag | |
| 0x1F1DFE39 | 0x064 | u32 | field_64_flag | |
| 0x210C06A7 | 0x068 | u32 | field_68_flag | |
| 0x23747EC6 | 0x06C | u32 | field_6c_flag | |
| 0x2374ECB2 | 0x070 | u32 | field_70_flag | |
| 0x23F01489 | 0x074 | u32 | field_74_flag | |
| 0x241928AB | 0x078 | u32 | field_78_flag | |
| 0x2419BADF | 0x07C | u32 | field_7c_flag | |
| 0x2468E4EF | 0x080 | u32 | field_80_flag | |
| 0x2661C2BE | 0x084 | u32 | field_84_flag | |
| 0x2A4658A2 | 0x088 | u32 | field_88_flag | |
| 0x2AC232ED | 0x08C | u32 | field_8c_flag | |
| 0x2D2B9CBB | 0x090 | u32 | field_90_flag | |
| 0x2DDEA8C4 | 0x094 | u32 | field_94_flag | |
| 0x308EA534 | 0x098 | u32 | field_98_flag | |
| 0x314CCF03 | 0x09C | u32 | field_9c_flag | |
| 0x32C81B6D | 0x0A0 | u32 | field_a0_flag | |
| 0x335D69E3 | 0x0A4 | u32 | field_a4_flag | |
| 0x3430ADFA | 0x0A8 | u32 | field_a8_flag | |
| 0x35A5DF74 | 0x0AC | u32 | field_ac_flag | |
| 0x36210B1A | 0x0B0 | u32 | field_b0_flag | |
| 0x37C3B267 | 0x0B4 | u32 | field_b4_flag | |
| 0x37E3612D | 0x0B8 | u32 | field_b8_flag | |
| 0x39C864BF | 0x0BC | u32 | field_bc_flag | |
| 0x3AEB25C8 | 0x0C0 | u32 | field_c0_flag | |
| 0x3B7A585F | 0x0C4 | u32 | field_c4_flag | |
| 0x3BE82C58 | 0x0C8 | u32 | field_c8_flag | |
| 0x3C179C46 | 0x0CC | u32 | field_cc_flag | |
| 0x3C5A8597 | 0x0D0 | u32 | field_d0_flag | |
| 0x3C85E841 | 0x0D4 | u32 | field_d4_flag | |
| 0x3E1C3BCE | 0x0D8 | u32 | field_d8_flag | |
| 0x3EA5A0A6 | 0x0DC | u32 | field_dc_flag | |
| 0x3FDE51F9 | 0x0E0 | u32 | field_e0_flag | |
| 0x40C482F1 | 0x0E4 | u32 | field_e4_flag | |
| 0x40E451BB | 0x0E8 | u32 | field_e8_flag | |
| 0x41263B8C | 0x0EC | u32 | field_ec_flag | |
| 0x42A2EFE2 | 0x0F0 | u32 | field_f0_flag | |
| 0x445A5975 | 0x0F4 | u32 | field_f4_flag | |
| 0x45CF2BFB | 0x0F8 | u32 | field_f8_flag | |
| 0x464BFF95 | 0x0FC | u32 | field_fc_flag | |
| 0x478995A2 | 0x100 | u32 | field_100_flag | |
| 0x48D9616F | 0x104 | u32 | field_104_flag | |
| 0x491B0B58 | 0x108 | u32 | field_108_flag | |
| 0x49A29030 | 0x10C | u32 | field_10c_flag | |
| 0x4B10ACD0 | 0x110 | u32 | field_110_flag | |
| 0x4B5DB501 | 0x114 | u32 | field_114_flag | |
| 0x4B82D8D7 | 0x118 | u32 | field_118_flag | |
| 0x4C7D68C9 | 0x11C | u32 | field_11c_flag | |
| 0x4CEF1CCE | 0x120 | u32 | field_120_flag | |
| 0x4DEC155E | 0x124 | u32 | field_124_flag | |
| 0x5166F228 | 0x128 | u32 | field_128_flag | |
| 0x531E183D | 0x12C | u32 | field_12c_flag | |
| 0x531E8A49 | 0x130 | u32 | field_130_flag | |
| 0x536FD479 | 0x134 | u32 | field_134_flag | |
| 0x54734E50 | 0x138 | u32 | field_138_flag | |
| 0x5473DC24 | 0x13C | u32 | field_13c_flag | |
| 0x54F7241F | 0x140 | u32 | field_140_flag | |
| 0x560B3631 | 0x144 | u32 | field_144_flag | |
| 0x5AD99852 | 0x148 | u32 | field_148_flag | |
| 0x5D416834 | 0x14C | u32 | field_14c_flag | |
| 0x5DB45C4B | 0x150 | u32 | field_150_flag | |
| 0x5DC5027B | 0x154 | u32 | field_154_flag | |
| 0x6070E6C2 | 0x158 | u32 | field_158_flag | |
| 0x6236589B | 0x15C | u32 | field_15c_flag | |
| 0x628FC3F3 | 0x160 | u32 | field_160_flag | |
| 0x635090AA | 0x164 | u32 | field_164_flag | |
| 0x63E4D768 | 0x168 | u32 | field_168_flag | |
| 0x63F432AC | 0x16C | u32 | field_16c_flag | |
| 0x643D54B3 | 0x170 | u32 | field_170_flag | |
| 0x64891371 | 0x174 | u32 | field_174_flag | |
| 0x6499F6B5 | 0x178 | u32 | field_178_flag | |
| 0x655B9C82 | 0x17C | u32 | field_17c_flag | |
| 0x65E207EA | 0x180 | u32 | field_180_flag | |
| 0x66C1469D | 0x184 | u32 | field_184_flag | |
| 0x671D22DB | 0x188 | u32 | field_188_flag | |
| 0x6BE9D132 | 0x18C | u32 | field_18c_flag | |
| 0x6C544BC1 | 0x190 | u32 | field_190_flag | |
| 0x6C84152B | 0x194 | u32 | field_194_flag | |
| 0x6CA4C661 | 0x198 | u32 | field_198_flag | |
| 0x6D66AC56 | 0x19C | u32 | field_19c_flag | |
| 0x6EE27838 | 0x1A0 | u32 | field_1a0_flag | |
| 0x6F770AB6 | 0x1A4 | u32 | field_1a4_flag | |
| 0x7833D98A | 0x1A8 | u32 | field_1a8_flag | |
| 0x7A4BA1EB | 0x1AC | u32 | field_1ac_flag | |
| 0x7D2665F2 | 0x1B0 | u32 | field_1b0_flag | |
| 0x7F5E8FE7 | 0x1B4 | u32 | field_1b4_flag | |
| 0x80A50FDC | 0x1B8 | u32 | field_1b8_flag | |
| 0x80EC1914 | 0x1BC | u32 | field_1bc_flag | |
| 0x81796B9A | 0x1C0 | u32 | field_1c0_flag | |
| 0x828A7407 | 0x1C4 | u32 | field_1c4_flag | |
| 0x82AAA74D | 0x1C8 | u32 | field_1c8_flag | |
| 0x82E3B185 | 0x1CC | u32 | field_1cc_flag | |
| 0x8321DBB2 | 0x1D0 | u32 | field_1d0_flag | |
| 0x83313E76 | 0x1D4 | u32 | field_1d4_flag | |
| 0x8368CD7A | 0x1D8 | u32 | field_1d8_flag | |
| 0x84050963 | 0x1DC | u32 | field_1dc_flag | |
| 0x84E8BDAD | 0x1E0 | u32 | field_1e0_flag | |
| 0x85C76354 | 0x1E4 | u32 | field_1e4_flag | |
| 0x85E7B01E | 0x1E8 | u32 | field_1e8_flag | |
| 0x8614AF83 | 0x1EC | u32 | field_1ec_flag | |
| 0x8781DD0D | 0x1F0 | u32 | field_1f0_flag | |
| 0x891343F7 | 0x1F4 | u32 | field_1f4_flag | |
| 0x8A87725D | 0x1F8 | u32 | field_1f8_flag | |
| 0x8A979799 | 0x1FC | u32 | field_1fc_flag | |
| 0x8B3C382C | 0x200 | u32 | field_200_flag | |
| 0x8B55FDAE | 0x204 | u32 | field_204_flag | |
| 0x8BEC66C6 | 0x208 | u32 | field_208_flag | |
| 0x8C3839B7 | 0x20C | u32 | field_20c_flag | |
| 0x8C81A2DF | 0x210 | u32 | field_210_flag | |
| 0x8D5EF186 | 0x214 | u32 | field_214_flag | |
| 0x8DEAB644 | 0x218 | u32 | field_218_flag | |
| 0x8DFA5380 | 0x21C | u32 | field_21c_flag | |
| 0x8E7E87EE | 0x220 | u32 | field_220_flag | |
| 0x9150EECB | 0x224 | u32 | field_224_flag | |
| 0x9445C0C7 | 0x228 | u32 | field_228_flag | |
| 0x963D2AD2 | 0x22C | u32 | field_22c_flag | |
| 0x963DB8A6 | 0x230 | u32 | field_230_flag | |
| 0x9DF38CEC | 0x234 | u32 | field_234_flag | |
| 0xA078AE6D | 0x238 | u32 | field_238_flag | |
| 0xA1BAC45A | 0x23C | u32 | field_23c_flag | |
| 0xA23E1034 | 0x240 | u32 | field_240_flag | |
| 0xA27309E5 | 0x244 | u32 | field_244_flag | |
| 0xA2E17DE2 | 0x248 | u32 | field_248_flag | |
| 0xA51AC2E5 | 0x24C | u32 | field_24c_flag | |
| 0xA51ECDFC | 0x250 | u32 | field_250_flag | |
| 0xA553D42D | 0x254 | u32 | field_254_flag | |
| 0xA58CB9FB | 0x258 | u32 | field_258_flag | |
| 0xA69E168B | 0x25C | u32 | field_25c_flag | |
| 0xA6D70043 | 0x260 | u32 | field_260_flag | |
| 0xA7156A74 | 0x264 | u32 | field_264_flag | |
| 0xA75C7CBC | 0x268 | u32 | field_268_flag | |
| 0xA7ACF11C | 0x26C | u32 | field_26c_flag | |
| 0xA8459EB9 | 0x270 | u32 | field_270_flag | |
| 0xA987F48E | 0x274 | u32 | field_274_flag | |
| 0xA9A727C4 | 0x278 | u32 | field_278_flag | |
| 0xAA543859 | 0x27C | u32 | field_27c_flag | |
| 0xABC14AD7 | 0x280 | u32 | field_280_flag | |
| 0xAC3AF5D0 | 0x284 | u32 | field_284_flag | |
| 0xACA881D7 | 0x288 | u32 | field_288_flag | |
| 0xACAC8ECE | 0x28C | u32 | field_28c_flag | |
| 0xAD39FC40 | 0x290 | u32 | field_290_flag | |
| 0xAECAE3DD | 0x294 | u32 | field_294_flag | |
| 0xAEEA3097 | 0x298 | u32 | field_298_flag | |
| 0xAF285AA0 | 0x29C | u32 | field_29c_flag | |
| 0xB34F0918 | 0x2A0 | u32 | field_2a0_flag | |
| 0xB3BA3D67 | 0x2A4 | u32 | field_2a4_flag | |
| 0xB422CD01 | 0x2A8 | u32 | field_2a8_flag | |
| 0xB4A6353A | 0x2AC | u32 | field_2ac_flag | |
| 0xB4D7F97E | 0x2B0 | u32 | field_2b0_flag | |
| 0xB6DEDF2F | 0x2B4 | u32 | field_2b4_flag | |
| 0xBA7D2F7C | 0x2B8 | u32 | field_2b8_flag | |
| 0xBA7DBD08 | 0x2BC | u32 | field_2bc_flag | |
| 0xBD107911 | 0x2C0 | u32 | field_2c0_flag | |
| 0xBD10EB65 | 0x2C4 | u32 | field_2c4_flag | |
| 0xBF689304 | 0x2C8 | u32 | field_2c8_flag | |
| 0xC1D9EFB9 | 0x2CC | u32 | field_2cc_flag | |
| 0xC325FD97 | 0x2D0 | u32 | field_2d0_flag | |
| 0xC3A105AC | 0x2D4 | u32 | field_2d4_flag | |
| 0xC3D0C9E8 | 0x2D8 | u32 | field_2d8_flag | |
| 0xC448398E | 0x2DC | u32 | field_2dc_flag | |
| 0xC4BD0DF1 | 0x2E0 | u32 | field_2e0_flag | |
| 0xC86FA392 | 0x2E4 | u32 | field_2e4_flag | |
| 0xCA174987 | 0x2E8 | u32 | field_2e8_flag | |
| 0xCA17DBF3 | 0x2EC | u32 | field_2ec_flag | |
| 0xCD7A1FEA | 0x2F0 | u32 | field_2f0_flag | |
| 0xCD7A8D9E | 0x2F4 | u32 | field_2f4_flag | |
| 0xCF02678B | 0x2F8 | u32 | field_2f8_flag | |
| 0xD0125AE2 | 0x2FC | u32 | field_2fc_flag | |
| 0xD05B4C2A | 0x300 | u32 | field_300_flag | |
| 0xD0ABC18A | 0x304 | u32 | field_304_flag | |
| 0xD199261D | 0x308 | u32 | field_308_flag | |
| 0xD1D030D5 | 0x30C | u32 | field_30c_flag | |
| 0xD219FD6A | 0x310 | u32 | field_310_flag | |
| 0xD21DF273 | 0x314 | u32 | field_314_flag | |
| 0xD254E4BB | 0x318 | u32 | field_318_flag | |
| 0xD28B896D | 0x31C | u32 | field_31c_flag | |
| 0xD82F6A36 | 0x320 | u32 | field_320_flag | |
| 0xD9CDD34B | 0x324 | u32 | field_324_flag | |
| 0xD9ED0001 | 0x328 | u32 | field_328_flag | |
| 0xDA3ECCD6 | 0x32C | u32 | field_32c_flag | |
| 0xDB3DC546 | 0x330 | u32 | field_330_flag | |
| 0xDBABBE58 | 0x334 | u32 | field_334_flag | |
| 0xDBAFB141 | 0x338 | u32 | field_338_flag | |
| 0xDCC67A41 | 0x33C | u32 | field_33c_flag | |
| 0xDD5308CF | 0x340 | u32 | field_340_flag | |
| 0xDE80C418 | 0x344 | u32 | field_344_flag | |
| 0xDF42AE2F | 0x348 | u32 | field_348_flag | |
| 0xE13A8830 | 0x34C | u32 | field_34c_flag | |
| 0xE342F051 | 0x350 | u32 | field_350_flag | |
| 0xE42F3448 | 0x354 | u32 | field_354_flag | |
| 0xE657DE5D | 0x358 | u32 | field_358_flag | |
| 0xEAF4BC7A | 0x35C | u32 | field_35c_flag | |
| 0xF1139F15 | 0x360 | u32 | field_360_flag | |
| 0xF2E08088 | 0x364 | u32 | field_364_flag | |
| 0xF3EF8D3B | 0x368 | u32 | field_368_flag | |
| 0xF426EB24 | 0x36C | u32 | field_36c_flag | |
| 0xF4360EE0 | 0x370 | u32 | field_370_flag | |
| 0xF46FFDEC | 0x374 | u32 | field_374_flag | |
| 0xF58D4491 | 0x378 | u32 | field_378_flag | |
| 0xF5AD97DB | 0x37C | u32 | field_37c_flag | |
| 0xF5E48113 | 0x380 | u32 | field_380_flag | |
| 0xF67E5B0C | 0x384 | u32 | field_384_flag | |
| 0xF7A23F4A | 0x388 | u32 | field_388_flag | |
| 0xF7EB2982 | 0x38C | u32 | field_38c_flag | |
| 0xF979B778 | 0x390 | u32 | field_390_flag | |
| 0xFA59C110 | 0x394 | u32 | field_394_flag | |
| 0xFAFD6316 | 0x398 | u32 | field_398_flag | |
| 0xFB3F0921 | 0x39C | u32 | field_39c_flag | |
| 0xFB869249 | 0x3A0 | u32 | field_3a0_flag | |
| 0xFC3B08BA | 0x3A4 | u32 | field_3a4_flag | |
| 0xFC52CD38 | 0x3A8 | u32 | field_3a8_flag | |
| 0xFCEB5650 | 0x3AC | u32 | field_3ac_flag | |
| 0xFD340509 | 0x3B0 | u32 | field_3b0_flag | |
| 0xFD8042CB | 0x3B4 | u32 | field_3b4_flag | |
| 0xFD90A70F | 0x3B8 | u32 | field_3b8_flag | |
| 0xFE147361 | 0x3BC | u32 | field_3bc_flag | |

## projectile_depiction_table (006effect, cmd=15, entry_size=60)
_Projectile visual depiction fields. RTTI: CProjectileDepictionTableDataHolder@GAM@VDK_

| Hash | Offset | Kind | Field Name | Notes |
|------|--------|------|------------|-------|
| 0x049A712B | 0x000 | u32 | depiction_type | projectile visual type |
| 0x057E839D | 0x004 | u32 | effect_hash | main effect resource hash |
| 0x08B05EA9 | 0x008 | u32 | sub_effect_hash | secondary effect hash |
| 0x1B12E734 | 0x00C | float | scale | [usually 1.0] projectile scale |
| 0x49672094 | 0x010 | u32 | model_hash | 3D model hash (shared with effect_project) |
| 0x5896D450 | 0x014 | u32 | trail_effect_hash | trail/streak effect hash |
| 0x5EF964EC | 0x018 | u32 | hit_effect_hash | on-hit effect hash |
| 0x8F49B2DA | 0x01C | float | trail_distance | [1..250] trail render distance |
| 0x996BA1AC | 0x020 | u32 | sound_hash | sound/SE resource hash |
| 0xBA4BBA9D | 0x024 | u32 | render_type | {1=normal, 2=additive} |
| 0xC19F85EA | 0x028 | u32 | material_hash | material override hash |
| 0xD1097B21 | 0x02C | float | z_offset | [-8..0] Z-axis spawn offset |
| 0xD9EF5A79 | 0x030 | u32 | spawn_effect_hash | spawn/muzzle effect hash |
| 0xDABB1A5C | 0x034 | int | unk_flags | behavior flags |
| 0xE9DE0A15 | 0x038 | u32 | destroy_effect_hash | destruction effect hash |

---

## commandlist (800etcetera, cmd=9, entry_size=40)
_In-game command guide / move list per unit. 902 entries across 107 units._
_Sequential hashes 0..8 (not VDK hashes). IDA: LookupCommandDescriptorByHash (0x1401A8BD0), Decide_Command UI (sub_140915070)._
_File: `vs2/x64/800etcetera/commandlist/commandlist.bin`_

| Hash | Offset | Kind | Field Name | Notes |
|------|--------|------|------------|-------|
| 0x00000000 | 0x000 | string (7) | command_name_hash | 30-byte obfuscated name hash in string pool |
| 0x00000001 | 0x008 | u32 (2) | command_type | 1=MainShot, 2=Melee, 3=Sub, 4=SpShot, 5=SpMelee, 6=BurstAtk, 7=ChargeShot, 8=ChargeMelee |
| 0x00000002 | 0x00C | u32 (2) | sub_variant | 0=base, 2-7=directional input variants (前/後/横 etc.) |
| 0x00000003 | 0x010 | u32 (2) | unit_id | Character unique ID (e.g. 1001001=RX-78-2, 2005001=ZZ) |
| 0x00000004 | 0x014 | u32 (2) | form_id | 1=base form, 2/3/4=transformed forms |
| 0x00000005 | 0x018 | u32 (2) | linked_cmd_1 | Linked command reference (0xFFFFFFFF=none) |
| 0x00000006 | 0x01C | u32 (2) | linked_cmd_2 | Linked command reference (0xFFFFFFFF=none) |
| 0x00000007 | 0x020 | u32 (2) | linked_cmd_3 | Linked command reference (0xFFFFFFFF=none) |
| 0x00000008 | 0x024 | u32 (2) | linked_cmd_4 | Linked command reference (0xFFFFFFFF=none) |

### command_type values

| Value | Japanese | English | Input |
|-------|----------|---------|-------|
| 1 | メイン射撃 | Main Shot | A button |
| 2 | 格闘 | Melee | B button |
| 3 | サブ射撃 | Sub Weapon | A+B |
| 4 | 特殊射撃 | Special Shot | A+C |
| 5 | 特殊格闘 | Special Melee | B+C |
| 6 | 覚醒技 | Burst Attack | A+B+C (Burst) |
| 7 | チャージ射撃 | Charge Shot | Hold A |
| 8 | チャージ格闘 | Charge Melee | Hold B |

### Statistics

| command_type | Count |
|-------------|-------|
| 1 (Main Shot) | 125 |
| 2 (Melee) | 81 |
| 3 (Sub) | 125 |
| 4 (Sp. Shot) | 30 |
| 5 (Sp. Melee) | 136 |
| 6 (Burst Atk) | 135 |
| 7 (CS) | 140 |
| 8 (CS Melee) | 130 |

### Multi-form units (form_id > 1)

| Unit ID | Forms | Description |
|---------|-------|-------------|
| 2005001 | 1,2 | Dual-form |
| 3001001 | 1,2 | Dual-form |
| 5001001 | 1,2,3,4 | Quad-form |
| 8001001 | 1,2 | Dual-form |
| 20001001 | 1,2,3,4 | Quad-form |
| 33001001 | 1,2,3 | Tri-form |

---

## awakening_param (100system, cmd=71, entry_size=284)
_Burst/Awakening system parameters. 6 entries = 6 burst types._
_File: `vs2/x64/100system/awakening_param/awakening_param.vgsht2`_
_IDA: sub_140612F30 (EnableAwakening handler). Renders GBuffer effects on activation._

| Rows | Cols | Stride | Kind distribution |
|------|------|--------|-------------------|
| 6 | 71 | 284 | INT32(1):20, UINT32(2):28, FLOAT32(5):23 |

6 rows correspond to burst types: F(Fighting/Red), E(Extend/Yellow), S(Shooting/Blue), M(Mobility/Green), R, C.
71 hashed column keys (VDK hash, not sequential). Full hash listing pending deeper IDA analysis.

---

## battle_system_param (100system, cmd=54, entry_size=220)
_Global battle system parameters. Single-row global config._
_File: `vs2/x64/100system/battle_system_param/battle_system_param.vgsht2`_

| Rows | Cols | Stride | Kind distribution |
|------|------|--------|-------------------|
| 1 | 54 | 220 | UINT32(2):38, FLOAT32(5):15, STRING_REF(7):1 |

Controls: battle time limit, COST system, boost max, guard rates, down thresholds, lock-on distances, etc.
54 hashed column keys. Full hash listing pending deeper IDA analysis.

---

## enemy_adjust_param (100system/mode_adjust, cmd=20, entry_size=80)
_Enemy AI difficulty adjustment. 32 entries = 32 AI difficulty levels._
_File: `vs2/x64/100system/mode_adjust/enemy_adjust_param/enemy_adjust_param.vgsht2`_

| Rows | Cols | Stride | Kind distribution |
|------|------|--------|-------------------|
| 32 | 20 | 80 | All FLOAT32(5) |

20 float multipliers per difficulty level (attack rate, dodge rate, reaction speed, etc.).

---

## total_adjust_param (100system/mode_adjust, cmd=21, entry_size=84)
_Global balance adjustment. 4 entries = 4 rank tiers._
_File: `vs2/x64/100system/mode_adjust/total_adjust_param/total_adjust_param.vgsht2`_

| Rows | Cols | Stride | Kind distribution |
|------|------|--------|-------------------|
| 4 | 21 | 84 | All FLOAT32(5) |

---

## triad_adjust_bonus_param (100system/mode_adjust, cmd=4, entry_size=16)
_Triad Battle bonus parameters. 10 entries._
_File: `vs2/x64/100system/mode_adjust/triad_adjust_param/triad_adjust_bonus_param.vgsht2`_

| Rows | Cols | Stride | Kind distribution |
|------|------|--------|-------------------|
| 10 | 4 | 16 | INT32(1):2, FLOAT32(5):2 |

---

## triad_adjust_edit_param (100system/mode_adjust, cmd=24, entry_size=100)
_Triad Battle edit/customization config. Single-row global._
_File: `vs2/x64/100system/mode_adjust/triad_adjust_param/triad_adjust_edit_param.vgsht2`_

| Rows | Cols | Stride | Kind distribution |
|------|------|--------|-------------------|
| 1 | 24 | 100 | FLOAT32(5):4, UINT32(2):14, INT32(1):1, STRING_REF(7):1 + others |

---

## triad_adjust_skill_param (100system/mode_adjust, cmd=7, entry_size=28)
_Triad Battle skill parameters. 33 entries = 33 skills._
_File: `vs2/x64/100system/mode_adjust/triad_adjust_param/triad_adjust_skill_param.vgsht2`_

| Rows | Cols | Stride | Kind distribution |
|------|------|--------|-------------------|
| 33 | 7 | 28 | FLOAT32(5):4, INT32(1):3 |

---

## ultimate_battle_adjust_param (100system/mode_adjust, cmd=7, entry_size=28)
_Ultimate Battle difficulty scaling. 55 entries = 55 stages._
_File: `vs2/x64/100system/mode_adjust/ultimate_battle_adjust_param/ultimate_battle_adjust_param.vgsht2`_

| Rows | Cols | Stride | Kind distribution |
|------|------|--------|-------------------|
| 55 | 7 | 28 | All FLOAT32(5) |

---

## winning_streak_adjust_param (100system/mode_adjust, cmd=4, entry_size=16)
_Winning streak difficulty scaling. 20 entries = 1-20 win streaks._
_File: `vs2/x64/100system/mode_adjust/winning_streak_adjust_param/winning_streak_adjust_param.vgsht2`_

| Rows | Cols | Stride | Kind distribution |
|------|------|--------|-------------------|
| 20 | 4 | 16 | All FLOAT32(5) |

---

## RegisterCommandAction_* Strings (from IDA)
_Known command action registration strings found in vsac27_Release.exe_

| String | Address | Function | Notes |
|--------|---------|----------|-------|
| RegisterCommandAction_LaunchScrew | TBD | TBD | Pending xref analysis |
| RegisterCommandUtility_GrapOnMotionFrame | TBD | TBD | Pending xref analysis |
| RegisterCommandAction_Micchaku | TBD | TBD | Close combat action |
| RegisterCommandUtility_ShotContinuousOnAimingBody | TBD | TBD | Continuous shot utility |

---

## Key Runtime Functions
| Address | Name | Purpose |
|---------|------|---------|
| 0x1401A8BD0 | LookupCommandDescriptorByHash | Core binary search hash→descriptor, **68 call sites** |
| 0x140987B50 | CommandTableLookup_Camera | Camera subsystem hash→payload lookup |
| 0x1405F9010 | FieldIndexToHashDispatch_A | Maps compile-time field index→hash (~20 hardcoded hashes) |
| 0x1405F9180 | FieldIndexToHashDispatch_B | Second field-index→hash dispatcher |
| 0x14098A7A0 | MenuCameraCommandUpdate | Menu/cutscene camera command consumer |
| 0x140986970 | CreateCMotionCameraForMenu | Allocates 0x550-byte camera object |
| 0x1400C4110 | SkipResourceHeader | Returns a1 + 32 (skip 0x20 header) |
| 0x1401142E0 | GetContainerEntry | Index-based 56-byte entry accessor |
| 0x1405AA780 | GetGlobalSingleton | Returns qword_1421155D0 |
| 0x1405B83C0 | DistributeParamResources | Distributes 15 fhm2d sub-entries to singleton slots |
| 0x1405B8340 | DistributeParamPair | Distributes 2 sub-entries (index 0,1) with magic check |
| 0x14066C890 | CheckChrSysParamMagic | Validates magic == 0xB4ACACAF |
| 0x14066C880 | CheckChrSysParamVersion | Validates version == 0x00010000 |
| 0x140635B30 | CharacterInit | Full character initialization from resource pack |
| 0x140915070 | Decide_Command (UI) | Command guide display toggle: "Command" vs "Controller" mode |
| 0x1409A8EB0 | LookupRecordIdByFieldValue | Find record ID where field matches value (used by BgmList) |
| 0x140612F30 | EnableAwakening | Awakening param load + GBuffer render effects |
| 0x1405F8C00 | CharParam_ReadU32ByHash | Generic hash→u32 reader for character_param table |
| 0x1405F8600 | CharParam_LockDistance | Lock distance by category index (5 hardcoded hashes) |
| 0x1405F8720 | CharParam_RangeDistance | Range distance by category index (5 hardcoded hashes) |
| 0x1405F8D40 | CharParam_CorrectionFloat | Correction float by category index |
| 0x1405F9500 | CharParam_HPSystemTick | HP damage/recovery/death event processor |

## Cross-Family Shared Hashes
| Hash | Families | Likely Purpose |
|------|----------|----------------|
| 0xD32D39ED | bullet_param, hitgroup | Shared hash; in checked Gyan file not a direct hitgroup entry ref from bullet_param |
| 0xEDD1C108 | bullet_param, hitgroup | Shared hash; in checked Gyan file not a direct interaction entry ref from bullet_param |
| 0xE6213731 | arms_param, character_param, speed_param | Blob/string reference (kind=7) |
| 0xF3C4CAE9 | arms_param, character_param, speed_param | Blob/string reference (kind=7) |
| 0x00000000..0x00000008 | commandlist (unique) | Sequential indices, not VDK hashes |

## Runtime Architecture Notes
- **500+ CCmdAction_ RTTI classes** exist in the binary — the command action system is extensive
- Param hashes are NOT embedded in EXE — loaded from .fhm2d data at runtime
- Only 1 of all tested param hashes (0x00D7CEDB from character_param) exists as a code immediate
- The EXE hardcodes a small subset of hashes in field-index dispatch functions (sub_1405F9010, sub_1405F9180)
- Hash function is proprietary VDK engine hash — NOT standard CRC32, FNV-1a, or DJB2
- CRC32 polynomial 0xEDB88320 IS present in binary (Crc32(type:%d) debug string at 0x1416d93ea) but field key hashes don't match CRC32 output for any tested candidate strings
- Binary search on hash arrays is done both via LookupCommandDescriptorByHash (0x1401A8BD0) calls and inline binary search patterns in loader functions
- The grap system uses: Grap@GAM@VDK (data), CCmdActionManager_SummonGrap@GAM@VDK (actions), CUnitTaskAutomataSummonGrap@GAM@VDK (automata)
- The arms system uses: CArmsParamAccessor@GAM@VDK (accessor, vtable at 0x14133c688), with destructor at 0x1405DE390

## VDK::GAM Action Classes (from RTTI)
These represent the game's command action system. Each class handles a specific game mechanic.

### Bullet/Projectile Actions
| Class | Description |
|-------|-------------|
| Action_ChangeBulletParam@GAM@VDK | Switch bullet parameter set at runtime |
| Action_SetShellVisible@GAM@VDK | Set projectile shell visibility |
| Action_SetProjectileOrder@GAM@VDK | Set projectile spawning order |
| Action_UpdateProjectileOrderFromParent@GAM@VDK | Update projectile order from parent entity |
| Action_ResetProjectileOrder@GAM@VDK | Reset projectile order |
| Action_SetHasShotLaser_STRKFR@EXVS2 | Mark has-shot-laser for Strike Freedom |
| Action_SetHasShotLaser_RefineSTRKFR@EXVS2 | Mark has-shot-laser for refined Strike Freedom |

### Collision/Interaction Actions
| Class | Description |
|-------|-------------|
| Action_SetAlertInfoEnableMode@GAM@VDK | Enable/disable alert info |
| Action_SetAlertInfoContents@GAM@VDK | Set alert info contents |
| Action_SetIntersectEnableMode@GAM@VDK | Enable/disable intersection checks |
| Action_SetInteractEnableModeAttack@GAM@VDK | Enable attack interaction mode |
| Action_SetInteractEnableModeAll@GAM@VDK | Enable all interaction modes |
| Action_SetInteractEnableModeBarrier@GAM@VDK | Enable barrier interaction mode |
| Action_SetInteractEnableModeReceive@GAM@VDK | Enable receive interaction mode |
| Action_SetInteractEnableModeAttackSub@GAM@VDK | Enable sub-attack interaction |
| Action_SetCollisionEnableModeForStage@GAM@VDK | Set stage collision mode |
| Action_SetCollisionEnableModeForShell@GAM@VDK | Set shell collision mode |
| Action_SetCollisionResolveType@GAM@VDK | Set collision resolution type |
| Action_ResetPastInteractSendRecord@GAM@VDK | Clear past interaction records |

### Motion/Animation Actions
| Class | Description |
|-------|-------------|
| Action_SetMotionPause@GAM@VDK | Pause motion |
| Action_SetMotionSpeedRate@GAM@VDK | Set motion speed multiplier |
| Action_SetMotionStateLoopEnd@GAM@VDK | Set motion loop end state |
| Action_ResetOffsetBoneForUpvectorZ@GAM@VDK | Reset bone Z-axis offset |

### Status/State Actions
| Class | Description |
|-------|-------------|
| Action_ChangeStatus@GAM@VDK | Change entity status |
| Action_SetDefaultStateEnableMode@GAM@VDK | Set default state enable |
| Action_SetEnableDefaultLine@GAM@VDK | Enable default line |
| Action_SetFlag_10TAGN_01TAGN@GAM@VDK | Set tag flags |
| Action_SetUnizonFlag@EXVS2 | Set Unizon (EX burst) flag |
| Action_ResetLifeCount@GAM@VDK | Reset life counter |
| Action_ResetGazeTargetPosition@GAM@VDK | Reset gaze target position |

### Movement Actions
| Class | Description |
|-------|-------------|
| Action_SetFrictionVelocity@GAM@VDK | Set friction velocity |
| Action_UpdateRotate@GAM@VDK | Update rotation |
| Action_UpdateMoveTargetPos@GAM@VDK | Update move target position |
| Action_UpdateTargetToRadicon@GAM@VDK | Update target to Radicon |
| Action_SetInitMatrix@EXVS2 | Set initial transform matrix |

### Visual Actions
| Class | Description |
|-------|-------------|
| Action_SetCurrentMaterial@GAM@VDK | Set current material |
| Action_SetDisappearSummonEffectMode@GAM@VDK | Set disappear/summon effect |

## VDK::GAM Data Holder / Accessor Classes (from RTTI)
| Class | Purpose |
|-------|---------|
| CArmsParamAccessor@GAM@VDK | Arms/weapon parameter accessor |
| BulletParam@GAM@VDK | Bullet parameter data |
| CProjectileDepictionTableDataHolder@GAM@VDK | Projectile visual depiction data |
| CVernierTableAccessor@GAM@VDK | Vernier/thruster table accessor |
| CEffectProjectController@GAM@VDK | Effect project controller |
| CEffectProjectAccessor@GAM@VDK | Effect project accessor |
| HashTable1DHolder@GAM@VDK | 1D hash table holder |
| HashTable@@@GAM@VDK | Generic hash table |
| Grap@GAM@VDK | Grapple/grab system |
| Interaction@GAM@VDK | Interaction system |
| Character@GAM@VDK | Character system |
| CharacterData@Exvs2ResourceInstance | Character resource data |
| AcSeqPcbTrainingCommandTable@SEQ | Training command table |
| CCmdActionManager_{Series}_{Unit}_{Variant}_{Action} | Per-unit command action managers (500+ RTTI classes) |

## VDK::GAM Velocity/Physics Classes
| Class | Purpose |
|-------|---------|
| CVelocityWorld@GAM@VDK | World-space velocity |
| CVelocityFriction@GAM@VDK | Friction-based velocity |
| CVelocityGround@GAM@VDK | Ground movement velocity |
| CShell@GAM@VDK | Shell/projectile object |
| Beam@GAM@VDK | Beam weapon |
| Shot@GAM@VDK | Shot/bullet |
