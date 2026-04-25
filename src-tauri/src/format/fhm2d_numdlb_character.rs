//! Character / effect FHM2D naming (`fhm2d_character` full package vs `fhm2d_effect` model subset + nutexb).
//! Source of truth; supersedes deprecated TS `applyNumdlbBaseNameToStructureObject`.

use std::collections::HashMap;

use super::{
    build_file_index_map, build_file_url, parent_segments, read_c_string_utf8, read_u64_le,
    split_path_segments, strip_extension, DecodedSubFile, OutputSubFileData, ParseNode,
};

const NUST_NUMATB_SUFFIX: &str = "__nust__";

/// Full character package vs effect/lightweight model naming (steps 3–5 only apply to `Character`).
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum NumdlbCharacterNamingMode {
    Character,
    Effect,
}

pub(super) fn apply_numdlb_base_name_to_structure(
    sub: &mut [OutputSubFileData],
    parse_root: &ParseNode,
    files: &[DecodedSubFile],
    mode: NumdlbCharacterNamingMode,
) -> Result<(), String> {
    let by_file_index = build_file_index_map(sub)?;
    let mut file_index_to_sub: HashMap<i32, usize> = HashMap::new();
    for (i, item) in sub.iter().enumerate() {
        file_index_to_sub.insert(item.file_index, i);
    }

    // Step 1: numdlb model names + rewrite fileUrl
    for item in sub.iter_mut() {
        if !item.file_type.eq_ignore_ascii_case(".numdlb") {
            continue;
        }
        let source_idx = *by_file_index
            .get(&item.file_index)
            .ok_or_else(|| format!("Character naming missing fileIndex {}", item.file_index))?;
        let modl = parse_numdlb_modl_info_v17(files[source_idx].data.as_slice())?;
        let prefix = parent_segments(item.file_url.as_str())?;
        item.file_base_name = Some(modl.model_name.clone());
        item.file_url = build_file_url(
            prefix.as_slice(),
            format!("{}{}", modl.model_name, item.file_type).as_str(),
        );
    }

    // Step 2: group renames (jnttbl, skeleton, materials, mesh)
    let numdlb_indices: Vec<usize> = sub
        .iter()
        .enumerate()
        .filter(|(_, e)| e.file_type.eq_ignore_ascii_case(".numdlb"))
        .map(|(i, _)| i)
        .collect();

    for &numdlb_idx in &numdlb_indices {
        let numdlb_item = &sub[numdlb_idx];
        let modl = parse_numdlb_modl_info_v17(
            files[*by_file_index.get(&numdlb_item.file_index).ok_or_else(|| {
                format!(
                    "Character naming missing fileIndex {}",
                    numdlb_item.file_index
                )
            })?]
            .data
            .as_slice(),
        )?;

        let Some(folder_path) = find_folder_path_for_file_index(parse_root, numdlb_item.file_index)
        else {
            continue;
        };
        let Some(folder_node) = find_folder_node_by_path(parse_root, folder_path.as_slice()) else {
            continue;
        };

        let mut group_item_indices: Vec<i32> = Vec::new();
        collect_item_file_indices(folder_node, &mut group_item_indices);

        let mut items_in_group: Vec<usize> = group_item_indices
            .iter()
            .filter_map(|idx| file_index_to_sub.get(idx).copied())
            .collect();

        items_in_group.sort_by_key(|&i| sub[i].file_index);

        let numdlb_in_group: Vec<usize> = items_in_group
            .iter()
            .copied()
            .filter(|&i| sub[i].file_type.eq_ignore_ascii_case(".numdlb"))
            .collect();
        let skeleton_candidates: Vec<usize> = items_in_group
            .iter()
            .copied()
            .filter(|&i| sub[i].file_type.eq_ignore_ascii_case(".nusktb"))
            .collect();
        let material_candidates: Vec<usize> = items_in_group
            .iter()
            .copied()
            .filter(|&i| sub[i].file_type.eq_ignore_ascii_case(".numatb"))
            .collect();
        let mesh_candidates: Vec<usize> = items_in_group
            .iter()
            .copied()
            .filter(|&i| sub[i].file_type.eq_ignore_ascii_case(".numshb"))
            .collect();
        let jnttbl_candidates: Vec<usize> = items_in_group
            .iter()
            .copied()
            .filter(|&i| sub[i].file_type.eq_ignore_ascii_case(".bin"))
            .collect();

        if numdlb_in_group.len() != 1 {
            return Err(format!(
                "Ambiguous group folder for numdlb fileIndex={}: expected 1 numdlb in group, got {}",
                numdlb_item.file_index,
                numdlb_in_group.len()
            ));
        }
        if skeleton_candidates.len() != 1 {
            return Err(format!(
                "Ambiguous group folder for numdlb fileIndex={}: expected 1 nusktb in group, got {}",
                numdlb_item.file_index,
                skeleton_candidates.len()
            ));
        }
        if mesh_candidates.len() != 1 {
            return Err(format!(
                "Ambiguous group folder for numdlb fileIndex={}: expected 1 numshb in group, got {}",
                numdlb_item.file_index,
                mesh_candidates.len()
            ));
        }

        let material_names: Vec<String> = modl
            .material_file_names
            .iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        let declared_material_count = material_names.len();

        if mode == NumdlbCharacterNamingMode::Character {
            if material_candidates.len() < declared_material_count {
                return Err(format!(
                    "Ambiguous group folder for numdlb fileIndex={}: expected at least {} numatb in group, got {}",
                    numdlb_item.file_index,
                    declared_material_count,
                    material_candidates.len()
                ));
            }
        }
        let extra_numatb_count = material_candidates
            .len()
            .saturating_sub(declared_material_count);
        if extra_numatb_count > 0 {
            if declared_material_count < 2 {
                if mode == NumdlbCharacterNamingMode::Character {
                    return Err(format!(
                        "numdlb fileIndex={}: {} extra numatb file(s) require materialFileNames[1] as __nust__ template, but only {} material path(s) in numdlb",
                        numdlb_item.file_index,
                        extra_numatb_count,
                        declared_material_count
                    ));
                }
            } else {
                let nust_template_desired = basename_from_mixed_path(material_names[1].as_str());
                let nust_template_stripped = strip_extension(nust_template_desired.as_str());
                assert_nust_material_template_for_extras(
                    nust_template_stripped.as_str(),
                    numdlb_item.file_index,
                )?;
            }
        }

        if jnttbl_candidates.len() == 1 {
            let target = jnttbl_candidates[0];
            let item = &mut sub[target];
            let prefix = parent_segments(item.file_url.as_str())?;
            let desired = format!("{}.jnttbl", modl.model_name);
            item.file_base_name = Some(modl.model_name.clone());
            item.file_url = build_file_url(prefix.as_slice(), desired.as_str());
        } else if jnttbl_candidates.len() > 1 {
            return Err(format!(
                "Ambiguous group folder for numdlb fileIndex={}: expected 0 or 1 .bin (jnttbl) in group, got {}",
                numdlb_item.file_index,
                jnttbl_candidates.len()
            ));
        }

        if !modl.skeleton_file_name.is_empty() {
            let desired = basename_from_mixed_path(modl.skeleton_file_name.as_str());
            let desired_base = strip_extension(desired.as_str());
            let target = skeleton_candidates[0];
            let item = &mut sub[target];
            let prefix = parent_segments(item.file_url.as_str())?;
            item.file_base_name = Some(desired_base);
            item.file_url = build_file_url(prefix.as_slice(), desired.as_str());
        }

        let nust_template_stripped_for_extras =
            if extra_numatb_count > 0 && declared_material_count >= 2 {
                strip_extension(basename_from_mixed_path(material_names[1].as_str()).as_str())
            } else {
                String::new()
            };

        let main_material_rename = declared_material_count.min(material_candidates.len());
        for i in 0..main_material_rename {
            let desired = basename_from_mixed_path(material_names[i].as_str());
            let desired_base = strip_extension(desired.as_str());
            let target = material_candidates[i];
            let item = &mut sub[target];
            let prefix = parent_segments(item.file_url.as_str())?;
            item.file_base_name = Some(desired_base);
            item.file_url = build_file_url(prefix.as_slice(), desired.as_str());
        }

        if extra_numatb_count > 0 && declared_material_count >= 2 {
            for e in 0..extra_numatb_count {
                let target = material_candidates[declared_material_count + e];
                let desired = build_extra_nust_numatb_desired_file_name(
                    nust_template_stripped_for_extras.as_str(),
                    e + 1,
                )?;
                let desired_base = strip_extension(desired.as_str());
                let item = &mut sub[target];
                let prefix = parent_segments(item.file_url.as_str())?;
                item.file_base_name = Some(desired_base);
                item.file_url = build_file_url(prefix.as_slice(), desired.as_str());
            }
        }

        if !modl.mesh_file_name.is_empty() {
            let desired = basename_from_mixed_path(modl.mesh_file_name.as_str());
            let desired_base = strip_extension(desired.as_str());
            let target = mesh_candidates[0];
            let item = &mut sub[target];
            let prefix = parent_segments(item.file_url.as_str())?;
            item.file_base_name = Some(desired_base);
            item.file_url = build_file_url(prefix.as_slice(), desired.as_str());
        }
    }

    if mode == NumdlbCharacterNamingMode::Effect {
        return Ok(());
    }

    // Step 3: nuhlpb under 0\3 mapped by model folders under 0\0
    let mut model_names_for_package: Vec<String> = Vec::new();
    if let (Some(model_root), Some(nuhlpb_root)) = (
        find_folder_node_by_path(parse_root, &["0", "0"]),
        find_folder_node_by_path(parse_root, &["0", "3"]),
    ) {
        let model_folders: Vec<&ParseNode> = model_root
            .children
            .as_ref()
            .map(|c| {
                c.iter()
                    .filter(|n| n.node_type.as_deref() == Some("Folder"))
                    .collect()
            })
            .unwrap_or_default();
        let model_folders = sort_folder_nodes_by_numeric_name(model_folders);

        let mut model_names: Vec<String> = Vec::new();
        for folder in model_folders {
            let mut indices: Vec<i32> = Vec::new();
            collect_item_file_indices(folder, &mut indices);
            let group_items: Vec<usize> = indices
                .iter()
                .filter_map(|idx| file_index_to_sub.get(idx).copied())
                .collect();
            let group_numdlb: Vec<usize> = group_items
                .iter()
                .copied()
                .filter(|&i| sub[i].file_type.eq_ignore_ascii_case(".numdlb"))
                .collect();
            if group_numdlb.len() != 1 {
                return Err(format!(
                    "Ambiguous model folder under 0\\0: expected 1 numdlb, got {}",
                    group_numdlb.len()
                ));
            }
            let gi = group_numdlb[0];
            let name = sub[gi].file_base_name.clone().or_else(|| {
                by_file_index.get(&sub[gi].file_index).and_then(|&si| {
                    parse_numdlb_modl_info_v17(files[si].data.as_slice())
                        .ok()
                        .map(|m| m.model_name)
                })
            });
            let name = name.ok_or_else(|| {
                "Missing modelName for numdlb in model folder under 0\\0".to_string()
            })?;
            model_names.push(name);
        }
        model_names_for_package = model_names.clone();

        let mut nuhlpb_indices: Vec<i32> = Vec::new();
        collect_item_file_indices(nuhlpb_root, &mut nuhlpb_indices);
        let mut nuhlpb_items: Vec<usize> = nuhlpb_indices
            .iter()
            .filter_map(|idx| file_index_to_sub.get(idx).copied())
            .filter(|&i| sub[i].file_type.eq_ignore_ascii_case(".nuhlpb"))
            .collect();
        nuhlpb_items.sort_by_key(|&i| sub[i].file_index);

        if nuhlpb_items.len() != model_names.len() {
            return Err(format!(
                "nuhlpb/model count mismatch: expected {} nuhlpb files in 0\\3, got {}",
                model_names.len(),
                nuhlpb_items.len()
            ));
        }

        for i in 0..model_names.len() {
            let model_name = model_names[i].clone();
            let target = nuhlpb_items[i];
            let item = &mut sub[target];
            let prefix = parent_segments(item.file_url.as_str())?;
            let desired = format!("{}.nuhlpb", model_name);
            item.file_base_name = Some(model_name);
            item.file_url = build_file_url(prefix.as_slice(), desired.as_str());
        }
    }

    // Step 4: four .bin directly under folder "0"
    let numdlb_model_names_fallback: Vec<String> = numdlb_indices
        .iter()
        .filter_map(|&i| sub[i].file_base_name.clone())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let effective_model_names_for_shell = if !model_names_for_package.is_empty() {
        model_names_for_package.clone()
    } else {
        numdlb_model_names_fallback
    };

    if let Some(root_folder0) = find_folder_node_by_path(parse_root, &["0"]) {
        let folder0_bin_items: Vec<usize> = root_folder0
            .children
            .as_ref()
            .map(|children| {
                let mut bins: Vec<usize> = children
                    .iter()
                    .filter(|c| c.node_type.as_deref() == Some("Item"))
                    .filter_map(|c| c.name.parse::<i32>().ok())
                    .filter_map(|fi| file_index_to_sub.get(&fi).copied())
                    .filter(|&i| sub[i].file_type.eq_ignore_ascii_case(".bin"))
                    .collect();
                bins.sort_by_key(|&i| sub[i].file_index);
                bins
            })
            .unwrap_or_default();

        if folder0_bin_items.len() < 4 {
            return Err(format!(
                "Expected at least 4 .bin files directly under folder 0, got {}",
                folder0_bin_items.len()
            ));
        }

        let base_name = normalize_character_base_name_from_model_names(
            effective_model_names_for_shell.as_slice(),
        );
        if !base_name.is_empty() {
            let character_id_item = folder0_bin_items[0];
            {
                let item = &mut sub[character_id_item];
                let prefix = parent_segments(item.file_url.as_str())?;
                let desired = format!("characterid_{}.bin", base_name);
                item.file_base_name = Some(format!("characterid_{}", base_name));
                item.file_url = build_file_url(prefix.as_slice(), desired.as_str());
            }
            let shell_item = folder0_bin_items[1];
            {
                let item = &mut sub[shell_item];
                let prefix = parent_segments(item.file_url.as_str())?;
                let desired = format!("shell_{}.shl", base_name);
                item.file_base_name = Some(format!("shell_{}", base_name));
                item.file_url = build_file_url(prefix.as_slice(), desired.as_str());
            }
            let vernier_item = folder0_bin_items[2];
            {
                let item = &mut sub[vernier_item];
                let prefix = parent_segments(item.file_url.as_str())?;
                let desired = format!("vernier_table_{}.bin", base_name);
                item.file_base_name = Some(format!("vernier_table_{}", base_name));
                item.file_url = build_file_url(prefix.as_slice(), desired.as_str());
            }
            let effect_item = folder0_bin_items[3];
            {
                let item = &mut sub[effect_item];
                let prefix = parent_segments(item.file_url.as_str())?;
                let desired = format!("effect_project_{}.bin", base_name);
                item.file_base_name = Some(format!("effect_project_{}", base_name));
                item.file_url = build_file_url(prefix.as_slice(), desired.as_str());
            }
        }
    }

    // Step 5: classify .bin under 0\1 by magic
    if let Some(folder01) = find_folder_node_by_path(parse_root, &["0", "1"]) {
        let mut indices: Vec<i32> = Vec::new();
        collect_item_file_indices(folder01, &mut indices);
        let mut bin_items: Vec<usize> = indices
            .iter()
            .filter_map(|idx| file_index_to_sub.get(idx).copied())
            .filter(|&i| sub[i].file_type.eq_ignore_ascii_case(".bin"))
            .collect();
        bin_items.sort_by_key(|&i| sub[i].file_index);

        for &i in &bin_items {
            let file_index = sub[i].file_index;
            let source_idx = *by_file_index
                .get(&file_index)
                .ok_or_else(|| format!("Character 0\\1 magic: missing fileIndex {}", file_index))?;
            let bytes = files[source_idx].data.as_slice();
            let magic = if bytes.len() >= 4 {
                core::str::from_utf8(&bytes[0..4]).unwrap_or("")
            } else {
                ""
            };
            let new_ext = if magic == "RGDL" { ".rgdprm" } else { ".hkt" };
            let item = &mut sub[i];
            let prefix = parent_segments(item.file_url.as_str())?;
            let segments = split_path_segments(item.file_url.as_str());
            let old_name = segments.last().map(|s| s.as_str()).unwrap_or("");
            let base = strip_extension(old_name);
            item.file_base_name = Some(base.clone());
            item.file_type = new_ext.to_string();
            item.file_url =
                build_file_url(prefix.as_slice(), format!("{}{}", base, new_ext).as_str());
        }
    }

    Ok(())
}

