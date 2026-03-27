use tauri::Manager;

mod commands;
mod nutexb_lib;
mod ssbh_dae;
mod ssbh_dae_cmd;
mod ssbh_preview;

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
        .invoke_handler(tauri::generate_handler![
            commands::my_custom_command,
            commands::read_file,
            commands::exec_shell_command,
            commands::exec_shell_command_with_output,
            commands::exec_process_with_output,
            commands::watch_folder,
            commands::nutexb_read_info,
            commands::nutexb_export_dds,
            commands::nutexb_export_png_uncompressed,
            commands::nutexb_export_png,
            commands::nutexb_png_base64,
            commands::nutexb_png_bytes,
            commands::nutexb_batch_export_png,
            ssbh_preview::ssbh_load_model_preview,
            ssbh_preview::ssbh_load_ssbh_file_as_json,
            ssbh_dae_cmd::ssbh_analyze_dae,
            ssbh_dae_cmd::ssbh_analyze_fbx,
            ssbh_dae_cmd::ssbh_export_folder_to_dae,
            ssbh_dae_cmd::ssbh_convert_dae_to_ssbh,
            ssbh_dae_cmd::ssbh_convert_fbx_to_ssbh,
            ssbh_dae_cmd::ssbh_read_numdlb_mapping,
            ssbh_dae_cmd::ssbh_write_numdlb_mapping,
            ssbh_dae_cmd::ssbh_template_read_numatb,
            commands::series_image_replace_from_png,
            commands::card_icon_replace_from_png,
            commands::card_icon_replace_from_png_with_dds_format,
            commands::card_icon_detect_dds_format,
            commands::card_icon_batch_replace_with_dds_format,
            commands::copy_asset_as_new
        ])
        .setup(|app| {
            #[cfg(debug_assertions)] // only include this code on debug builds
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
                window.close_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
