//! EXVS2 effect-folder domain helpers.
//!
//! This module is intentionally UI-free. It reads and mutates an extracted
//! effect FHM2D folder plus its sibling `_structure.json`, and exposes small
//! command-friendly structs for Test Editor tooling.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::fhm2d_memory_preview::{collect_texture_refs, load_matl_data};
use crate::format::fhm2d::SubFileStructureEntry;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderSelection {
    pub kind: String,
    pub file_index: Option<i32>,
    pub hash_id: Option<i32>,
    pub name: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderCopyEfxbnPolicy {
    pub file_index: i32,
    pub dest_file_name: Option<String>,
    #[serde(default)]
    pub overwrite: bool,
    #[serde(default)]
    pub skip: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderHash {
    pub signed: i32,
    pub unsigned: u32,
    pub hex: String,
}

impl EffectFolderHash {
    fn from_i32(value: i32) -> Self {
        let unsigned = value as u32;
        Self {
            signed: value,
            unsigned,
            hex: format!("0x{unsigned:08X}"),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderFileItem {
    pub file_index: i32,
    pub file_type: String,
    pub actual_ext: String,
    pub file_url: String,
    pub file_base_name: String,
    pub name: String,
    pub path: String,
    pub hash: Option<EffectFolderHash>,
    pub unk2: Option<String>,
    pub missing: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub efxbn: Option<EfxbnSummary>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderModel {
    pub name: String,
    pub hash: EffectFolderHash,
    pub entry_index: usize,
    pub folder_unk3: i32,
    pub files: Vec<EffectFolderFileItem>,
    pub missing_required_exts: Vec<String>,
    pub material_texture_ids: Vec<EffectFolderHash>,
}

/// The pack every other effect pack draws shared models and colour maps from.
///
/// A `.efxbn` names a model or texture by CRC32, never by path, so a reference resolves against
/// the whole `006effect` tree rather than the opened folder. Across the shipped corpus 59.4% of
/// model references (523 of 880) and 69.5% of texture references (1,191 of 1,714) exist only
/// here, so a pack indexed on its own leaves the majority of its effects with nothing to draw.
pub const EFFECT_FOLDER_COMMON_PACK_NAME: &str = "000common_001";

/// The resource half of the shared pack, indexed alongside whichever pack was opened.
///
/// Only models and textures: the shared pack's own ~1,000 files include `.efxbn` payloads that
/// nothing in this inventory reads, and parsing them would dominate every inspection.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderCommonPack {
    pub effect_root: String,
    pub structure_json_path: String,
    pub models: Vec<EffectFolderModel>,
    pub textures: Vec<EffectFolderFileItem>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderInventorySummary {
    pub total_files: usize,
    pub efxbn_count: usize,
    pub model_count: usize,
    pub texture_count: usize,
    /// Model IDs found in neither this pack nor the shared pack. A real defect.
    pub unresolved_model_ids: Vec<EffectFolderHash>,
    /// Texture IDs found in neither this pack nor the shared pack. A real defect.
    pub unresolved_texture_ids: Vec<EffectFolderHash>,
    /// Model IDs that resolve only through the shared pack. Expected, not a defect.
    pub common_model_ids: Vec<EffectFolderHash>,
    /// Texture IDs that resolve only through the shared pack. Expected, not a defect.
    pub common_texture_ids: Vec<EffectFolderHash>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderInventory {
    pub effect_root: String,
    pub structure_json_path: String,
    pub summary: EffectFolderInventorySummary,
    pub efxbns: Vec<EffectFolderFileItem>,
    pub models: Vec<EffectFolderModel>,
    pub textures: Vec<EffectFolderFileItem>,
    pub other_files: Vec<EffectFolderFileItem>,
    /// None when the opened pack *is* the shared pack, or when no shared pack sits beside it —
    /// the latter also raises a warning, since references into it can no longer be resolved.
    pub common_pack: Option<EffectFolderCommonPack>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EfxbnControlLookupEntry {
    pub index: usize,
    pub key_f32_bits: u32,
    pub key: f32,
    pub value_f32_bits: u32,
    pub value: f32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EfxbnControlReferenceSummary {
    pub index: usize,
    pub name: String,
    pub raw_offset: u32,
    pub runtime_offset: u32,
    pub selector: u32,
    pub lookup_index: u32,
}

/// Values the loader derives before a block is used, reproduced from `sub_140146590`.
///
/// The authored fields stay untouched so a pack still round-trips byte for byte; anything
/// that renders or simulates should read these instead.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EfxbnRuntimeNormalization {
    /// Type-9 wrappers adopt a type derived from their first child.
    pub element_type: u32,
    pub action_flags: u32,
    pub delete_settings: u32,
    /// Derived from `blendState` and `enableSoftParticle`, never read from the file.
    pub z_write_enable: u32,
    pub soft_particle_range: f32,
    pub strip_segment_life: f32,
    pub strip_tail_alpha_rate: f32,
    pub strip_head_alpha_rate: f32,
    pub internal_element_data_index: u32,
    pub draw_scheme: EfxbnDrawScheme,
}

/// The runtime draw-scheme flag word at element `+0x390`.
///
/// `sub_1401470F0` synthesizes it from the loaded record; `sub_140188E30` then picks the
/// pixel-shader variant with any-bit-hit masks (`0x40` AddMix, `0x280` ColorEx, `0x20804`
/// Light, `0x1000` MultiUV, `0x10001` Soft, `0x20000` HLight). It is never stored in the
/// file, so nothing downstream can choose a variant without this.
#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EfxbnDrawScheme {
    /// Every bit the EFXBN alone determines. Zero for blocks the loader never enables.
    pub flag: u32,
    /// The multi-UV group, which applies only when the block's model mesh carries two or more
    /// vertex attribute streams of type 17 (a second UV set). `sub_1401470F0` walks the mesh
    /// to decide; the parser has no mesh, so it reports the group separately rather than
    /// guessing. Callers that resolved the model OR it into `flag`; the rest must not.
    pub mesh_multi_uv_flag: u32,
}

/// `sub_140145DF0` writes the draw-scheme enable byte at element `+0x394` for authored element
/// types 1, 3 and 5 only, before `sub_140146590` rewrites the type. Everything else keeps a
/// zero flag word.
const EFXBN_DRAW_SCHEME_ENABLED_TYPES: [u32; 3] = [1, 3, 5];

// Producer bits, in the order `sub_1401470F0` applies them.
const DRAW_SCHEME_SOFT_PARTICLE: u32 = 0x1;
const DRAW_SCHEME_ACTION_800: u32 = 0x2;
const DRAW_SCHEME_LIGHTING_1: u32 = 0x4;
const DRAW_SCHEME_NORMAL_MAP: u32 = 0x8;
const DRAW_SCHEME_Z_TEST: u32 = 0x10;
const DRAW_SCHEME_Z_WRITE: u32 = 0x20;
const DRAW_SCHEME_ADD_MIX: u32 = 0x40;
const DRAW_SCHEME_UV_OFFSET_MAP: u32 = 0x80;
const DRAW_SCHEME_ACTION_1000000: u32 = 0x100;
const DRAW_SCHEME_COLOR_MAP_SOURCED: u32 = 0x200;
const DRAW_SCHEME_ACTION_2000000: u32 = 0x400;
const DRAW_SCHEME_LIGHTING_4: u32 = 0x800;
const DRAW_SCHEME_MULTI_UV: u32 = 0x1000;
const DRAW_SCHEME_MULTI_UV_OFFSET_MAP: u32 = 0x2000;
const DRAW_SCHEME_MULTI_UV_COLOR_MAP: u32 = 0x4000;
const DRAW_SCHEME_EXTRA_2000: u32 = 0x8000;
const DRAW_SCHEME_EXTRA_40000: u32 = 0x10000;
const DRAW_SCHEME_LIGHTING_8: u32 = 0x20000;
/// Skips the `rgb * 0.5` the base Face and Model pixel shaders otherwise apply. Driven by the
/// same `extraFlags & 0x2000` test as `DRAW_SCHEME_EXTRA_2000`, so the two always agree.
const DRAW_SCHEME_FULL_BRIGHTNESS: u32 = 0x40000;

const EFXBN_ACTION_FLAG_DRAW_800: u32 = 0x800;
const EFXBN_ACTION_FLAG_DRAW_1000000: u32 = 0x0100_0000;
const EFXBN_ACTION_FLAG_DRAW_2000000: u32 = 0x0200_0000;
const EFXBN_EXTRA_FLAG_FULL_BRIGHTNESS: u32 = 0x2000;
const EFXBN_EXTRA_FLAG_DEPTH_EMISSION: u32 = 0x0004_0000;
const EFXBN_LIGHTING_FLAG_DIRECTIONAL: u32 = 0x1;
const EFXBN_LIGHTING_FLAG_REFLECTION: u32 = 0x4;
const EFXBN_LIGHTING_FLAG_NORMAL_MAP: u32 = 0x8;
/// `blendState` value that selects the AddMix pixel shader.
const EFXBN_BLEND_STATE_ADD_MIX: u32 = 4;
/// A model-control parameter only contributes its color-map bit when it is this input source.
const EFXBN_MODEL_CONTROL_INPUT_SOURCE_BOUND: u32 = 1;

/// Reproduces `sub_1401470F0`.
///
/// `element_type` is the value at `+0x28` as the producer sees it, i.e. after
/// `sub_140146590` wrote the normalized type back. The enable gate upstream keys off the
/// authored type instead, and the two only differ for type-9 wrappers, which the gate rejects.
fn efxbn_draw_scheme(
    effect: &EfxbnEffectSummary,
    element_type: u32,
    model_controls: &[EfxbnModelControlSummary],
) -> EfxbnDrawScheme {
    if !EFXBN_DRAW_SCHEME_ENABLED_TYPES.contains(&effect.effect_type) {
        return EfxbnDrawScheme {
            flag: 0,
            mesh_multi_uv_flag: 0,
        };
    }

    let bound_color_map = |slot: i32| {
        usize::try_from(slot).ok().is_some_and(|index| {
            model_controls.get(index).is_some_and(|control| {
                control.input_source_type == EFXBN_MODEL_CONTROL_INPUT_SOURCE_BOUND
            })
        })
    };

    let mut flag = 0u32;
    if effect.enable_soft_particle != 0 {
        flag |= DRAW_SCHEME_SOFT_PARTICLE;
    }
    if effect.action_flags & EFXBN_ACTION_FLAG_DRAW_800 != 0 {
        flag |= DRAW_SCHEME_ACTION_800;
    }
    if effect.lighting_flags & EFXBN_LIGHTING_FLAG_DIRECTIONAL != 0 {
        flag |= DRAW_SCHEME_LIGHTING_1;
    }
    if effect.normal_map_hash != 0 {
        flag |= DRAW_SCHEME_NORMAL_MAP;
    }
    if effect.z_test_enable != 0 {
        flag |= DRAW_SCHEME_Z_TEST;
    }
    if effect.z_write_enable != 0 {
        flag |= DRAW_SCHEME_Z_WRITE;
    }
    if effect.blend_state == EFXBN_BLEND_STATE_ADD_MIX {
        flag |= DRAW_SCHEME_ADD_MIX;
    }
    if effect.uv_texture_parameter_index[0] != -1 {
        flag |= DRAW_SCHEME_UV_OFFSET_MAP;
    }
    if effect.action_flags & EFXBN_ACTION_FLAG_DRAW_1000000 != 0 {
        flag |= DRAW_SCHEME_ACTION_1000000;
    }
    if effect.action_flags & EFXBN_ACTION_FLAG_DRAW_2000000 != 0 {
        flag |= DRAW_SCHEME_ACTION_2000000;
    }
    if effect.lighting_flags & EFXBN_LIGHTING_FLAG_REFLECTION != 0 {
        flag |= DRAW_SCHEME_LIGHTING_4;
    }
    if effect.extra_flags & EFXBN_EXTRA_FLAG_FULL_BRIGHTNESS != 0 {
        flag |= DRAW_SCHEME_EXTRA_2000 | DRAW_SCHEME_FULL_BRIGHTNESS;
    }
    if effect.extra_flags & EFXBN_EXTRA_FLAG_DEPTH_EMISSION != 0 {
        flag |= DRAW_SCHEME_EXTRA_40000;
    }
    if effect.lighting_flags & EFXBN_LIGHTING_FLAG_NORMAL_MAP != 0 {
        flag |= DRAW_SCHEME_LIGHTING_8;
    }
    if bound_color_map(effect.color_texture_parameter_index[0]) {
        flag |= DRAW_SCHEME_COLOR_MAP_SOURCED;
    }

    // Only model blocks can reach the mesh walk, and its two dependent bits are gated on it.
    let mut mesh_multi_uv_flag = 0u32;
    if element_type == 3 {
        mesh_multi_uv_flag |= DRAW_SCHEME_MULTI_UV;
        if effect.uv_texture_parameter_index[1] != -1 {
            mesh_multi_uv_flag |= DRAW_SCHEME_MULTI_UV_OFFSET_MAP;
        }
        if bound_color_map(effect.color_texture_parameter_index[1]) {
            mesh_multi_uv_flag |= DRAW_SCHEME_MULTI_UV_COLOR_MAP;
        }
    }

    EfxbnDrawScheme {
        flag,
        mesh_multi_uv_flag,
    }
}

const EFXBN_NORMALIZE_EPSILON: f32 = 0.000_001;
const EFXBN_ACTION_FLAG_LOOP: u32 = 1;
/// Forces the loop flag on.
const EFXBN_ACTION_FLAG_FORCE_LOOP: u32 = 0x0800_0000;
/// Clears the loop flag and the second delete-setting bit.
const EFXBN_ACTION_FLAG_CLEAR_LOOP: u32 = 0x0080_0000;
const EFXBN_DEFAULT_SOFT_PARTICLE_RANGE: f32 = 8.0;
const EFXBN_DEFAULT_STRIP_ALPHA_RATE: f32 = 0.3;
const EFXBN_STRIP_SEGMENT_LIFE_FACTOR: f32 = 16.0;

fn normalize_efxbn_block(
    effect: &EfxbnEffectSummary,
    first_child: Option<&EfxbnEffectSummary>,
    model_controls: &[EfxbnModelControlSummary],
) -> EfxbnRuntimeNormalization {
    let mut element_type = effect.effect_type;
    if effect.child_index_size != 0 && element_type == 9 {
        if let Some(child) = first_child {
            match child.effect_type {
                1 => element_type = 0,
                3 => element_type = 2,
                5 => element_type = 4,
                6 => element_type = 7,
                _ => {}
            }
        }
    }

    let mut z_write_enable = effect.z_write_enable;
    if effect.blend_state == 0 {
        z_write_enable = 1;
    }
    if effect.enable_soft_particle != 0 {
        z_write_enable = 0;
    }

    let soft_particle_range = if effect.soft_particle_range.abs() < EFXBN_NORMALIZE_EPSILON {
        EFXBN_DEFAULT_SOFT_PARTICLE_RANGE
    } else {
        effect.soft_particle_range
    };

    let mut action_flags = effect.action_flags;
    let mut delete_settings = effect.delete_settings;
    if action_flags & EFXBN_ACTION_FLAG_FORCE_LOOP != 0 {
        action_flags |= EFXBN_ACTION_FLAG_LOOP;
    }
    if action_flags & EFXBN_ACTION_FLAG_CLEAR_LOOP != 0 {
        delete_settings &= !2;
        action_flags &= !EFXBN_ACTION_FLAG_LOOP;
    }

    let (strip_segment_life, strip_tail_alpha_rate, strip_head_alpha_rate) = if element_type == 5 {
        (
            if effect.strip_segment_life < 0.0 {
                effect.strip_segment_interval * EFXBN_STRIP_SEGMENT_LIFE_FACTOR
            } else {
                effect.strip_segment_life
            },
            if effect.strip_tail_alpha_rate.abs() < EFXBN_NORMALIZE_EPSILON {
                EFXBN_DEFAULT_STRIP_ALPHA_RATE
            } else {
                effect.strip_tail_alpha_rate
            },
            if effect.strip_head_alpha_rate.abs() < EFXBN_NORMALIZE_EPSILON {
                EFXBN_DEFAULT_STRIP_ALPHA_RATE
            } else {
                effect.strip_head_alpha_rate
            },
        )
    } else {
        (
            effect.strip_segment_life,
            effect.strip_tail_alpha_rate,
            effect.strip_head_alpha_rate,
        )
    };

    if element_type == 10 && effect.post_effect_type != 2 {
        action_flags &= !EFXBN_ACTION_FLAG_LOOP;
    }

    EfxbnRuntimeNormalization {
        element_type,
        action_flags,
        delete_settings,
        z_write_enable,
        soft_particle_range,
        strip_segment_life,
        strip_tail_alpha_rate,
        strip_head_alpha_rate,
        internal_element_data_index: effect.index as u32,
        // `sub_1401470F0` runs after this pass and reads the rewritten type at `+0x28`.
        draw_scheme: efxbn_draw_scheme(effect, element_type, model_controls),
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EfxbnEffectSummary {
    pub index: usize,
    /// Tree depth. `0` is a root emitter; children carry the parent depth plus one.
    pub level: u32,
    /// Number of valid entries in `child_index_array`.
    pub child_index_size: u32,
    /// Block indices spawned by this block. Unused slots are `-1`.
    pub child_index_array: [i32; 8],
    /// First child index, retained for callers that predate `child_index_array`.
    pub referenced_effect_index: i32,
    pub effect_type: u32,
    pub life_time_base: f32,
    pub life_time_random: f32,
    pub interval_base: f32,
    pub interval_random: f32,
    pub num_emit: u32,
    pub action_flags: u32,
    pub spawn_form_type: u32,
    pub spawn_form_length: [f32; 4],
    pub speed_random: [f32; 4],
    pub size_base: [f32; 4],
    pub size_random: [f32; 4],
    pub rotation_base: [f32; 4],
    pub rotation_random: [f32; 4],
    pub rotation_speed: [f32; 4],
    pub internal_element_data_index: u32,
    pub enable_data_flag: u32,
    /// Model resource handle. Mirrors `model_id`/`model_hash`.
    pub nud_handle: u32,
    /// Texture resource handle bound directly to the block, independent of the
    /// four model-control parameter slots.
    pub texture_handle: u32,
    /// Reflected as `pad01[2]`. Carried so the writer can reproduce a file byte for byte.
    pub pad01: [u32; 2],
    /// Primary and pass-2 color-map parameter slots.
    pub color_texture_parameter_index: [i32; 2],
    /// Primary and pass-2 UV-offset parameter slots.
    pub uv_texture_parameter_index: [i32; 2],
    pub center_pivot: [f32; 2],
    pub delete_settings: u32,
    pub fade_time_base: f32,
    pub culling_type: u32,
    pub z_write_enable: u32,
    pub z_test_enable: u32,
    pub blend_state: u32,
    pub draw_repository_index: u32,
    pub instance_amount_type: u32,
    pub draw_amount_index: u32,
    pub enable_soft_particle: u32,
    pub position_offset: [f32; 4],
    pub delay_emit_time_base: f32,
    pub emit_area_type: u32,
    pub enable_z_sort: u32,
    pub delete_effect_id: u32,
    pub delete_end_scale: [f32; 4],
    pub light_attenuation_radius: f32,
    pub lighting_flags: u32,
    pub normal_map_hash: u32,
    pub world_wind_apply_rate: f32,
    pub strip_segment_interval: f32,
    /// Reflected as `stripSegmentLength_NotUse`; the engine declares it and never reads it.
    pub strip_segment_length_not_use: f32,
    pub strip_segment_life: f32,
    /// Reflected as `stripSegmentNum_NotUse`; declared and never read.
    pub strip_segment_num_not_use: u32,
    pub strip_segment_split_num: u32,
    pub drawer_id: u32,
    pub world_wind_apply_rate_random: f32,
    pub soft_particle_range: f32,
    pub camera_fade_range: f32,
    pub extra_flags: u32,
    pub noise_direction_max_rot: f32,
    pub noise_direction_area_range: f32,
    pub blur_start_color: [f32; 4],
    pub blur_end_color: [f32; 4],
    pub blur_enable_range: f32,
    pub blur_fade_power: f32,
    pub light_type: u32,
    pub light_base_radius: f32,
    pub rotation_speed_random: [f32; 4],
    pub camera_offset: f32,
    pub post_effect_type: u32,
    pub post_effect_blend_rate: f32,
    /// Reflected as `stripTaleAlphaRate`; the game misspells "tail".
    pub strip_tail_alpha_rate: f32,
    pub strip_head_alpha_rate: f32,
    pub emit_interpolate_distance: f32,
    pub noise_rotate_pos_offset: f32,
    pub z_sort_offset: f32,
    pub special_shader_type: u32,
    pub reflection_power: f32,
    pub pass2_blend_type: u32,
    pub animation_delay_frame: f32,
    pub animation_loop_start_frame: f32,
    pub animation_loop_end_frame: f32,
    pub animation_delete_frame: f32,
    pub animation_speed_rate: f32,
    pub animation_blend_delete_frame: u32,
    pub emitter_lod_type: u32,
    pub animation_start_frame: f32,
    pub bounding_sphere_info: [f32; 4],
    pub post_effect_shape_radius: f32,
    pub world_water_apply_rate: f32,
    pub num_emit_count_random: u32,
    pub depth_emission_range: f32,
    pub depth_emission_power: f32,
    pub highlight_power: f32,
    pub emit_interpolate_type: u32,
    pub mesh_emitter_index: u32,
    pub mesh_emitter_count: u32,
    pub field_effect_type: u32,
    pub field_effect_power: f32,
    pub field_effect_interval: f32,
    pub field_effect_angle: f32,
    pub field_effect_frequency: f32,
    pub field_effect_offset: f32,
    pub field_effect_recieve_rate: f32,
    pub field_effect_extra_value1: f32,
    pub model_id: i32,
    pub model_hash: EffectFolderHash,
    pub animation_id: i32,
    pub animation_hash: EffectFolderHash,
    pub control_references: Vec<EfxbnControlReferenceSummary>,
    /// `reserve_area[31]` at reflected offset 756. No shader or CPU consumer reads it, but the
    /// bytes are carried verbatim so `build_efxbn_bytes` reproduces a file exactly.
    pub reserve_area: Vec<u32>,
    /// Loader-derived values. Always populated by `parse_efxbn_bytes`; it stays optional
    /// only because wrapper type resolution needs a second pass over every block.
    pub runtime: Option<EfxbnRuntimeNormalization>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EfxbnModelControlSummary {
    pub index: usize,
    pub input_source_type: u32,
    pub color_map_id: i32,
    pub color_map_hash: EffectFolderHash,
    pub addressing_mode: u32,
    pub reverse_u: u32,
    pub reverse_v: u32,
    pub texture_width: u32,
    pub texture_height: u32,
    pub uv_pattern_type: u32,
    pub uv_u: [f32; 4],
    pub uv_v: [f32; 4],
    pub uv_scroll_speed: f32,
    pub uv_scroll_limit: f32,
    pub uv_scroll_direction: f32,
    pub uv_animation_random: u32,
    pub uv_animation_frame_num: u32,
    pub uv_animation_frame_width: u32,
    pub uv_animation_frame_height: u32,
    pub uv_animation_frame_num_by_line: u32,
    pub uv_animation_frame_time: u32,
    pub uv_animation_3d_texture: u32,
    pub uv_scroll_model_speed_u: f32,
    pub uv_scroll_model_speed_v: f32,
    pub uv_distortion_power_u: f32,
    pub uv_distortion_power_v: f32,
    pub texture_setting_flags: u32,
    pub uv_animation_start_frame: u32,
    pub uv_random_offset_u: f32,
    pub uv_random_offset_v: f32,
    pub reserve_area: Vec<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EfxbnUnknownTodo {
    pub field: String,
    pub status: String,
    pub reason: String,
    pub follow_up: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EfxbnTodo {
    pub unknowns: Vec<EfxbnUnknownTodo>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EfxbnSummary {
    pub path: String,
    pub magic: String,
    pub version_or_flags: u32,
    pub file_size: u32,
    pub actual_size: usize,
    pub effect_count: u32,
    /// Number of `(time, value)` curve keys stored after the effect blocks.
    pub curve_key_count: u32,
    pub control_lookup_region_offset: u32,
    pub control_lookup_region_size: u32,
    pub control_lookup_region_end: u32,
    pub model_control_config_count: u32,
    pub model_control_region_offset: u32,
    pub model_control_region_size: u32,
    pub trailing_offset: u32,
    pub model_ids: Vec<EffectFolderHash>,
    pub animation_ids: Vec<EffectFolderHash>,
    pub model_control_texture_ids: Vec<EffectFolderHash>,
    pub control_lookup_entries: Vec<EfxbnControlLookupEntry>,
    pub effects: Vec<EfxbnEffectSummary>,
    pub model_controls: Vec<EfxbnModelControlSummary>,
    pub texture_parameters: Vec<EfxbnModelControlSummary>,
    pub todo: EfxbnTodo,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderValidationError {
    pub phase: String,
    pub item: Option<String>,
    pub message: String,
    pub path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderValidationSummary {
    pub total_files: usize,
    pub efxbn_count: usize,
    pub model_count: usize,
    pub texture_count: usize,
    pub unresolved_model_id_count: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderValidationResult {
    pub valid: bool,
    pub effect_root: String,
    pub structure_json_path: String,
    pub summary: EffectFolderValidationSummary,
    pub errors: Vec<EffectFolderValidationError>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderMutationResult {
    pub effect_root: String,
    pub structure_json_path: String,
    pub total_files: usize,
    pub added_files: Vec<String>,
    pub removed_files: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderCopyResult {
    pub source_effect_root: String,
    pub destination_effect_root: String,
    pub destination_structure_json_path: String,
    pub total_files: usize,
    pub copied_files: Vec<String>,
    pub skipped: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug)]
struct StructureFile {
    value: Value,
    sub_file_data: Vec<Value>,
    sub_file_structure: Vec<SubFileStructureEntry>,
}

#[derive(Clone, Debug)]
enum Node {
    Folder {
        entry_index: usize,
        entry: SubFileStructureEntry,
        children: Vec<Node>,
    },
    Item {
        entry_index: usize,
        entry: SubFileStructureEntry,
        file_index: i32,
    },
}

#[derive(Clone, Debug)]
struct FileRecord {
    file_index: i32,
    file_type: String,
    actual_ext: String,
    file_url: String,
    file_base_name: String,
    path: PathBuf,
}

pub fn inspect_effect_folder(
    effect_root: &str,
    structure_json_path: Option<&str>,
) -> Result<EffectFolderInventory, String> {
    let root_path = validate_dir(effect_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let json_dir = structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let structure = read_structure_file(&structure_path)?;
    let data_by_index = build_file_record_map(&structure.sub_file_data, &json_dir)?;
    let forest = parse_forest(&structure.sub_file_structure)?;
    let mut warnings = Vec::new();
    let mut efxbns = Vec::new();
    let mut textures = Vec::new();
    let mut others = Vec::new();
    let mut models = Vec::new();
    collect_models(&forest, &data_by_index, &mut models);
    for model in &mut models {
        match collect_model_material_texture_ids(&model.files) {
            Ok(ids) => model.material_texture_ids = ids,
            Err(error) => warnings.push(format!(
                "Failed to read material textures for model {}: {error}",
                model.name
            )),
        }
    }
    let model_hashes: HashSet<i32> = models.iter().map(|m| m.hash.signed).collect();

    for item in collect_items(&forest) {
        let Some(file_index) = item.file_index() else {
            continue;
        };
        let Some(record) = data_by_index.get(&file_index) else {
            warnings.push(format!(
                "SubFileStructure item references missing fileIndex {}.",
                file_index
            ));
            continue;
        };
        let mut file_item = file_item_from_node(record, item.item_entry());
        match record.actual_ext.as_str() {
            ".efxbn" => {
                match parse_efxbn_file(record.path.to_string_lossy().as_ref()) {
                    Ok(summary) => file_item.efxbn = Some(summary),
                    Err(error) => warnings.push(format!(
                        "Failed to parse efxbn fileIndex {} ({}): {error}",
                        record.file_index, record.file_url
                    )),
                }
                efxbns.push(file_item);
            }
            ".nutexb" => textures.push(file_item),
            _ if !is_inside_model(&models, record.file_index) => others.push(file_item),
            _ => {}
        }
    }

    let common_pack = collect_common_pack(&root_path, &mut warnings)?;
    let texture_hashes = texture_hash_set(&textures);
    let common_model_hashes: HashSet<i32> = common_pack
        .as_ref()
        .map(|pack| pack.models.iter().map(|model| model.hash.signed).collect())
        .unwrap_or_default();
    let common_texture_hashes = common_pack
        .as_ref()
        .map(|pack| texture_hash_set(&pack.textures))
        .unwrap_or_default();

    let mut unresolved_models = BTreeSet::new();
    let mut unresolved_textures = BTreeSet::new();
    let mut common_models = BTreeSet::new();
    let mut common_textures = BTreeSet::new();
    for item in &efxbns {
        let Some(summary) = &item.efxbn else {
            continue;
        };
        for hash in &summary.model_ids {
            classify_resource_reference(
                hash.signed,
                &model_hashes,
                &common_model_hashes,
                &mut common_models,
                &mut unresolved_models,
            );
        }
        for hash in &summary.model_control_texture_ids {
            classify_resource_reference(
                hash.signed,
                &texture_hashes,
                &common_texture_hashes,
                &mut common_textures,
                &mut unresolved_textures,
            );
        }
    }
    let unresolved_model_ids = hash_list(unresolved_models);
    let unresolved_texture_ids = hash_list(unresolved_textures);
    let common_model_ids = hash_list(common_models);
    let common_texture_ids = hash_list(common_textures);
    push_reference_warnings(
        &mut warnings,
        &common_model_ids,
        &common_texture_ids,
        &unresolved_model_ids,
        &unresolved_texture_ids,
    );

    Ok(EffectFolderInventory {
        effect_root: root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        summary: EffectFolderInventorySummary {
            total_files: structure.sub_file_data.len(),
            efxbn_count: efxbns.len(),
            model_count: models.len(),
            texture_count: textures.len(),
            unresolved_model_ids,
            unresolved_texture_ids,
            common_model_ids,
            common_texture_ids,
        },
        efxbns,
        models,
        textures,
        other_files: others,
        common_pack,
        warnings,
    })
}

fn texture_hash_set(textures: &[EffectFolderFileItem]) -> HashSet<i32> {
    textures
        .iter()
        .filter_map(|texture| texture.hash.as_ref().map(|hash| hash.signed))
        .collect()
}

fn hash_list(hashes: BTreeSet<i32>) -> Vec<EffectFolderHash> {
    hashes.into_iter().map(EffectFolderHash::from_i32).collect()
}

/// Sort one referenced resource ID into "resolved here", "resolved in the shared pack", or
/// "resolved nowhere". A zero ID means the block binds no resource at all.
fn classify_resource_reference(
    hash: i32,
    own: &HashSet<i32>,
    common: &HashSet<i32>,
    from_common: &mut BTreeSet<i32>,
    unresolved: &mut BTreeSet<i32>,
) {
    if hash == 0 || own.contains(&hash) {
        return;
    }
    if common.contains(&hash) {
        from_common.insert(hash);
        return;
    }
    unresolved.insert(hash);
}

/// State where every cross-pack reference landed.
///
/// Shared-pack hits are aggregated because they are the common case — the majority of every
/// pack's references — while anything unresolved is listed one ID at a time, because each one is
/// a resource the game will fail to draw.
fn push_reference_warnings(
    warnings: &mut Vec<String>,
    common_model_ids: &[EffectFolderHash],
    common_texture_ids: &[EffectFolderHash],
    unresolved_model_ids: &[EffectFolderHash],
    unresolved_texture_ids: &[EffectFolderHash],
) {
    if !common_model_ids.is_empty() || !common_texture_ids.is_empty() {
        warnings.push(format!(
            "Resolved {} model and {} texture reference(s) from the shared pack {EFFECT_FOLDER_COMMON_PACK_NAME}.",
            common_model_ids.len(),
            common_texture_ids.len()
        ));
    }
    for hash in unresolved_model_ids {
        warnings.push(format!(
            "EFXBN references modelId {} that exists in neither this pack nor {EFFECT_FOLDER_COMMON_PACK_NAME}.",
            hash.hex
        ));
    }
    for hash in unresolved_texture_ids {
        warnings.push(format!(
            "EFXBN references textureId {} that exists in neither this pack nor {EFFECT_FOLDER_COMMON_PACK_NAME}.",
            hash.hex
        ));
    }
}

/// The shared pack that sits next to `root`, or None when `root` is that pack.
fn common_pack_root(root: &Path) -> Result<Option<PathBuf>, String> {
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Invalid effect root name: {}", root.display()))?;
    if name.eq_ignore_ascii_case(EFFECT_FOLDER_COMMON_PACK_NAME) {
        return Ok(None);
    }
    let parent = root.parent().ok_or_else(|| {
        format!(
            "Cannot resolve the shared effect pack next to {}",
            root.display()
        )
    })?;
    Ok(Some(parent.join(EFFECT_FOLDER_COMMON_PACK_NAME)))
}

/// Index the shared pack's models and textures so references into it can be resolved.
///
/// An absent shared pack is reported as a warning rather than an error: a pack extracted or
/// copied on its own is still worth inspecting, and every reference it cannot resolve is then
/// listed by ID. A shared pack that exists but cannot be read is an error, because silently
/// dropping half the resources would make the inventory lie.
fn collect_common_pack(
    root: &Path,
    warnings: &mut Vec<String>,
) -> Result<Option<EffectFolderCommonPack>, String> {
    let Some(common_root) = common_pack_root(root)? else {
        return Ok(None);
    };
    let structure_path = resolve_structure_path(&common_root, None)?;
    if !common_root.is_dir() || !structure_path.is_file() {
        warnings.push(format!(
            "Shared effect pack {EFFECT_FOLDER_COMMON_PACK_NAME} is not next to {}; references that live there cannot be resolved.",
            root.display()
        ));
        return Ok(None);
    }
    let (models, textures) = collect_effect_folder_resources(&structure_path)?;
    Ok(Some(EffectFolderCommonPack {
        effect_root: common_root.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        models,
        textures,
    }))
}

/// The models and textures a pack publishes for other packs to reference by hash.
fn collect_effect_folder_resources(
    structure_path: &Path,
) -> Result<(Vec<EffectFolderModel>, Vec<EffectFolderFileItem>), String> {
    let json_dir = structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let structure = read_structure_file(structure_path)?;
    let data_by_index = build_file_record_map(&structure.sub_file_data, &json_dir)?;
    let forest = parse_forest(&structure.sub_file_structure)?;
    let mut models = Vec::new();
    collect_models(&forest, &data_by_index, &mut models);
    let mut textures = Vec::new();
    for item in collect_items(&forest) {
        let Some(record) = item
            .file_index()
            .and_then(|index| data_by_index.get(&index))
        else {
            continue;
        };
        if record.actual_ext == ".nutexb" {
            textures.push(file_item_from_node(record, item.item_entry()));
        }
    }
    Ok((models, textures))
}

pub fn parse_efxbn_file(path: &str) -> Result<EfxbnSummary, String> {
    let bytes = fs::read(path).map_err(|e| format!("Failed to read efxbn {path}: {e}"))?;
    parse_efxbn_bytes(&bytes, path)
}

/// Element types the loader will actually accept.
///
/// Drawables are 1 / 3 / 5; 6, 8, 9, 10 and 11 are containers. Type 2 occurs in none of the
/// 40,309 blocks of the shipped corpus and the loader has no branch for it, so a file that
/// declares one would render nothing.
const EFXBN_KNOWN_ELEMENT_TYPES: [u32; 8] = [1, 3, 5, 6, 8, 9, 10, 11];

/// Structural problems inside a single `.efxbn`, independent of the pack around it.
///
/// These are the invariants an edit can break without changing the file's size, so they are
/// checked before a repack rather than discovered by the game.
pub fn validate_efxbn_summary(summary: &EfxbnSummary) -> Vec<String> {
    let mut problems = Vec::new();
    let block_count = summary.effects.len();
    let control_count = summary.model_controls.len();
    let key_count = summary.control_lookup_entries.len();

    for effect in &summary.effects {
        let index = effect.index;
        if !EFXBN_KNOWN_ELEMENT_TYPES.contains(&effect.effect_type) {
            problems.push(format!(
                "Block {index} declares unknown elementType {}.",
                effect.effect_type
            ));
        }
        let child_count = effect.child_index_size as usize;
        if child_count > effect.child_index_array.len() {
            problems.push(format!(
                "Block {index} declares childIndexSize {child_count}, but only {} slots exist.",
                effect.child_index_array.len()
            ));
        }
        for child in effect
            .child_index_array
            .iter()
            .take(child_count.min(effect.child_index_array.len()))
        {
            if *child >= 0 && *child as usize >= block_count {
                problems.push(format!(
                    "Block {index} references child block {child}, but the file holds {block_count}."
                ));
            }
        }
        for (slot, parameter) in effect
            .color_texture_parameter_index
            .iter()
            .chain(effect.uv_texture_parameter_index.iter())
            .enumerate()
        {
            if *parameter >= 0 && *parameter as usize >= control_count {
                problems.push(format!(
                    "Block {index} texture slot {slot} references model control {parameter}, but the file holds {control_count}."
                ));
            }
        }
        for reference in &effect.control_references {
            if reference.selector == 0 {
                continue;
            }
            let end = reference.lookup_index as usize + reference.selector as usize;
            if end > key_count {
                problems.push(format!(
                    "Block {index} curve `{}` reads keys {}..{end}, past curveKeyCount {key_count}.",
                    reference.name, reference.lookup_index
                ));
            }
        }
    }
    problems
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EfxbnFileWriteResult {
    pub path: String,
    pub byte_len: usize,
    pub summary: EfxbnSummary,
}

/// Writes a whole edited `.efxbn` back to disk through `build_efxbn_bytes`.
///
/// This is the only EFXBN write path. It replaced a byte patcher that poked four bytes per curve
/// key and therefore could not resize the key table, retopologise the block tree, or rebind a
/// model; `build_efxbn_bytes` lays out all three regions from their own lengths and rewrites the
/// header counts, so every one of those edits works here. Two write paths that can disagree is
/// the worst failure mode this format has, which is why the patcher was deleted rather than kept.
///
/// Three guards, all deliberate:
///
/// * The target must sit under `effect_root`. A path escaping the inspected pack is a bug in the
///   caller, and the blast radius of a stray write to a shipped game file is not recoverable.
/// * The target must already exist and be a `.efxbn`. This command edits; it does not create.
/// * The bytes land in a sibling temp file that is renamed into place, so a failure part-way
///   leaves the original intact rather than truncated.
///
/// The written bytes are re-parsed before returning, so the caller's document is refreshed from
/// what is actually on disk rather than from what it believed it wrote.
pub fn write_efxbn_file(
    effect_root: &str,
    path: &str,
    summary: &EfxbnSummary,
) -> Result<EfxbnFileWriteResult, String> {
    let target = Path::new(path);
    if !target.is_file() {
        return Err(format!("EFXBN target is not an existing file: {path}"));
    }
    if !target
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("efxbn"))
    {
        return Err(format!("EFXBN target is not a .efxbn file: {path}"));
    }
    ensure_efxbn_write_target_inside_root(Path::new(effect_root), target)?;

    let bytes = build_efxbn_bytes(summary)?;
    let parent = target
        .parent()
        .ok_or_else(|| format!("EFXBN target has no parent directory: {path}"))?;
    let temp = parent.join(format!(
        "{}.efxbn-write-tmp",
        target
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("effect")
    ));
    fs::write(&temp, &bytes)
        .map_err(|e| format!("Failed to stage efxbn write {}: {e}", temp.display()))?;
    if let Err(error) = fs::rename(&temp, target) {
        let _ = fs::remove_file(&temp);
        return Err(format!("Failed to replace efxbn {path}: {error}"));
    }

    let rewritten = parse_efxbn_bytes(&bytes, path)?;
    Ok(EfxbnFileWriteResult {
        path: path.to_string(),
        byte_len: bytes.len(),
        summary: rewritten,
    })
}

/// Rejects a write target that does not resolve inside the inspected effect root.
///
/// Canonicalizing both sides is what makes this meaningful on Windows, where the same file is
/// reachable through short names, differing case and `..` segments.
fn ensure_efxbn_write_target_inside_root(root: &Path, target: &Path) -> Result<(), String> {
    let canonical_root = fs::canonicalize(root)
        .map_err(|e| format!("Failed to resolve effect root {}: {e}", root.display()))?;
    let canonical_target = fs::canonicalize(target)
        .map_err(|e| format!("Failed to resolve efxbn path {}: {e}", target.display()))?;
    if !canonical_target.starts_with(&canonical_root) {
        return Err(format!(
            "Refusing to write {} because it is outside the effect root {}.",
            canonical_target.display(),
            canonical_root.display()
        ));
    }
    Ok(())
}

/// Serializes a parsed summary back to EFXBN bytes.
///
/// Every byte of the container is covered by a typed field — the 880-byte block through the
/// reflected `SEfxElementData` layout including `pad01`, the two `*_NotUse` slots,
/// `worldWindApplyRateRandom` and `reserve_area[31]`, and the 184-byte model control through
/// its own `reserve_area[12]`. Nothing is copied from a raw image, so a parsed-then-built file
/// is byte-identical only when the parser really did read everything.
pub fn build_efxbn_bytes(summary: &EfxbnSummary) -> Result<Vec<u8>, String> {
    if summary.effects.len() != summary.effect_count as usize {
        return Err(format!(
            "EFXBN effectCount is {} but {} blocks are present.",
            summary.effect_count,
            summary.effects.len()
        ));
    }
    if summary.control_lookup_entries.len() != summary.curve_key_count as usize {
        return Err(format!(
            "EFXBN curveKeyCount is {} but {} curve keys are present.",
            summary.curve_key_count,
            summary.control_lookup_entries.len()
        ));
    }
    if summary.model_controls.len() != summary.model_control_config_count as usize {
        return Err(format!(
            "EFXBN modelControlCount is {} but {} model controls are present.",
            summary.model_control_config_count,
            summary.model_controls.len()
        ));
    }

    let block_region = summary.effects.len() * EFXBN_BLOCK_STRIDE;
    let key_region = summary.control_lookup_entries.len() * EFXBN_CURVE_KEY_STRIDE;
    let control_region = summary.model_controls.len() * EFXBN_MODEL_CONTROL_STRIDE;
    let total = EFXBN_BLOCK_REGION_OFFSET + block_region + key_region + control_region;
    let mut bytes = vec![0u8; total];
    bytes[0..4].copy_from_slice(b"EFXB");
    write_u32_le(&mut bytes, 0x04, summary.version_or_flags);
    write_u32_le(&mut bytes, 0x08, total as u32);
    write_u32_le(&mut bytes, 0x0c, summary.effect_count);
    write_u32_le(&mut bytes, 0x10, summary.curve_key_count);
    write_u32_le(&mut bytes, 0x14, summary.model_control_config_count);

    for (index, effect) in summary.effects.iter().enumerate() {
        let base = EFXBN_BLOCK_REGION_OFFSET + index * EFXBN_BLOCK_STRIDE;
        write_efxbn_block(&mut bytes, base, effect)?;
    }

    let key_base = EFXBN_BLOCK_REGION_OFFSET + block_region;
    for (index, entry) in summary.control_lookup_entries.iter().enumerate() {
        let offset = key_base + index * EFXBN_CURVE_KEY_STRIDE;
        write_u32_le(&mut bytes, offset, entry.key_f32_bits);
        write_u32_le(&mut bytes, offset + 4, entry.value_f32_bits);
    }

    let control_base = key_base + key_region;
    for (index, control) in summary.model_controls.iter().enumerate() {
        let base = control_base + index * EFXBN_MODEL_CONTROL_STRIDE;
        write_efxbn_model_control(&mut bytes, base, control)?;
    }

    Ok(bytes)
}

fn write_efxbn_block(
    bytes: &mut [u8],
    base: usize,
    effect: &EfxbnEffectSummary,
) -> Result<(), String> {
    if effect.control_references.len() != EFXBN_CONTROL_REFERENCE_FIELDS.len() {
        return Err(format!(
            "EFXBN block {} carries {} control references, expected {}.",
            effect.index,
            effect.control_references.len(),
            EFXBN_CONTROL_REFERENCE_FIELDS.len()
        ));
    }
    if effect.reserve_area.len() != EFXBN_BLOCK_RESERVE_AREA_LEN {
        return Err(format!(
            "EFXBN block {} carries {} reserve dwords, expected {EFXBN_BLOCK_RESERVE_AREA_LEN}.",
            effect.index,
            effect.reserve_area.len()
        ));
    }

    write_u32_le(bytes, base, effect.level);
    write_u32_le(bytes, base + 0x04, effect.child_index_size);
    for (slot, child) in effect.child_index_array.iter().enumerate() {
        write_i32_le(bytes, base + 0x08 + slot * 4, *child);
    }
    write_u32_le(bytes, base + 0x28, effect.effect_type);
    write_f32_le(bytes, base + 0x2c, effect.life_time_base);
    write_f32_le(bytes, base + 0x30, effect.life_time_random);
    write_f32_le(bytes, base + 0x34, effect.interval_base);
    write_f32_le(bytes, base + 0x38, effect.interval_random);
    write_u32_le(bytes, base + 0x3c, effect.num_emit);
    write_u32_le(bytes, base + 0x40, effect.action_flags);
    write_u32_le(bytes, base + 0x44, effect.spawn_form_type);
    write_f32x4_le(bytes, base + 0x48, &effect.spawn_form_length);
    for (reference, (_, raw_offset)) in effect
        .control_references
        .iter()
        .zip(EFXBN_CONTROL_REFERENCE_FIELDS.iter())
    {
        let offset = base + *raw_offset as usize;
        write_u32_le(bytes, offset, reference.selector);
        write_u32_le(bytes, offset + 4, reference.lookup_index);
    }
    write_u32_le(bytes, base + 0xd8, effect.internal_element_data_index);
    write_u32_le(bytes, base + 0xdc, effect.enable_data_flag);
    write_f32x4_le(bytes, base + 0xe0, &effect.speed_random);
    write_f32x4_le(bytes, base + 0xf0, &effect.size_base);
    write_f32x4_le(bytes, base + 0x100, &effect.size_random);
    write_f32x4_le(bytes, base + 0x110, &effect.rotation_base);
    write_f32x4_le(bytes, base + 0x120, &effect.rotation_random);
    write_f32x4_le(bytes, base + 0x130, &effect.rotation_speed);
    write_u32_le(bytes, base + 0x140, effect.nud_handle);
    write_u32_le(bytes, base + 0x144, effect.texture_handle);
    write_u32_le(bytes, base + 0x148, effect.pad01[0]);
    write_u32_le(bytes, base + 0x14c, effect.pad01[1]);
    write_i32_le(bytes, base + 0x150, effect.color_texture_parameter_index[0]);
    write_i32_le(bytes, base + 0x154, effect.color_texture_parameter_index[1]);
    write_i32_le(bytes, base + 0x158, effect.uv_texture_parameter_index[0]);
    write_i32_le(bytes, base + 0x15c, effect.uv_texture_parameter_index[1]);
    write_f32_le(bytes, base + 0x160, effect.center_pivot[0]);
    write_f32_le(bytes, base + 0x164, effect.center_pivot[1]);
    write_u32_le(bytes, base + 0x168, effect.delete_settings);
    write_f32_le(bytes, base + 0x16c, effect.fade_time_base);
    write_u32_le(bytes, base + 0x170, effect.culling_type);
    write_u32_le(bytes, base + 0x174, effect.z_write_enable);
    write_u32_le(bytes, base + 0x178, effect.z_test_enable);
    write_u32_le(bytes, base + 0x17c, effect.blend_state);
    write_u32_le(bytes, base + 0x180, effect.draw_repository_index);
    write_u32_le(bytes, base + 0x184, effect.instance_amount_type);
    write_u32_le(bytes, base + 0x188, effect.draw_amount_index);
    write_u32_le(bytes, base + 0x18c, effect.enable_soft_particle);
    write_f32x4_le(bytes, base + 0x190, &effect.position_offset);
    write_f32_le(bytes, base + 0x1a0, effect.delay_emit_time_base);
    write_u32_le(bytes, base + 0x1a4, effect.emit_area_type);
    write_u32_le(bytes, base + 0x1a8, effect.enable_z_sort);
    write_u32_le(bytes, base + 0x1ac, effect.delete_effect_id);
    write_f32x4_le(bytes, base + 0x1b0, &effect.delete_end_scale);
    write_f32_le(bytes, base + 0x1c0, effect.light_attenuation_radius);
    write_u32_le(bytes, base + 0x1c4, effect.lighting_flags);
    write_u32_le(bytes, base + 0x1c8, effect.normal_map_hash);
    write_f32_le(bytes, base + 0x1dc, effect.world_wind_apply_rate);
    write_f32_le(bytes, base + 0x1e0, effect.strip_segment_interval);
    write_f32_le(bytes, base + 0x1e4, effect.strip_segment_length_not_use);
    write_f32_le(bytes, base + 0x1e8, effect.strip_segment_life);
    write_u32_le(bytes, base + 0x1ec, effect.strip_segment_num_not_use);
    write_u32_le(bytes, base + 0x1f0, effect.strip_segment_split_num);
    write_u32_le(bytes, base + 0x1f4, effect.drawer_id);
    write_f32_le(bytes, base + 0x1f8, effect.world_wind_apply_rate_random);
    write_f32_le(bytes, base + 0x1fc, effect.soft_particle_range);
    write_f32_le(bytes, base + 0x200, effect.camera_fade_range);
    write_u32_le(bytes, base + 0x204, effect.extra_flags);
    write_f32_le(bytes, base + 0x208, effect.noise_direction_max_rot);
    write_f32_le(bytes, base + 0x20c, effect.noise_direction_area_range);
    write_f32x4_le(bytes, base + 0x210, &effect.blur_start_color);
    write_f32x4_le(bytes, base + 0x220, &effect.blur_end_color);
    write_f32_le(bytes, base + 0x230, effect.blur_enable_range);
    write_f32_le(bytes, base + 0x234, effect.blur_fade_power);
    write_u32_le(bytes, base + 0x238, effect.light_type);
    write_f32_le(bytes, base + 0x23c, effect.light_base_radius);
    write_f32x4_le(bytes, base + 0x240, &effect.rotation_speed_random);
    write_f32_le(bytes, base + 0x250, effect.camera_offset);
    write_u32_le(bytes, base + 0x254, effect.post_effect_type);
    write_f32_le(bytes, base + 0x258, effect.post_effect_blend_rate);
    write_f32_le(bytes, base + 0x25c, effect.strip_tail_alpha_rate);
    write_f32_le(bytes, base + 0x260, effect.strip_head_alpha_rate);
    write_f32_le(bytes, base + 0x264, effect.emit_interpolate_distance);
    write_f32_le(bytes, base + 0x268, effect.noise_rotate_pos_offset);
    write_f32_le(bytes, base + 0x26c, effect.z_sort_offset);
    write_u32_le(bytes, base + 0x270, effect.special_shader_type);
    write_f32_le(bytes, base + 0x274, effect.reflection_power);
    write_u32_le(bytes, base + 0x278, effect.pass2_blend_type);
    write_f32_le(bytes, base + 0x27c, effect.animation_delay_frame);
    write_f32_le(bytes, base + 0x280, effect.animation_loop_start_frame);
    write_f32_le(bytes, base + 0x284, effect.animation_loop_end_frame);
    write_f32_le(bytes, base + 0x288, effect.animation_delete_frame);
    write_f32_le(bytes, base + 0x28c, effect.animation_speed_rate);
    write_i32_le(bytes, base + 0x290, effect.animation_id);
    write_u32_le(bytes, base + 0x294, effect.animation_blend_delete_frame);
    write_u32_le(bytes, base + 0x298, effect.emitter_lod_type);
    write_f32_le(bytes, base + 0x29c, effect.animation_start_frame);
    write_f32x4_le(bytes, base + 0x2a0, &effect.bounding_sphere_info);
    write_f32_le(bytes, base + 0x2b0, effect.post_effect_shape_radius);
    write_f32_le(bytes, base + 0x2b4, effect.world_water_apply_rate);
    write_u32_le(bytes, base + 0x2b8, effect.num_emit_count_random);
    write_f32_le(bytes, base + 0x2bc, effect.depth_emission_range);
    write_f32_le(bytes, base + 0x2c0, effect.depth_emission_power);
    write_f32_le(bytes, base + 0x2c4, effect.highlight_power);
    write_u32_le(bytes, base + 0x2c8, effect.mesh_emitter_index);
    write_u32_le(bytes, base + 0x2cc, effect.mesh_emitter_count);
    write_u32_le(bytes, base + 0x2d0, effect.field_effect_type);
    write_f32_le(bytes, base + 0x2d4, effect.field_effect_power);
    write_f32_le(bytes, base + 0x2d8, effect.field_effect_interval);
    write_f32_le(bytes, base + 0x2dc, effect.field_effect_angle);
    write_f32_le(bytes, base + 0x2e0, effect.field_effect_frequency);
    write_f32_le(bytes, base + 0x2e4, effect.field_effect_offset);
    write_f32_le(bytes, base + 0x2e8, effect.field_effect_recieve_rate);
    write_f32_le(bytes, base + 0x2ec, effect.field_effect_extra_value1);
    write_u32_le(bytes, base + 0x2f0, effect.emit_interpolate_type);
    for (slot, value) in effect.reserve_area.iter().enumerate() {
        write_u32_le(
            bytes,
            base + EFXBN_BLOCK_RESERVE_AREA_OFFSET + slot * 4,
            *value,
        );
    }
    Ok(())
}

fn write_efxbn_model_control(
    bytes: &mut [u8],
    base: usize,
    control: &EfxbnModelControlSummary,
) -> Result<(), String> {
    if control.reserve_area.len() != EFXBN_MODEL_CONTROL_RESERVE_AREA_LEN {
        return Err(format!(
            "EFXBN model control {} carries {} reserve dwords, expected {EFXBN_MODEL_CONTROL_RESERVE_AREA_LEN}.",
            control.index,
            control.reserve_area.len()
        ));
    }
    write_u32_le(bytes, base, control.input_source_type);
    write_i32_le(bytes, base + 0x04, control.color_map_id);
    write_u32_le(bytes, base + 0x08, control.addressing_mode);
    write_u32_le(bytes, base + 0x0c, control.reverse_u);
    write_u32_le(bytes, base + 0x10, control.reverse_v);
    write_u32_le(bytes, base + 0x14, control.texture_width);
    write_u32_le(bytes, base + 0x18, control.texture_height);
    write_u32_le(bytes, base + 0x1c, control.uv_pattern_type);
    write_f32x4_le(bytes, base + 0x20, &control.uv_u);
    write_f32x4_le(bytes, base + 0x30, &control.uv_v);
    write_f32_le(bytes, base + 0x40, control.uv_scroll_speed);
    write_f32_le(bytes, base + 0x44, control.uv_scroll_limit);
    write_f32_le(bytes, base + 0x48, control.uv_scroll_direction);
    write_u32_le(bytes, base + 0x4c, control.uv_animation_random);
    write_u32_le(bytes, base + 0x50, control.uv_animation_frame_num);
    write_u32_le(bytes, base + 0x54, control.uv_animation_frame_width);
    write_u32_le(bytes, base + 0x58, control.uv_animation_frame_height);
    write_u32_le(bytes, base + 0x5c, control.uv_animation_frame_num_by_line);
    write_u32_le(bytes, base + 0x60, control.uv_animation_frame_time);
    write_u32_le(bytes, base + 0x64, control.uv_animation_3d_texture);
    write_f32_le(bytes, base + 0x68, control.uv_scroll_model_speed_u);
    write_f32_le(bytes, base + 0x6c, control.uv_scroll_model_speed_v);
    write_f32_le(bytes, base + 0x70, control.uv_distortion_power_u);
    write_f32_le(bytes, base + 0x74, control.uv_distortion_power_v);
    write_u32_le(bytes, base + 0x78, control.texture_setting_flags);
    write_u32_le(bytes, base + 0x7c, control.uv_animation_start_frame);
    write_f32_le(bytes, base + 0x80, control.uv_random_offset_u);
    write_f32_le(bytes, base + 0x84, control.uv_random_offset_v);
    for (slot, value) in control.reserve_area.iter().enumerate() {
        write_u32_le(
            bytes,
            base + EFXBN_MODEL_CONTROL_RESERVE_AREA_OFFSET + slot * 4,
            *value,
        );
    }
    Ok(())
}

fn write_u32_le(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

fn write_i32_le(bytes: &mut [u8], offset: usize, value: i32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

/// Floats round-trip through their bit pattern, so a signalling NaN or a negative zero in the
/// source file survives the rebuild unchanged.
fn write_f32_le(bytes: &mut [u8], offset: usize, value: f32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_bits().to_le_bytes());
}

fn write_f32x4_le(bytes: &mut [u8], offset: usize, values: &[f32; 4]) {
    for (slot, value) in values.iter().enumerate() {
        write_f32_le(bytes, offset + slot * 4, *value);
    }
}

/// Byte offset of the first effect block, i.e. the size of the EFXBN header.
/// Native reference: `sub_140145DF0` reads block `i` from `payload + 0x18 + i * 0x370`.
const EFXBN_BLOCK_REGION_OFFSET: usize = 0x18;

/// Size of one effect block. Identical to the shader-reflected `SEfxElementData`,
/// so block offsets and reflected offsets are the same number.
const EFXBN_BLOCK_STRIDE: usize = 0x370;

/// `SEfxElementData.reserve_area[31]` at reflected offset 756, filling the block to `0x370`.
const EFXBN_BLOCK_RESERVE_AREA_OFFSET: usize = 0x2f4;
const EFXBN_BLOCK_RESERVE_AREA_LEN: usize = 31;

/// Size of one model-control (texture parameter) record.
const EFXBN_MODEL_CONTROL_STRIDE: usize = 0xb8;

/// The model control's own trailing reserve dwords, filling the record to `0xb8`.
const EFXBN_MODEL_CONTROL_RESERVE_AREA_OFFSET: usize = 0x88;
const EFXBN_MODEL_CONTROL_RESERVE_AREA_LEN: usize = 12;

/// One curve key is an `(time, value)` float pair. Times run from 0 to 100.
const EFXBN_CURVE_KEY_STRIDE: usize = 8;

/// Curve references declared by `SEfxElementData` as `EfxElementKeyArrayInfo`
/// (`{ uint size; uint curveIndex; }`) at their reflected offsets.
const EFXBN_CONTROL_REFERENCE_FIELDS: [(&str, u32); 18] = [
    ("spawnForm0", 0x58),
    ("spawnForm1", 0x60),
    ("spawnForm2", 0x68),
    ("spawnForm3", 0x70),
    ("spreadX", 0x78),
    ("spreadY", 0x80),
    ("speedBaseX", 0x88),
    ("speedBaseY", 0x90),
    ("speedBaseZ", 0x98),
    ("scaleBaseX", 0xa0),
    ("scaleBaseY", 0xa8),
    ("scaleBaseZ", 0xb0),
    ("colorR", 0xb8),
    ("colorG", 0xc0),
    ("colorB", 0xc8),
    ("colorA", 0xd0),
    ("worldGravityAccel", 0x1cc),
    ("directionAccel", 0x1d4),
];

fn efxbn_unknown_todo() -> EfxbnTodo {
    EfxbnTodo {
        unknowns: vec![
            EfxbnUnknownTodo {
                field: "effects[].reserveArea".to_string(),
                status: "unk".to_string(),
                reason: "SEfxElementData declares reserve_area[31] at offset 756; the corpus keeps it zero and no shader or CPU consumer reads it."
                    .to_string(),
                follow_up: "Only name entries after a nonzero corpus example appears.".to_string(),
            },
            EfxbnUnknownTodo {
                field: "effects[].pad01".to_string(),
                status: "unk".to_string(),
                reason: "SEfxElementData declares pad01[2] at offset 328 between textureHandle and the parameter slots; no shader reads it."
                    .to_string(),
                follow_up: "Carried verbatim by build_efxbn_bytes; name it only if a nonzero corpus example appears."
                    .to_string(),
            },
            EfxbnUnknownTodo {
                field: "effects[].controlReferences".to_string(),
                status: "partial".to_string(),
                reason: "Control selectors/lookup indices are parsed, but final authoring labels for several ctrlNN lanes remain unresolved."
                    .to_string(),
                follow_up: "Keep ctrlNN names until each lane has an anchored consumer and authoring label."
                    .to_string(),
            },
            EfxbnUnknownTodo {
                field: "trailingRaw".to_string(),
                status: "unkRaw".to_string(),
                reason: "Current EXVS2 corpus has true trailing length 0; Tauri summary preserves offsets/sizes without emitting full raw hex for inventory payloads."
                    .to_string(),
                follow_up: "Investigate only if a real file contains post-model-control bytes.".to_string(),
            },
        ],
    }
}

pub fn validate_effect_folder_for_repack(
    effect_root: &str,
    structure_json_path: Option<&str>,
) -> EffectFolderValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let root_path = PathBuf::from(effect_root);
    let structure_path =
        resolve_structure_path(&root_path, structure_json_path).unwrap_or_else(|_| {
            root_path
                .parent()
                .unwrap_or_else(|| Path::new("."))
                .join("_structure.json")
        });

    if !root_path.is_dir() {
        push_error(
            &mut errors,
            "input",
            None,
            format!("Effect root is not a directory: {}", root_path.display()),
            Some(&root_path),
        );
        return validation_result(effect_root, &structure_path, errors, warnings, None);
    }

    let structure = match read_structure_file(&structure_path) {
        Ok(value) => value,
        Err(error) => {
            push_error(&mut errors, "structure", None, error, Some(&structure_path));
            return validation_result(effect_root, &structure_path, errors, warnings, None);
        }
    };
    let json_dir = structure_path.parent().unwrap_or_else(|| Path::new("."));

    if let Some(expected) = structure
        .value
        .get("Fhm2dTotalCount")
        .and_then(Value::as_u64)
        .map(|v| v as usize)
    {
        if expected != structure.sub_file_data.len() {
            push_error(
                &mut errors,
                "structure",
                None,
                format!(
                    "Fhm2dTotalCount is {expected}, but SubFileData has {} entries.",
                    structure.sub_file_data.len()
                ),
                Some(&structure_path),
            );
        }
    }

    let data_by_index = match build_file_record_map(&structure.sub_file_data, json_dir) {
        Ok(map) => map,
        Err(error) => {
            push_error(&mut errors, "structure", None, error, Some(&structure_path));
            HashMap::new()
        }
    };

    let forest = match parse_forest(&structure.sub_file_structure) {
        Ok(nodes) => nodes,
        Err(error) => {
            push_error(&mut errors, "structure", None, error, Some(&structure_path));
            Vec::new()
        }
    };

    for record in data_by_index.values() {
        if !record.path.is_file() {
            push_error(
                &mut errors,
                "files",
                Some(&record.file_url),
                format!("Missing file: {}", record.file_url),
                Some(&record.path),
            );
        } else if is_nonempty_required_model_ext(&record.actual_ext) {
            match fs::metadata(&record.path) {
                Ok(meta) if meta.len() == 0 => push_error(
                    &mut errors,
                    "models",
                    Some(&record.file_url),
                    "Required model file is empty placeholder.",
                    Some(&record.path),
                ),
                Ok(_) => {}
                Err(error) => push_error(
                    &mut errors,
                    "files",
                    Some(&record.file_url),
                    format!("Failed to stat file: {error}"),
                    Some(&record.path),
                ),
            }
        }
    }

    let mut models = Vec::new();
    collect_models(&forest, &data_by_index, &mut models);
    for model in &models {
        if !model.missing_required_exts.is_empty() {
            push_error(
                &mut errors,
                "models",
                Some(&model.name),
                format!(
                    "Model folder is missing required file type(s): {}.",
                    model.missing_required_exts.join(", ")
                ),
                None::<&Path>,
            );
        }
    }

    let model_hashes: HashSet<i32> = models.iter().map(|m| m.hash.signed).collect();
    let common_model_hashes: HashSet<i32> = match collect_common_pack(&root_path, &mut warnings) {
        Ok(pack) => pack
            .map(|pack| pack.models.iter().map(|model| model.hash.signed).collect())
            .unwrap_or_default(),
        Err(error) => {
            push_error(&mut errors, "structure", None, error, Some(&structure_path));
            HashSet::new()
        }
    };
    let mut efxbn_count = 0usize;
    let mut texture_count = 0usize;
    let mut unresolved = BTreeSet::new();
    let mut from_common = BTreeSet::new();
    let mut seen_hash_by_kind: HashSet<(String, i32)> = HashSet::new();
    for item in collect_items(&forest) {
        let Some(file_index) = item.file_index() else {
            continue;
        };
        let Some(record) = data_by_index.get(&file_index) else {
            push_error(
                &mut errors,
                "structure",
                None,
                format!(
                    "SubFileStructure item references missing fileIndex {}.",
                    file_index
                ),
                Some(&structure_path),
            );
            continue;
        };
        if record.actual_ext == ".efxbn" {
            efxbn_count += 1;
            if let Some(hash) = item.item_entry().and_then(item_hash) {
                if !seen_hash_by_kind.insert(("efxbn".into(), hash)) {
                    warnings.push(format!(
                        "Duplicate efxbn hash {}.",
                        EffectFolderHash::from_i32(hash).hex
                    ));
                }
            }
            match parse_efxbn_file(record.path.to_string_lossy().as_ref()) {
                Ok(summary) => {
                    for problem in validate_efxbn_summary(&summary) {
                        push_error(
                            &mut errors,
                            "efxbn",
                            Some(&record.file_url),
                            problem,
                            Some(&record.path),
                        );
                    }
                    for hash in summary.model_ids {
                        classify_resource_reference(
                            hash.signed,
                            &model_hashes,
                            &common_model_hashes,
                            &mut from_common,
                            &mut unresolved,
                        );
                    }
                }
                Err(error) => push_error(
                    &mut errors,
                    "efxbn",
                    Some(&record.file_url),
                    error,
                    Some(&record.path),
                ),
            }
        } else if record.actual_ext == ".nutexb" {
            texture_count += 1;
            if let Some(hash) = item.item_entry().and_then(item_hash) {
                if !seen_hash_by_kind.insert(("nutexb".into(), hash)) {
                    warnings.push(format!(
                        "Duplicate texture hash {}.",
                        EffectFolderHash::from_i32(hash).hex
                    ));
                }
            }
        }
    }
    if !from_common.is_empty() {
        warnings.push(format!(
            "Resolved {} model reference(s) from the shared pack {EFFECT_FOLDER_COMMON_PACK_NAME}.",
            from_common.len()
        ));
    }
    for hash in &unresolved {
        warnings.push(format!(
            "EFXBN references modelId {} that exists in neither this pack nor {EFFECT_FOLDER_COMMON_PACK_NAME}.",
            EffectFolderHash::from_i32(*hash).hex
        ));
    }

    validation_result(
        effect_root,
        &structure_path,
        errors,
        warnings,
        Some(EffectFolderValidationSummary {
            total_files: structure.sub_file_data.len(),
            efxbn_count,
            model_count: models.len(),
            texture_count,
            unresolved_model_id_count: unresolved.len(),
        }),
    )
}

pub fn import_effect_file(
    effect_root: &str,
    structure_json_path: Option<&str>,
    source_path: Option<&str>,
    kind: &str,
    hash_id: i32,
    target_filename: Option<&str>,
) -> Result<EffectFolderMutationResult, String> {
    let root_path = validate_dir(effect_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let json_dir = structure_path.parent().unwrap_or_else(|| Path::new("."));
    let mut structure = read_structure_file(&structure_path)?;
    let mut forest = parse_forest(&structure.sub_file_structure)?;
    let data_by_index = build_file_record_map(&structure.sub_file_data, json_dir)?;
    let ext = effect_file_kind_ext(kind)?;
    let unk2 = if ext == ".nutexb" {
        "01000000"
    } else {
        "00000000"
    };
    let source = source_path.map(PathBuf::from);
    if let Some(path) = &source {
        if !path.is_file() {
            return Err(format!("Source file does not exist: {}", path.display()));
        }
    }

    let base_name = target_filename
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            source.as_ref().and_then(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .map(str::to_string)
            })
        })
        .unwrap_or_else(|| format!("{}_{}", kind, EffectFolderHash::from_i32(hash_id).hex));
    let filename = ensure_extension(&base_name, ext);
    let target_dir = primary_file_dir(&root_path, &data_by_index);
    let target = unique_child_path(&target_dir, &filename);
    if let Some(path) = &source {
        copy_one_file(path, &target)?;
    } else {
        write_placeholder_file(&target, ext)?;
    }

    let file_index = next_file_index(&structure.sub_file_data);
    let file_url = file_url_for_target(json_dir, &target);
    let display_name = stem(&filename);
    structure.sub_file_data.push(json!({
        "index": structure.sub_file_data.len(),
        "fileType": ext,
        "fileIndex": file_index,
        "fileUrl": file_url,
        "fileBaseName": display_name,
    }));
    append_to_primary_container(
        &mut forest,
        &data_by_index,
        Node::Item {
            entry_index: 0,
            entry: make_item(file_index, unk2, hash_id, &display_name),
            file_index,
        },
    );
    write_structure_file(&structure_path, &mut structure, &forest)?;

    Ok(EffectFolderMutationResult {
        effect_root: root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        total_files: structure.sub_file_data.len(),
        added_files: vec![target.to_string_lossy().to_string()],
        removed_files: vec![],
        warnings: vec![],
    })
}

pub fn import_effect_model_folder(
    effect_root: &str,
    structure_json_path: Option<&str>,
    source_dir: Option<&str>,
    model_hash_id: i32,
    target_folder_name: Option<&str>,
) -> Result<EffectFolderMutationResult, String> {
    let root_path = validate_dir(effect_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let json_dir = structure_path.parent().unwrap_or_else(|| Path::new("."));
    let mut structure = read_structure_file(&structure_path)?;
    let mut forest = parse_forest(&structure.sub_file_structure)?;
    let data_by_index = build_file_record_map(&structure.sub_file_data, json_dir)?;
    let base_folder_name = target_folder_name
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| {
            source_dir.and_then(|dir| {
                Path::new(dir)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(str::to_string)
            })
        })
        .unwrap_or_else(|| EffectFolderHash::from_i32(model_hash_id).hex);
    let model_dir = unique_child_path(
        &primary_file_dir(&root_path, &data_by_index),
        &base_folder_name,
    );
    let source_files = if let Some(dir) = source_dir {
        scan_source_model_files(Path::new(dir))?
    } else {
        Vec::new()
    };
    let model_name =
        model_name_from_files(&source_files).unwrap_or_else(|| sanitize_stem(&base_folder_name));
    let files_to_create = if source_files.is_empty() {
        vec![
            (None, format!("{model_name}.nusktb"), ".nusktb".to_string()),
            (None, format!("{model_name}.numshb"), ".numshb".to_string()),
            (None, format!("{model_name}.numdlb"), ".numdlb".to_string()),
            (None, format!("{model_name}.jnttbl"), ".jnttbl".to_string()),
        ]
    } else {
        source_files
            .iter()
            .map(|path| {
                let filename = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("file.bin")
                    .to_string();
                let ext = extension_from_name(&filename);
                (Some(path.clone()), filename, ext)
            })
            .collect()
    };
    validate_model_ext_set(&files_to_create)?;

    fs::create_dir_all(&model_dir)
        .map_err(|e| format!("Failed to create model dir {}: {e}", model_dir.display()))?;
    let mut children = Vec::new();
    let mut added = Vec::new();
    for (source, filename, ext) in files_to_create {
        let target = model_dir.join(&filename);
        if let Some(source_path) = source {
            copy_one_file(&source_path, &target)?;
        } else {
            fs::write(&target, [])
                .map_err(|e| format!("Failed to create placeholder {}: {e}", target.display()))?;
        }
        added.push(target.to_string_lossy().to_string());
        let file_index = next_file_index(&structure.sub_file_data);
        let file_type = file_type_for_ext(&ext);
        let file_url = file_url_for_target(json_dir, &target);
        let display_name = stem(&filename);
        structure.sub_file_data.push(json!({
            "index": structure.sub_file_data.len(),
            "fileType": file_type,
            "fileIndex": file_index,
            "fileUrl": file_url,
            "fileBaseName": display_name,
        }));
        children.push(Node::Item {
            entry_index: 0,
            entry: make_item(
                file_index,
                item_unk2_for_ext(&ext),
                item_unk3_for_ext(&ext),
                &display_name,
            ),
            file_index,
        });
    }
    append_to_primary_container(
        &mut forest,
        &data_by_index,
        Node::Folder {
            entry_index: 0,
            entry: make_folder(2, model_hash_id),
            children,
        },
    );
    write_structure_file(&structure_path, &mut structure, &forest)?;

    Ok(EffectFolderMutationResult {
        effect_root: root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        total_files: structure.sub_file_data.len(),
        added_files: added,
        removed_files: vec![],
        warnings: vec![],
    })
}

/// Update the structure Item hash (`unk3`) for one file index.
///
/// The value is always stored as a JSON number (i32). Callers may compute it
/// from a direct hex/decimal edit or from an IEEE CRC32 of a string seed.
pub fn update_effect_folder_item_hash(
    effect_root: &str,
    structure_json_path: Option<&str>,
    file_index: i32,
    hash_id: i32,
) -> Result<EffectFolderMutationResult, String> {
    let root_path = validate_dir(effect_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let mut structure = read_structure_file(&structure_path)?;
    let mut forest = parse_forest(&structure.sub_file_structure)?;

    if !set_item_hash_in_forest(&mut forest, file_index, hash_id) {
        return Err(format!(
            "No structure Item found for fileIndex {file_index}."
        ));
    }

    write_structure_file(&structure_path, &mut structure, &forest)?;

    Ok(EffectFolderMutationResult {
        effect_root: root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        total_files: structure.sub_file_data.len(),
        added_files: vec![],
        removed_files: vec![],
        warnings: vec![],
    })
}

pub fn delete_effect_folder_entries(
    effect_root: &str,
    structure_json_path: Option<&str>,
    selections: &[EffectFolderSelection],
    delete_files: bool,
) -> Result<EffectFolderMutationResult, String> {
    let root_path = validate_dir(effect_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let json_dir = structure_path.parent().unwrap_or_else(|| Path::new("."));
    let mut structure = read_structure_file(&structure_path)?;
    let mut forest = parse_forest(&structure.sub_file_structure)?;
    let data_by_index = build_file_record_map(&structure.sub_file_data, json_dir)?;
    let mut removed_indices = HashSet::new();
    remove_matching_nodes(
        &mut forest,
        selections,
        &data_by_index,
        &mut removed_indices,
    );
    if removed_indices.is_empty() {
        return Err("No matching effect-folder entries were found.".to_string());
    }

    let mut removed_files = Vec::new();
    let mut next_data = Vec::new();
    for entry in &structure.sub_file_data {
        let file_index = value_file_index(entry);
        if file_index.is_some_and(|idx| removed_indices.contains(&idx)) {
            if let Some(url) = entry.get("fileUrl").and_then(Value::as_str) {
                removed_files.push(url.to_string());
                if delete_files {
                    let path = resolve_file_path(json_dir, url);
                    delete_file_if_under(&root_path, &path);
                }
            }
        } else {
            next_data.push(entry.clone());
        }
    }
    structure.sub_file_data = next_data;
    reindex_sub_file_data(&mut structure.sub_file_data);
    write_structure_file(&structure_path, &mut structure, &forest)?;

    Ok(EffectFolderMutationResult {
        effect_root: root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        total_files: structure.sub_file_data.len(),
        added_files: vec![],
        removed_files,
        warnings: vec![],
    })
}

pub fn copy_effect_folder_selection(
    source_effect_root: &str,
    source_structure_json_path: Option<&str>,
    destination_effect_root: &str,
    destination_structure_json_path: Option<&str>,
    selections: &[EffectFolderSelection],
) -> Result<EffectFolderCopyResult, String> {
    copy_effect_folder_selection_with_policies(
        source_effect_root,
        source_structure_json_path,
        destination_effect_root,
        destination_structure_json_path,
        selections,
        &[],
    )
}

pub fn copy_effect_folder_selection_with_policies(
    source_effect_root: &str,
    source_structure_json_path: Option<&str>,
    destination_effect_root: &str,
    destination_structure_json_path: Option<&str>,
    selections: &[EffectFolderSelection],
    policies: &[EffectFolderCopyEfxbnPolicy],
) -> Result<EffectFolderCopyResult, String> {
    let source_root = validate_dir(source_effect_root)?;
    let source_structure_path = resolve_structure_path(&source_root, source_structure_json_path)?;
    let source_json_dir = source_structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."));
    let source_structure = read_structure_file(&source_structure_path)?;
    let source_data = build_file_record_map(&source_structure.sub_file_data, source_json_dir)?;
    let source_forest = parse_forest(&source_structure.sub_file_structure)?;

    let dest_root = validate_dir(destination_effect_root)?;
    let dest_structure_path = resolve_structure_path(&dest_root, destination_structure_json_path)?;
    let dest_json_dir = dest_structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."));
    let mut dest_structure = read_structure_file(&dest_structure_path)?;
    let mut dest_forest = parse_forest(&dest_structure.sub_file_structure)?;
    let mut dest_data = build_file_record_map(&dest_structure.sub_file_data, dest_json_dir)?;
    let mut copied = Vec::new();
    let mut skipped = Vec::new();
    let mut warnings = Vec::new();
    let mut copied_keys = HashSet::new();

    let closure = build_copy_closure(&source_forest, &source_data, selections, &mut warnings);
    for texture in closure.texture_items {
        append_source_item_to_destination(
            &source_root,
            &dest_root,
            dest_json_dir,
            &mut dest_structure,
            &mut dest_forest,
            &mut dest_data,
            &texture,
            &mut copied,
            &mut skipped,
            &mut copied_keys,
            None,
        )?;
    }
    for model in closure.model_nodes {
        append_source_model_to_destination(
            &source_root,
            &dest_root,
            dest_json_dir,
            &mut dest_structure,
            &mut dest_forest,
            &mut dest_data,
            &model,
            &mut copied,
            &mut skipped,
            &mut copied_keys,
        )?;
    }
    for animation in closure.animation_items {
        append_source_item_to_destination(
            &source_root,
            &dest_root,
            dest_json_dir,
            &mut dest_structure,
            &mut dest_forest,
            &mut dest_data,
            &animation,
            &mut copied,
            &mut skipped,
            &mut copied_keys,
            None,
        )?;
    }
    for efxbn in closure.efxbn_items {
        let file_index = efxbn.file_index();
        let policy = file_index.and_then(|idx| policies.iter().find(|item| item.file_index == idx));
        if policy.is_some_and(|item| item.skip) {
            skipped.push(format!(
                "Kept existing efxbn fileIndex {}.",
                file_index.unwrap_or(-1)
            ));
            continue;
        }
        append_source_item_to_destination(
            &source_root,
            &dest_root,
            dest_json_dir,
            &mut dest_structure,
            &mut dest_forest,
            &mut dest_data,
            &efxbn,
            &mut copied,
            &mut skipped,
            &mut copied_keys,
            policy,
        )?;
    }

    write_structure_file(&dest_structure_path, &mut dest_structure, &dest_forest)?;
    Ok(EffectFolderCopyResult {
        source_effect_root: source_root.to_string_lossy().to_string(),
        destination_effect_root: dest_root.to_string_lossy().to_string(),
        destination_structure_json_path: dest_structure_path.to_string_lossy().to_string(),
        total_files: dest_structure.sub_file_data.len(),
        copied_files: copied,
        skipped,
        warnings,
    })
}

pub fn repack_effect_folder_from_structure(
    structure_json_path: &str,
    output_path: &str,
    atomic_write: bool,
    progress_callback: Option<&dyn Fn(crate::format::fhm2d_pack::RepackProgress)>,
) -> Result<crate::format::fhm2d_pack::RepackResult, String> {
    let structure = PathBuf::from(structure_json_path);
    let effect_root = infer_root_from_structure_path(&structure)?;
    let validation = validate_effect_folder_for_repack(
        &effect_root.to_string_lossy(),
        Some(structure_json_path),
    );
    if !validation.valid {
        let messages = validation
            .errors
            .iter()
            .map(|e| e.message.as_str())
            .collect::<Vec<_>>()
            .join("; ");
        return Err(format!("Effect folder validation failed: {messages}"));
    }
    crate::format::fhm2d_pack::repack_fhm2d_from_structure(
        structure_json_path,
        output_path,
        atomic_write,
        progress_callback,
    )
}

#[derive(Default)]
struct CopyClosure {
    efxbn_items: Vec<Node>,
    model_nodes: Vec<Node>,
    texture_items: Vec<Node>,
    animation_items: Vec<Node>,
}

fn build_copy_closure(
    forest: &[Node],
    data_by_index: &HashMap<i32, FileRecord>,
    selections: &[EffectFolderSelection],
    warnings: &mut Vec<String>,
) -> CopyClosure {
    let mut closure = CopyClosure::default();
    let all_items = collect_items(forest);
    let all_models = collect_model_nodes(forest, data_by_index);
    let mut wanted_model_hashes = BTreeSet::new();
    let mut wanted_texture_hashes = BTreeSet::new();
    let mut wanted_animation_hashes = BTreeSet::new();
    let mut efxbn_in_closure: HashSet<i32> = HashSet::new();
    let mut texture_in_closure: HashSet<i32> = HashSet::new();
    let mut model_in_closure: HashSet<i32> = HashSet::new();

    let push_efxbn =
        |item: &Node, closure: &mut CopyClosure, efxbn_in_closure: &mut HashSet<i32>| {
            let Some(file_index) = item.file_index() else {
                return;
            };
            if efxbn_in_closure.insert(file_index) {
                closure.efxbn_items.push(item.clone());
            }
        };

    let push_texture =
        |item: &Node, closure: &mut CopyClosure, texture_in_closure: &mut HashSet<i32>| {
            let Some(file_index) = item.file_index() else {
                return;
            };
            if texture_in_closure.insert(file_index) {
                closure.texture_items.push(item.clone());
            }
        };

    let push_model =
        |model: &Node, closure: &mut CopyClosure, model_in_closure: &mut HashSet<i32>| {
            let key = folder_hash(model).unwrap_or_else(|| {
                // Fallback: first child file index keeps uniqueness when hash is missing.
                collect_items(std::slice::from_ref(model))
                    .first()
                    .and_then(|item| item.file_index())
                    .unwrap_or(0)
            });
            if model_in_closure.insert(key) {
                closure.model_nodes.push(model.clone());
            }
        };

    // Seed from user selection.
    for item in &all_items {
        let Some(file_index) = item.file_index() else {
            continue;
        };
        let Some(record) = data_by_index.get(&file_index) else {
            continue;
        };
        if !selections
            .iter()
            .any(|selection| selection_matches_item(selection, item, record))
        {
            continue;
        }
        match record.actual_ext.as_str() {
            ".efxbn" => {
                push_efxbn(item, &mut closure, &mut efxbn_in_closure);
            }
            ".nutexb" => push_texture(item, &mut closure, &mut texture_in_closure),
            _ => {}
        }
    }

    for model in &all_models {
        if selections
            .iter()
            .any(|selection| selection_matches_model(selection, model, data_by_index))
        {
            push_model(model, &mut closure, &mut model_in_closure);
        }
    }

    // Read direct EFXBN resource IDs. Control references are curve selectors,
    // not FHM2D file indices, so they must never expand the copy set.
    for item in closure.efxbn_items.clone() {
        let Some(efxbn_index) = item.file_index() else {
            continue;
        };
        let Some(record) = data_by_index.get(&efxbn_index) else {
            continue;
        };
        if record.actual_ext != ".efxbn" {
            continue;
        }
        match parse_efxbn_file(record.path.to_string_lossy().as_ref()) {
            Ok(summary) => {
                absorb_efxbn_summary_refs(
                    &summary,
                    &mut wanted_model_hashes,
                    &mut wanted_texture_hashes,
                    &mut wanted_animation_hashes,
                );
            }
            Err(error) => warnings.push(format!(
                "Failed to parse efxbn {}: {error}",
                record.file_url
            )),
        }
    }

    // Models referenced by hash (meta modelId).
    for model in &all_models {
        let model_hash = folder_hash(model);
        if model_hash.is_some_and(|hash| wanted_model_hashes.contains(&hash)) {
            push_model(model, &mut closure, &mut model_in_closure);
        }
    }

    // Material textures are transitive dependencies of source-owned models.
    // Missing resource IDs stay silent because EXVS2 may use global pools.
    for model in &closure.model_nodes {
        let model_files = model_from_node(model, data_by_index).files;
        match collect_model_material_texture_ids(&model_files) {
            Ok(ids) => {
                wanted_texture_hashes.extend(ids.into_iter().map(|hash| hash.signed));
            }
            Err(error) => warnings.push(format!(
                "Failed to read copied model material textures: {error}"
            )),
        }
    }

    // Textures referenced by model-control blocks or copied model materials.
    for item in &all_items {
        let Some(file_index) = item.file_index() else {
            continue;
        };
        let Some(record) = data_by_index.get(&file_index) else {
            continue;
        };
        if record.actual_ext != ".nutexb" {
            continue;
        }
        if item
            .item_entry()
            .and_then(item_hash)
            .is_some_and(|hash| wanted_texture_hashes.contains(&hash))
        {
            push_texture(item, &mut closure, &mut texture_in_closure);
        }
    }

    // Animation IDs are filename-stem CRC32 values. Copy only matching source
    // NUANMB files; globally resolved animations are intentionally ignored.
    let copied_model_file_indices: HashSet<i32> = closure
        .model_nodes
        .iter()
        .flat_map(|model| collect_items(std::slice::from_ref(model)))
        .filter_map(|item| item.file_index())
        .collect();
    let mut animation_in_closure = HashSet::new();
    for item in &all_items {
        let Some(file_index) = item.file_index() else {
            continue;
        };
        if copied_model_file_indices.contains(&file_index) {
            continue;
        }
        let Some(record) = data_by_index.get(&file_index) else {
            continue;
        };
        if record.actual_ext == ".nuanmb"
            && item
                .item_entry()
                .and_then(item_hash)
                .is_some_and(|hash| wanted_animation_hashes.contains(&hash))
            && animation_in_closure.insert(file_index)
        {
            closure.animation_items.push((*item).clone());
        }
    }

    closure
}

fn absorb_efxbn_summary_refs(
    summary: &EfxbnSummary,
    wanted_model_hashes: &mut BTreeSet<i32>,
    wanted_texture_hashes: &mut BTreeSet<i32>,
    wanted_animation_hashes: &mut BTreeSet<i32>,
) {
    for hash in &summary.model_ids {
        if hash.signed != 0 {
            wanted_model_hashes.insert(hash.signed);
        }
    }
    for hash in &summary.model_control_texture_ids {
        if hash.signed != 0 {
            wanted_texture_hashes.insert(hash.signed);
        }
    }
    for hash in &summary.animation_ids {
        if hash.signed != 0 {
            wanted_animation_hashes.insert(hash.signed);
        }
    }
}

fn append_source_item_to_destination(
    source_root: &Path,
    dest_root: &Path,
    dest_json_dir: &Path,
    dest_structure: &mut StructureFile,
    dest_forest: &mut Vec<Node>,
    dest_data: &mut HashMap<i32, FileRecord>,
    source_item: &Node,
    copied: &mut Vec<String>,
    skipped: &mut Vec<String>,
    copied_keys: &mut HashSet<String>,
    policy: Option<&EffectFolderCopyEfxbnPolicy>,
) -> Result<(), String> {
    let Node::Item {
        entry, file_index, ..
    } = source_item
    else {
        return Ok(());
    };
    let source_map = build_file_record_map_for_node(source_root, source_item)?;
    let Some(source_record) = source_map.get(file_index) else {
        return Ok(());
    };
    let hash = item_hash(entry).unwrap_or(0);
    let key = format!("{}:{hash}", source_record.actual_ext);
    if !copied_keys.insert(key.clone()) {
        return Ok(());
    }
    let overwrite = policy.is_some_and(|item| item.overwrite);
    let dest_name = match policy.and_then(|item| {
        item.dest_file_name
            .as_deref()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(ToOwned::to_owned)
    }) {
        Some(name) => Some(sanitize_effect_copy_dest_file_name(&name)?),
        None => None,
    };
    if destination_has_item_hash(dest_forest, dest_data, &source_record.actual_ext, hash) {
        if overwrite {
            let dest_record =
                find_dest_record_by_hash(dest_forest, dest_data, &source_record.actual_ext, hash)
                    .ok_or_else(|| {
                    format!(
                        "Destination already has {} hash {} but the file record is missing.",
                        source_record.actual_ext,
                        EffectFolderHash::from_i32(hash).hex
                    )
                })?;
            let dest_path = dest_record.path.clone();
            copy_one_file_replace(&source_record.path, &dest_path)?;
            copied.push(dest_path.to_string_lossy().to_string());
            return Ok(());
        }
        skipped.push(format!(
            "Destination already has {} hash {}.",
            source_record.actual_ext,
            EffectFolderHash::from_i32(hash).hex
        ));
        return Ok(());
    }
    if overwrite {
        return Err(format!(
            "Overwrite requested for {} hash {}, but the destination pack does not have it.",
            source_record.actual_ext,
            EffectFolderHash::from_i32(hash).hex
        ));
    }

    let target_dir = primary_file_dir(dest_root, dest_data);
    let source_filename = source_record
        .path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("effect_file.bin");
    let filename = dest_name.as_deref().unwrap_or(source_filename);
    let filename = if source_record.actual_ext == ".efxbn" {
        ensure_extension(filename, ".efxbn")
    } else {
        filename.to_string()
    };
    let target = if dest_name.is_some() {
        let candidate = target_dir.join(&filename);
        if candidate.exists() {
            return Err(format!(
                "Destination already has file {}.",
                candidate.display()
            ));
        }
        candidate
    } else {
        unique_child_path(&target_dir, &filename)
    };
    copy_one_file(&source_record.path, &target)?;
    let new_file_index = next_file_index(&dest_structure.sub_file_data);
    let file_url = file_url_for_target(dest_json_dir, &target);
    let display_name = source_record.file_base_name.clone();
    dest_structure.sub_file_data.push(json!({
        "index": dest_structure.sub_file_data.len(),
        "fileType": source_record.file_type,
        "fileIndex": new_file_index,
        "fileUrl": file_url,
        "fileBaseName": display_name,
    }));
    let mut new_entry = entry.clone();
    if let SubFileStructureEntry::Item {
        file_index,
        original_file_index,
        ..
    } = &mut new_entry
    {
        *file_index = new_file_index;
        *original_file_index = new_file_index;
    }
    let node = Node::Item {
        entry_index: 0,
        entry: new_entry,
        file_index: new_file_index,
    };
    append_to_primary_container(dest_forest, dest_data, node);
    let record =
        file_record_from_value(dest_structure.sub_file_data.last().unwrap(), dest_json_dir)?;
    dest_data.insert(new_file_index, record);
    copied.push(target.to_string_lossy().to_string());
    Ok(())
}

fn append_source_model_to_destination(
    source_root: &Path,
    dest_root: &Path,
    dest_json_dir: &Path,
    dest_structure: &mut StructureFile,
    dest_forest: &mut Vec<Node>,
    dest_data: &mut HashMap<i32, FileRecord>,
    source_model: &Node,
    copied: &mut Vec<String>,
    skipped: &mut Vec<String>,
    copied_keys: &mut HashSet<String>,
) -> Result<(), String> {
    let Some(model_hash) = folder_hash(source_model) else {
        return Ok(());
    };
    let key = format!("model:{model_hash}");
    if !copied_keys.insert(key) {
        return Ok(());
    }
    if destination_has_model_hash(dest_forest, model_hash) {
        skipped.push(format!(
            "Destination already has model hash {}.",
            EffectFolderHash::from_i32(model_hash).hex
        ));
        return Ok(());
    }
    let source_map = build_file_record_map_for_node(source_root, source_model)?;
    let source_items = collect_items(std::slice::from_ref(source_model));
    let first_record = source_items
        .iter()
        .find_map(|item| item.file_index().and_then(|idx| source_map.get(&idx)))
        .ok_or_else(|| "Source model has no copyable files.".to_string())?;
    let source_model_dir = first_record.path.parent().ok_or_else(|| {
        format!(
            "Cannot infer model dir from {}",
            first_record.path.display()
        )
    })?;
    let folder_name = source_model_dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("model");
    let dest_model_dir = unique_child_path(&primary_file_dir(dest_root, dest_data), folder_name);
    fs::create_dir_all(&dest_model_dir).map_err(|e| {
        format!(
            "Failed to create model dir {}: {e}",
            dest_model_dir.display()
        )
    })?;

    let mut file_index_map = HashMap::new();
    for item in &source_items {
        let Some(old_file_index) = item.file_index() else {
            continue;
        };
        let Some(record) = source_map.get(&old_file_index) else {
            continue;
        };
        let filename = record
            .path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("model_file.bin");
        let target = unique_child_path(&dest_model_dir, filename);
        copy_one_file(&record.path, &target)?;
        let new_file_index = next_file_index(&dest_structure.sub_file_data);
        let file_url = file_url_for_target(dest_json_dir, &target);
        dest_structure.sub_file_data.push(json!({
            "index": dest_structure.sub_file_data.len(),
            "fileType": record.file_type,
            "fileIndex": new_file_index,
            "fileUrl": file_url,
            "fileBaseName": record.file_base_name,
        }));
        let new_record =
            file_record_from_value(dest_structure.sub_file_data.last().unwrap(), dest_json_dir)?;
        dest_data.insert(new_file_index, new_record);
        file_index_map.insert(old_file_index, new_file_index);
        copied.push(target.to_string_lossy().to_string());
    }
    let cloned = remap_node_file_indices(source_model, &file_index_map);
    append_to_primary_container(dest_forest, dest_data, cloned);
    Ok(())
}

fn build_file_record_map_for_node(
    root: &Path,
    node: &Node,
) -> Result<HashMap<i32, FileRecord>, String> {
    let structure = resolve_structure_path(root, None)?;
    let json_dir = structure.parent().unwrap_or_else(|| Path::new("."));
    let loaded = read_structure_file(&structure)?;
    let map = build_file_record_map(&loaded.sub_file_data, json_dir)?;
    let needed: HashSet<i32> = collect_items(std::slice::from_ref(node))
        .into_iter()
        .filter_map(Node::file_index)
        .collect();
    Ok(map
        .into_iter()
        .filter(|(idx, _)| needed.contains(idx))
        .collect())
}

fn remap_node_file_indices(node: &Node, map: &HashMap<i32, i32>) -> Node {
    match node {
        Node::Item {
            entry_index,
            entry,
            file_index,
        } => {
            let new_index = map.get(file_index).copied().unwrap_or(*file_index);
            let mut new_entry = entry.clone();
            if let SubFileStructureEntry::Item {
                file_index,
                original_file_index,
                ..
            } = &mut new_entry
            {
                *file_index = new_index;
                *original_file_index = new_index;
            }
            Node::Item {
                entry_index: *entry_index,
                entry: new_entry,
                file_index: new_index,
            }
        }
        Node::Folder {
            entry_index,
            entry,
            children,
        } => Node::Folder {
            entry_index: *entry_index,
            entry: entry.clone(),
            children: children
                .iter()
                .map(|child| remap_node_file_indices(child, map))
                .collect(),
        },
    }
}

fn validate_dir(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("effect_root cannot be empty.".to_string());
    }
    let path = PathBuf::from(trimmed);
    if !path.is_dir() {
        return Err(format!("Effect folder does not exist: {}", path.display()));
    }
    Ok(path)
}

fn resolve_structure_path(root: &Path, explicit: Option<&str>) -> Result<PathBuf, String> {
    if let Some(path) = explicit.map(str::trim).filter(|s| !s.is_empty()) {
        return Ok(PathBuf::from(path));
    }
    let parent = root.parent().ok_or_else(|| {
        format!(
            "Cannot resolve sibling structure JSON for {}",
            root.display()
        )
    })?;
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Invalid effect root name: {}", root.display()))?;
    Ok(parent.join(format!("{name}_structure.json")))
}

fn infer_root_from_structure_path(structure_path: &Path) -> Result<PathBuf, String> {
    let parent = structure_path.parent().ok_or_else(|| {
        format!(
            "Cannot infer effect root from structure JSON {}",
            structure_path.display()
        )
    })?;
    let stem = structure_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Invalid structure JSON path: {}", structure_path.display()))?
        .trim_end_matches("_structure.json")
        .trim_end_matches(".json")
        .to_string();
    Ok(parent.join(stem))
}

fn read_structure_file(path: &Path) -> Result<StructureFile, String> {
    if !path.is_file() {
        return Err(format!("Missing structure JSON: {}", path.display()));
    }
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read structure JSON {}: {e}", path.display()))?;
    let value: Value = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse structure JSON {}: {e}", path.display()))?;
    let sub_file_data = value
        .get("SubFileData")
        .and_then(Value::as_array)
        .ok_or_else(|| "Structure JSON missing SubFileData array".to_string())?
        .clone();
    let sub_file_structure: Vec<SubFileStructureEntry> = serde_json::from_value(
        value
            .get("SubFileStructure")
            .cloned()
            .ok_or_else(|| "Structure JSON missing SubFileStructure".to_string())?,
    )
    .map_err(|e| format!("Failed to parse SubFileStructure: {e}"))?;
    Ok(StructureFile {
        value,
        sub_file_data,
        sub_file_structure,
    })
}

fn write_structure_file(
    path: &Path,
    structure: &mut StructureFile,
    forest: &[Node],
) -> Result<(), String> {
    let mut flat = Vec::new();
    for node in forest {
        serialize_node(node, &mut flat);
    }
    reindex_sub_file_data(&mut structure.sub_file_data);
    let obj = structure
        .value
        .as_object_mut()
        .ok_or_else(|| "Structure JSON root must be an object".to_string())?;
    obj.insert(
        "Fhm2dTotalCount".to_string(),
        json!(structure.sub_file_data.len()),
    );
    obj.insert(
        "SubFileData".to_string(),
        Value::Array(structure.sub_file_data.clone()),
    );
    obj.insert(
        "SubFileStructure".to_string(),
        serde_json::to_value(&flat)
            .map_err(|e| format!("Failed to serialize SubFileStructure: {e}"))?,
    );
    let serialized = serde_json::to_string_pretty(&structure.value)
        .map_err(|e| format!("Failed to serialize structure JSON: {e}"))?;
    atomic_write_text(path, &format!("{serialized}\n"))
}

fn atomic_write_text(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Structure JSON has no parent: {}", path.display()))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("structure.json");
    let temp_path = parent.join(format!(".{file_name}.effect-folder.tmp"));
    fs::write(&temp_path, contents).map_err(|e| {
        format!(
            "Failed to write temp structure JSON {}: {e}",
            temp_path.display()
        )
    })?;
    if !path.exists() {
        return fs::rename(&temp_path, path)
            .map_err(|e| format!("Failed to replace structure JSON {}: {e}", path.display()));
    }

    let backup_path = parent.join(format!(".{file_name}.effect-folder-backup"));
    if backup_path.exists() {
        fs::remove_file(&backup_path)
            .map_err(|e| format!("Failed to remove stale structure backup: {e}"))?;
    }
    fs::rename(path, &backup_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("Failed to prepare structure JSON replacement: {e}")
    })?;
    if let Err(error) = fs::rename(&temp_path, path) {
        let _ = fs::rename(&backup_path, path);
        let _ = fs::remove_file(&temp_path);
        return Err(format!("Failed to replace structure JSON: {error}"));
    }
    let _ = fs::remove_file(&backup_path);
    Ok(())
}

fn parse_forest(entries: &[SubFileStructureEntry]) -> Result<Vec<Node>, String> {
    let entries = expand_endmarks(entries);
    let mut cursor = 0usize;
    let mut out = Vec::new();
    while cursor < entries.len() {
        if matches!(entries[cursor], SubFileStructureEntry::EndMark { .. }) {
            cursor += 1;
            continue;
        }
        out.push(parse_node(&entries, &mut cursor)?);
    }
    Ok(out)
}

fn expand_endmarks(entries: &[SubFileStructureEntry]) -> Vec<SubFileStructureEntry> {
    let mut out = Vec::new();
    for entry in entries {
        match entry {
            SubFileStructureEntry::EndMark { end_mark_count } => {
                for _ in 0..(*end_mark_count).max(1) {
                    out.push(SubFileStructureEntry::EndMark { end_mark_count: 1 });
                }
            }
            other => out.push(other.clone()),
        }
    }
    out
}

fn parse_node(entries: &[SubFileStructureEntry], cursor: &mut usize) -> Result<Node, String> {
    let entry_index = *cursor;
    match entries
        .get(*cursor)
        .ok_or_else(|| "SubFileStructure cursor out of range.".to_string())?
        .clone()
    {
        SubFileStructureEntry::Folder { folder_count, .. } => {
            let entry = entries[entry_index].clone();
            *cursor += 1;
            let mut children = Vec::new();
            for _ in 0..folder_count.max(0) {
                if *cursor >= entries.len() {
                    return Err(format!(
                        "Folder entry {entry_index} ended before folderCount children."
                    ));
                }
                if matches!(entries[*cursor], SubFileStructureEntry::EndMark { .. }) {
                    return Err(format!(
                        "Folder entry {entry_index} hit EndMark before folderCount children."
                    ));
                }
                children.push(parse_node(entries, cursor)?);
            }
            if matches!(
                entries.get(*cursor),
                Some(SubFileStructureEntry::EndMark { .. })
            ) {
                *cursor += 1;
            } else {
                return Err(format!("Folder entry {entry_index} is missing EndMark."));
            }
            Ok(Node::Folder {
                entry_index,
                entry,
                children,
            })
        }
        SubFileStructureEntry::Item { file_index, .. } => {
            let entry = entries[entry_index].clone();
            *cursor += 1;
            Ok(Node::Item {
                entry_index,
                entry,
                file_index,
            })
        }
        SubFileStructureEntry::EndMark { .. } => {
            Err(format!("Unexpected EndMark at entry {entry_index}."))
        }
    }
}

fn serialize_node(node: &Node, out: &mut Vec<SubFileStructureEntry>) {
    match node {
        Node::Item { entry, .. } => out.push(entry.clone()),
        Node::Folder {
            entry, children, ..
        } => {
            let mut folder = entry.clone();
            if let SubFileStructureEntry::Folder { folder_count, .. } = &mut folder {
                *folder_count = children.len() as i32;
            }
            out.push(folder);
            for child in children {
                serialize_node(child, out);
            }
            out.push(SubFileStructureEntry::EndMark { end_mark_count: 1 });
        }
    }
}

fn build_file_record_map(
    entries: &[Value],
    json_dir: &Path,
) -> Result<HashMap<i32, FileRecord>, String> {
    let mut out = HashMap::new();
    for entry in entries {
        let record = file_record_from_value(entry, json_dir)?;
        if out.insert(record.file_index, record).is_some() {
            return Err("Duplicate SubFileData fileIndex found.".to_string());
        }
    }
    Ok(out)
}

fn file_record_from_value(entry: &Value, json_dir: &Path) -> Result<FileRecord, String> {
    let file_index = value_file_index(entry)
        .ok_or_else(|| "SubFileData entry missing fileIndex.".to_string())?;
    let file_type = entry
        .get("fileType")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    let file_url = entry
        .get("fileUrl")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("SubFileData[{file_index}] missing fileUrl."))?
        .to_string();
    let file_base_name = entry
        .get("fileBaseName")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| stem(&file_basename(&file_url)));
    let path = resolve_file_path(json_dir, &file_url);
    let declared_ext = actual_ext(&file_type, &file_url);
    let actual_ext = content_aware_effect_ext(&path, declared_ext);
    Ok(FileRecord {
        file_index,
        file_type,
        actual_ext,
        path,
        file_url,
        file_base_name,
    })
}

fn value_file_index(entry: &Value) -> Option<i32> {
    entry
        .get("fileIndex")
        .and_then(Value::as_i64)
        .map(|v| v as i32)
}

fn collect_items(nodes: &[Node]) -> Vec<&Node> {
    let mut out = Vec::new();
    for node in nodes {
        collect_items_inner(node, &mut out);
    }
    out
}

fn collect_items_inner<'a>(node: &'a Node, out: &mut Vec<&'a Node>) {
    match node {
        Node::Item { .. } => out.push(node),
        Node::Folder { children, .. } => {
            for child in children {
                collect_items_inner(child, out);
            }
        }
    }
}

fn collect_model_nodes<'a>(
    nodes: &'a [Node],
    data_by_index: &HashMap<i32, FileRecord>,
) -> Vec<&'a Node> {
    let mut out = Vec::new();
    for node in nodes {
        collect_model_nodes_inner(node, data_by_index, &mut out);
    }
    out
}

fn collect_model_nodes_inner<'a>(
    node: &'a Node,
    data_by_index: &HashMap<i32, FileRecord>,
    out: &mut Vec<&'a Node>,
) {
    if is_model_group(node, data_by_index) {
        out.push(node);
        return;
    }
    if let Node::Folder { children, .. } = node {
        for child in children {
            collect_model_nodes_inner(child, data_by_index, out);
        }
    }
}

fn collect_models(
    nodes: &[Node],
    data_by_index: &HashMap<i32, FileRecord>,
    out: &mut Vec<EffectFolderModel>,
) {
    for node in nodes {
        if is_model_group(node, data_by_index) {
            out.push(model_from_node(node, data_by_index));
            continue;
        }
        if let Node::Folder { children, .. } = node {
            collect_models(children, data_by_index, out);
        }
    }
}

fn is_model_group(node: &Node, data_by_index: &HashMap<i32, FileRecord>) -> bool {
    let Node::Folder {
        entry, children, ..
    } = node
    else {
        return false;
    };
    if matches!(entry, SubFileStructureEntry::Folder { unk3: 2, .. }) {
        return true;
    }
    children.iter().any(|child| match child {
        Node::Item { file_index, .. } => data_by_index
            .get(file_index)
            .is_some_and(|record| record.actual_ext == ".numdlb"),
        Node::Folder { .. } => false,
    })
}

fn model_from_node(node: &Node, data_by_index: &HashMap<i32, FileRecord>) -> EffectFolderModel {
    let (entry_index, folder_unk3, hash) = match node {
        Node::Folder {
            entry_index,
            entry: SubFileStructureEntry::Folder { unk3, unk5, .. },
            ..
        } => (*entry_index, *unk3, *unk5),
        _ => (0, 0, 0),
    };
    let mut files = Vec::new();
    let mut exts = HashSet::new();
    for item in collect_items(std::slice::from_ref(node)) {
        if let Some(record) = item.file_index().and_then(|idx| data_by_index.get(&idx)) {
            exts.insert(record.actual_ext.clone());
            files.push(file_item_from_node(record, item.item_entry()));
        }
    }
    let missing_required_exts = [".nusktb", ".numshb", ".numdlb", ".jnttbl"]
        .into_iter()
        .filter(|ext| !exts.contains(*ext))
        .map(str::to_string)
        .collect::<Vec<_>>();
    let name = files
        .iter()
        .find(|file| file.actual_ext == ".numdlb")
        .map(|file| file.file_base_name.clone())
        .or_else(|| files.first().map(|file| file.file_base_name.clone()))
        .unwrap_or_else(|| EffectFolderHash::from_i32(hash).hex.clone());
    EffectFolderModel {
        name,
        hash: EffectFolderHash::from_i32(hash),
        entry_index,
        folder_unk3,
        files,
        missing_required_exts,
        material_texture_ids: Vec::new(),
    }
}

fn collect_model_material_texture_ids(
    files: &[EffectFolderFileItem],
) -> Result<Vec<EffectFolderHash>, String> {
    let mut hashes = BTreeSet::new();
    for file in files
        .iter()
        .filter(|file| file.actual_ext == ".numatb" && !file.missing)
    {
        let bytes = fs::read(&file.path)
            .map_err(|e| format!("Failed to read numatb {}: {e}", file.path))?;
        let matl = load_matl_data(&bytes)
            .map_err(|e| format!("Failed to parse numatb {}: {e}", file.path))?;
        for reference in collect_texture_refs(&matl) {
            let base_name = file_basename(reference.trim());
            let resource_stem = stem(&base_name);
            if !resource_stem.is_empty() {
                hashes.insert(crc32fast::hash(resource_stem.as_bytes()) as i32);
            }
        }
    }
    Ok(hashes.into_iter().map(EffectFolderHash::from_i32).collect())
}

fn file_item_from_node(
    record: &FileRecord,
    entry: Option<&SubFileStructureEntry>,
) -> EffectFolderFileItem {
    let (hash, unk2, name) = match entry {
        Some(SubFileStructureEntry::Item {
            unk2,
            unk3,
            display_name,
            ..
        }) => (
            Some(EffectFolderHash::from_i32(*unk3)),
            Some(unk2.clone()),
            display_name
                .clone()
                .unwrap_or_else(|| record.file_base_name.clone()),
        ),
        _ => (None, None, record.file_base_name.clone()),
    };
    EffectFolderFileItem {
        file_index: record.file_index,
        file_type: record.file_type.clone(),
        actual_ext: record.actual_ext.clone(),
        file_url: record.file_url.clone(),
        file_base_name: record.file_base_name.clone(),
        name,
        path: record.path.to_string_lossy().to_string(),
        hash,
        unk2,
        missing: !record.path.is_file(),
        efxbn: None,
    }
}

fn is_inside_model(models: &[EffectFolderModel], file_index: i32) -> bool {
    models
        .iter()
        .any(|model| model.files.iter().any(|file| file.file_index == file_index))
}

fn parse_efxbn_bytes(bytes: &[u8], path: &str) -> Result<EfxbnSummary, String> {
    if bytes.len() < EFXBN_BLOCK_REGION_OFFSET {
        return Err(format!("EFXBN file too small: {} bytes", bytes.len()));
    }
    if &bytes[0..4] != b"EFXB" {
        return Err("Invalid EFXBN magic; expected EFXB.".to_string());
    }
    let version_or_flags = read_u32_le(bytes, 0x04)?;
    let file_size = read_u32_le(bytes, 0x08)?;
    let effect_count = read_u32_le(bytes, 0x0c)?;
    let curve_key_count = read_u32_le(bytes, 0x10)?;
    let model_control_config_count = read_u32_le(bytes, 0x14)?;
    if file_size as usize != bytes.len() {
        return Err(format!(
            "EFXBN header fileSize is {file_size}, actual size is {}.",
            bytes.len()
        ));
    }
    let meta_size = effect_count as usize * EFXBN_BLOCK_STRIDE;
    if bytes.len() < EFXBN_BLOCK_REGION_OFFSET + meta_size {
        return Err("EFXBN meta region extends past file size.".to_string());
    }
    // Native layout, confirmed at sub_140145DF0: the header is six dwords, block `i`
    // starts at `payload + 0x18 + i * 0x370`, the curve key array follows the blocks,
    // and the model-control region follows the keys.
    let control_lookup_region_offset = EFXBN_BLOCK_REGION_OFFSET + meta_size;
    let control_lookup_region_size = curve_key_count as usize * EFXBN_CURVE_KEY_STRIDE;
    let control_lookup_region_end = control_lookup_region_offset + control_lookup_region_size;
    if control_lookup_region_end > bytes.len() {
        return Err("EFXBN curve key region extends past file size.".to_string());
    }
    let model_control_region_offset = control_lookup_region_end;
    let model_control_region_size =
        model_control_config_count as usize * EFXBN_MODEL_CONTROL_STRIDE;
    let trailing_offset = model_control_region_offset + model_control_region_size;
    if trailing_offset > bytes.len() {
        return Err("EFXBN model-control region extends past file size.".to_string());
    }

    let mut control_lookup_entries = Vec::with_capacity(curve_key_count as usize);
    for index in 0..curve_key_count as usize {
        let off = control_lookup_region_offset + index * EFXBN_CURVE_KEY_STRIDE;
        control_lookup_entries.push(EfxbnControlLookupEntry {
            index,
            key_f32_bits: read_u32_le(bytes, off)?,
            key: read_f32_le(bytes, off)?,
            value_f32_bits: read_u32_le(bytes, off + 4)?,
            value: read_f32_le(bytes, off + 4)?,
        });
    }

    let mut effects = Vec::new();
    let mut model_ids = BTreeSet::new();
    let mut animation_ids = BTreeSet::new();
    for i in 0..effect_count as usize {
        let base = EFXBN_BLOCK_REGION_OFFSET + i * EFXBN_BLOCK_STRIDE;
        // `nudHandle` and `animationHash` in the reflected struct.
        let model_id = read_i32_le(bytes, base + 0x140)?;
        let animation_id = read_i32_le(bytes, base + 0x290)?;
        model_ids.insert(model_id);
        animation_ids.insert(animation_id);
        let mut control_references = Vec::with_capacity(EFXBN_CONTROL_REFERENCE_FIELDS.len());
        for (index, (name, raw_offset)) in EFXBN_CONTROL_REFERENCE_FIELDS.iter().enumerate() {
            let off = base + *raw_offset as usize;
            control_references.push(EfxbnControlReferenceSummary {
                index,
                name: (*name).to_string(),
                raw_offset: *raw_offset,
                // Block offsets and reflected `SEfxElementData` offsets are identical.
                runtime_offset: *raw_offset,
                selector: read_u32_le(bytes, off)?,
                lookup_index: read_u32_le(bytes, off + 4)?,
            });
        }
        let mut reserve_area = Vec::with_capacity(EFXBN_BLOCK_RESERVE_AREA_LEN);
        for slot in 0..EFXBN_BLOCK_RESERVE_AREA_LEN {
            reserve_area.push(read_u32_le(
                bytes,
                base + EFXBN_BLOCK_RESERVE_AREA_OFFSET + slot * 4,
            )?);
        }
        effects.push(EfxbnEffectSummary {
            index: i,
            level: read_u32_le(bytes, base)?,
            child_index_size: read_u32_le(bytes, base + 0x04)?,
            child_index_array: [
                read_i32_le(bytes, base + 0x08)?,
                read_i32_le(bytes, base + 0x0c)?,
                read_i32_le(bytes, base + 0x10)?,
                read_i32_le(bytes, base + 0x14)?,
                read_i32_le(bytes, base + 0x18)?,
                read_i32_le(bytes, base + 0x1c)?,
                read_i32_le(bytes, base + 0x20)?,
                read_i32_le(bytes, base + 0x24)?,
            ],
            referenced_effect_index: read_i32_le(bytes, base + 0x08)?,
            effect_type: read_u32_le(bytes, base + 0x28)?,
            life_time_base: read_f32_le(bytes, base + 0x2c)?,
            life_time_random: read_f32_le(bytes, base + 0x30)?,
            interval_base: read_f32_le(bytes, base + 0x34)?,
            interval_random: read_f32_le(bytes, base + 0x38)?,
            num_emit: read_u32_le(bytes, base + 0x3c)?,
            action_flags: read_u32_le(bytes, base + 0x40)?,
            spawn_form_type: read_u32_le(bytes, base + 0x44)?,
            spawn_form_length: [
                read_f32_le(bytes, base + 0x48)?,
                read_f32_le(bytes, base + 0x4c)?,
                read_f32_le(bytes, base + 0x50)?,
                read_f32_le(bytes, base + 0x54)?,
            ],
            speed_random: [
                read_f32_le(bytes, base + 0xe0)?,
                read_f32_le(bytes, base + 0xe4)?,
                read_f32_le(bytes, base + 0xe8)?,
                read_f32_le(bytes, base + 0xec)?,
            ],
            size_base: [
                read_f32_le(bytes, base + 0xf0)?,
                read_f32_le(bytes, base + 0xf4)?,
                read_f32_le(bytes, base + 0xf8)?,
                read_f32_le(bytes, base + 0xfc)?,
            ],
            size_random: [
                read_f32_le(bytes, base + 0x100)?,
                read_f32_le(bytes, base + 0x104)?,
                read_f32_le(bytes, base + 0x108)?,
                read_f32_le(bytes, base + 0x10c)?,
            ],
            rotation_base: [
                read_f32_le(bytes, base + 0x110)?,
                read_f32_le(bytes, base + 0x114)?,
                read_f32_le(bytes, base + 0x118)?,
                read_f32_le(bytes, base + 0x11c)?,
            ],
            rotation_random: [
                read_f32_le(bytes, base + 0x120)?,
                read_f32_le(bytes, base + 0x124)?,
                read_f32_le(bytes, base + 0x128)?,
                read_f32_le(bytes, base + 0x12c)?,
            ],
            rotation_speed: [
                read_f32_le(bytes, base + 0x130)?,
                read_f32_le(bytes, base + 0x134)?,
                read_f32_le(bytes, base + 0x138)?,
                read_f32_le(bytes, base + 0x13c)?,
            ],
            internal_element_data_index: read_u32_le(bytes, base + 0xd8)?,
            enable_data_flag: read_u32_le(bytes, base + 0xdc)?,
            nud_handle: read_u32_le(bytes, base + 0x140)?,
            texture_handle: read_u32_le(bytes, base + 0x144)?,
            pad01: [
                read_u32_le(bytes, base + 0x148)?,
                read_u32_le(bytes, base + 0x14c)?,
            ],
            color_texture_parameter_index: [
                read_i32_le(bytes, base + 0x150)?,
                read_i32_le(bytes, base + 0x154)?,
            ],
            uv_texture_parameter_index: [
                read_i32_le(bytes, base + 0x158)?,
                read_i32_le(bytes, base + 0x15c)?,
            ],
            center_pivot: [
                read_f32_le(bytes, base + 0x160)?,
                read_f32_le(bytes, base + 0x164)?,
            ],
            delete_settings: read_u32_le(bytes, base + 0x168)?,
            fade_time_base: read_f32_le(bytes, base + 0x16c)?,
            culling_type: read_u32_le(bytes, base + 0x170)?,
            z_write_enable: read_u32_le(bytes, base + 0x174)?,
            z_test_enable: read_u32_le(bytes, base + 0x178)?,
            blend_state: read_u32_le(bytes, base + 0x17c)?,
            draw_repository_index: read_u32_le(bytes, base + 0x180)?,
            instance_amount_type: read_u32_le(bytes, base + 0x184)?,
            draw_amount_index: read_u32_le(bytes, base + 0x188)?,
            enable_soft_particle: read_u32_le(bytes, base + 0x18c)?,
            position_offset: [
                read_f32_le(bytes, base + 0x190)?,
                read_f32_le(bytes, base + 0x194)?,
                read_f32_le(bytes, base + 0x198)?,
                read_f32_le(bytes, base + 0x19c)?,
            ],
            delay_emit_time_base: read_f32_le(bytes, base + 0x1a0)?,
            emit_area_type: read_u32_le(bytes, base + 0x1a4)?,
            enable_z_sort: read_u32_le(bytes, base + 0x1a8)?,
            delete_effect_id: read_u32_le(bytes, base + 0x1ac)?,
            delete_end_scale: [
                read_f32_le(bytes, base + 0x1b0)?,
                read_f32_le(bytes, base + 0x1b4)?,
                read_f32_le(bytes, base + 0x1b8)?,
                read_f32_le(bytes, base + 0x1bc)?,
            ],
            light_attenuation_radius: read_f32_le(bytes, base + 0x1c0)?,
            lighting_flags: read_u32_le(bytes, base + 0x1c4)?,
            normal_map_hash: read_u32_le(bytes, base + 0x1c8)?,
            world_wind_apply_rate: read_f32_le(bytes, base + 0x1dc)?,
            strip_segment_interval: read_f32_le(bytes, base + 0x1e0)?,
            strip_segment_length_not_use: read_f32_le(bytes, base + 0x1e4)?,
            strip_segment_life: read_f32_le(bytes, base + 0x1e8)?,
            strip_segment_num_not_use: read_u32_le(bytes, base + 0x1ec)?,
            strip_segment_split_num: read_u32_le(bytes, base + 0x1f0)?,
            drawer_id: read_u32_le(bytes, base + 0x1f4)?,
            world_wind_apply_rate_random: read_f32_le(bytes, base + 0x1f8)?,
            soft_particle_range: read_f32_le(bytes, base + 0x1fc)?,
            camera_fade_range: read_f32_le(bytes, base + 0x200)?,
            extra_flags: read_u32_le(bytes, base + 0x204)?,
            noise_direction_max_rot: read_f32_le(bytes, base + 0x208)?,
            noise_direction_area_range: read_f32_le(bytes, base + 0x20c)?,
            blur_start_color: [
                read_f32_le(bytes, base + 0x210)?,
                read_f32_le(bytes, base + 0x214)?,
                read_f32_le(bytes, base + 0x218)?,
                read_f32_le(bytes, base + 0x21c)?,
            ],
            blur_end_color: [
                read_f32_le(bytes, base + 0x220)?,
                read_f32_le(bytes, base + 0x224)?,
                read_f32_le(bytes, base + 0x228)?,
                read_f32_le(bytes, base + 0x22c)?,
            ],
            blur_enable_range: read_f32_le(bytes, base + 0x230)?,
            blur_fade_power: read_f32_le(bytes, base + 0x234)?,
            light_type: read_u32_le(bytes, base + 0x238)?,
            light_base_radius: read_f32_le(bytes, base + 0x23c)?,
            rotation_speed_random: [
                read_f32_le(bytes, base + 0x240)?,
                read_f32_le(bytes, base + 0x244)?,
                read_f32_le(bytes, base + 0x248)?,
                read_f32_le(bytes, base + 0x24c)?,
            ],
            camera_offset: read_f32_le(bytes, base + 0x250)?,
            post_effect_type: read_u32_le(bytes, base + 0x254)?,
            post_effect_blend_rate: read_f32_le(bytes, base + 0x258)?,
            strip_tail_alpha_rate: read_f32_le(bytes, base + 0x25c)?,
            strip_head_alpha_rate: read_f32_le(bytes, base + 0x260)?,
            emit_interpolate_distance: read_f32_le(bytes, base + 0x264)?,
            noise_rotate_pos_offset: read_f32_le(bytes, base + 0x268)?,
            z_sort_offset: read_f32_le(bytes, base + 0x26c)?,
            special_shader_type: read_u32_le(bytes, base + 0x270)?,
            reflection_power: read_f32_le(bytes, base + 0x274)?,
            pass2_blend_type: read_u32_le(bytes, base + 0x278)?,
            animation_delay_frame: read_f32_le(bytes, base + 0x27c)?,
            animation_loop_start_frame: read_f32_le(bytes, base + 0x280)?,
            animation_loop_end_frame: read_f32_le(bytes, base + 0x284)?,
            animation_delete_frame: read_f32_le(bytes, base + 0x288)?,
            animation_speed_rate: read_f32_le(bytes, base + 0x28c)?,
            animation_blend_delete_frame: read_u32_le(bytes, base + 0x294)?,
            emitter_lod_type: read_u32_le(bytes, base + 0x298)?,
            animation_start_frame: read_f32_le(bytes, base + 0x29c)?,
            bounding_sphere_info: [
                read_f32_le(bytes, base + 0x2a0)?,
                read_f32_le(bytes, base + 0x2a4)?,
                read_f32_le(bytes, base + 0x2a8)?,
                read_f32_le(bytes, base + 0x2ac)?,
            ],
            post_effect_shape_radius: read_f32_le(bytes, base + 0x2b0)?,
            world_water_apply_rate: read_f32_le(bytes, base + 0x2b4)?,
            num_emit_count_random: read_u32_le(bytes, base + 0x2b8)?,
            depth_emission_range: read_f32_le(bytes, base + 0x2bc)?,
            depth_emission_power: read_f32_le(bytes, base + 0x2c0)?,
            highlight_power: read_f32_le(bytes, base + 0x2c4)?,
            emit_interpolate_type: read_u32_le(bytes, base + 0x2f0)?,
            mesh_emitter_index: read_u32_le(bytes, base + 0x2c8)?,
            mesh_emitter_count: read_u32_le(bytes, base + 0x2cc)?,
            field_effect_type: read_u32_le(bytes, base + 0x2d0)?,
            field_effect_power: read_f32_le(bytes, base + 0x2d4)?,
            field_effect_interval: read_f32_le(bytes, base + 0x2d8)?,
            field_effect_angle: read_f32_le(bytes, base + 0x2dc)?,
            field_effect_frequency: read_f32_le(bytes, base + 0x2e0)?,
            field_effect_offset: read_f32_le(bytes, base + 0x2e4)?,
            field_effect_recieve_rate: read_f32_le(bytes, base + 0x2e8)?,
            field_effect_extra_value1: read_f32_le(bytes, base + 0x2ec)?,
            model_id,
            model_hash: EffectFolderHash::from_i32(model_id),
            animation_id,
            animation_hash: EffectFolderHash::from_i32(animation_id),
            control_references,
            reserve_area,
            runtime: None,
        });
    }

    let mut model_control_texture_ids = BTreeSet::new();
    let mut model_controls = Vec::with_capacity(model_control_config_count as usize);
    for i in 0..model_control_config_count as usize {
        let base = model_control_region_offset + i * EFXBN_MODEL_CONTROL_STRIDE;
        let input_source_type = read_u32_le(bytes, base)?;
        let color_map_id = read_i32_le(bytes, base + 0x04)?;
        let mut reserve_area = Vec::with_capacity(EFXBN_MODEL_CONTROL_RESERVE_AREA_LEN);
        for index in 0..EFXBN_MODEL_CONTROL_RESERVE_AREA_LEN {
            reserve_area.push(read_u32_le(
                bytes,
                base + EFXBN_MODEL_CONTROL_RESERVE_AREA_OFFSET + index * 4,
            )?);
        }
        model_control_texture_ids.insert(color_map_id);
        model_controls.push(EfxbnModelControlSummary {
            index: i,
            input_source_type,
            color_map_id,
            color_map_hash: EffectFolderHash::from_i32(color_map_id),
            addressing_mode: read_u32_le(bytes, base + 0x08)?,
            reverse_u: read_u32_le(bytes, base + 0x0c)?,
            reverse_v: read_u32_le(bytes, base + 0x10)?,
            texture_width: read_u32_le(bytes, base + 0x14)?,
            texture_height: read_u32_le(bytes, base + 0x18)?,
            uv_pattern_type: read_u32_le(bytes, base + 0x1c)?,
            uv_u: [
                read_f32_le(bytes, base + 0x20)?,
                read_f32_le(bytes, base + 0x24)?,
                read_f32_le(bytes, base + 0x28)?,
                read_f32_le(bytes, base + 0x2c)?,
            ],
            uv_v: [
                read_f32_le(bytes, base + 0x30)?,
                read_f32_le(bytes, base + 0x34)?,
                read_f32_le(bytes, base + 0x38)?,
                read_f32_le(bytes, base + 0x3c)?,
            ],
            uv_scroll_speed: read_f32_le(bytes, base + 0x40)?,
            uv_scroll_limit: read_f32_le(bytes, base + 0x44)?,
            uv_scroll_direction: read_f32_le(bytes, base + 0x48)?,
            uv_animation_random: read_u32_le(bytes, base + 0x4c)?,
            uv_animation_frame_num: read_u32_le(bytes, base + 0x50)?,
            uv_animation_frame_width: read_u32_le(bytes, base + 0x54)?,
            uv_animation_frame_height: read_u32_le(bytes, base + 0x58)?,
            uv_animation_frame_num_by_line: read_u32_le(bytes, base + 0x5c)?,
            uv_animation_frame_time: read_u32_le(bytes, base + 0x60)?,
            uv_animation_3d_texture: read_u32_le(bytes, base + 0x64)?,
            uv_scroll_model_speed_u: read_f32_le(bytes, base + 0x68)?,
            uv_scroll_model_speed_v: read_f32_le(bytes, base + 0x6c)?,
            uv_distortion_power_u: read_f32_le(bytes, base + 0x70)?,
            uv_distortion_power_v: read_f32_le(bytes, base + 0x74)?,
            texture_setting_flags: read_u32_le(bytes, base + 0x78)?,
            uv_animation_start_frame: read_u32_le(bytes, base + 0x7c)?,
            uv_random_offset_u: read_f32_le(bytes, base + 0x80)?,
            uv_random_offset_v: read_f32_le(bytes, base + 0x84)?,
            reserve_area,
        });
    }

    // Second pass. Wrapper type resolution reads the first child and the draw scheme reads
    // the model-control table, so both blocks and controls must already be parsed.
    let normalized: Vec<EfxbnRuntimeNormalization> = effects
        .iter()
        .map(|effect| {
            let first_child = effect
                .child_index_array
                .first()
                .copied()
                .filter(|index| *index >= 0)
                .and_then(|index| effects.get(index as usize));
            normalize_efxbn_block(effect, first_child, &model_controls)
        })
        .collect();
    for (effect, runtime) in effects.iter_mut().zip(normalized) {
        effect.runtime = Some(runtime);
    }

    Ok(EfxbnSummary {
        path: path.to_string(),
        magic: "EFXB".to_string(),
        version_or_flags,
        file_size,
        actual_size: bytes.len(),
        effect_count,
        curve_key_count,
        control_lookup_region_offset: control_lookup_region_offset as u32,
        control_lookup_region_size: control_lookup_region_size as u32,
        control_lookup_region_end: control_lookup_region_end as u32,
        model_control_config_count,
        model_control_region_offset: model_control_region_offset as u32,
        model_control_region_size: model_control_region_size as u32,
        trailing_offset: trailing_offset as u32,
        model_ids: model_ids
            .into_iter()
            .map(EffectFolderHash::from_i32)
            .collect(),
        animation_ids: animation_ids
            .into_iter()
            .map(EffectFolderHash::from_i32)
            .collect(),
        model_control_texture_ids: model_control_texture_ids
            .into_iter()
            .map(EffectFolderHash::from_i32)
            .collect(),
        control_lookup_entries,
        effects,
        texture_parameters: model_controls.clone(),
        model_controls,
        todo: efxbn_unknown_todo(),
    })
}

fn read_u32_le(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let slice = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| format!("Read u32 out of range at 0x{offset:X}"))?;
    Ok(u32::from_le_bytes(
        slice.try_into().map_err(|_| "slice".to_string())?,
    ))
}

fn read_i32_le(bytes: &[u8], offset: usize) -> Result<i32, String> {
    Ok(read_u32_le(bytes, offset)? as i32)
}

fn read_f32_le(bytes: &[u8], offset: usize) -> Result<f32, String> {
    Ok(f32::from_bits(read_u32_le(bytes, offset)?))
}

fn validation_result(
    effect_root: &str,
    structure_path: &Path,
    errors: Vec<EffectFolderValidationError>,
    warnings: Vec<String>,
    summary: Option<EffectFolderValidationSummary>,
) -> EffectFolderValidationResult {
    let summary = summary.unwrap_or(EffectFolderValidationSummary {
        total_files: 0,
        efxbn_count: 0,
        model_count: 0,
        texture_count: 0,
        unresolved_model_id_count: 0,
    });
    EffectFolderValidationResult {
        valid: errors.is_empty(),
        effect_root: effect_root.to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        summary,
        errors,
        warnings,
    }
}

fn push_error(
    errors: &mut Vec<EffectFolderValidationError>,
    phase: &str,
    item: Option<&str>,
    message: impl Into<String>,
    path: Option<impl AsRef<Path>>,
) {
    errors.push(EffectFolderValidationError {
        phase: phase.to_string(),
        item: item.map(str::to_string),
        message: message.into(),
        path: path.map(|p| p.as_ref().to_string_lossy().to_string()),
    });
}

fn effect_file_kind_ext(kind: &str) -> Result<&'static str, String> {
    match kind.trim().to_ascii_lowercase().as_str() {
        "efxbn" | ".efxbn" => Ok(".efxbn"),
        "texture" | "nutexb" | ".nutexb" => Ok(".nutexb"),
        other => Err(format!("Unsupported effect file kind: {other}")),
    }
}

fn make_item(file_index: i32, unk2: &str, unk3: i32, name: &str) -> SubFileStructureEntry {
    SubFileStructureEntry::Item {
        unk1: "00000000".to_string(),
        file_index,
        unk2: unk2.to_string(),
        unk2_1: 0,
        unk3,
        unk4: 0,
        original_file_index: file_index,
        display_name: Some(name.to_string()),
    }
}

fn make_folder(unk3: i32, unk5: i32) -> SubFileStructureEntry {
    SubFileStructureEntry::Folder {
        unk1: "00000000".to_string(),
        folder_count: 0,
        unk2: "00000000".to_string(),
        unk2_1: 0,
        unk3,
        unk4: 0,
        unk5,
        unk6: 0,
    }
}

fn append_to_primary_container(
    forest: &mut Vec<Node>,
    data_by_index: &HashMap<i32, FileRecord>,
    node: Node,
) {
    if let Some(container) = find_primary_container_mut(forest, data_by_index) {
        container.push(node);
    } else {
        forest.push(node);
    }
}

fn find_primary_container_mut<'a>(
    nodes: &'a mut [Node],
    data_by_index: &HashMap<i32, FileRecord>,
) -> Option<&'a mut Vec<Node>> {
    for node in nodes {
        if let Node::Folder { children, .. } = node {
            if children.iter().any(|child| match child {
                Node::Item { file_index, .. } => {
                    data_by_index.get(file_index).is_some_and(|record| {
                        record.actual_ext == ".efxbn" || record.actual_ext == ".nutexb"
                    })
                }
                Node::Folder { .. } => is_model_group(child, data_by_index),
            }) {
                return Some(children);
            }
            if let Some(found) = find_primary_container_mut(children, data_by_index) {
                return Some(found);
            }
        }
    }
    None
}

fn primary_file_dir(root: &Path, data_by_index: &HashMap<i32, FileRecord>) -> PathBuf {
    let mut counts: HashMap<PathBuf, usize> = HashMap::new();
    for record in data_by_index.values() {
        if matches!(record.actual_ext.as_str(), ".efxbn" | ".nutexb") {
            if let Some(parent) = record.path.parent() {
                *counts.entry(parent.to_path_buf()).or_default() += 1;
            }
        }
    }
    counts
        .into_iter()
        .max_by_key(|(_, count)| *count)
        .map(|(path, _)| path)
        .unwrap_or_else(|| root.to_path_buf())
}

fn remove_matching_nodes(
    nodes: &mut Vec<Node>,
    selections: &[EffectFolderSelection],
    data_by_index: &HashMap<i32, FileRecord>,
    removed_indices: &mut HashSet<i32>,
) {
    let old = std::mem::take(nodes);
    for mut node in old {
        if node_matches_any(&node, selections, data_by_index) {
            for item in collect_items(std::slice::from_ref(&node)) {
                if let Some(file_index) = item.file_index() {
                    removed_indices.insert(file_index);
                }
            }
            continue;
        }
        if let Node::Folder { children, .. } = &mut node {
            remove_matching_nodes(children, selections, data_by_index, removed_indices);
        }
        nodes.push(node);
    }
}

fn node_matches_any(
    node: &Node,
    selections: &[EffectFolderSelection],
    data_by_index: &HashMap<i32, FileRecord>,
) -> bool {
    selections.iter().any(|selection| match node {
        Node::Item { .. } => {
            let Node::Item { file_index, .. } = node else {
                return false;
            };
            data_by_index
                .get(file_index)
                .is_some_and(|record| selection_matches_item(selection, node, record))
        }
        Node::Folder { .. } => selection_matches_model(selection, node, data_by_index),
    })
}

fn selection_matches_item(
    selection: &EffectFolderSelection,
    node: &Node,
    record: &FileRecord,
) -> bool {
    let Node::Item {
        entry, file_index, ..
    } = node
    else {
        return false;
    };
    let kind = selection.kind.to_ascii_lowercase();
    let kind_match = match record.actual_ext.as_str() {
        ".efxbn" => kind == "efxbn" || kind == ".efxbn" || kind == "file",
        ".nutexb" => kind == "texture" || kind == "nutexb" || kind == ".nutexb" || kind == "file",
        _ => kind == "file",
    };
    kind_match
        && selection
            .file_index
            .map_or(true, |wanted| wanted == *file_index)
        && selection
            .hash_id
            .map_or(true, |wanted| item_hash(entry) == Some(wanted))
        && selection.name.as_ref().map_or(true, |wanted| {
            wanted.eq_ignore_ascii_case(&record.file_base_name)
                || wanted.eq_ignore_ascii_case(&file_basename(&record.file_url))
        })
}

fn selection_matches_model(
    selection: &EffectFolderSelection,
    node: &Node,
    data_by_index: &HashMap<i32, FileRecord>,
) -> bool {
    if selection.kind.to_ascii_lowercase() != "model" || !is_model_group(node, data_by_index) {
        return false;
    }
    let hash_match = selection
        .hash_id
        .map_or(true, |wanted| folder_hash(node) == Some(wanted));
    let name_match = selection.name.as_ref().map_or(true, |wanted| {
        let model = model_from_node(node, data_by_index);
        wanted.eq_ignore_ascii_case(&model.name)
    });
    hash_match && name_match
}

fn destination_has_item_hash(
    forest: &[Node],
    data_by_index: &HashMap<i32, FileRecord>,
    ext: &str,
    hash: i32,
) -> bool {
    find_dest_record_by_hash(forest, data_by_index, ext, hash).is_some()
}

fn find_dest_record_by_hash<'a>(
    forest: &[Node],
    data_by_index: &'a HashMap<i32, FileRecord>,
    ext: &str,
    hash: i32,
) -> Option<&'a FileRecord> {
    collect_items(forest).into_iter().find_map(|item| {
        let file_index = item.file_index()?;
        let record = data_by_index.get(&file_index)?;
        if record.actual_ext == ext && item.item_entry().and_then(item_hash) == Some(hash) {
            Some(record)
        } else {
            None
        }
    })
}

fn destination_has_model_hash(forest: &[Node], hash: i32) -> bool {
    forest.iter().any(|node| node_has_model_hash(node, hash))
}

fn node_has_model_hash(node: &Node, hash: i32) -> bool {
    if folder_hash(node) == Some(hash) {
        return true;
    }
    match node {
        Node::Folder { children, .. } => children
            .iter()
            .any(|child| node_has_model_hash(child, hash)),
        Node::Item { .. } => false,
    }
}

fn item_hash(entry: &SubFileStructureEntry) -> Option<i32> {
    match entry {
        SubFileStructureEntry::Item { unk3, .. } => Some(*unk3),
        _ => None,
    }
}

fn set_item_hash_in_forest(nodes: &mut [Node], file_index: i32, hash_id: i32) -> bool {
    for node in nodes {
        match node {
            Node::Item {
                file_index: item_file_index,
                entry: SubFileStructureEntry::Item { unk3, .. },
                ..
            } if *item_file_index == file_index => {
                *unk3 = hash_id;
                return true;
            }
            Node::Folder { children, .. } => {
                if set_item_hash_in_forest(children, file_index, hash_id) {
                    return true;
                }
            }
            _ => {}
        }
    }
    false
}

fn folder_hash(node: &Node) -> Option<i32> {
    match node {
        Node::Folder {
            entry: SubFileStructureEntry::Folder { unk5, .. },
            ..
        } => Some(*unk5),
        _ => None,
    }
}

impl Node {
    fn file_index(&self) -> Option<i32> {
        match self {
            Node::Item { file_index, .. } => Some(*file_index),
            Node::Folder { .. } => None,
        }
    }

    fn item_entry(&self) -> Option<&SubFileStructureEntry> {
        match self {
            Node::Item { entry, .. } => Some(entry),
            Node::Folder { .. } => None,
        }
    }
}

fn next_file_index(entries: &[Value]) -> i32 {
    entries
        .iter()
        .filter_map(value_file_index)
        .max()
        .unwrap_or(-1)
        + 1
}

fn reindex_sub_file_data(entries: &mut [Value]) {
    for (index, entry) in entries.iter_mut().enumerate() {
        if let Some(obj) = entry.as_object_mut() {
            obj.insert("index".to_string(), json!(index));
        }
    }
}

fn scan_source_model_files(source_dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !source_dir.is_dir() {
        return Err(format!(
            "Source model folder does not exist: {}",
            source_dir.display()
        ));
    }
    let mut files = Vec::new();
    for entry in fs::read_dir(source_dir).map_err(|e| {
        format!(
            "Failed to read source model folder {}: {e}",
            source_dir.display()
        )
    })? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file() {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let ext = extension_from_name(name);
            if is_model_file_ext(&ext) {
                files.push(path);
            }
        }
    }
    files.sort();
    Ok(files)
}

fn validate_model_ext_set(files: &[(Option<PathBuf>, String, String)]) -> Result<(), String> {
    for required in [".nusktb", ".numshb", ".numdlb", ".jnttbl"] {
        let count = files.iter().filter(|(_, _, ext)| ext == required).count();
        if count != 1 {
            return Err(format!(
                "Effect model folder must contain exactly one {required}; found {count}."
            ));
        }
    }
    Ok(())
}

fn model_name_from_files(files: &[PathBuf]) -> Option<String> {
    files.iter().find_map(|path| {
        let name = path.file_name()?.to_str()?;
        if extension_from_name(name) == ".numdlb" {
            Some(stem(name))
        } else {
            None
        }
    })
}

fn is_model_file_ext(ext: &str) -> bool {
    matches!(
        ext,
        ".nusktb" | ".numshb" | ".numdlb" | ".jnttbl" | ".numatb" | ".nuhlpb"
    )
}

fn is_nonempty_required_model_ext(ext: &str) -> bool {
    matches!(ext, ".nusktb" | ".numshb" | ".numdlb")
}

fn item_unk2_for_ext(ext: &str) -> &'static str {
    match ext {
        ".nusktb" => "10000000",
        ".numatb" => "21000000",
        ".numshb" => "30000000",
        ".numdlb" => "40000000",
        ".jnttbl" => "50000000",
        _ => "00000000",
    }
}

fn item_unk3_for_ext(ext: &str) -> i32 {
    match ext {
        ".numatb" => 1,
        _ => 0,
    }
}

fn file_type_for_ext(ext: &str) -> String {
    if ext == ".jnttbl" {
        ".bin".to_string()
    } else {
        ext.to_string()
    }
}

fn actual_ext(file_type: &str, file_url: &str) -> String {
    let name = file_basename(file_url);
    let ext = extension_from_name(&name);
    if !ext.is_empty() {
        ext
    } else {
        file_type.to_ascii_lowercase()
    }
}

fn content_aware_effect_ext(path: &Path, declared_ext: String) -> String {
    if declared_ext != ".efxbn" && declared_ext != ".nuanmb" {
        return declared_ext;
    }

    let mut prefix = [0u8; 0x14];
    let Some(detected_ext) = fs::File::open(path).ok().and_then(|mut file| {
        file.read_exact(&mut prefix).ok()?;
        if &prefix[0..4] == b"EFXB" {
            Some(".efxbn")
        } else if &prefix[0..4] == b"HBSS" && &prefix[0x10..0x14] == b"MINA" {
            Some(".nuanmb")
        } else {
            None
        }
    }) else {
        return declared_ext;
    };

    detected_ext.to_string()
}

fn resolve_file_path(json_dir: &Path, file_url: &str) -> PathBuf {
    let cleaned = file_url.replace('\\', "/");
    let cleaned = cleaned.trim_start_matches("./");
    json_dir.join(cleaned)
}

fn file_url_for_target(json_dir: &Path, target: &Path) -> String {
    let rel = target
        .strip_prefix(json_dir)
        .map(Path::to_path_buf)
        .unwrap_or_else(|_| target.to_path_buf());
    format!(".\\{}", rel.to_string_lossy().replace('/', "\\"))
}

fn copy_one_file(source: &Path, destination: &Path) -> Result<(), String> {
    if destination.exists() {
        return Err(format!(
            "Import destination already exists and will not be overwritten: {}",
            destination.display()
        ));
    }
    copy_one_file_replace(source, destination)
}

fn copy_one_file_replace(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.is_file() {
        return Err(format!("Source file does not exist: {}", source.display()));
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }
    fs::copy(source, destination).map_err(|e| {
        format!(
            "Failed to copy {} -> {}: {e}",
            source.display(),
            destination.display()
        )
    })?;
    Ok(())
}

fn write_placeholder_file(path: &Path, ext: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }
    let bytes = if ext == ".efxbn" {
        let mut out = vec![0u8; 0x20];
        out[0..4].copy_from_slice(b"EFXB");
        out[0x04..0x08].copy_from_slice(&2u32.to_le_bytes());
        out[0x08..0x0c].copy_from_slice(&(0x20u32).to_le_bytes());
        out
    } else {
        Vec::new()
    };
    fs::write(path, bytes)
        .map_err(|e| format!("Failed to write placeholder {}: {e}", path.display()))
}

fn unique_child_path(parent: &Path, desired_name: &str) -> PathBuf {
    let candidate = parent.join(desired_name);
    if !candidate.exists() {
        return candidate;
    }
    let stem = stem(desired_name);
    let ext = extension_from_name(desired_name);
    for n in 1..10_000 {
        let name = if ext.is_empty() {
            format!("{stem}_{n}")
        } else {
            format!("{stem}_{n}{ext}")
        };
        let candidate = parent.join(name);
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!("{stem}_overflow{ext}"))
}

fn delete_file_if_under(root: &Path, path: &Path) {
    let Ok(root) = fs::canonicalize(root) else {
        return;
    };
    let Ok(path) = fs::canonicalize(path) else {
        return;
    };
    if path.starts_with(root) {
        let _ = fs::remove_file(path);
    }
}

pub fn sanitize_effect_copy_dest_file_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Destination file name is empty.".to_string());
    }
    if trimmed == "."
        || trimmed == ".."
        || trimmed.contains("..")
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || Path::new(trimmed).is_absolute()
    {
        return Err(
            "Destination file name must be a single file name inside the pack.".to_string(),
        );
    }
    Ok(ensure_extension(trimmed, ".efxbn"))
}