struct NumdlbModlInfoV17 {
    model_name: String,
    skeleton_file_name: String,
    material_file_names: Vec<String>,
    #[allow(dead_code)]
    animation_file_name: Option<String>,
    mesh_file_name: String,
}

/// Modl `model_name` may be stored as a path like `\name.numdlx`; strip separators and wrong extensions.
fn normalize_numdlb_model_name(raw: &str) -> String {
    let mut s = raw.trim().to_string();
    while s.starts_with('\\') || s.starts_with('/') {
        s = s[1..].trim_start().to_string();
    }
    s = basename_from_mixed_path(s.as_str());
    loop {
        let lower = s.to_ascii_lowercase();
        if !lower.ends_with(".numdlx") && !lower.ends_with(".numdlb") {
            break;
        }
        let next = strip_extension(s.as_str());
        if next.len() == s.len() {
            break;
        }
        s = next;
    }
    s.trim().to_string()
}

fn parse_numdlb_modl_info_v17(bytes: &[u8]) -> Result<NumdlbModlInfoV17, String> {
    if bytes.get(0..4) != Some(b"HBSS") || bytes.get(0x10..0x14) != Some(b"LDOM") {
        return Err("Invalid numdlb header for Modl parse".to_string());
    }
    let major = read_u16_le(bytes, 0x14)?;
    let minor = read_u16_le(bytes, 0x16)?;
    if major != 1 || minor != 7 {
        return Err(format!("Unsupported numdlb Modl version: {major}.{minor}"));
    }
    const BASE: usize = 0x18;
    let model_raw = read_ssbh_string_at(bytes, BASE + 0x00)?;
    if model_raw.trim().is_empty() {
        return Err("numdlb model_name is empty".to_string());
    }
    let model_name = normalize_numdlb_model_name(model_raw.as_str());
    if model_name.is_empty() {
        return Err("numdlb model_name is empty after normalize".to_string());
    }
    let skeleton_file_name = read_ssbh_string_at(bytes, BASE + 0x08)?;
    let mat_header = read_ssbh_array_header(bytes, BASE + 0x10)?;
    let mut material_file_names = Vec::with_capacity(mat_header.count);
    for i in 0..mat_header.count {
        let element_offset = mat_header
            .data_offset
            .checked_add(i * 8)
            .ok_or_else(|| "numdlb material array element offset overflow".to_string())?;
        material_file_names.push(read_ssbh_string_at(bytes, element_offset)?);
    }
    let animation_file_name = match read_rel_ptr64_abs(bytes, BASE + 0x20)? {
        Some(off) => Some(read_ssbh_string_at(bytes, off)?),
        None => None,
    };
    let mesh_file_name = read_ssbh_string_at(bytes, BASE + 0x28)?;
    Ok(NumdlbModlInfoV17 {
        model_name,
        skeleton_file_name,
        material_file_names,
        animation_file_name,
        mesh_file_name,
    })
}

