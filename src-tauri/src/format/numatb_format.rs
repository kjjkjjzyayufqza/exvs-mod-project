use ssbh_data::matl_data::{MatlData, MatlEntryData, ParamId};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NumatbProfileKind {
    Maya,
    Nust,
}

/// Heuristic: `__maya__` in basename selects Maya profile; otherwise Nust.
pub fn detect_numatb_profile_from_name(name: &str) -> NumatbProfileKind {
    if name.to_ascii_lowercase().contains("__maya__") {
        NumatbProfileKind::Maya
    } else {
        NumatbProfileKind::Nust
    }
}

pub const TEXTURE_MAP_USE_TOGGLES: &[(ParamId, ParamId)] = &[
    (ParamId::MetallicMap, ParamId::UseMetallicMap),
    (ParamId::RoughnessMap, ParamId::UseRoughnessMap),
    (
        ParamId::AmbientOcclusionMap,
        ParamId::UseAmbientOcclusionMap,
    ),
    (ParamId::NormalMap, ParamId::UseNormalMap),
    (ParamId::EmissiveMap, ParamId::UseEmissiveMap),
];

const BASE_COLOR_MAP_PATHS: &[ParamId] = &[
    ParamId::BaseColorMap,
    ParamId::BaseColorMapLayer1,
    ParamId::DiffuseMap,
    ParamId::DiffuseMapLayer1,
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MissingTexturePath {
    pub material_label: String,
    pub param_id: ParamId,
    pub is_textures2_bucket: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct TexturePathSlot<'a> {
    path: &'a str,
    is_textures2_bucket: bool,
}

pub fn read_entry_boolean(entry: &MatlEntryData, param_id: ParamId) -> Option<bool> {
    entry
        .booleans
        .iter()
        .find(|row| row.param_id == param_id)
        .map(|row| row.data)
}

pub fn entry_has_texture_param(entry: &MatlEntryData, param_id: ParamId) -> bool {
    entry.textures.iter().any(|row| row.param_id == param_id)
        || entry.textures2.iter().any(|row| row.param_id == param_id)
}

pub fn is_base_color_map_path_required(entry: &MatlEntryData) -> bool {
    let use_base = read_entry_boolean(entry, ParamId::UseBaseColorMap);
    let use_diffuse = read_entry_boolean(entry, ParamId::UseDiffuseMap);

    if use_base == Some(true) || use_diffuse == Some(true) {
        return true;
    }
    if use_base == Some(false) || use_diffuse == Some(false) {
        return false;
    }

    BASE_COLOR_MAP_PATHS
        .iter()
        .any(|&param_id| entry_has_texture_param(entry, param_id))
}

pub fn collect_required_texture_map_param_ids(
    entry: &MatlEntryData,
    profile: NumatbProfileKind,
) -> Vec<ParamId> {
    let mut required = Vec::new();

    // Texture1 is validated only when the entry actually declares it (textures or textures2),
    // never forced onto materials that never had a Texture1 param.
    if entry_has_texture_param(entry, ParamId::Texture1) {
        push_unique(&mut required, ParamId::Texture1);
    }

    for &(map_id, use_id) in TEXTURE_MAP_USE_TOGGLES {
        if read_entry_boolean(entry, use_id) == Some(true) {
            push_unique(&mut required, map_id);
        }
    }

    // EXVS Maya materials may declare UseSpecularUvTransform without a SpecularMap slot.
    // Do not treat the UV toggle as a blanket SpecularMap requirement; only flag when
    // the slot row exists and UseSpecularUvTransform is true.
    if profile == NumatbProfileKind::Maya && should_require_maya_specular_map_path(entry) {
        push_unique(&mut required, ParamId::SpecularMap);
    }

    // EXVS materials may declare UseDiffuseUvTransform without a DiffuseCubeMap slot.
    // Do not treat the UV toggle as a blanket DiffuseCubeMap requirement; only flag when
    // the slot row exists and UseDiffuseUvTransform is true.
    if should_require_diffuse_cube_map_path(entry) {
        push_unique(&mut required, ParamId::DiffuseCubeMap);
    }

    if is_base_color_map_path_required(entry) {
        let use_explicit = read_entry_boolean(entry, ParamId::UseBaseColorMap) == Some(true)
            || read_entry_boolean(entry, ParamId::UseDiffuseMap) == Some(true);

        if use_explicit {
            let mut found_present = false;
            for &param_id in BASE_COLOR_MAP_PATHS {
                if entry_has_texture_param(entry, param_id) {
                    push_unique(&mut required, param_id);
                    found_present = true;
                }
            }
            if !found_present {
                push_unique(&mut required, ParamId::BaseColorMap);
            }
        } else {
            for &param_id in BASE_COLOR_MAP_PATHS {
                if entry_has_texture_param(entry, param_id) {
                    push_unique(&mut required, param_id);
                }
            }
        }
    }

    required
}

pub fn param_texture_path(entry: &MatlEntryData, param_id: ParamId) -> Option<&str> {
    lookup_texture_path_slot(entry, param_id).map(|slot| slot.path)
}

pub fn texture_param_uses_textures2_bucket(entry: &MatlEntryData, param_id: ParamId) -> bool {
    lookup_texture_path_slot(entry, param_id)
        .map(|slot| slot.is_textures2_bucket)
        .unwrap_or_else(|| default_texture_param_uses_textures2_bucket(param_id))
}

pub fn collect_missing_texture_paths_for_entry(
    entry: &MatlEntryData,
    profile: NumatbProfileKind,
) -> Vec<MissingTexturePath> {
    collect_required_texture_map_param_ids(entry, profile)
        .into_iter()
        .filter_map(|param_id| {
            let slot = lookup_texture_path_slot(entry, param_id);
            if slot.is_some_and(|slot| !slot.path.trim().is_empty()) {
                return None;
            }

            Some(MissingTexturePath {
                material_label: entry.material_label.clone(),
                param_id,
                is_textures2_bucket: slot
                    .map(|slot| slot.is_textures2_bucket)
                    .unwrap_or_else(|| default_texture_param_uses_textures2_bucket(param_id)),
            })
        })
        .collect()
}

pub fn collect_missing_texture_paths_for_matl(
    matl: &MatlData,
    profile: NumatbProfileKind,
) -> Vec<MissingTexturePath> {
    matl.entries
        .iter()
        .flat_map(|entry| collect_missing_texture_paths_for_entry(entry, profile))
        .collect()
}

fn lookup_texture_path_slot(
    entry: &MatlEntryData,
    param_id: ParamId,
) -> Option<TexturePathSlot<'_>> {
    entry
        .textures
        .iter()
        .find(|row| row.param_id == param_id)
        .map(|row| TexturePathSlot {
            path: row.data.as_str(),
            is_textures2_bucket: false,
        })
        .or_else(|| {
            entry
                .textures2
                .iter()
                .find(|row| row.param_id == param_id)
                .map(|row| TexturePathSlot {
                    path: row.data.as_str(),
                    is_textures2_bucket: true,
                })
        })
}