fn ensure_extension(name: &str, ext: &str) -> String {
    if name.to_ascii_lowercase().ends_with(ext) {
        name.to_string()
    } else {
        format!("{name}{ext}")
    }
}

fn file_basename(file_url: &str) -> String {
    file_url
        .replace('\\', "/")
        .split('/')
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .last()
        .unwrap_or(file_url)
        .to_string()
}

fn extension_from_name(name: &str) -> String {
    match name.rfind('.') {
        Some(idx) if idx > 0 && idx + 1 < name.len() => name[idx..].to_ascii_lowercase(),
        _ => String::new(),
    }
}

fn stem(name: &str) -> String {
    match name.rfind('.') {
        Some(idx) if idx > 0 => name[..idx].to_string(),
        _ => name.to_string(),
    }
}

fn sanitize_stem(name: &str) -> String {
    stem(name)
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_minimal_zero_effect_efxbn() {
        // The header is six dwords; a file with no blocks, keys, or model controls
        // is exactly that header.
        let mut bytes = vec![0u8; EFXBN_BLOCK_REGION_OFFSET];
        bytes[0..4].copy_from_slice(b"EFXB");
        bytes[0x04..0x08].copy_from_slice(&2u32.to_le_bytes());
        bytes[0x08..0x0c].copy_from_slice(&(EFXBN_BLOCK_REGION_OFFSET as u32).to_le_bytes());

        let parsed = parse_efxbn_bytes(&bytes, "memory").unwrap();

        assert_eq!(parsed.magic, "EFXB");
        assert_eq!(parsed.effect_count, 0);
        assert_eq!(parsed.curve_key_count, 0);
        assert_eq!(
            parsed.control_lookup_region_offset,
            EFXBN_BLOCK_REGION_OFFSET as u32
        );
        assert_eq!(parsed.trailing_offset, EFXBN_BLOCK_REGION_OFFSET as u32);
        let json = serde_json::to_value(&parsed).unwrap();
        assert!(json["todo"]["unknowns"].is_array());
    }

    #[test]
    fn parses_model_and_animation_ids_from_effect_meta() {
        let mut bytes = vec![0u8; EFXBN_BLOCK_REGION_OFFSET + EFXBN_BLOCK_STRIDE + 21 * 8];
        bytes[0..4].copy_from_slice(b"EFXB");
        bytes[0x04..0x08].copy_from_slice(&2u32.to_le_bytes());
        let len = bytes.len() as u32;
        bytes[0x08..0x0c].copy_from_slice(&len.to_le_bytes());
        bytes[0x0c..0x10].copy_from_slice(&1u32.to_le_bytes());
        bytes[0x10..0x14].copy_from_slice(&21u32.to_le_bytes());
        let model_id = -1085699015i32;
        let animation_id = 0x3E87E9B8i32;
        // Reflected offsets: nudHandle 320, animationHash 656, spawnForm0 88.
        let model_off = EFXBN_BLOCK_REGION_OFFSET + 320;
        let animation_off = EFXBN_BLOCK_REGION_OFFSET + 656;
        let first_control_ref_off = EFXBN_BLOCK_REGION_OFFSET + 88;
        let first_lookup_entry_off = EFXBN_BLOCK_REGION_OFFSET + EFXBN_BLOCK_STRIDE;
        bytes[model_off..model_off + 4].copy_from_slice(&model_id.to_le_bytes());
        bytes[animation_off..animation_off + 4].copy_from_slice(&animation_id.to_le_bytes());
        bytes[first_control_ref_off..first_control_ref_off + 4]
            .copy_from_slice(&1u32.to_le_bytes());
        bytes[first_control_ref_off + 4..first_control_ref_off + 8]
            .copy_from_slice(&0u32.to_le_bytes());
        bytes[first_lookup_entry_off..first_lookup_entry_off + 4]
            .copy_from_slice(&100f32.to_le_bytes());
        bytes[first_lookup_entry_off + 4..first_lookup_entry_off + 8]
            .copy_from_slice(&1.5f32.to_le_bytes());

        let parsed = parse_efxbn_bytes(&bytes, "memory").unwrap();

        assert_eq!(parsed.effect_count, 1);
        assert_eq!(parsed.model_ids[0].signed, model_id);
        assert_eq!(parsed.effects[0].model_id, model_id);
        assert_eq!(parsed.animation_ids[0].signed, animation_id);
        assert_eq!(parsed.effects[0].animation_id, animation_id);
        assert_eq!(parsed.effects[0].animation_hash.hex, "0x3E87E9B8");
        assert_eq!(parsed.curve_key_count, 21);
        assert_eq!(parsed.control_lookup_entries.len(), 21);
        assert_eq!(parsed.control_lookup_entries[0].key_f32_bits, 0x42C80000);
        assert_eq!(parsed.control_lookup_entries[0].key, 100.0);
        assert_eq!(parsed.control_lookup_entries[0].value_f32_bits, 0x3FC00000);
        assert_eq!(parsed.control_lookup_entries[0].value, 1.5);
        assert_eq!(parsed.effects[0].control_references.len(), 18);
        assert_eq!(parsed.effects[0].control_references[0].name, "spawnForm0");
        // Block offsets equal the reflected SEfxElementData offsets: spawnForm0 at 88,
        // worldGravityAccel at 460, directionAccel at 468.
        assert_eq!(parsed.effects[0].control_references[0].raw_offset, 88);
        assert_eq!(parsed.effects[0].control_references[0].runtime_offset, 88);
        assert_eq!(parsed.effects[0].control_references[0].selector, 1);
        assert_eq!(parsed.effects[0].control_references[0].lookup_index, 0);
        assert_eq!(parsed.effects[0].control_references[16].raw_offset, 460);
        assert_eq!(parsed.effects[0].control_references[17].runtime_offset, 468);
        assert_eq!(parsed.effects[0].meta_parsed.unk_config_info.len(), 8);
        assert_eq!(
            parsed.effects[0]
                .meta_parsed
                .config_header
                .unk_bytes12
                .len(),
            12
        );
        assert_eq!(
            parsed.effects[0].meta_parsed.config_header.unk_floats4,
            [0.0, 0.0, 0.0, 0.0]
        );
        assert_eq!(parsed.effects[0].meta_parsed.model_id, model_id);
        assert_eq!(parsed.effects[0].meta_parsed.animation_id, animation_id);
        assert_eq!(parsed.effects[0].meta_parsed.unk32, 0);
        assert_eq!(parsed.effects[0].meta_parsed.unk_config_info2.len(), 8);
        assert_eq!(parsed.effects[0].meta_parsed.id_table_pairs.len(), 16);
        assert_eq!(parsed.effects[0].meta_parsed.control_references.len(), 18);
        let json = serde_json::to_value(&parsed).unwrap();
        assert!(json["effects"][0]["metaParsed"].is_object());
        assert!(json["effects"][0]["metaParsed"]["unkConfigInfo"].is_array());
        assert!(json["effects"][0]["metaParsed"]["configHeader"]["unkBytes12"].is_array());
    }

    #[test]
    fn copy_closure_uses_resource_hashes_not_control_lookup_indexes() {
        fn item_node(file_index: i32, hash: i32) -> Node {
            Node::Item {
                entry_index: file_index as usize,
                entry: SubFileStructureEntry::Item {
                    unk1: String::new(),
                    file_index,
                    unk2: String::new(),
                    unk2_1: 0,
                    unk3: hash,
                    unk4: 0,
                    original_file_index: file_index,
                    display_name: None,
                },
                file_index,
            }
        }

        fn record(root: &Path, file_index: i32, ext: &str, stem: &str) -> FileRecord {
            let path = root.join(format!("{stem}{ext}"));
            if !path.exists() {
                fs::write(&path, b"stub").unwrap();
            }
            FileRecord {
                file_index,
                file_type: ext.to_string(),
                actual_ext: ext.to_string(),
                file_url: path.to_string_lossy().to_string(),
                file_base_name: stem.to_string(),
                path,
            }
        }

        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let model_id = 100i32;
        let texture_id = 200i32;
        let animation_id = 300i32;
        let efxbn_hash = 999i32;

        let control_lookup_offset = EFXBN_BLOCK_REGION_OFFSET + EFXBN_BLOCK_STRIDE;
        let model_control_offset = control_lookup_offset + EFXBN_CURVE_KEY_STRIDE;
        let mut bytes = vec![0u8; model_control_offset + 0xb8];
        let file_size = bytes.len() as u32;
        bytes[0..4].copy_from_slice(b"EFXB");
        bytes[0x04..0x08].copy_from_slice(&2u32.to_le_bytes());
        bytes[0x08..0x0c].copy_from_slice(&file_size.to_le_bytes());
        bytes[0x0c..0x10].copy_from_slice(&1u32.to_le_bytes());
        bytes[0x10..0x14].copy_from_slice(&1u32.to_le_bytes());
        bytes[0x14..0x18].copy_from_slice(&1u32.to_le_bytes());
        bytes[0x20 + 0x138..0x20 + 0x13c].copy_from_slice(&model_id.to_le_bytes());
        bytes[0x20 + 0x288..0x20 + 0x28c].copy_from_slice(&animation_id.to_le_bytes());
        bytes[0x20 + 0x50..0x20 + 0x54].copy_from_slice(&1u32.to_le_bytes());
        // This is a control lookup index, deliberately equal to an unrelated fileIndex.
        bytes[0x20 + 0x54..0x20 + 0x58].copy_from_slice(&6u32.to_le_bytes());
        bytes[model_control_offset + 4..model_control_offset + 8]
            .copy_from_slice(&texture_id.to_le_bytes());
        let efxbn_path = root.join("effect.efxbn");
        fs::write(&efxbn_path, bytes).unwrap();

        let model_file = item_node(10, 0);
        let model = Node::Folder {
            entry_index: 7,
            entry: SubFileStructureEntry::Folder {
                unk1: String::new(),
                folder_count: 1,
                unk2: String::new(),
                unk2_1: 0,
                unk3: 2,
                unk4: 0,
                unk5: model_id,
                unk6: 0,
            },
            children: vec![model_file],
        };
        let forest = vec![
            item_node(1, efxbn_hash),
            item_node(2, texture_id),
            item_node(3, model_id),
            item_node(4, efxbn_hash),
            item_node(5, animation_id),
            item_node(6, 6),
            model,
        ];
        let mut records = HashMap::new();
        let mut efxbn_record = record(root, 1, ".efxbn", "effect");
        efxbn_record.path = efxbn_path;
        records.insert(1, efxbn_record);
        records.insert(2, record(root, 2, ".nutexb", "direct_texture"));
        records.insert(3, record(root, 3, ".nutexb", "model_hash_false_positive"));
        records.insert(4, record(root, 4, ".nutexb", "efxbn_hash_false_positive"));
        records.insert(5, record(root, 5, ".nuanmb", "animation"));
        records.insert(6, record(root, 6, ".bin", "control_index_false_positive"));
        records.insert(10, record(root, 10, ".numdlb", "model"));

        let mut warnings = Vec::new();
        let closure = build_copy_closure(
            &forest,
            &records,
            &[EffectFolderSelection {
                kind: "efxbn".to_string(),
                file_index: Some(1),
                hash_id: None,
                name: None,
            }],
            &mut warnings,
        );

        assert_eq!(
            closure
                .efxbn_items
                .iter()
                .filter_map(Node::file_index)
                .collect::<Vec<_>>(),
            vec![1]
        );
        assert_eq!(
            closure
                .texture_items
                .iter()
                .filter_map(Node::file_index)
                .collect::<Vec<_>>(),
            vec![2]
        );
        assert_eq!(
            closure
                .animation_items
                .iter()
                .filter_map(Node::file_index)
                .collect::<Vec<_>>(),
            vec![5]
        );
        assert_eq!(
            closure
                .model_nodes
                .iter()
                .filter_map(folder_hash)
                .collect::<Vec<_>>(),
            vec![model_id]
        );
        assert!(warnings.is_empty());
    }

    #[test]
    fn efxbn_regions_follow_header_blocks_keys_model_controls() {
        let effect_count = 3usize;
        let control_config_region_param = 65u32;
        let model_control_count = 1usize;
        let meta_size = effect_count * EFXBN_BLOCK_STRIDE;
        let control_lookup_offset = EFXBN_BLOCK_REGION_OFFSET + meta_size;
        let control_lookup_size = control_config_region_param as usize * EFXBN_CURVE_KEY_STRIDE;
        let model_control_offset = control_lookup_offset + control_lookup_size;
        let file_size = model_control_offset + model_control_count * 0xb8;
        let mut bytes = vec![0u8; file_size];
        bytes[0..4].copy_from_slice(b"EFXB");
        bytes[0x04..0x08].copy_from_slice(&2u32.to_le_bytes());
        bytes[0x08..0x0c].copy_from_slice(&(file_size as u32).to_le_bytes());
        bytes[0x0c..0x10].copy_from_slice(&(effect_count as u32).to_le_bytes());
        bytes[0x10..0x14].copy_from_slice(&control_config_region_param.to_le_bytes());
        bytes[0x14..0x18].copy_from_slice(&(model_control_count as u32).to_le_bytes());
        let first_effect_offset = 0x20usize;
        bytes[first_effect_offset..first_effect_offset + 4].copy_from_slice(&2i32.to_le_bytes());
        bytes[first_effect_offset + 0x20..first_effect_offset + 0x24]
            .copy_from_slice(&9u32.to_le_bytes());
        bytes[first_effect_offset + 0x24..first_effect_offset + 0x28]
            .copy_from_slice(&1.0f32.to_le_bytes());
        bytes[first_effect_offset + 0x28..first_effect_offset + 0x2c]
            .copy_from_slice(&0.25f32.to_le_bytes());
        bytes[first_effect_offset + 0x2c..first_effect_offset + 0x30]
            .copy_from_slice(&3.0f32.to_le_bytes());
        bytes[first_effect_offset + 0x30..first_effect_offset + 0x34]
            .copy_from_slice(&0.5f32.to_le_bytes());
        bytes[first_effect_offset + 0x34..first_effect_offset + 0x38]
            .copy_from_slice(&4u32.to_le_bytes());
        bytes[first_effect_offset + 0x38..first_effect_offset + 0x3c]
            .copy_from_slice(&0x800u32.to_le_bytes());
        bytes[first_effect_offset + 0x3c..first_effect_offset + 0x40]
            .copy_from_slice(&10u32.to_le_bytes());
        bytes[first_effect_offset + 0x40..first_effect_offset + 0x44]
            .copy_from_slice(&128.0f32.to_le_bytes());
        bytes[first_effect_offset + 0xe8..first_effect_offset + 0xec]
            .copy_from_slice(&2.0f32.to_le_bytes());
        bytes[first_effect_offset + 0x16c..first_effect_offset + 0x170]
            .copy_from_slice(&1u32.to_le_bytes());
        bytes[first_effect_offset + 0x170..first_effect_offset + 0x174]
            .copy_from_slice(&1u32.to_le_bytes());
        bytes[first_effect_offset + 0x174..first_effect_offset + 0x178]
            .copy_from_slice(&2u32.to_le_bytes());
        bytes[first_effect_offset + 0x188..first_effect_offset + 0x18c]
            .copy_from_slice(&5.0f32.to_le_bytes());
        bytes[first_effect_offset + 0x1d8..first_effect_offset + 0x1dc]
            .copy_from_slice(&2.0f32.to_le_bytes());
        bytes[first_effect_offset + 0x1e0..first_effect_offset + 0x1e4]
            .copy_from_slice(&8.0f32.to_le_bytes());
        bytes[first_effect_offset + 0x1e8..first_effect_offset + 0x1ec]
            .copy_from_slice(&3u32.to_le_bytes());
        bytes[first_effect_offset + 0x254..first_effect_offset + 0x258]
            .copy_from_slice(&0.25f32.to_le_bytes());
        bytes[first_effect_offset + 0x258..first_effect_offset + 0x25c]
            .copy_from_slice(&0.75f32.to_le_bytes());
        bytes[first_effect_offset + 0x25c..first_effect_offset + 0x260]
            .copy_from_slice(&4.0f32.to_le_bytes());
        bytes[first_effect_offset + 0x2e8..first_effect_offset + 0x2ec]
            .copy_from_slice(&2u32.to_le_bytes());
        bytes[first_effect_offset + 0x2c0..first_effect_offset + 0x2c4]
            .copy_from_slice(&12u32.to_le_bytes());
        bytes[first_effect_offset + 0x2c4..first_effect_offset + 0x2c8]
            .copy_from_slice(&34u32.to_le_bytes());
        for (offset, value) in [(0x148usize, 0i32), (0x14c, -1), (0x150, -1), (0x154, -1)] {
            bytes[first_effect_offset + offset..first_effect_offset + offset + 4]
                .copy_from_slice(&value.to_le_bytes());
        }
        bytes[model_control_offset..model_control_offset + 4].copy_from_slice(&1u32.to_le_bytes());
        let texture_id = 0x6AF9B19Fu32 as i32;
        bytes[model_control_offset + 4..model_control_offset + 8]
            .copy_from_slice(&texture_id.to_le_bytes());
        bytes[model_control_offset + 8..model_control_offset + 12]
            .copy_from_slice(&3u32.to_le_bytes());
        for (offset, value) in [
            (0x0c, 1u32),
            (0x10, 2),
            (0x14, 128),
            (0x18, 256),
            (0x1c, 4),
            (0x4c, 1),
            (0x50, 64),
            (0x54, 32),
            (0x58, 16),
            (0x5c, 8),
            (0x60, 5),
            (0x64, 1),
            (0x78, 0x120),
            (0x7c, 3),
        ] {
            bytes[model_control_offset + offset..model_control_offset + offset + 4]
                .copy_from_slice(&value.to_le_bytes());
        }
        for (offset, value) in [
            (0x20, 0.1f32),
            (0x24, 0.2),
            (0x28, 0.3),
            (0x2c, 0.4),
            (0x30, 1.1),
            (0x34, 1.2),
            (0x38, 1.3),
            (0x3c, 1.4),
            (0x40, 0.5),
            (0x44, -0.25),
            (0x48, 1.5),
            (0x68, 0.01),
            (0x6c, -0.02),
            (0x70, 0.25),
            (0x74, -0.5),
            (0x80, 0.75),
            (0x84, -0.75),
        ] {
            bytes[model_control_offset + offset..model_control_offset + offset + 4]
                .copy_from_slice(&value.to_le_bytes());
        }
        for index in 0..12usize {
            let offset = model_control_offset + 0x88 + index * 4;
            bytes[offset..offset + 4].copy_from_slice(&(100 + index as u32).to_le_bytes());
        }

        let parsed = parse_efxbn_bytes(&bytes, "memory").unwrap();

        assert_eq!(parsed.curve_key_count, control_config_region_param);
        assert_eq!(
            parsed.control_lookup_region_size,
            control_lookup_size as u32
        );
        assert_eq!(
            parsed.control_lookup_region_offset,
            control_lookup_offset as u32
        );
        assert_eq!(
            parsed.model_control_region_offset,
            model_control_offset as u32
        );
        assert_eq!(parsed.trailing_offset, file_size as u32);
        assert_eq!(parsed.effects[0].referenced_effect_index, 2);
        assert_eq!(parsed.effects[0].effect_type, 9);
        assert_eq!(parsed.effects[0].life_time_base, 1.0);
        assert_eq!(parsed.effects[0].life_time_random, 0.25);
        assert_eq!(parsed.effects[0].interval_base, 3.0);
        assert_eq!(parsed.effects[0].interval_random, 0.5);
        assert_eq!(parsed.effects[0].num_emit, 4);
        assert_eq!(parsed.effects[0].action_flags, 0x800);
        assert_eq!(parsed.effects[0].spawn_form_type, 10);
        assert_eq!(parsed.effects[0].spawn_form_length[0], 128.0);
        assert_eq!(parsed.effects[0].size_base[0], 2.0);
        assert_eq!(parsed.effects[0].z_write_enable, 1);
        assert_eq!(parsed.effects[0].z_test_enable, 1);
        assert_eq!(parsed.effects[0].blend_state, 2);
        assert_eq!(parsed.effects[0].position_offset[0], 5.0);
        assert_eq!(parsed.effects[0].strip_segment_interval, 2.0);
        assert_eq!(parsed.effects[0].strip_segment_life, 8.0);
        assert_eq!(parsed.effects[0].strip_segment_split_num, 3);
        assert_eq!(parsed.effects[0].strip_tail_alpha_rate, 0.25);
        assert_eq!(parsed.effects[0].strip_head_alpha_rate, 0.75);
        assert_eq!(parsed.effects[0].emit_interpolate_distance, 4.0);
        assert_eq!(parsed.effects[0].emit_interpolate_type, 2);
        assert_eq!(parsed.effects[0].mesh_emitter_index, 12);
        assert_eq!(parsed.effects[0].mesh_emitter_count, 34);
        assert_eq!(parsed.effects[0].color_texture_parameter_index, [0, -1]);
        assert_eq!(parsed.effects[0].uv_texture_parameter_index, [-1, -1]);
        assert_eq!(parsed.model_control_texture_ids[0].signed, texture_id);
        assert_eq!(parsed.model_controls[0].index, 0);
        assert_eq!(parsed.model_controls[0].input_source_type, 1);
        assert_eq!(parsed.model_controls[0].color_map_id, texture_id);
        assert_eq!(parsed.model_controls[0].color_map_hash.hex, "0x6AF9B19F");
        assert_eq!(parsed.model_controls[0].addressing_mode, 3);
        assert_eq!(parsed.model_controls[0].reverse_u, 1);
        assert_eq!(parsed.model_controls[0].reverse_v, 2);
        assert_eq!(parsed.model_controls[0].texture_width, 128);
        assert_eq!(parsed.model_controls[0].texture_height, 256);
        assert_eq!(parsed.model_controls[0].uv_pattern_type, 4);
        assert_eq!(parsed.model_controls[0].uv_u, [0.1, 0.2, 0.3, 0.4]);
        assert_eq!(parsed.model_controls[0].uv_v, [1.1, 1.2, 1.3, 1.4]);
        assert_eq!(parsed.model_controls[0].uv_scroll_speed, 0.5);
        assert_eq!(parsed.model_controls[0].uv_scroll_limit, -0.25);
        assert_eq!(parsed.model_controls[0].uv_scroll_direction, 1.5);
        assert_eq!(parsed.model_controls[0].uv_animation_random, 1);
        assert_eq!(parsed.model_controls[0].uv_animation_frame_num, 64);
        assert_eq!(parsed.model_controls[0].uv_animation_frame_width, 32);
        assert_eq!(parsed.model_controls[0].uv_animation_frame_height, 16);
        assert_eq!(parsed.model_controls[0].uv_animation_frame_num_by_line, 8);
        assert_eq!(parsed.model_controls[0].uv_animation_frame_time, 5);
        assert_eq!(parsed.model_controls[0].uv_animation_3d_texture, 1);
        assert_eq!(parsed.model_controls[0].uv_scroll_model_speed_u, 0.01);
        assert_eq!(parsed.model_controls[0].uv_scroll_model_speed_v, -0.02);
        assert_eq!(parsed.model_controls[0].uv_distortion_power_u, 0.25);
        assert_eq!(parsed.model_controls[0].uv_distortion_power_v, -0.5);
        assert_eq!(parsed.model_controls[0].texture_setting_flags, 0x120);
        assert_eq!(parsed.model_controls[0].uv_animation_start_frame, 3);
        assert_eq!(parsed.model_controls[0].uv_random_offset_u, 0.75);
        assert_eq!(parsed.model_controls[0].uv_random_offset_v, -0.75);
        assert_eq!(
            parsed.model_controls[0].reserve_area,
            (100u32..112).collect::<Vec<_>>()
        );
        assert_eq!(parsed.texture_parameters.len(), parsed.model_controls.len());
        assert_eq!(
            parsed.texture_parameters[0].color_map_hash.hex,
            "0x6AF9B19F"
        );
        let json = serde_json::to_value(&parsed).unwrap();
        assert!(json["textureParameters"].is_array());
        assert_eq!(
            json["textureParameters"][0]["colorMapHash"]["hex"],
            "0x6AF9B19F"
        );
    }

    #[test]
    fn real_effect_sample_inspects_when_present() {
        let root = Path::new(r"E:\XB\解包\com\file\006effect\0x6D9F47E5");
        let structure = Path::new(r"E:\XB\解包\com\file\006effect\0x6D9F47E5_structure.json");
        if !root.is_dir() || !structure.is_file() {
            eprintln!("SKIP: real 006effect sample is not present.");
            return;
        }

        let inventory =
            inspect_effect_folder(&root.to_string_lossy(), Some(&structure.to_string_lossy()))
                .unwrap();

        assert!(inventory.summary.efxbn_count > 0);
        assert!(inventory.summary.model_count > 0);
        assert!(inventory.summary.texture_count > 0);
    }

    #[test]
    fn real_effect_sample_validates_when_present() {
        let root = Path::new(r"E:\XB\解包\com\file\006effect\0x6D9F47E5");
        let structure = Path::new(r"E:\XB\解包\com\file\006effect\0x6D9F47E5_structure.json");
        if !root.is_dir() || !structure.is_file() {
            eprintln!("SKIP: real 006effect sample is not present.");
            return;
        }

        let result = validate_effect_folder_for_repack(
            &root.to_string_lossy(),
            Some(&structure.to_string_lossy()),
        );

        assert!(
            result.valid,
            "expected real effect sample to validate, errors={}",
            serde_json::to_string_pretty(&result.errors).unwrap()
        );
    }

    #[test]
    fn import_placeholder_efxbn_updates_structure() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("0xTEST");
        fs::create_dir_all(&root).unwrap();
        let structure = tmp.path().join("0xTEST_structure.json");
        fs::write(
            &structure,
            serde_json::to_string_pretty(&json!({
                "Magic": -843925575_i32,
                "Fhm2dTotalCount": 0,
                "UnkCount": 0,
                "SubFileData": [],
                "SubFileStructure": [],
            }))
            .unwrap(),
        )
        .unwrap();

        let result = import_effect_file(
            &root.to_string_lossy(),
            Some(&structure.to_string_lossy()),
            None,
            "efxbn",
            123,
            Some("effect_a"),
        )
        .unwrap();
        let inventory =
            inspect_effect_folder(&root.to_string_lossy(), Some(&structure.to_string_lossy()))
                .unwrap();

        assert_eq!(result.total_files, 1);
        assert_eq!(inventory.summary.efxbn_count, 1);
        assert!(root.join("effect_a.efxbn").is_file());
    }
}