fn read_u16_le(data: &[u8], offset: usize) -> Result<u16, String> {
    let b = data
        .get(offset..offset + 2)
        .ok_or_else(|| format!("read_u16 out of range at 0x{offset:X}"))?;
    Ok(u16::from_le_bytes([b[0], b[1]]))
}

fn read_rel_ptr64_abs(data: &[u8], field_offset: usize) -> Result<Option<usize>, String> {
    let rel = read_u64_le(data, field_offset)?;
    if rel == 0 {
        return Ok(None);
    }
    field_offset
        .checked_add(rel as usize)
        .ok_or_else(|| "RelPtr64 absolute offset overflow".to_string())
        .map(Some)
}

fn read_ssbh_string_at(data: &[u8], pointer_field_offset: usize) -> Result<String, String> {
    let Some(abs) = read_rel_ptr64_abs(data, pointer_field_offset)? else {
        return Ok(String::new());
    };
    read_c_string_utf8(data, abs, 4096)
}

struct SsbhArrayHeader {
    data_offset: usize,
    count: usize,
}

fn read_ssbh_array_header(data: &[u8], field_offset: usize) -> Result<SsbhArrayHeader, String> {
    let rel = read_u64_le(data, field_offset)?;
    let count_u64 = read_u64_le(data, field_offset + 8)?;
    let count = usize::try_from(count_u64).map_err(|_| "SsbhArray count overflow".to_string())?;
    if count == 0 {
        return Ok(SsbhArrayHeader {
            data_offset: field_offset,
            count: 0,
        });
    }
    let abs = field_offset
        .checked_add(rel as usize)
        .ok_or_else(|| "SsbhArray data offset overflow".to_string())?;
    Ok(SsbhArrayHeader {
        data_offset: abs,
        count,
    })
}

