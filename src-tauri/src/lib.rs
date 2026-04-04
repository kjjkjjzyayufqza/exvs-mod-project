use tauri::Manager;

mod commands;
mod format;
mod jnttbl_cmd;
mod jnttbl_format;
mod nutexb_lib;
mod ssbh_dae;
mod ssbh_dae_cmd;
mod ssbh_preview;
mod ssbh_motion;

pub use ssbh_motion::smoke_decode_and_sample_nuanmb;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(commands::WatcherState::default())
        .manage(ssbh_motion::MotionSampleCacheState::default())
        .invoke_handler(tauri::generate_handler![
            commands::my_custom_command,
            commands::read_file,
            commands::exec_shell_command,
            commands::exec_shell_command_with_output,
            commands::exec_process_with_output,
            commands::watch_folder,
            commands::nutexb_preview_file_identity,
            commands::nutexb_read_info,
            commands::nutexb_export_dds,
            commands::nutexb_export_png_uncompressed,
            commands::nutexb_export_png,
            commands::nutexb_png_base64,
            commands::nutexb_png_bytes,
            commands::nutexb_batch_export_png,
            ssbh_preview::ssbh_load_model_preview,
            ssbh_preview::ssbh_list_numdlb_under_tree,
            ssbh_preview::ssbh_load_ssbh_file_as_json,
            ssbh_motion::ssbh_list_nuanmb_under_tree,
            ssbh_motion::ssbh_nuanmb_manifest,
            ssbh_motion::ssbh_load_motion_clip,
            ssbh_motion::ssbh_sample_motion_frame,
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
            jnttbl_cmd::jnttbl_read_file,
            jnttbl_cmd::jnttbl_write_file,
            jnttbl_cmd::ssbh_read_nusktb_bone_names,
            commands::series_image_replace_from_png,
            commands::card_icon_replace_from_png,
            commands::card_icon_replace_from_png_with_dds_format,
            commands::card_icon_detect_dds_format,
            commands::card_icon_batch_replace_with_dds_format,
            commands::copy_asset_as_new,
            commands::write_files_batch_base64,
            commands::extract_fhm2d_to_folder
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
