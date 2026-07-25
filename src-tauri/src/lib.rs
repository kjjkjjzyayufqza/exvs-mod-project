use tauri::Manager;

mod character_id_preview;
pub mod collision_mesh;
mod commands;
mod console_color;
pub mod exvs2_json_cli;
#[cfg(debug_assertions)]
mod dev_tools_sync;
mod fhm2d_memory_preview;
pub mod format;
pub mod havok_cli;
pub mod havok_collision_encode;
pub mod havok_mesh_encode;
pub mod havok_mesh_export;
mod jnttbl_cmd;
mod jnttbl_format;
pub mod numshb_collision;
pub mod nutexb_lib;
mod preview_collection_state;
mod scene_memory_session;
mod scene_session_commands;
pub mod ssbh_dae;
mod ssbh_dae_cmd;
mod ssbh_fbx;
mod ssbh_mesh_binary;
mod ssbh_motion;
pub mod ssbh_motion_interchange;
pub mod ssbh_preview;
mod stage_commands;

pub use ssbh_motion::smoke_decode_and_sample_nuanmb;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(commands::WatcherState::default())
        .manage(preview_collection_state::PreviewCollectionState::default())
        .manage(fhm2d_memory_preview::Fhm2dMemorySessionState::default())
        .manage(ssbh_motion::MotionSampleCacheState::default())
        .manage(stage_commands::StagePendingImportState::default())
        .manage(scene_memory_session::SceneSessionState::default())
        .invoke_handler(tauri::generate_handler![
            commands::my_custom_command,
            commands::read_file,
            commands::path_exists,
            commands::copy_file_to_path,
            commands::exec_shell_command,
            commands::exec_shell_command_with_output,
            commands::exec_process_with_output,
            commands::watch_folder,
            commands::suppress_test_editor_watcher,
            commands::nutexb_preview_file_identity,
            commands::nutexb_read_info,
            commands::nutexb_export_dds,
            commands::nutexb_export_png_uncompressed,
            commands::nutexb_export_png,
            commands::nutexb_png_base64,
            commands::nutexb_thumbnail_base64,
            commands::nutexb_preview_base64,
            commands::nutexb_png_bytes,
            commands::nutexb_rgba_bytes,
            commands::nutexb_compressed_bytes,
            commands::nutexb_identity_and_compressed,
            commands::nutexb_stream_identities,
            commands::nutexb_batch_export_png,
            ssbh_preview::ssbh_load_model_preview,
            ssbh_preview::ssbh_list_numdlb_under_tree,
            ssbh_preview::ssbh_load_ssbh_file_as_json,
            ssbh_motion::ssbh_list_nuanmb_under_tree,
            ssbh_motion::ssbh_nuanmb_manifest,
            ssbh_motion::ssbh_load_motion_clip,
            ssbh_motion::ssbh_sample_motion_frame,
            ssbh_motion_interchange::ssbh_export_complete_motion_fbx,
            ssbh_dae_cmd::ssbh_analyze_dae,
            ssbh_dae_cmd::ssbh_analyze_fbx,
            ssbh_dae_cmd::ssbh_export_folder_to_dae,
            ssbh_dae_cmd::ssbh_convert_dae_to_ssbh,
            ssbh_dae_cmd::ssbh_convert_fbx_to_ssbh,
            ssbh_dae_cmd::ssbh_read_numdlb_mapping,
            ssbh_dae_cmd::ssbh_write_numdlb_mapping,
            ssbh_dae_cmd::ssbh_read_nuhlpb,
            ssbh_dae_cmd::ssbh_write_nuhlpb,
            ssbh_dae_cmd::ssbh_template_read_numatb,
            ssbh_dae_cmd::ssbh_template_write_numatb,
            ssbh_dae_cmd::stage_batch_export_dae,
            ssbh_dae_cmd::stage_export_single_dae,
            ssbh_fbx::unit_model_batch_export_fbx,
            jnttbl_cmd::jnttbl_read_file,
            jnttbl_cmd::jnttbl_write_file,
            jnttbl_cmd::ssbh_read_nusktb_bone_names,
            commands::series_image_replace_from_png,
            commands::card_icon_replace_from_png,
            commands::card_icon_replace_from_png_with_dds_format,
            commands::card_icon_detect_dds_format,
            commands::card_icon_batch_replace_with_dds_format,
            commands::copy_asset_as_new,
            commands::remove_asset_workspace,
            commands::move_legacy_workspace_content,
            commands::write_files_batch_base64,
            commands::extract_fhm2d_to_folder,
            commands::bulk_extract_msc_fhm2d_to_folder,
            commands::analyze_fhm2d_structure_migration,
            commands::migrate_fhm2d_structure_metadata,
            character_id_preview::character_id_memory_preview_rows,
            fhm2d_memory_preview::create_fhm2d_memory_session,
            fhm2d_memory_preview::create_fhm2d_memory_session_from_path,
            fhm2d_memory_preview::rename_fhm2d_memory_entry,
            fhm2d_memory_preview::list_fhm2d_memory_preview_candidates,
            fhm2d_memory_preview::build_ssbh_preview_bundle_from_memory,
            fhm2d_memory_preview::fhm2d_memory_nutexb_preview_identity,
            fhm2d_memory_preview::fhm2d_memory_nutexb_png_bytes,
            fhm2d_memory_preview::fhm2d_memory_nutexb_rgba_bytes,
            fhm2d_memory_preview::dispose_fhm2d_memory_session,
            fhm2d_memory_preview::fhm2d_memory_convert_hkt_to_xml,
            preview_collection_state::preview_collection_replace_from_bundles,
            preview_collection_state::preview_collection_append_from_bundles,
            preview_collection_state::preview_collection_snapshot,
            preview_collection_state::preview_collection_set_query,
            preview_collection_state::preview_collection_toggle_item_visibility,
            preview_collection_state::preview_collection_toggle_all_visibility,
            preview_collection_state::preview_collection_toggle_item_selected,
            preview_collection_state::preview_collection_set_active,
            preview_collection_state::preview_collection_clear_active,
            preview_collection_state::preview_collection_set_view_range,
            preview_collection_state::preview_collection_set_control_range,
            preview_collection_state::preview_collection_remove_missing_ids,
            commands::parse_command_table_file,
            commands::build_command_table_file,
            commands::parse_typed_param_file,
            commands::build_typed_param_file,
            commands::parse_chrsysparam_file,
            commands::build_chrsysparam_file,
            commands::parse_shl_file,
            commands::build_shl_file,
            stage_commands::stage_apply_rename,
            stage_commands::load_stage_bundle,
            stage_commands::stage_load_skeleton,
            stage_commands::stage_load_model_slot_bundle,
            stage_commands::stage_stream_bundles,
            ssbh_mesh_binary::take_mesh_geometry,
            ssbh_mesh_binary::clear_mesh_geometry_registry,
            stage_commands::preview_stage_fhm2d_rename,
            stage_commands::load_stage_from_preview,
            stage_commands::extract_stage_fhm2d_to_folder,
            stage_commands::repack_fhm2d,
            stage_commands::repack_unit_model_fhm2d,
            stage_commands::inspect_effect_folder,
            stage_commands::parse_effect_efxbn_file,
            stage_commands::validate_effect_folder_for_repack,
            stage_commands::repack_effect_folder_fhm2d,
            stage_commands::import_effect_folder_file,
            stage_commands::import_effect_folder_model,
            stage_commands::delete_effect_folder_entries,
            stage_commands::copy_effect_folder_selection,
            stage_commands::repack_stage_fhm2d_preserving_shared_textures,
            stage_commands::redistribute_stage_textures,
            stage_commands::restore_shared_textures,
            stage_commands::apply_scene_texture_edits,
            stage_commands::rebuild_stage_structure_json,
            stage_commands::rebuild_stage_structure_json_forced,
            stage_commands::rebuild_stage_structure_json_with_shared_textures,
            stage_commands::exvs_stage_validate_for_repack,
            stage_commands::scene_validate_numatb_empty_params,
            stage_commands::validate_unit_model_for_repack,
            stage_commands::list_unit_model_textures,
            stage_commands::sync_unit_model_texture_containers,
            stage_commands::add_unit_model_nutexb,
            stage_commands::register_unit_model_pool_orphans,
            stage_commands::remove_unit_model_nutexb,
            stage_commands::extract_unit_model_fhm2d_to_folder,
            stage_commands::analyze_unit_model_folder_migration,
            stage_commands::migrate_unit_model_folder_layout,
            stage_commands::remove_unit_model_model,
            stage_commands::add_unit_model_model,
            stage_commands::replace_unit_model_model,
            stage_commands::preview_unit_model_model_replacement,
            stage_commands::validate_unit_model_source_folder,
            scene_session_commands::scene_session_create,
            scene_session_commands::scene_session_destroy,
            scene_session_commands::scene_session_is_dirty,
            scene_session_commands::scene_import_dae,
            scene_session_commands::scene_import_dae_from_path,
            scene_session_commands::scene_import_dae_from_path_streamed,
            scene_session_commands::scene_preview_hkt_collision_path,
            scene_session_commands::scene_preview_hkt_collision_mesh_path,
            scene_session_commands::scene_export_hkt_collision_review_obj_path,
            scene_session_commands::scene_configure_import,
            scene_session_commands::scene_remove_import,
            scene_session_commands::scene_remove_havok_data,
            scene_session_commands::scene_build_import_preview_bundle,
            scene_session_commands::scene_open_folder,
            scene_session_commands::scene_execute_import,
            scene_session_commands::scene_execute_import_streamed,
            scene_session_commands::scene_generate_hkt,
            scene_session_commands::scene_generate_hkt_from_mesh,
            scene_session_commands::scene_replace_hkt,
            scene_session_commands::scene_generate_replacement_hkt_from_dae_path,
            scene_session_commands::scene_apply_replacement_hkt_bytes,
            scene_session_commands::scene_replace_hkt_from_dae_path,
            scene_session_commands::scene_preview_hkt_collision_bytes,
            scene_session_commands::scene_preview_hkt_collision_session,
            scene_session_commands::scene_get_import_config,
            scene_session_commands::scene_convert_static_mesh_to_stage_files,
            scene_session_commands::scene_convert_static_mesh_to_stage_files_streamed,
            scene_session_commands::unit_model_import_static_mesh,
            scene_session_commands::scene_validate_import_texture_refs,
            scene_session_commands::scene_get_havok_meta,
            scene_session_commands::scene_list_havok_meta,
            scene_session_commands::scene_get_havok_raw_bytes,
            scene_session_commands::scene_save_as_folder,
            scene_session_commands::scene_repack_in_place,
            scene_session_commands::scene_list_imports,
            scene_session_commands::scene_forget_model,
            scene_session_commands::scene_forget_base_model,
            havok_cli::detect_havok_installation,
            havok_cli::convert_hkt_to_xml,
            havok_cli::convert_xml_to_hkt,
            havok_cli::scene_generate_hkt_from_dae_path,
            havok_mesh_export::convert_hkt_to_obj
        ]);

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                match app.path().resource_dir() {
                    Ok(resource_dir) => {
                        if let Err(error) = dev_tools_sync::sync_debug_tools_to_resource_dir(&resource_dir) {
                            eprintln!("failed to sync debug tools resources: {error}");
                        }
                    }
                    Err(error) => {
                        eprintln!("failed to resolve debug resource dir for tools sync: {error}");
                    }
                }

                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