fn basename_from_mixed_path(path: &str) -> String {
    let normalized = path.trim_start_matches(['.', '/', '\\']);
    let parts: Vec<&str> = normalized
        .split(['/', '\\'])
        .filter(|s| !s.is_empty())
        .collect();
    parts
        .last()
        .map(|s| (*s).to_string())
        .unwrap_or_else(|| path.to_string())
}

fn assert_nust_material_template_for_extras(
    stripped_basename: &str,
    numdlb_file_index: i32,
) -> Result<(), String> {
    if !stripped_basename.ends_with(NUST_NUMATB_SUFFIX) {
        return Err(format!(
            "numdlb fileIndex={numdlb_file_index}: materialFileNames[1] must be a __nust__ path (e.g. *{NUST_NUMATB_SUFFIX}.numatb), got \"{stripped_basename}\""
        ));
    }
    Ok(())
}

fn build_extra_nust_numatb_desired_file_name(
    nust_template_stripped_basename: &str,
    variant_index_1_based: usize,
) -> Result<String, String> {
    if !nust_template_stripped_basename.ends_with(NUST_NUMATB_SUFFIX) {
        return Err(format!(
            "Invalid nust template basename: \"{nust_template_stripped_basename}\""
        ));
    }
    let prefix = &nust_template_stripped_basename
        [..nust_template_stripped_basename.len() - NUST_NUMATB_SUFFIX.len()];
    let m_part = format!("_m{:03}", variant_index_1_based);
    Ok(format!("{prefix}{m_part}{NUST_NUMATB_SUFFIX}.numatb"))
}