fn default_texture_param_uses_textures2_bucket(param_id: ParamId) -> bool {
    matches!(
        param_id,
        ParamId::Texture1
            | ParamId::BaseColorMap
            | ParamId::BaseColorMapLayer1
            | ParamId::EmissiveMap
            | ParamId::NormalMap
            | ParamId::AmbientOcclusionMap
            | ParamId::RoughnessMap
            | ParamId::MetallicMap
            | ParamId::DiffuseCubeMap
    )
}

fn should_require_maya_specular_map_path(entry: &MatlEntryData) -> bool {
    read_entry_boolean(entry, ParamId::UseSpecularUvTransform) == Some(true)
        && entry_has_texture_param(entry, ParamId::SpecularMap)
}

fn should_require_diffuse_cube_map_path(entry: &MatlEntryData) -> bool {
    read_entry_boolean(entry, ParamId::UseDiffuseUvTransform) == Some(true)
        && entry_has_texture_param(entry, ParamId::DiffuseCubeMap)
}

fn push_unique(out: &mut Vec<ParamId>, param_id: ParamId) {
    if !out.contains(&param_id) {
        out.push(param_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ssbh_data::matl_data::{BooleanParam, Texture2Param, TextureParam};

    fn empty_entry(material_label: &str) -> MatlEntryData {
        MatlEntryData {
            material_label: material_label.to_string(),
            shader_label: String::new(),
            blend_states: Vec::new(),
            floats: Vec::new(),
            float1s: Vec::new(),
            booleans: Vec::new(),
            vectors: Vec::new(),
            colors: Vec::new(),
            rasterizer_states: Vec::new(),
            samplers: Vec::new(),
            textures: Vec::new(),
            textures2: Vec::new(),
            type4_v16: Vec::new(),
            type4_v15: Vec::new(),
            uv_transforms: Vec::new(),
        }
    }

    fn boolean(param_id: ParamId, data: bool) -> BooleanParam {
        BooleanParam::new(param_id, data)
    }

    fn texture(param_id: ParamId, data: &str) -> TextureParam {
        TextureParam::new(param_id, data.to_string())
    }

    fn texture2(param_id: ParamId, data: &str) -> Texture2Param {
        Texture2Param::new(param_id, data.to_string())
    }

    fn missing_ids(entry: &MatlEntryData, profile: NumatbProfileKind) -> Vec<ParamId> {
        collect_missing_texture_paths_for_entry(entry, profile)
            .into_iter()
            .map(|missing| missing.param_id)
            .collect()
    }

    const MAYA: NumatbProfileKind = NumatbProfileKind::Maya;
    const NUST: NumatbProfileKind = NumatbProfileKind::Nust;

    #[test]
    fn texture1_not_required_without_a_texture_row() {
        let entry = empty_entry("m1");

        assert!(collect_missing_texture_paths_for_entry(&entry, MAYA).is_empty());
    }

    #[test]
    fn texture1_required_only_when_present_and_empty() {
        let mut entry = empty_entry("m1");
        entry.textures2.push(texture2(ParamId::Texture1, ""));

        let missing = collect_missing_texture_paths_for_entry(&entry, MAYA);

        assert_eq!(missing_ids(&entry, MAYA), vec![ParamId::Texture1]);
        assert_eq!(missing[0].material_label, "m1");
        assert!(missing[0].is_textures2_bucket);
    }

    #[test]
    fn roughness_map_requires_true_use_toggle() {
        let mut entry = empty_entry("m1");
        entry.textures2.push(texture2(ParamId::RoughnessMap, ""));
        entry
            .booleans
            .push(boolean(ParamId::UseRoughnessMap, false));

        assert!(missing_ids(&entry, MAYA).is_empty());

        entry.booleans.clear();
        entry.booleans.push(boolean(ParamId::UseRoughnessMap, true));

        assert_eq!(missing_ids(&entry, MAYA), vec![ParamId::RoughnessMap]);
    }

    #[test]
    fn base_color_slot_is_implicit_when_present() {
        let mut entry = empty_entry("m1");
        entry.textures2.push(texture2(ParamId::BaseColorMap, ""));

        assert_eq!(missing_ids(&entry, MAYA), vec![ParamId::BaseColorMap]);
    }

    #[test]
    fn base_color_false_toggle_disables_implicit_slot_requirement() {
        let mut entry = empty_entry("m1");
        entry.textures2.push(texture2(ParamId::BaseColorMap, ""));
        entry
            .booleans
            .push(boolean(ParamId::UseBaseColorMap, false));

        assert!(missing_ids(&entry, MAYA).is_empty());
    }

    #[test]
    fn explicit_base_color_toggle_requires_default_slot_when_absent() {
        let mut entry = empty_entry("m1");
        entry.booleans.push(boolean(ParamId::UseBaseColorMap, true));

        let missing = collect_missing_texture_paths_for_entry(&entry, MAYA);

        assert_eq!(
            missing.iter().map(|item| item.param_id).collect::<Vec<_>>(),
            vec![ParamId::BaseColorMap]
        );
        assert!(missing[0].is_textures2_bucket);
    }

    #[test]
    fn normal_map_without_use_toggle_is_not_required() {
        let mut entry = empty_entry("m1");
        entry.textures2.push(texture2(ParamId::NormalMap, ""));

        assert!(missing_ids(&entry, MAYA).is_empty());
    }

    #[test]
    fn specular_map_requires_true_use_specular_uv_transform_on_maya_profile() {
        let mut entry = empty_entry("m1");
        entry.textures.push(texture(ParamId::SpecularMap, ""));
        entry
            .booleans
            .push(boolean(ParamId::UseSpecularUvTransform, false));

        assert!(missing_ids(&entry, MAYA).is_empty());

        entry.booleans.clear();
        entry
            .booleans
            .push(boolean(ParamId::UseSpecularUvTransform, true));

        assert_eq!(missing_ids(&entry, MAYA), vec![ParamId::SpecularMap]);
    }

    #[test]
    fn maya_use_specular_uv_transform_without_specular_map_slot_is_allowed() {
        let mut entry = empty_entry("m1");
        entry
            .booleans
            .push(boolean(ParamId::UseSpecularUvTransform, true));

        assert!(missing_ids(&entry, MAYA).is_empty());
    }

    #[test]
    fn nust_profile_does_not_apply_maya_specular_map_rule() {
        let mut entry = empty_entry("m1");
        entry.textures.push(texture(ParamId::SpecularMap, ""));
        entry
            .booleans
            .push(boolean(ParamId::UseSpecularUvTransform, true));

        assert!(missing_ids(&entry, NUST).is_empty());
    }

    #[test]
    fn diffuse_cube_map_requires_true_use_diffuse_uv_transform_when_slot_exists() {
        let mut entry = empty_entry("m1");
        entry.textures2.push(texture2(ParamId::DiffuseCubeMap, ""));
        entry
            .booleans
            .push(boolean(ParamId::UseDiffuseUvTransform, false));

        assert!(missing_ids(&entry, NUST).is_empty());

        entry.booleans.clear();
        entry
            .booleans
            .push(boolean(ParamId::UseDiffuseUvTransform, true));

        assert_eq!(missing_ids(&entry, NUST), vec![ParamId::DiffuseCubeMap]);
        assert_eq!(missing_ids(&entry, MAYA), vec![ParamId::DiffuseCubeMap]);
    }

    #[test]
    fn use_diffuse_uv_transform_without_diffuse_cube_map_slot_is_allowed() {
        let mut entry = empty_entry("m1");
        entry
            .booleans
            .push(boolean(ParamId::UseDiffuseUvTransform, true));

        assert!(missing_ids(&entry, NUST).is_empty());
        assert!(missing_ids(&entry, MAYA).is_empty());
    }

    #[test]
    fn all_enabled_pbr_maps_are_required() {
        let mut entry = empty_entry("emiMtl");
        entry.booleans.extend([
            boolean(ParamId::UseMetallicMap, true),
            boolean(ParamId::UseRoughnessMap, true),
            boolean(ParamId::UseAmbientOcclusionMap, true),
            boolean(ParamId::UseNormalMap, true),
            boolean(ParamId::UseEmissiveMap, true),
            boolean(ParamId::UseSpecularUvTransform, true),
        ]);
        entry.textures2.extend([
            texture2(ParamId::MetallicMap, ""),
            texture2(ParamId::RoughnessMap, ""),
            texture2(ParamId::AmbientOcclusionMap, ""),
            texture2(ParamId::NormalMap, ""),
            texture2(ParamId::EmissiveMap, ""),
            texture2(ParamId::SpecularMap, ""),
        ]);

        assert_eq!(
            missing_ids(&entry, MAYA),
            vec![
                ParamId::MetallicMap,
                ParamId::RoughnessMap,
                ParamId::AmbientOcclusionMap,
                ParamId::NormalMap,
                ParamId::EmissiveMap,
                ParamId::SpecularMap,
            ]
        );
    }

    #[test]
    fn filled_texture1_and_base_color_are_complete_for_pbr_material() {
        let mut entry = empty_entry("pbr1Mtl");
        entry.textures2.extend([
            texture2(ParamId::Texture1, "model/pbr1_texture1"),
            texture2(ParamId::BaseColorMap, "model/pbr1_basecolor"),
        ]);

        assert!(collect_missing_texture_paths_for_entry(&entry, MAYA).is_empty());
    }

    #[test]
    fn matl_validation_checks_every_entry() {
        let mut mapped = empty_entry("mappedMtl");
        mapped.textures.push(texture(ParamId::DiffuseMap, "filled"));

        let mut extra = empty_entry("extraMtl");
        extra.textures.push(texture(ParamId::Texture1, ""));

        let matl = MatlData {
            major_version: 1,
            minor_version: 6,
            entries: vec![mapped, extra],
        };

        let missing = collect_missing_texture_paths_for_matl(&matl, MAYA);

        // mappedMtl has a filled DiffuseMap and no Texture1 row -> complete.
        // extraMtl declares an empty Texture1 -> flagged.
        assert_eq!(
            missing
                .iter()
                .map(|item| (item.material_label.as_str(), item.param_id))
                .collect::<Vec<_>>(),
            vec![("extraMtl", ParamId::Texture1)]
        );
    }

    #[test]
    fn detect_numatb_profile_from_filename() {
        assert_eq!(
            super::detect_numatb_profile_from_name("001stage001_sky__maya__.numatb"),
            NumatbProfileKind::Maya
        );
        assert_eq!(
            super::detect_numatb_profile_from_name("001stage001_sky__nust__.numatb"),
            NumatbProfileKind::Nust
        );
    }
}
