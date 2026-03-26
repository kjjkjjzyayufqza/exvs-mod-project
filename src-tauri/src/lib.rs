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
            commands::nutexb_batch_export_png,
            ssbh_preview::ssbh_load_model_preview,
            ssbh_preview::ssbh_load_ssbh_file_as_json,
            ssbh_dae_cmd::ssbh_analyze_dae,
            ssbh_dae_cmd::ssbh_analyze_fbx,
            ssbh_dae_cmd::ssbh_export_folder_to_dae,
            ssbh_dae_cmd::ssbh_convert_dae_to_ssbh,
            ssbh_dae_cmd::ssbh_convert_fbx_to_ssbh,
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

#[cfg(test)]
mod dae_integration_tests {
    use crate::ssbh_dae_cmd::ssbh_convert_dae_to_ssbh;

    #[test]
    #[ignore = "Requires local DAE path; run: cargo test convert_user_delta_dae_roundtrip -- --ignored"]
    fn convert_user_delta_dae_roundtrip() {
        let dae = r"D:\output\德尔塔改\1.dae";
        let out_dir = std::env::temp_dir().join("tauri_ssbh_dae_import_smoke");
        let _ = std::fs::remove_dir_all(&out_dir);
        std::fs::create_dir_all(&out_dir).expect("mkdir");
        let v = ssbh_convert_dae_to_ssbh(
            dae.to_string(),
            out_dir.to_string_lossy().to_string(),
            "smoke_model".to_string(),
            1.0,
            false,
            "y_up".to_string(),
            Vec::new(),
            false,
            true,
            true,
            true,
        )
        .expect("convert");
        let obj = v.as_object().expect("json object");
        assert_eq!(obj.get("ok").and_then(|x| x.as_bool()), Some(true));
        let numdlb = out_dir.join("smoke_model.numdlb");
        let numshb = out_dir.join("smoke_model.numshb");
        assert!(numdlb.is_file(), "numdlb at {}", numdlb.display());
        assert!(numshb.is_file(), "numshb at {}", numshb.display());
        let _ = std::fs::remove_dir_all(&out_dir);
    }
}