fn find_folder_path_for_file_index(root: &ParseNode, file_index: i32) -> Option<Vec<String>> {
    let target = file_index.to_string();
    fn dfs(node: &ParseNode, parent_folder_path: &[String], target: &str) -> Option<Vec<String>> {
        if node.node_type.as_deref() == Some("Item") {
            return if node.name == target {
                Some(parent_folder_path.to_vec())
            } else {
                None
            };
        }
        let children = node.children.as_ref()?;
        for child in children {
            let next_path = if child.node_type.as_deref() == Some("Folder") {
                let mut p = parent_folder_path.to_vec();
                p.push(child.name.clone());
                p
            } else {
                parent_folder_path.to_vec()
            };
            if let Some(result) = dfs(child, &next_path, target) {
                if child.node_type.as_deref() == Some("Item") {
                    return Some(parent_folder_path.to_vec());
                }
                return Some(result);
            }
        }
        None
    }
    dfs(root, &[], target.as_str())
}

fn collect_item_file_indices(node: &ParseNode, out: &mut Vec<i32>) {
    if node.node_type.as_deref() == Some("Item") {
        if let Ok(n) = node.name.parse::<i32>() {
            out.push(n);
        }
        return;
    }
    if let Some(children) = &node.children {
        for c in children {
            collect_item_file_indices(c, out);
        }
    }
}

fn find_folder_node_by_path<'a>(
    root: &'a ParseNode,
    folder_path: &[impl AsRef<str>],
) -> Option<&'a ParseNode> {
    let mut current = root;
    for segment in folder_path {
        let seg = segment.as_ref();
        let children = current.children.as_ref()?;
        let next = children
            .iter()
            .find(|c| c.node_type.as_deref() == Some("Folder") && c.name.as_str() == seg)?;
        current = next;
    }
    Some(current)
}

fn sort_folder_nodes_by_numeric_name<'a>(mut nodes: Vec<&'a ParseNode>) -> Vec<&'a ParseNode> {
    nodes.sort_by(|a, b| {
        let an = a.name.parse::<i32>();
        let bn = b.name.parse::<i32>();
        match (an, bn) {
            (Ok(aa), Ok(bb)) => aa.cmp(&bb),
            _ => a.name.cmp(&b.name),
        }
    });
    nodes
}

fn longest_common_prefix(strings: &[String]) -> String {
    if strings.is_empty() {
        return String::new();
    }
    let mut prefix = strings[0].clone();
    for s in strings.iter().skip(1) {
        prefix = prefix
            .chars()
            .zip(s.chars())
            .take_while(|(a, b)| a == b)
            .map(|(ch, _)| ch)
            .collect();
        if prefix.is_empty() {
            return String::new();
        }
    }
    prefix
}

fn normalize_character_base_name_from_model_names(model_names: &[String]) -> String {
    let filtered: Vec<String> = model_names
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if filtered.is_empty() {
        return String::new();
    }
    let lcp = longest_common_prefix(filtered.as_slice());
    let trimmed = lcp.trim_end_matches(|c| c == '_' || c == '\\' || c == '/' || c == '-');
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }
    filtered[0]
        .trim_end_matches(|c| c == '_' || c == '\\' || c == '/' || c == '-')
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_u16_le(bytes: &mut [u8], offset: usize, value: u16) {
        bytes[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
    }

    fn write_u64_le(bytes: &mut [u8], offset: usize, value: u64) {
        bytes[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
    }

    fn write_c_string(bytes: &mut [u8], offset: usize, value: &str) {
        let end = offset + value.len();
        bytes[offset..end].copy_from_slice(value.as_bytes());
        bytes[end] = 0;
    }

    fn set_rel_ptr(bytes: &mut [u8], field_offset: usize, target_offset: usize) {
        write_u64_le(bytes, field_offset, (target_offset - field_offset) as u64);
    }

    fn make_test_numdlb() -> Vec<u8> {
        let mut bytes = vec![0u8; 0x200];
        bytes[0x00..0x04].copy_from_slice(b"HBSS");
        bytes[0x10..0x14].copy_from_slice(b"LDOM");
        write_u16_le(&mut bytes, 0x14, 1);
        write_u16_le(&mut bytes, 0x16, 7);

        const BASE: usize = 0x18;
        set_rel_ptr(&mut bytes, BASE + 0x00, 0x80);
        set_rel_ptr(&mut bytes, BASE + 0x20, 0x60);
        write_u64_le(&mut bytes, BASE + 0x10, 0);
        write_u64_le(&mut bytes, BASE + 0x18, 0);
        set_rel_ptr(&mut bytes, 0x60, 0x90);

        write_c_string(&mut bytes, 0x80, "body_model");
        write_c_string(&mut bytes, 0x90, "body_anim.nuanmb");

        bytes
    }

    fn make_empty_parse_root() -> ParseNode {
        ParseNode {
            node_type: None,
            name: "Root".to_string(),
            link: None,
            unk1: None,
            unk2: None,
            unk3: None,
            children: Some(Vec::new()),
        }
    }

    #[test]
    fn parse_numdlb_modl_info_reads_animation_name_via_nested_rel_ptr() {
        let bytes = make_test_numdlb();

        let info = parse_numdlb_modl_info_v17(bytes.as_slice()).expect("numdlb should parse");

        assert_eq!(info.model_name, "body_model");
        assert_eq!(
            info.animation_file_name.as_deref(),
            Some("body_anim.nuanmb")
        );
    }

    #[test]
    fn apply_numdlb_base_name_skips_step2_when_parse_folder_is_missing() {
        let mut sub = vec![OutputSubFileData {
            index: 0,
            file_type: ".numdlb".to_string(),
            file_index: 7,
            file_url: ".\\pkg\\0.numdlb".to_string(),
            file_base_name: None,
        }];
        let files = vec![DecodedSubFile {
            file_index: 7,
            data: make_test_numdlb(),
        }];
        let parse_root = make_empty_parse_root();

        apply_numdlb_base_name_to_structure(
            &mut sub,
            &parse_root,
            files.as_slice(),
            NumdlbCharacterNamingMode::Character,
        )
        .expect("missing parse folder should be skipped like TS");

        assert_eq!(sub[0].file_base_name.as_deref(), Some("body_model"));
        assert_eq!(sub[0].file_url, ".\\pkg\\body_model.numdlb");
    }

    #[test]
    fn longest_common_prefix_handles_unicode_without_panicking() {
        let values = vec!["机体_alpha".to_string(), "机体_beta".to_string()];

        let prefix = longest_common_prefix(values.as_slice());

        assert_eq!(prefix, "机体_");
    }

    #[test]
    fn normalize_numdlb_model_name_strips_leading_slash_and_numdlx_extension() {
        let raw = r"\eff_021destny_001strkfr_001_wing_001.numdlx";
        assert_eq!(
            normalize_numdlb_model_name(raw),
            "eff_021destny_001strkfr_001_wing_001"
        );
    }
}
